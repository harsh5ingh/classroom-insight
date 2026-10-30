"""Explicit browser snapshot capture. No device access or recording on the server."""
from .scoring import explain_fusion
import io
import json
import math
import threading
import zipfile
from pathlib import Path
from uuid import uuid4
import cv2
import numpy as np
from flask import request, jsonify, send_file, abort
from .db import db, rows, event, now, preferences
from .observations import FaceObserver, fuse_signals


def jpeg_dimensions(data):
    """Read JPEG dimensions before allocating decoded pixels; reject other formats."""
    if not data.startswith(b'\xff\xd8'):
        raise ValueError('Camera frames must be JPEG images.')
    pos = 2
    while pos+4 <= len(data):
        if data[pos]!=255:
            break
        while pos<len(data) and data[pos]==255: pos+=1
        if pos>=len(data): break
        marker=data[pos]; pos+=1
        if marker in (0xd9,0xda): break
        if marker==0x01 or 0xd0<=marker<=0xd7: continue
        length=int.from_bytes(data[pos:pos+2],'big')
        if length<2 or pos+length>len(data): break
        if marker in (0xc0,0xc1,0xc2) and length>=8:
            return int.from_bytes(data[pos+5:pos+7],'big'),int.from_bytes(data[pos+3:pos+5],'big')
        pos+=length
    raise ValueError('Invalid JPEG header.')


def validate_capture(files, timestamps):
    if not isinstance(timestamps,list) or not 2<=len(files)<=60 or len(files)!=len(timestamps):
        raise ValueError('Provide 2–60 camera frames with matching timestamps.')
    previous=-1
    for i,t in enumerate(timestamps):
        if type(t) not in (int,float) or not math.isfinite(t) or not 0<=t<=120 or (i and t-previous<.5) or (not i and t>5):
            raise ValueError('Camera timestamps must increase by at least 0.5s within 120s; first frame must be within 5s.')
        previous=t
    images=[]
    for file in files:
        data=file.read(512*1024+1)
        if not data or len(data)>512*1024:
            raise ValueError('Each camera JPEG must be nonempty and at most 512 KiB.')
        w,h=jpeg_dimensions(data)
        if not 16<=w<=960 or not 16<=h<=720:
            raise ValueError('Camera frames must be 16–960 pixels wide and 16–720 high.')
        image=cv2.imdecode(np.frombuffer(data,np.uint8),cv2.IMREAD_COLOR)
        if image is None or image.shape[:2]!=(h,w):
            raise ValueError('Camera frame could not be decoded.')
        # Re-encode: strip EXIF, GPS, comments and any trailing embedded data.
        ok,clean=cv2.imencode('.jpg',image,[cv2.IMWRITE_JPEG_QUALITY,85])
        if not ok: raise ValueError('Camera frame could not be stored.')
        images.append(clean.tobytes())
    return images


def analyze_camera(path,prefs,progress):
    with zipfile.ZipFile(path) as archive:
        timestamps=json.loads(archive.read('timestamps.json'))
        observer=None
        unavailable=['Camera capture contains timestamped snapshots, not continuous video or audio.',
                     'Head pose unsupported. HOG person counting is not run on this snapshot workflow.']
        if prefs.get('face_detection',True):
            try: observer=FaceObserver(2,prefs)
            except (cv2.error,ValueError,AttributeError): unavailable.append('Face detector unavailable.')
        else: unavailable.append('Face observations disabled in analysis preferences.')
        previous=None
        points=[]
        for i,t in enumerate(timestamps):
            frame=cv2.imdecode(np.frombuffer(archive.read(f'{i}.jpg'),np.uint8),cv2.IMREAD_COLOR)
            if frame is None: raise ValueError('Stored camera frame is unreadable.')
            gray=cv2.resize(cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY),(160,90))
            activity=round(float(np.mean(cv2.absdiff(gray,previous)))/255*100,2) if previous is not None else None
            previous=gray
            if observer:
                try: observer.observe(frame,t)
                except (cv2.error,ValueError):
                    observer=None
                    unavailable.append('Face processing failed; no track results retained.')
            points.append({'seconds':t,'count':None,'faces':observer.last_count if observer else None,'activity':activity})
            progress(10+round((i+1)/len(timestamps)*75))
    video={'duration_seconds':timestamps[-1], 'sample_seconds':2,'frames_sampled':len(points),
           'points':points,'detector':None,'method':'Mean sampled grayscale intensity difference (%).',
           'limitations':'Camera snapshots at a nominal 2-second cadence. Real browser timestamps are retained; gaps are not continuous presence.',
           'face_tracking':None}
    if observer:
        tracker=observer.tracker
        video['face_tracking']={'method':'OpenCV frontal Haar; anonymous conservative IoU tracks.',
            'tracks':tracker.result(),'minimum_seconds':tracker.minimum,'minimum_samples':tracker.minimum_samples,
            'still_motion_threshold':tracker.still_threshold,'eligible_sampling':True,
            'limitations':'Snapshot continuity is not identity or continuous physical presence. Misses/gaps/ambiguity break tracks. Explicit instructor verification is required.',
            'pose_method':'Head pose unsupported. Eye-line roll is a 2D image heuristic only, not a head-pose estimate.'}
    return {'kind':'measured','source':{'kind':'browser_camera','frame_seconds':timestamps,
            'clock':'Browser monotonic elapsed timestamps; not independently verified wall-clock time.'},
            'video':video,'audio':None,'fusion':explain_fusion(fuse_signals(video,None),prefs.get('visual_weight',1),prefs.get('audio_weight',1)),'unavailable':unavailable,
            'notes':['Explicit browser capture; uploaded only after instructor review. No automatic attendance or identity inference.']}


def register_capture(app,job_lock,ValidationError):
    @app.post('/api/sessions/<int:session_id>/capture')
    def capture_upload(session_id):
        session=rows('SELECT * FROM sessions WHERE id=?',(session_id,))
        if not session: abort(404,description='Session not found.')
        if session[0]['is_demo']: raise ValidationError('Use a real session for camera observations.')
        if request.form.get('consent')!='true': raise ValidationError('Confirm authorization to upload this capture.')
        try: timestamps=json.loads(request.form.get('timestamps',''))
        except (ValueError,TypeError): raise ValidationError('Provide camera timestamps as a JSON array.')
        if not job_lock.acquire(blocking=False):
            return jsonify(error={'code':'busy','message':'Another recording is being analyzed. Please wait.'}),409
        stored=uuid4().hex+'.zip'
        path=Path(app.config['UPLOAD_FOLDER'])/stored
        try:
            try: images=validate_capture(request.files.getlist('frames'),timestamps)
            except (ValueError,cv2.error) as exc:
                raise ValidationError(str(exc) if isinstance(exc,ValueError) else 'Invalid camera image.') from exc
            with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_STORED) as archive:
                archive.writestr('timestamps.json',json.dumps(timestamps))
                for i,image in enumerate(images): archive.writestr(f'{i}.jpg',image)
            aid=db().execute("INSERT INTO analyses(session_id,filename,stored_name,status,created_at) VALUES(?,?,?,'queued',?)",
                (session_id,'Camera snapshots.zip',stored,now())).lastrowid
            event('Authorized camera snapshots uploaded for local analysis')
            db().commit()
            prefs=preferences()
            def work():
                from .analysis import process_job
                try: process_job(app,aid,str(path),prefs)
                finally: job_lock.release()
            if app.config.get('TESTING'): work()
            else: threading.Thread(target=work,daemon=True).start()
        except Exception:
            path.unlink(missing_ok=True)
            if job_lock.locked(): job_lock.release()
            raise
        return jsonify(id=aid,status='queued'),202

    @app.get('/api/analyses/<int:analysis_id>/frames/<int:index>')
    def capture_frame(analysis_id,index):
        record=rows('SELECT stored_name,result FROM analyses WHERE id=?',(analysis_id,))
        if not record or not record[0]['stored_name'] or not record[0]['stored_name'].endswith('.zip'):
            abort(404,description='Camera frame unavailable.')
        result=json.loads(record[0]['result'] or '{}')
        timestamps=result.get('source',{}).get('frame_seconds',[])
        if not 0<=index<len(timestamps): abort(404,description='Camera frame unavailable.')
        try:
            with zipfile.ZipFile(Path(app.config['UPLOAD_FOLDER'])/record[0]['stored_name']) as archive:
                data=archive.read(f'{index}.jpg')
        except (OSError,KeyError,zipfile.BadZipFile): abort(404,description='Camera frame unavailable.')
        response=send_file(io.BytesIO(data),mimetype='image/jpeg')
        response.headers['Cache-Control']='no-store'
        return response
