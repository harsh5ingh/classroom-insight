"""Authenticated, read-only diagnostics and reports shared by React and Streamlit."""
import csv
import io
import json
import platform
import shutil
import sys
from importlib.metadata import version, PackageNotFoundError
from flask import jsonify, request, abort, Response, current_app
from .db import db, rows, preferences, now
from .scoring import explain_fusion

PACKAGES={'flask':'Flask','numpy':'numpy','opencv':'opencv-python-headless','librosa':'librosa','scipy':'scipy','streamlit':'streamlit','mediapipe':'mediapipe','gemini_sdk':'google-genai','groq_sdk':'groq','keyring':'keyring'}
def packages():
    result={}
    for label,name in PACKAGES.items():
        try: result[label]=version(name)
        except PackageNotFoundError: result[label]=None
    return result

def clean(value):
    if isinstance(value,dict): return {k:clean(v) for k,v in value.items() if k not in ('preview','box','stored_name','credential_id','api_key','filename')}
    if isinstance(value,list): return [clean(v) for v in value]
    return value

def session_report(sid,weights=None):
    session=rows('SELECT id,title,date,instructor,is_demo FROM sessions WHERE id=?',(sid,))
    if not session: abort(404,description='Session not found.')
    attendance=rows('SELECT a.*,s.name,s.identifier FROM attendance a JOIN students s ON s.id=a.student_id WHERE a.session_id=? ORDER BY s.name',(sid,))
    changes=rows('SELECT c.*,s.name FROM attendance_changes c JOIN students s ON s.id=c.student_id WHERE c.session_id=? ORDER BY c.id LIMIT 5001',(sid,))
    analyses=[]; tracks=[]
    prefs=preferences(); vw,aw=weights or (prefs['visual_weight'],prefs['audio_weight'])
    for a in rows("SELECT id,status,is_demo,created_at,result FROM analyses WHERE session_id=? ORDER BY id DESC LIMIT 100",(sid,)):
        result=json.loads(a.pop('result') or '{}')
        fusion=result.get('fusion')
        # Without an explicit preview override, preserve the analysis's recorded formula/weights.
        saved=fusion.get('weights') if fusion else None
        chosen=weights or ((saved['visual'],saved['audio']) if saved else (1,1))
        result['fusion']=explain_fusion(fusion,*chosen)
        for t in ((result.get('video') or {}).get('face_tracking') or {}).get('tracks',[]):
            confirmations=[c for c in changes if c['analysis_id']==a['id'] and c['track_id']==t['id']]
            tracks.append({'analysis_id':a['id'],**clean(t),'confirmations':confirmations,
                'observed_presence_seconds':t.get('presence_seconds'),
                'duration_note':'Observed anonymous duration, not verified whole-session attendance. Recorded sparse spans are not filled in.'})
        analyses.append({**a,'result':clean(result)})
    counts={status:sum(a['status']==status for a in attendance) for status in ('present','absent','unconfirmed')}
    recommendations=rows('SELECT source,items,note,created_at FROM recommendations WHERE session_id=? ORDER BY id DESC LIMIT 100',(sid,))
    for r in recommendations:r['items']=json.loads(r['items'])
    return {'schema':'classroom-report-v1','generated_at':now(),'session':session[0],
        'attendance':attendance,'summary':{**counts,'total':len(attendance),'rate':counts['present']/len(attendance)*100 if attendance else None},
        'attendance_changes':changes[:5000],'history_truncated':len(changes)>5000,'analyses':analyses,'tracks':tracks,
        'analysis_limit':100,'recommendations':recommendations,'weight_preview':bool(weights),
        'limitations':['No verified arrival/departure duration is available. Confirmation time is not arrival time.',
                        'Participation and individual attention are unavailable; no peer rankings.',
                        'At most 100 analyses and recommendation records and 5000 changes per report. Original records are unchanged.',
                        'Face thumbnails, bounding boxes, original media and provider credentials are excluded. Reports contain roster data; share only with authorization.']}

def register_insights(app):
    # Under /api/analytics: reuse the existing authenticated dashboard API guard.
    @app.get('/api/analytics/diagnostics')
    def diagnostics():
        from .providers import state
        db().execute('SELECT 1');provider=state();installed=packages()
        counts={table:db().execute('SELECT COUNT(*) FROM '+table).fetchone()[0] for table in ('students','sessions','analyses')}
        retained=db().execute('SELECT COUNT(*) FROM analyses WHERE stored_name IS NOT NULL').fetchone()[0]
        active=provider['active'];item=provider['providers'].get(active,{})
        return jsonify(python=platform.python_version(),supported_python=sys.version_info>=(3,12),virtual_environment=sys.prefix!=sys.base_prefix,
            packages=installed,database='connected',backend='ready',counts=counts,ffmpeg=bool(shutil.which('ffmpeg')),
            ai={'active':active or 'local','model':item.get('model'),'verification':'Check Settings for current authenticated generation status; diagnostics makes no AI request.'},
            offline={'local_analysis':True,'local_recommendations':True,'cloud_requires_network':bool(active)},
            devices='Browser permission and hardware must be checked on this computer; package availability does not prove device access.',
            privacy={'retained_media_records':retained,'live_raw_retention':'none','uploaded_media_retention':'Until explicitly deleted in Settings or Sessions; no automatic purge.',
                     'credentials':'Windows Credential Manager or explicitly disclosed backend environment fallback; never exported.',
                     'head_pose':'unsupported','mediapipe':'Optional package/model not selected: bundled OpenCV Haar remains the active detector.'})

    @app.get('/api/analytics/sessions/<int:sid>/report')
    def report(sid):
        weights=None
        if 'visual_weight' in request.args or 'audio_weight' in request.args:
            try:
                weights=(float(request.args.get('visual_weight','1')),float(request.args.get('audio_weight','1')))
                explain_fusion(None,*weights)
            except (ValueError,TypeError):abort(400,description='Weights must be finite 0-10 and not both zero.')
        value=session_report(sid,weights)
        if request.args.get('format')=='csv':
            output=io.StringIO();writer=csv.writer(output)
            writer.writerow(['student_id','name','identifier','status','confirmed_at','updated_at','source'])
            for a in value['attendance']:
                writer.writerow([("'"+str(a[k])) if str(a[k] or '').lstrip().startswith(('=','+','-','@')) else a[k] for k in ('student_id','name','identifier','status','confirmed_at','updated_at','source')])
            return Response(output.getvalue(),mimetype='text/csv',headers={'Content-Disposition':f'attachment; filename=session-{sid}-attendance.csv'})
        if request.args.get('format') not in (None,'json'):abort(400,description='Choose CSV or JSON.')
        return jsonify(value)

    @app.get('/api/analytics/students/<int:student_id>')
    def student_insights(student_id):
        student=rows('SELECT id,name,identifier FROM students WHERE id=?',(student_id,))
        if not student:abort(404,description='Student not found.')
        history=rows('SELECT a.*,s.title,s.date,s.is_demo FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE a.student_id=? ORDER BY s.date DESC LIMIT 501',(student_id,))
        associations=[]
        for c in rows('SELECT c.*,a.result FROM attendance_changes c LEFT JOIN analyses a ON a.id=c.analysis_id WHERE c.student_id=? AND c.track_id IS NOT NULL ORDER BY c.id DESC LIMIT 500',(student_id,)):
            result=json.loads(c.pop('result') or '{}')
            track=next((t for t in ((result.get('video') or {}).get('face_tracking') or {}).get('tracks',[]) if t['id']==c['track_id']),None)
            associations.append({**c,'observed_presence_seconds':track.get('presence_seconds') if track else None,'first_seen':track.get('first_seen') if track else None,'last_seen':track.get('last_seen') if track else None})
        return jsonify(student=student[0],history=history[:500],truncated=len(history)>500,confirmed_tracks=associations,
            confirmed_attendance_duration=None,participation=None,
            limitations='Confirmation is an instructor action, not an arrival/departure measurement. Anonymous durations are evidence only for the explicitly linked track; no individual participation or attention is inferred.')
