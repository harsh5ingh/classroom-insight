import csv
import io
import json
import os
import re
import secrets
import sqlite3
import threading
import math
from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlparse
from dotenv import load_dotenv
from flask import Flask, jsonify, request, Response, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.utils import secure_filename
from .db import db, rows, init_db, now, event, preferences, record_attendance
from .observations import fuse_signals
from .analysis import process_job
from .recommendations import config_status, verify_model, summarize, generate
from .portal import register_portal

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')

class ValidationError(Exception):
    pass

def payload():
    data = request.get_json(silent=True)
    if not isinstance(data,dict):
        raise ValidationError('A JSON object is required.')
    return data

def text_field(data, key, maximum=160, required=True):
    value = data.get(key,'')
    if not isinstance(value,str) or len(value.strip()) > maximum or (required and not value.strip()):
        raise ValidationError(f'{key.replace("_"," ").capitalize()} must be text of 1–{maximum} characters.' if required else f'Invalid {key}.')
    return value.strip()

def existing(table, item_id):
    # Table identifiers come exclusively from internal constants.
    record = db().execute(f'SELECT * FROM {table} WHERE id=?',(item_id,)).fetchone()
    if record is None:
        from flask import abort
        abort(404, description='Record not found.')
    return dict(record)

def attendance_summary(session_id=None):
    where, args = (' WHERE session_id=?',(session_id,)) if session_id is not None else ('',())
    counts = {r['status']:r['n'] for r in rows('SELECT status,COUNT(*) n FROM attendance'+where+' GROUP BY status',args)}
    present, absent, unconfirmed = [counts.get(k,0) for k in ('present','absent','unconfirmed')]
    total = present+absent+unconfirmed
    return {'present':present,'absent':absent,'unconfirmed':unconfirmed,'total':total,
            'rate':round(100*present/total,1) if total else None}

def analysis_record(row):
    row['has_media'] = bool(row.pop('stored_name',None))
    row['result'] = json.loads(row['result']) if row['result'] else None
    return row

def session_records():
    result = rows('SELECT * FROM sessions ORDER BY date DESC,id DESC')
    for session in result:
        session['attendance'] = attendance_summary(session['id'])
        latest = rows('SELECT id,status,progress,is_demo FROM analyses WHERE session_id=? ORDER BY id DESC LIMIT 1',(session['id'],))
        session['analysis'] = latest[0] if latest else None
    return result

def create_app(config=None):
    app = Flask(__name__, static_folder=str(ROOT/'dist'), static_url_path='/assets-static')
    app.config.update(DATABASE=str(ROOT/'data'/'classroom.sqlite3'), UPLOAD_FOLDER=str(ROOT/'data'/'uploads'),
                      MAX_CONTENT_LENGTH=100*1024*1024, SECRET_KEY=os.getenv('FLASK_SECRET_KEY') or secrets.token_hex(32))
    if config:
        app.config.update(config)
    Path(app.config['DATABASE']).parent.mkdir(parents=True,exist_ok=True)
    Path(app.config['UPLOAD_FOLDER']).mkdir(parents=True,exist_ok=True)
    init_db(app)
    job_lock = threading.Lock()

    @app.before_request
    def local_origin():
        if request.host.split(':')[0] not in ('127.0.0.1','localhost','[::1]'):
            return jsonify(error={'code':'forbidden_host','message':'This installation accepts local requests only.'}),403
        origin = request.headers.get('Origin')
        if request.method not in ('GET','HEAD','OPTIONS') and origin and origin not in (
            'http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:4173','http://localhost:4173',
            'http://127.0.0.1:5000','http://localhost:5000'):
            return jsonify(error={'code':'forbidden_origin','message':'Cross-origin changes are not permitted.'}),403
        if request.method not in ('GET','HEAD','OPTIONS') and request.headers.get('Sec-Fetch-Site') == 'cross-site':
            return jsonify(error={'code':'forbidden_origin','message':'Cross-site changes are not permitted.'}),403

    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['Referrer-Policy']='no-referrer'
        response.headers['X-Frame-Options']='DENY'
        if request.path.startswith('/api'):
            response.headers['Cache-Control']='no-store'
        return response

    @app.errorhandler(ValidationError)
    def validation(exc):
        return jsonify(error={'code':'validation_error','message':str(exc)}),400

    @app.errorhandler(sqlite3.IntegrityError)
    def integrity(_exc):
        db().rollback()
        return jsonify(error={'code':'conflict','message':'That student identifier already exists or a referenced record is invalid.'}),409

    @app.errorhandler(HTTPException)
    def http_error(exc):
        message = ('Request exceeds the allowed size for this endpoint.' if request.path.startswith(('/api/enquiries','/api/auth','/api/readiness')) else 'File exceeds the 100 MB limit.') if exc.code == 413 else exc.description
        return jsonify(error={'code':exc.name.lower().replace(' ','_'),'message':message}),exc.code

    @app.errorhandler(Exception)
    def unexpected(_exc):
        db().rollback()
        return jsonify(error={'code':'internal_error','message':'The request could not be completed. Please retry.'}),500

    @app.get('/api/health')
    def health():
        db().execute('SELECT 1')
        return jsonify(status='ok', storage='sqlite', mode='local')

    @app.get('/api/config')
    def configuration():
        import shutil
        return jsonify(gemini=config_status(), preferences=preferences(), ffmpeg_available=bool(shutil.which('ffmpeg')),
                       upload_limit_mb=100, retention='Media and records remain on this computer until explicitly deleted. No automatic expiration.',
                       privacy='Only aggregate metrics are sent to Gemini, and only when requested. Original media stays local.')

    @app.post('/api/config/verify-gemini')
    def verify():
        client, error = verify_model()
        if client:
            client.close()
        return jsonify(access='verified' if client else ('unavailable' if config_status()['credential_supplied'] else 'not_configured'),
                       message=error or 'Configured model is accessible and supports content generation. Generation quota has not been tested.')

    @app.put('/api/settings')
    def settings():
        data = payload()
        if type(data.get('sample_seconds')) is not int or not 2 <= data['sample_seconds'] <= 60 or type(data.get('person_detection')) is not bool:
            raise ValidationError('Sample interval must be 2–60 seconds and person detection must be true or false.')
        if 'face_detection' in data and type(data['face_detection']) is not bool:
            raise ValidationError('Face observations must be true or false.')
        for key in ('sample_seconds','person_detection', *(['face_detection'] if 'face_detection' in data else [])):
            db().execute('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,json.dumps(data[key])))
        db().commit()
        return jsonify(preferences())

    @app.get('/api/students')
    def students():
        result = rows('SELECT * FROM students ORDER BY name COLLATE NOCASE')
        for student in result:
            history = rows('SELECT a.status,a.confirmed_at,a.updated_at,a.source,s.id session_id,s.title,s.date FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE student_id=? ORDER BY s.date DESC',(student['id'],))
            student['history']=history
            student['rate']=round(sum(r['status']=='present' for r in history)/len(history)*100,1) if history else None
        return jsonify(result)

    @app.route('/api/students',methods=['POST'])
    @app.route('/api/students/<int:student_id>',methods=['PUT','DELETE'])
    def student_write(student_id=None):
        if student_id is not None:
            existing('students',student_id)
        if request.method == 'DELETE':
            db().execute('DELETE FROM students WHERE id=?',(student_id,))
            event('Student and linked attendance records deleted')
        else:
            data=payload()
            identifier=text_field(data,'identifier',40)
            if not re.fullmatch(r'[A-Za-z0-9_-]+',identifier):
                raise ValidationError('Student identifier may contain letters, digits, hyphens and underscores.')
            name,cohort=text_field(data,'name',100),text_field(data,'cohort',80,False)
            if student_id is None:
                student_id=db().execute('INSERT INTO students(identifier,name,cohort) VALUES(?,?,?)',(identifier,name,cohort)).lastrowid
                event('Student registered')
            else:
                db().execute('UPDATE students SET identifier=?,name=?,cohort=? WHERE id=?',(identifier,name,cohort,student_id))
                event('Student record updated')
        db().commit()
        return jsonify(id=student_id),201 if request.method=='POST' else 200

    @app.get('/api/sessions')
    def sessions():
        return jsonify(session_records())

    @app.route('/api/sessions',methods=['POST'])
    @app.route('/api/sessions/<int:session_id>',methods=['PUT','DELETE','GET'])
    def session_write(session_id=None):
        if session_id is not None:
            session=existing('sessions',session_id)
        if request.method == 'GET':
            session['attendance']=attendance_summary(session_id)
            return jsonify(session)
        if request.method == 'DELETE':
            if rows("SELECT id FROM analyses WHERE session_id=? AND status IN ('queued','processing')",(session_id,)):
                raise ValidationError('Wait for analysis to finish before deleting this session.')
            for row in rows('SELECT stored_name FROM analyses WHERE session_id=?',(session_id,)):
                if row['stored_name']:
                    (Path(app.config['UPLOAD_FOLDER'])/row['stored_name']).unlink(missing_ok=True)
            db().execute('DELETE FROM sessions WHERE id=?',(session_id,))
            event('Session and linked records deleted')
        else:
            data=payload()
            title,instructor,day=text_field(data,'title'),text_field(data,'instructor',100),text_field(data,'date',10)
            try:
                if date.fromisoformat(day).isoformat()!=day:
                    raise ValueError()
            except ValueError:
                raise ValidationError('Date must be a valid YYYY-MM-DD calendar date.')
            if session_id is None:
                session_id=db().execute('INSERT INTO sessions(title,date,instructor,created_at) VALUES(?,?,?,?)',(title,day,instructor,now())).lastrowid
                db().execute("INSERT INTO attendance(session_id,student_id) SELECT ?,id FROM students WHERE is_demo=0",(session_id,))
                event('New session created')
            else:
                db().execute('UPDATE sessions SET title=?,date=?,instructor=? WHERE id=?',(title,day,instructor,session_id))
        db().commit()
        return jsonify(id=session_id),201 if request.method=='POST' else 200

    @app.get('/api/sessions/<int:session_id>/attendance')
    def attendance(session_id):
        existing('sessions',session_id)
        return jsonify(records=rows('SELECT s.id,s.identifier,s.name,s.cohort,a.status,a.confirmed_at,a.updated_at,a.source FROM attendance a JOIN students s ON s.id=a.student_id WHERE session_id=? ORDER BY s.name',(session_id,)),summary=attendance_summary(session_id),
                       changes=rows('SELECT c.*,s.name FROM attendance_changes c JOIN students s ON s.id=c.student_id WHERE c.session_id=? ORDER BY c.id DESC LIMIT 500',(session_id,)))

    @app.put('/api/sessions/<int:session_id>/attendance')
    def update_attendance(session_id):
        existing('sessions',session_id)
        updates=payload().get('records')
        if not isinstance(updates,list) or not updates or len(updates)>5000:
            raise ValidationError('Provide 1–5000 attendance records.')
        roster={r['student_id'] for r in rows('SELECT student_id FROM attendance WHERE session_id=?',(session_id,))}
        for record in updates:
            if not isinstance(record,dict) or type(record.get('student_id')) is not int or record['student_id'] not in roster or record.get('status') not in ('present','absent','unconfirmed'):
                raise ValidationError('Every attendance entry must reference this session’s roster and a valid status.')
        if len({r['student_id'] for r in updates})!=len(updates):
            raise ValidationError('Each student may appear only once per attendance update.')
        for r in updates:
            record_attendance(session_id,r['student_id'],r['status'])
        event('Attendance manually confirmed',existing('sessions',session_id)['is_demo'])
        db().commit()
        return jsonify(attendance_summary(session_id))

    @app.post('/api/sessions/<int:session_id>/presence-confirmations')
    def confirm_presence(session_id):
        session = existing('sessions',session_id)
        data = payload()
        if data.get('identity_confirmed') is not True or any(type(data.get(k)) is not int for k in ('analysis_id','track_id','student_id')):
            raise ValidationError('Select a roster student and explicitly confirm that you verified their identity in the recording.')
        analysis = existing('analyses',data['analysis_id'])
        if analysis['session_id']!=session_id or analysis['status']!='complete' or analysis['is_demo'] or session['is_demo']:
            raise ValidationError('Use a completed real analysis from this session.')
        if not analysis['stored_name'] or not (Path(app.config['UPLOAD_FOLDER'])/analysis['stored_name']).is_file():
            raise ValidationError('Original recording is unavailable for identity review. Use manual attendance instead.')
        result = json.loads(analysis['result'])
        tracking = (result.get('video') or {}).get('face_tracking') or {}
        track = next((t for t in tracking.get('tracks',[]) if t['id']==data['track_id']),None)
        if not track or not tracking.get('eligible_sampling') or not track['qualified'] or track['samples']<3 or track['span_seconds']<20:
            raise ValidationError('This anonymous track does not meet the sustained-presence review threshold.')
        if not rows('SELECT 1 FROM attendance WHERE session_id=? AND student_id=?',(session_id,data['student_id'])):
            raise ValidationError('Student must belong to this session roster.')
        prior = rows('SELECT student_id FROM attendance_changes WHERE analysis_id=? AND track_id=?',(analysis['id'],track['id']))
        if prior:
            if prior[0]['student_id']!=data['student_id']:
                raise ValidationError('This track has already been reviewed for a different student.')
            return jsonify(summary=attendance_summary(session_id),duplicate=True)
        record_attendance(session_id,data['student_id'],'present','instructor_reviewed_track',analysis['id'],track['id'])
        event('Instructor reviewed sustained presence and confirmed a roster student')
        db().commit()
        return jsonify(summary=attendance_summary(session_id),duplicate=False),201

    @app.post('/api/sessions/<int:session_id>/fusion')
    def combine_recordings(session_id):
        session = existing('sessions',session_id)
        data = payload()
        if session['is_demo'] or any(type(data.get(k)) is not int for k in ('video_analysis_id','audio_analysis_id')):
            raise ValidationError('Choose two completed real recordings from the same session.')
        offset = data.get('audio_offset_seconds',0)
        if type(offset) not in (float,int) or not math.isfinite(offset) or abs(offset)>7200:
            raise ValidationError('Audio offset must be a finite number between -7200 and 7200 seconds.')
        inputs = [existing('analyses',data[k]) for k in ('video_analysis_id','audio_analysis_id')]
        if inputs[0]['id']==inputs[1]['id'] or any(a['session_id']!=session_id or a['status']!='complete' or a['is_demo'] for a in inputs):
            raise ValidationError('Choose different completed recordings from this session.')
        results = [json.loads(a['result']) for a in inputs]
        if any(r.get('derived_from') for r in results):
            raise ValidationError('Combine original recording analyses, not previously combined results.')
        video,audio = results[0].get('video'),results[1].get('audio')
        if not video or not audio:
            raise ValidationError('The selected recordings must supply video observations and audio observations respectively.')
        fusion = fuse_signals(video,audio,offset)
        if not fusion or not fusion['joint_windows']:
            raise ValidationError('These signals do not overlap at this offset. Review alignment.')
        # Face reviews remain attached to their original analysis, never duplicated.
        visual = {k:v for k,v in video.items() if k!='face_tracking'}
        result = {'kind':'measured','video':visual,'audio':audio,'fusion':fusion,'derived_from':[a['id'] for a in inputs],
                  'unavailable':[], 'notes':['Instructor-supplied time alignment; simultaneous recording is not automatically verified. Audio time-series uses its original recording clock; the combined index uses the supplied offset.']}
        aid = db().execute("INSERT INTO analyses(session_id,filename,status,progress,result,created_at) VALUES(?,?,'complete',100,?,?)",
                           (session_id,'Aligned observations · '+str(inputs[0]['id'])+' + '+str(inputs[1]['id']),json.dumps(result),now())).lastrowid
        event('Timestamp-aligned audio and video observations combined')
        db().commit()
        return jsonify(id=aid),201

    @app.get('/api/analyses/<int:analysis_id>/media')
    def review_media(analysis_id):
        analysis = existing('analyses',analysis_id)
        if not analysis['stored_name']:
            from flask import abort
            abort(404,description='Original media is unavailable.')
        response = send_from_directory(app.config['UPLOAD_FOLDER'],analysis['stored_name'],conditional=True)
        response.headers['Cache-Control']='no-store'
        return response

    @app.post('/api/sessions/<int:session_id>/roster')
    def sync_roster(session_id):
        session=existing('sessions',session_id)
        db().execute('INSERT OR IGNORE INTO attendance(session_id,student_id) SELECT ?,id FROM students WHERE is_demo=?',(session_id,session['is_demo']))
        db().commit()
        return jsonify(attendance_summary(session_id))

    @app.get('/api/analyses')
    def analyses():
        session_id=request.args.get('session_id',type=int)
        query='SELECT * FROM analyses'
        args=()
        if session_id is not None:
            existing('sessions',session_id)
            query+=' WHERE session_id=?'
            args=(session_id,)
        return jsonify([analysis_record(r) for r in rows(query+' ORDER BY id DESC',args)])

    @app.post('/api/sessions/<int:session_id>/media')
    def upload(session_id):
        session=existing('sessions',session_id)
        if session['is_demo']:
            raise ValidationError('Create a real session before uploading media. Sample measurements stay separate.')
        file=request.files.get('file')
        filename=secure_filename(file.filename or '') if file else ''
        suffix=Path(filename).suffix.lower()
        if not file or suffix not in ('.mp4','.mov','.avi','.webm','.mkv','.wav','.mp3','.m4a','.flac','.ogg'):
            raise ValidationError('Choose MP4, MOV, AVI, WebM, MKV, WAV, MP3, M4A, FLAC or OGG media.')
        if not job_lock.acquire(blocking=False):
            return jsonify(error={'code':'busy','message':'Another recording is being analyzed. Please wait.'}),409
        stored=uuid4().hex+suffix
        path=Path(app.config['UPLOAD_FOLDER'])/stored
        try:
            file.save(path)
            if path.stat().st_size==0:
                raise ValidationError('The uploaded file is empty.')
            analysis_id=db().execute("INSERT INTO analyses(session_id,filename,stored_name,status,created_at) VALUES(?,?,?,'queued',?)",(session_id,filename,stored,now())).lastrowid
            event('Recording uploaded for local analysis')
            db().commit()
            prefs=preferences()
            def work():
                try:
                    process_job(app,analysis_id,str(path),prefs)
                finally:
                    job_lock.release()
            if app.config.get('TESTING'):
                work()
            else:
                threading.Thread(target=work,daemon=True).start()
        except Exception:
            path.unlink(missing_ok=True)
            if job_lock.locked():
                job_lock.release()
            raise
        return jsonify(id=analysis_id,status='queued'),202

    @app.delete('/api/analyses/<int:analysis_id>')
    def delete_analysis(analysis_id):
        row=existing('analyses',analysis_id)
        if row['status'] in ('queued','processing'):
            raise ValidationError('Wait for processing to finish before deleting media.')
        if row['stored_name']:
            (Path(app.config['UPLOAD_FOLDER'])/row['stored_name']).unlink(missing_ok=True)
        if request.args.get('media_only')=='true':
            result = json.loads(row['result']) if row['result'] else None
            if result and (result.get('video') or {}).get('face_tracking'):
                for track in result['video']['face_tracking']['tracks']:
                    track['preview'] = None
            db().execute('UPDATE analyses SET stored_name=NULL,result=? WHERE id=?',(json.dumps(result) if result else None,analysis_id))
        else:
            db().execute('DELETE FROM analyses WHERE id=?',(analysis_id,))
            db().execute('DELETE FROM recommendations WHERE session_id=?',(row['session_id'],))
        event('Recording media deleted; retained metrics depend on the selected deletion option')
        db().commit()
        return jsonify(deleted=True)

    @app.get('/api/analytics')
    def analytics():
        start,end=request.args.get('start',''),request.args.get('end','')
        for day in (start,end):
            if day:
                try: date.fromisoformat(day)
                except ValueError: raise ValidationError('Invalid date filter.')
        if start and end and start>end:
            raise ValidationError('Start date must be on or before end date.')
        selected=request.args.get('session_id',type=int)
        sessions=[s for s in session_records() if (not start or s['date']>=start) and (not end or s['date']<=end) and (selected is None or s['id']==selected)]
        totals={k:sum(s['attendance'][k] for s in sessions) for k in ('present','absent','unconfirmed','total')}
        totals['rate']=round(totals['present']/totals['total']*100,1) if totals['total'] else None
        trend=[]
        analyzed=0
        for s in reversed(sessions):
            latest=rows("SELECT result FROM analyses WHERE session_id=? AND status='complete' ORDER BY id DESC LIMIT 1",(s['id'],))
            result=json.loads(latest[0]['result']) if latest else None
            metrics=summarize(result,s['attendance'])
            analyzed+=bool(latest)
            trend.append({'id':s['id'],'date':s['date'],'title':s['title'],'is_demo':s['is_demo'],'rate':s['attendance']['rate'],
                          'activity':metrics.get('scene_change_mean'),'sound':metrics.get('sound_active_fraction')})
        return jsonify(summary={**totals,'sessions':len(sessions),'analyzed':analyzed},trend=trend,sessions=sessions,
                       events=rows('SELECT * FROM events ORDER BY id DESC LIMIT 8'),demo=any(s['is_demo'] for s in sessions))

    @app.route('/api/recommendations',methods=['GET','POST'])
    def recommendations():
        if request.method=='GET':
            result=rows('SELECT r.*,s.title,s.is_demo FROM recommendations r JOIN sessions s ON s.id=r.session_id ORDER BY r.id DESC')
            for row in result: row['items']=json.loads(row['items'])
            return jsonify(result)
        data=payload()
        if type(data.get('session_id')) is not int or type(data.get('use_gemini',False)) is not bool:
            raise ValidationError('A session id and boolean Gemini preference are required.')
        session=existing('sessions',data['session_id'])
        analysis=rows("SELECT result FROM analyses WHERE session_id=? AND status='complete' ORDER BY id DESC LIMIT 1",(session['id'],))
        metrics=summarize(json.loads(analysis[0]['result']) if analysis else None,attendance_summary(session['id']))
        result=generate(metrics,data.get('use_gemini',False))
        rec_id=db().execute('INSERT INTO recommendations(session_id,source,items,note,created_at) VALUES(?,?,?,?,?)',
            (session['id'],result['source'],json.dumps(result['items']),result['note'],now())).lastrowid
        event('Teaching suggestions generated',session['is_demo'])
        db().commit()
        return jsonify(id=rec_id,**result),201

    @app.get('/api/export/attendance.csv')
    def export():
        session_id=request.args.get('session_id',type=int)
        query='SELECT s.date,s.title,t.identifier,t.name,t.cohort,a.status,s.is_demo,a.confirmed_at,a.updated_at,a.source FROM attendance a JOIN sessions s ON s.id=a.session_id JOIN students t ON t.id=a.student_id'
        args=()
        if session_id is not None:
            existing('sessions',session_id)
            query+=' WHERE s.id=?'; args=(session_id,)
        output=io.StringIO(newline='')
        writer=csv.writer(output)
        writer.writerow(['Date','Session','Student identifier','Student name','Cohort','Status','Demonstration data','Confirmed at (UTC)','Updated at (UTC)','Source'])
        for row in rows(query+' ORDER BY s.date,t.name',args):
            # Protect spreadsheet consumers against formula injection.
            writer.writerow(["'"+v if isinstance(v,str) and v.startswith(('=','+','-','@','\t','\r','\n')) else v for v in row.values()])
        return Response('\ufeff'+output.getvalue(),mimetype='text/csv',headers={'Content-Disposition':'attachment; filename=classroom-attendance.csv'})

    @app.post('/api/demo')
    def demo():
        if rows('SELECT id FROM sessions WHERE is_demo=1 LIMIT 1'):
            return jsonify(message='Sample dataset is already loaded.')
        names=['Aarav Mehta','Amelia Chen','Daniel Brooks','Fatima Khan','Ishaan Shah','Leah Williams','Maya Patel','Noah Thomas','Olivia Reed','Riya Kapoor','Sofia Garcia','Yusuf Ali']
        ids=[]
        for i,name in enumerate(names):
            identifier=f'DEMO-{i+1:03}'
            if rows('SELECT id FROM students WHERE identifier=?',(identifier,)):
                identifier=f'DEMO-{uuid4().hex[:8]}'
            ids.append(db().execute('INSERT INTO students(identifier,name,cohort,is_demo) VALUES(?,?,?,1)',(identifier,name,'Environmental Studies · A')).lastrowid)
        titles=['Reading the landscape','Systems & interdependence','The urban ecosystem','Water as a shared resource','Designing resilient cities','From observation to action']
        for i,title in enumerate(titles):
            day=(date.today()-timedelta(days=(5-i)*3)).isoformat()
            sid=db().execute('INSERT INTO sessions(title,date,instructor,is_demo,created_at) VALUES(?,?,?,1,?)',(title,day,'Dr. Morgan Ellis',now())).lastrowid
            statuses=['present' if j < [9,10,9,11,10,10][i] else ('unconfirmed' if i==5 and j==11 else 'absent') for j in range(12)]
            db().executemany('INSERT INTO attendance(session_id,student_id,status) VALUES(?,?,?)',[(sid,j,statuses[k]) for k,j in enumerate(ids)])
            points=[{'seconds':j*60,'count':8+(j+i)%4,'activity':round(2+((j*7+i*3)%17)*.6,2) if j else None} for j in range(31)]
            result={'kind':'simulated','video':{'duration_seconds':1800,'sample_seconds':60,'frames_sampled':31,'points':points,'detector':'Simulated sample counts','method':'Simulated scene change; no recording was analyzed.','limitations':'All measurements in this sample session are fictional.'},
                    'audio':{'duration_seconds':1800,'energy':[{'seconds':j*60,'energy':round(.01+((j+i)%6)*.012,3)} for j in range(31)],'active_fraction':.42+i*.03,'threshold':.03,'active_intervals':[], 'method':'Simulated audio energy.'},'unavailable':[], 'notes':['Demonstration data only.']}
            db().execute("INSERT INTO analyses(session_id,filename,status,progress,result,is_demo,created_at) VALUES(?,?,'complete',100,?,1,?)",(sid,'Sample dataset · no original recording',json.dumps(result),now()))
            rec=generate(summarize(result,attendance_summary(sid)))
            db().execute('INSERT INTO recommendations(session_id,source,items,note,created_at) VALUES(?,?,?,?,?)',(sid,'local',json.dumps(rec['items']),'Advisory • fictional sample metrics',now()))
        event('Six fictional sessions and twelve sample students loaded',1)
        db().commit()
        return jsonify(message='Sample dataset loaded.'),201

    @app.delete('/api/demo')
    def reset_demo():
        db().execute('DELETE FROM sessions WHERE is_demo=1')
        db().execute('DELETE FROM students WHERE is_demo=1')
        db().execute('DELETE FROM events WHERE is_demo=1')
        db().commit()
        return jsonify(message='Sample data removed. Real records were preserved.')

    @app.get('/')
    @app.get('/<path:path>')
    def spa(path=''):
        if path.startswith('api/'):
            from flask import abort
            abort(404)
        target=ROOT/'dist'/path
        if path and target.is_file() and target.resolve().is_relative_to((ROOT/'dist').resolve()):
            return send_from_directory(ROOT/'dist',path)
        if (ROOT/'dist'/'index.html').exists():
            return send_from_directory(ROOT/'dist','index.html')
        return jsonify(message='Start the React frontend with npm run dev.'),200
    register_portal(app)
    return app

if __name__=='__main__':
    create_app().run(host='127.0.0.1',port=5000,debug=False,threaded=True)
