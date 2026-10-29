import io
import json
import sqlite3
import wave
from pathlib import Path
import cv2
import numpy as np
import pytest
from backend.app import create_app
from backend.db import db, now
from backend.analysis import audio_metrics, analyze_media
from backend.observations import PresenceTracker, FaceObserver, fuse_signals
from backend.recommendations import summarize


@pytest.fixture
def client(tmp_path,monkeypatch):
    for key in ('GEMINI_API_KEY','DEMO_LOGIN_EMAIL','DEMO_LOGIN_PASSWORD'):
        monkeypatch.delenv(key,raising=False)
    app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'test.sqlite3'),'UPLOAD_FOLDER':str(tmp_path/'media')})
    c=app.test_client()
    assert c.post('/api/auth/login',json={'email':'instructor@classroom.demo','password':'ClassroomDemo!2026'}).status_code==200
    return c


def roster(client):
    student=client.post('/api/students',json={'identifier':'TEST1','name':'Test learner','cohort':'Evaluation'}).json['id']
    session=client.post('/api/sessions',json={'title':'Evaluation','date':'2026-10-29','instructor':'Test instructor'}).json['id']
    return session,student


def add_analysis(client,sid,result,filename='test.avi'):
    with client.application.app_context():
        # Fake bytes are for API authorization/state tests only, not decoder validation.
        path=Path(client.application.config['UPLOAD_FOLDER'])/filename
        path.write_bytes(b'fixture-not-real-media')
        aid=db().execute("INSERT INTO analyses(session_id,filename,stored_name,status,progress,result,created_at) VALUES(?,?,?,'complete',100,?,?)",
                         (sid,filename,filename,json.dumps(result),now())).lastrowid
        db().commit()
        return aid


def visual(points=None):
    return {'duration_seconds':30,'sample_seconds':10,'points':points or [
        {'seconds':0,'activity':None},{'seconds':10,'activity':5},{'seconds':20,'activity':10}],
        'face_tracking':{'eligible_sampling':True,'tracks':[{'id':1,'samples':3,'span_seconds':20,'qualified':True,'preview':'fixture'}]}}


def audio():
    return {'duration_seconds':30,'active_intervals':[{'start':0,'end':10}], 'active_fraction':1/3}


def test_additive_migration_backs_up_preserves_and_is_idempotent(tmp_path):
    target=tmp_path/'legacy.sqlite3'
    with sqlite3.connect(target) as c:
        c.executescript("CREATE TABLE students(id INTEGER PRIMARY KEY,identifier TEXT,name TEXT,cohort TEXT,is_demo INTEGER); CREATE TABLE sessions(id INTEGER PRIMARY KEY,title TEXT,date TEXT,instructor TEXT,is_demo INTEGER,created_at TEXT); CREATE TABLE attendance(session_id INTEGER,student_id INTEGER,status TEXT,PRIMARY KEY(session_id,student_id)); INSERT INTO students VALUES(1,'A','Original','Class',0); INSERT INTO sessions VALUES(1,'Original','2026-10-29','Teacher',0,'original-time'); INSERT INTO attendance VALUES(1,1,'present');")
    config={'TESTING':True,'DATABASE':str(target),'UPLOAD_FOLDER':str(tmp_path/'media')}
    app=create_app(config)
    with app.app_context():
        row=dict(db().execute('SELECT * FROM attendance').fetchone())
        assert row=={'session_id':1,'student_id':1,'status':'present','confirmed_at':None,'updated_at':None,'source':'legacy'}
        assert db().execute('SELECT name FROM students').fetchone()[0]=='Original'
    backups=list((tmp_path/'backups').glob('*.sqlite3'))
    assert len(backups)==1
    with sqlite3.connect(backups[0]) as c:
        assert c.execute('SELECT * FROM attendance').fetchall()==[(1,1,'present')]
        assert len(c.execute('PRAGMA table_info(attendance)').fetchall())==3
    create_app(config)
    assert list((tmp_path/'backups').glob('*.sqlite3'))==backups


def test_attendance_timestamp_history_csv_and_duplicate_batch(client):
    sid,student=roster(client)
    url=f'/api/sessions/{sid}/attendance'
    record={'student_id':student,'status':'present'}
    assert client.put(url,json={'records':[record,record]}).status_code==400
    assert client.get(url).json['changes']==[]
    assert client.put(url,json={'records':[record]}).status_code==200
    data=client.get(url).json
    assert data['records'][0]['confirmed_at'].endswith('+00:00')
    assert data['records'][0]['source']=='manual'
    assert data['changes'][0]['previous_status']=='unconfirmed'
    assert client.put(url,json={'records':[record]}).status_code==200
    assert len(client.get(url).json['changes'])==1
    assert client.put(url,json={'records':[{'student_id':student,'status':'absent'}]}).status_code==200
    assert len(client.get(url).json['changes'])==2
    csv=client.get(f'/api/export/attendance.csv?session_id={sid}').text
    assert 'Confirmed at (UTC)' in csv and '+00:00' in csv
    assert client.get('/api/students').json[0]['history'][0]['confirmed_at']
    assert client.put(url,json={'records':[{'student_id':student,'status':'unconfirmed'}]}).status_code==200
    assert client.get(url).json['records'][0]['confirmed_at'] is None


def test_attendance_invalid_batch_does_not_partially_write(client):
    sid,student=roster(client)
    response=client.put(f'/api/sessions/{sid}/attendance',json={'records':[{'student_id':student,'status':'present'},{'student_id':999,'status':'absent'}]})
    assert response.status_code==400
    data=client.get(f'/api/sessions/{sid}/attendance').json
    assert data['summary']['present']==0 and not data['changes']


def test_track_requires_multiple_samples_and_twenty_seconds():
    tracker=PresenceTracker(10)
    box=(.1,.1,.2,.2)
    tracker.update(0,[box]);assert not tracker.result()[0]['qualified']
    tracker.update(10,[box]);assert not tracker.result()[0]['qualified']
    tracker.update(20,[box]);result=tracker.result()[0]
    assert result['qualified'] and result['samples']==3 and result['span_seconds']==20
    assert result['longest_still_seconds']==20
    assert result['mean_eye_line_roll_degrees'] is None


def test_track_missing_frame_ambiguity_and_sparse_sampling_break_presence():
    box=(.1,.1,.2,.2)
    t=PresenceTracker(10)
    t.update(0,[box]);t.update(10,[]);t.update(20,[box])
    assert len(t.result())==2 and not any(r['qualified'] for r in t.result())
    t.update(30,[box,box])
    assert len(t.result())==4
    sparse=PresenceTracker(20)
    for second in (0,20,40):sparse.update(second,[box])
    assert not any(r['qualified'] for r in sparse.result())
    gap=PresenceTracker(2);gap.update(0,[box]);gap.update(10,[box])
    assert len(gap.result())==2


def test_track_motion_roll_and_cap():
    tracker=PresenceTracker(2)
    tracker.update(0,[(.1,.1,.2,.2)],rolls={0:5})
    tracker.update(2,[(.12,.1,.2,.2)],rolls={0:7})
    result=tracker.result()[0]
    assert result['mean_motion_face_widths_per_second']==.05
    assert result['mean_eye_line_roll_degrees']==6 and result['roll_samples']==2
    assert result['longest_still_seconds']==0
    for second in range(4,500,2):
        tracker.update(second,[]);tracker.update(second+.1,[(.1,.1,.2,.2)])
    assert len(tracker.result())==100


def test_bundled_face_model_executes_without_fabricating_faces():
    observer=FaceObserver(10)
    assert observer.observe(np.zeros((128,160,3),dtype=np.uint8),0)==[]
    assert observer.tracker.result()==[]


def test_face_observer_tracks_mock_detections_and_roll(monkeypatch):
    observer=FaceObserver(10)
    class Faces:
        def detectMultiScale(self,*args,**kwargs):return np.array([[40,20,80,80]])
    class Eyes:
        def empty(self):return False
        def detectMultiScale(self,*args,**kwargs):return np.array([[10,10,10,10],[45,15,10,10]])
    observer.detector=Faces();observer.eyes=Eyes()
    for sec in (0,10,20):observer.observe(np.zeros((128,160,3),dtype=np.uint8),sec)
    track=observer.tracker.result()[0]
    assert track['qualified'] and track['preview'] and track['roll_samples']==3
    assert 8<track['mean_eye_line_roll_degrees']<9


def test_presence_review_needs_identity_qualification_roster_and_media(client):
    sid,student=roster(client)
    aid=add_analysis(client,sid,{'kind':'measured','video':visual()})
    url=f'/api/sessions/{sid}/presence-confirmations'
    data={'analysis_id':aid,'track_id':1,'student_id':student}
    assert client.post(url,json=data).status_code==400
    data['identity_confirmed']=True
    assert client.post(url,json={**data,'track_id':99}).status_code==400
    assert client.post(url,json={**data,'student_id':999}).status_code==400
    assert client.get(f'/api/sessions/{sid}/attendance').json['summary']['present']==0
    assert client.post(url,json=data).status_code==201
    assert client.post(url,json=data).json['duplicate']
    attendance=client.get(f'/api/sessions/{sid}/attendance').json
    assert attendance['summary']['present']==1 and len(attendance['changes'])==1
    assert attendance['changes'][0]['analysis_id']==aid
    assert attendance['records'][0]['source']=='instructor_reviewed_track'
    assert client.get(f'/api/analyses/{aid}/media').status_code==200
    assert client.delete(f'/api/analyses/{aid}?media_only=true').status_code==200
    assert client.get('/api/analyses').json[0]['result']['video']['face_tracking']['tracks'][0]['preview'] is None
    assert client.post(url,json=data).status_code==400
    assert client.get(f'/api/analyses/{aid}/media').status_code==404


def test_single_frame_track_never_confirms_attendance(client):
    sid,student=roster(client);v=visual()
    v['face_tracking']['tracks'][0].update(samples=1,span_seconds=0,qualified=False)
    aid=add_analysis(client,sid,{'kind':'measured','video':v})
    assert client.post(f'/api/sessions/{sid}/presence-confirmations',json={'analysis_id':aid,'track_id':1,'student_id':student,'identity_confirmed':True}).status_code==400
    assert client.get(f'/api/sessions/{sid}/attendance').json['summary']['present']==0


def test_media_review_requires_auth(client):
    sid,_=roster(client);aid=add_analysis(client,sid,{'kind':'measured','video':visual()})
    client.post('/api/auth/logout')
    assert client.get(f'/api/analyses/{aid}/media').status_code==401


def test_fusion_alignment_missing_signals_and_gaps():
    result=fuse_signals(visual(),audio())
    assert result['points'][0]['score']==75 # 50 visual, 100 audio
    assert result['points'][1]['score']==50 # 100 visual, zero sound
    assert result['points'][2]['visual'] is None # no fabricated final video interval
    assert result['joint_windows']==2
    partial=fuse_signals(visual(),None)
    assert partial['joint_windows']==0 and partial['points'][0]['score']==50
    shifted=fuse_signals(visual(),audio(),10)
    assert shifted['points'][0]['sound'] is None and shifted['points'][1]['sound']==100
    missing=fuse_signals(visual([{'seconds':0,'activity':None},{'seconds':25,'activity':10}]),None)
    assert missing['score'] is None
    assert fuse_signals(None,None) is None


def test_fusion_rejects_nonoverlapping_sources_even_in_same_window():
    v={'duration_seconds':10,'sample_seconds':2,'points':[{'seconds':0,'activity':None},{'seconds':2,'activity':5}]}
    a={'duration_seconds':2,'active_intervals':[]}
    assert fuse_signals(v,a,5)['joint_windows']==0


def test_combined_api_requires_same_session_and_preserves_sources(client):
    sid,_=roster(client)
    v=add_analysis(client,sid,{'kind':'measured','video':visual(),'audio':None},'video.avi')
    a=add_analysis(client,sid,{'kind':'measured','video':None,'audio':audio()},'audio.wav')
    url=f'/api/sessions/{sid}/fusion';data={'video_analysis_id':v,'audio_analysis_id':a,'audio_offset_seconds':0}
    assert client.post(url,json={**data,'audio_offset_seconds':True}).status_code==400
    assert client.post(url,json={**data,'audio_offset_seconds':100}).status_code==400
    assert client.post(url,json={**data,'audio_analysis_id':v}).status_code==400
    response=client.post(url,json=data);assert response.status_code==201
    records=client.get('/api/analyses').json
    assert len(records)==3 and records[0]['result']['fusion']['joint_windows']==2
    assert 'face_tracking' not in records[0]['result']['video']
    assert records[0]['result']['derived_from']==[v,a]
    assert client.post(url,json={**data,'video_analysis_id':response.json['id']}).status_code==400
    other=client.post('/api/sessions',json={'title':'Other','date':'2026-10-29','instructor':'Test'}).json['id']
    assert client.post(f'/api/sessions/{other}/fusion',json=data).status_code==400


def test_timestamp_gaps_do_not_extend_low_activity_runs():
    result=summarize({'kind':'measured','video':{'sample_seconds':10,'points':[
        {'seconds':0,'activity':None},{'seconds':10,'activity':1},{'seconds':100,'activity':1},{'seconds':110,'activity':1}]}}, {'present':0,'total':0,'unconfirmed':0})
    assert result['low_scene_change_seconds']==10


def test_audio_heuristic_is_not_claimed_as_speech_and_tracks_bouts(tmp_path):
    path=tmp_path/'audio.wav'
    with wave.open(str(path),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(8000)
        tone=np.sin(np.arange(8000)*2*np.pi*440/8000)*12000
        f.writeframes(np.concatenate([np.zeros(8000),tone,np.zeros(8000),tone]).astype('<i2').tobytes())
    result=audio_metrics(path)
    assert result['activity_bouts']==2 and result['bouts_per_minute']==30
    assert 0<=result['speech_like_fraction']<=1
    assert 'not verified speech' in result['speech_method']
    assert result['active_fraction']==.5


def test_new_video_pipeline_returns_face_and_fusion_metadata(tmp_path,monkeypatch):
    monkeypatch.setattr('backend.analysis.shutil.which',lambda _:None)
    path=tmp_path/'blank.avi'
    writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'MJPG'),1,(160,128))
    assert writer.isOpened()
    for i in range(4):writer.write(np.full((128,160,3),i*50,dtype=np.uint8))
    writer.release()
    result=analyze_media(path,{'sample_seconds':2,'person_detection':False},lambda _:None)
    assert result['video']['face_tracking']['tracks']==[]
    assert result['video']['points'][0]['faces']==0
    assert result['fusion']['joint_windows']==0
    assert result['audio'] is None


def test_face_preferences_can_disable_observations(client,tmp_path,monkeypatch):
    assert client.put('/api/settings',json={'sample_seconds':2,'person_detection':False,'face_detection':'yes'}).status_code==400
    assert client.put('/api/settings',json={'sample_seconds':2,'person_detection':False,'face_detection':False}).json['face_detection'] is False
    monkeypatch.setattr('backend.analysis.shutil.which',lambda _:None)
    path=tmp_path/'no-faces.avi'
    writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'MJPG'),1,(160,128))
    writer.write(np.zeros((128,160,3),dtype=np.uint8));writer.release()
    result=analyze_media(path,{'sample_seconds':2,'person_detection':False,'face_detection':False},lambda _:None)
    assert result['video']['face_tracking'] is None
    assert result['video']['points'][0]['faces'] is None
    assert any('disabled' in x for x in result['unavailable'])


def test_presence_cannot_link_a_track_to_two_students_or_another_session(client):
    sid,student=roster(client)
    other=client.post('/api/students',json={'identifier':'TEST2','name':'Other learner','cohort':''}).json['id']
    client.post(f'/api/sessions/{sid}/roster')
    aid=add_analysis(client,sid,{'kind':'measured','video':visual()})
    payload={'analysis_id':aid,'track_id':1,'student_id':student,'identity_confirmed':True}
    assert client.post(f'/api/sessions/{sid}/presence-confirmations',json=payload).status_code==201
    assert client.post(f'/api/sessions/{sid}/presence-confirmations',json={**payload,'student_id':other}).status_code==400
    another=client.post('/api/sessions',json={'title':'Other','date':'2026-10-29','instructor':'Test'}).json['id']
    assert client.post(f'/api/sessions/{another}/presence-confirmations',json=payload).status_code==400
    assert client.get(f'/api/sessions/{sid}/attendance').json['summary']['present']==1


def test_real_http_async_upload_fusion_export_and_logout(tmp_path,monkeypatch):
    """Real sockets + daemon analysis worker, synthetic files, isolated database."""
    import threading
    import time
    import requests
    from werkzeug.serving import make_server
    for key in ('GEMINI_API_KEY','DEMO_LOGIN_EMAIL','DEMO_LOGIN_PASSWORD'):
        monkeypatch.delenv(key,raising=False)
    monkeypatch.setattr('backend.analysis.shutil.which',lambda _:None)
    app=create_app({'DATABASE':str(tmp_path/'http.sqlite3'),'UPLOAD_FOLDER':str(tmp_path/'media')})
    server=make_server('127.0.0.1',0,app,threaded=True)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    base=f'http://127.0.0.1:{server.server_port}'
    session=requests.Session()
    try:
        assert session.get(base+'/api/health',timeout=5).json()['status']=='ok'
        assert session.get(base+'/api/students',timeout=5).status_code==401
        assert session.post(base+'/api/auth/login',json={'email':'instructor@classroom.demo','password':'ClassroomDemo!2026'},timeout=5).status_code==200
        sid=session.post(base+'/api/sessions',json={'title':'Synthetic HTTP evaluation','date':'2026-10-29','instructor':'QA'},timeout=5).json()['id']
        paths=[]
        video=tmp_path/'synthetic.avi'
        writer=cv2.VideoWriter(str(video),cv2.VideoWriter_fourcc(*'MJPG'),2,(160,128))
        assert writer.isOpened()
        for i in range(48):writer.write(np.full((128,160,3),(i//8)*30,dtype=np.uint8))
        writer.release();paths.append(video)
        wav=tmp_path/'synthetic.wav'
        with wave.open(str(wav),'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(8000)
            f.writeframes(np.concatenate([np.zeros(8000*12),np.sin(np.arange(8000*12)*2*np.pi*440/8000)*12000]).astype('<i2').tobytes())
        paths.append(wav)
        ids=[]
        for path in paths:
            with path.open('rb') as f:
                response=session.post(base+f'/api/sessions/{sid}/media',files={'file':(path.name,f)},timeout=10)
            assert response.status_code==202
            aid=response.json()['id'];ids.append(aid)
            deadline=time.monotonic()+20
            while time.monotonic()<deadline:
                record=next(a for a in session.get(base+'/api/analyses',timeout=5).json() if a['id']==aid)
                if record['status'] in ('complete','failed'):break
                time.sleep(.05)
            assert record['status']=='complete',record.get('error')
        combined=session.post(base+f'/api/sessions/{sid}/fusion',json={'video_analysis_id':ids[0],'audio_analysis_id':ids[1],'audio_offset_seconds':0},timeout=5)
        assert combined.status_code==201
        latest=session.get(base+'/api/analyses',timeout=5).json()[0]
        assert latest['result']['fusion']['joint_windows']>0
        assert session.get(base+f'/api/analyses/{ids[0]}/media',timeout=5).content==video.read_bytes()
        assert session.get(base+f'/api/sessions/{sid}/attendance',timeout=5).json()['summary']['present']==0
        assert session.post(base+'/api/recommendations',json={'session_id':sid,'use_gemini':True},timeout=5).json()['source']=='local'
        assert 'Confirmed at (UTC)' in session.get(base+'/api/export/attendance.csv',timeout=5).text
        assert session.get(base+'/api/analytics',timeout=5).json()['summary']['analyzed']==1
        assert session.post(base+'/api/auth/logout',timeout=5).status_code==200
        assert session.get(base+f'/api/analyses/{ids[0]}/media',timeout=5).status_code==401
    finally:
        session.close();server.shutdown();server.server_close();thread.join(timeout=5)
