import io
import json
import time
import cv2
import numpy as np
import pytest
from backend.app import create_app
from backend.live import LiveTracker,LiveRun,Windows
from backend.db import db

H={'Origin':'http://localhost:5000','X-Classroom-Live':'1'}

@pytest.fixture
def client(tmp_path,monkeypatch):
    for name in ('GEMINI_API_KEY','GOOGLE_API_KEY','GROQ_API_KEY','DEMO_LOGIN_EMAIL','DEMO_LOGIN_PASSWORD'):monkeypatch.delenv(name,raising=False)
    app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'live.sqlite3'),'UPLOAD_FOLDER':str(tmp_path/'media')})
    c=app.test_client();c.post('/api/auth/login',json={'email':'instructor@classroom.demo','password':'ClassroomDemo!2026'})
    return c

def setup(c):
    student=c.post('/api/students',json={'identifier':'LIVE-1','name':'Fictional Live Test','cohort':''}).json['id']
    sid=c.post('/api/sessions',json={'title':'Live QA','date':'2026-10-30','instructor':'QA'}).json['id']
    response=c.post('/api/live/start',json={'session_id':sid,'consent':True},headers=H)
    assert response.status_code==201
    run=c.application.extensions['live_runs'][response.json['id']]
    clock=[100.];run.clock=lambda:clock[0];run.start=100.;run.last=100.;run.checkpoint=100.
    return sid,student,run,clock

def jpeg(value=0):return cv2.imencode('.jpg',np.full((240,320,3),value,np.uint8))[1].tobytes()

def frame(c,r,clock,second,audio=None,data=None):
    clock[0]=100+second
    form={'seconds':str(second),'frame':(io.BytesIO(data if data is not None else jpeg()),'frame.jpg')}
    if audio is not None:form['audio']=json.dumps(audio)
    return c.post(f'/api/live/{r.id}/frame',data=form,headers=H)

def test_tracker_multiple_continuity_gap_and_qualification():
    t=LiveTracker(fps=4)
    for i in range(82):
        t.update(i*.25,[[.1+(i%2)*.005,.1,.15,.15],[.6,.1,.15,.15]])
    assert len(t.tracks)==2 and all(x['qualified'] for x in t.tracks)
    assert all(x['samples']==82 for x in t.tracks)
    t.update(21,[]);assert not any(x['visible'] for x in t.tracks)
    ids=t.update(22,[[.1,.1,.15,.15]])
    assert ids==[1] and t.tracks[0]['presence_seconds']<22
    assert t.update(33,[[.1,.1,.15,.15]])==[3]
    assert not t.tracks[-1]['qualified']
    one=LiveTracker();one.update(0,[[0,0,.2,.2]]);one.update(10,[[0,0,.2,.2]]);one.update(20,[[0,0,.2,.2]])
    assert not one.tracks[0]['qualified'] and one.tracks[0]['presence_seconds']==1

def test_ambiguity_and_scene_reset_never_guess_identity():
    t=LiveTracker();t.update(0,[[.1,.1,.2,.2],[.12,.1,.2,.2]])
    assert t.update(.25,[[.11,.1,.2,.2]])==[3]
    t.break_continuity();assert t.update(.5,[[.11,.1,.2,.2]])==[4]

def test_frame_decode_real_haar_empty_input_and_privacy(client):
    sid,student,r,clock=setup(client)
    first=frame(client,r,clock,.25)
    assert first.status_code==200 and first.json['tracks']==[] and first.json['frames_processed']==1
    assert first.json['processed_fps']>0 and first.json['processing_ms']>=0
    assert frame(client,r,clock,.5,data=b'not-jpeg').status_code==400
    assert frame(client,r,clock,.5,data=b'x'*(256*1024+1)).status_code==413
    assert frame(client,r,clock,.5).status_code==200
    assert frame(client,r,clock,.5).status_code==429
    response=client.post(f'/api/live/{r.id}/end',json={},headers=H)
    assert response.status_code==200
    analysis=client.get('/api/analyses').json[0]
    assert analysis['status']=='complete' and not analysis['has_media']
    assert analysis['result']['source']['kind']=='live_monitor'
    from pathlib import Path
    assert not list(Path(client.application.config['UPLOAD_FOLDER']).iterdir())
    assert r.previous is None and r.id not in client.application.extensions['live_runs']

def test_live_confirm_requires_sustained_visible_track_and_roster(client):
    sid,student,r,clock=setup(client)
    # Synthetic detector boxes validate the plumbing, not real-world face accuracy.
    class Detector:
        def detectMultiScale(self,*a,**k):return [(40,40,60,60)]
    r.observer.detector=Detector()
    path=f'/api/live/{r.id}/confirm';body={'track_id':1,'student_id':student,'identity_confirmed':True}
    frame(client,r,clock,.25)
    assert client.post(path,json=body,headers=H).status_code==400
    for i in range(2,83):assert frame(client,r,clock,i*.25).status_code==200
    assert client.post(path,json={**body,'identity_confirmed':False},headers=H).status_code==400
    assert client.post(path,json={**body,'student_id':99999},headers=H).status_code==400
    assert client.post(path,json=body,headers=H).json['duplicate'] is False
    assert client.post(path,json=body,headers=H).json['duplicate'] is True
    other=client.post('/api/students',json={'identifier':'LIVE-2','name':'Other','cohort':''}).json['id']
    assert client.post(path,json={**body,'student_id':other},headers=H).status_code in (400,409)
    with client.application.app_context():
        record=db().execute('SELECT * FROM attendance WHERE session_id=? AND student_id=?',(sid,student)).fetchone()
        assert record['status']=='present' and record['confirmed_at'] and record['source']=='instructor_live_confirmation'
        assert db().execute('SELECT COUNT(*) FROM attendance_changes WHERE analysis_id=?',(r.aid,)).fetchone()[0]==1
    clock[0]+=3
    assert client.post(path,json=body,headers=H).status_code==400
    assert 'instructor_live_confirmation' in client.get('/api/export/attendance.csv').text

def test_audio_alignment_missing_signals_and_no_speech_claim(client):
    _,_,r,clock=setup(client)
    frame(client,r,clock,.25)
    audio={'start':.25,'end':.5,'rms':.05,'active_fraction':1.,'intervals':[{'start':.25,'end':.5}]}
    result=frame(client,r,clock,.5,audio=audio)
    assert result.status_code==200
    w=result.json['windows'][0]
    assert w['sound']==100 and w['visual']==0 and w['score']==50 and w['modalities']==2
    assert result.json['audio_intervals']==audio['intervals']
    assert frame(client,r,clock,.75,audio=audio).status_code==400
    invalid={**audio,'start':.5,'end':.75,'rms':float('nan')}
    assert frame(client,r,clock,.75,audio=invalid).status_code==400
    windows=Windows();windows.add(0,5,'visual',.2)
    assert windows.result(5)[0]['sound'] is None and windows.result(5)[0]['score']==20
    windows.add(9,11,'audio',1)
    assert len(windows.result(11))==2
    assert windows.result(11)[0]['joint_coverage']==0

def test_backend_drop_queue_authorization_and_expiration(client):
    sid,student,r,clock=setup(client)
    assert client.application.test_client().post(f'/api/live/{r.id}/end',json={},headers=H).status_code==401
    assert client.post(f'/api/live/{r.id}/end',json={}).status_code==403
    assert client.post('/api/live/start',json={'session_id':sid,'consent':True},headers=H).status_code==409
    r.lock.acquire()
    try:assert frame(client,r,clock,.25).status_code==429
    finally:r.lock.release()
    clock[0]=125
    with client.application.app_context():client.application.extensions['live_sweep']()
    assert r.closed and r.previous is None
    assert frame(client,r,clock,26).status_code==410
    assert client.post(f'/api/live/{r.id}/end',json={},headers=H).status_code==200
    result=client.post('/api/live/start',json={'session_id':sid,'consent':True},headers=H)
    assert result.status_code==201 and result.json['id']!=r.id

def test_other_login_cannot_control_existing_live_run(client):
    _,_,r,clock=setup(client)
    other=client.application.test_client()
    other.post('/api/auth/login',json={'email':'instructor@classroom.demo','password':'ClassroomDemo!2026'})
    assert other.post(f'/api/live/{r.id}/end',json={},headers=H).status_code==403
    assert other.post(f'/api/live/{r.id}/confirm',json={},headers=H).status_code==403

@pytest.mark.parametrize('field,value',[('consent',False),('fps',6),('minimum_seconds',19),('minimum_samples',2),('maximum_gap',11),('fps',True)])
def test_live_start_threshold_validation(client,field,value):
    sid=client.post('/api/sessions',json={'title':'Validation','date':'2026-10-30','instructor':'QA'}).json['id']
    assert client.post('/api/live/start',json={'session_id':sid,'consent':True,field:value},headers=H).status_code==400

def test_live_local_suggestions_and_restart_preserves_checkpoint(client):
    _,_,r,clock=setup(client)
    frame(client,r,clock,.25);frame(client,r,clock,11)
    result=client.post(f'/api/live/{r.id}/suggestions',json={'cloud':True},headers=H)
    assert result.status_code==200 and result.json['source']=='local' and result.json['items'][0]['evidence']
    restarted=create_app(dict(client.application.config))
    with restarted.app_context():
        record=db().execute('SELECT status,result FROM analyses WHERE id=?',(r.aid,)).fetchone()
        assert record['status']=='failed' and json.loads(record['result'])['source']['kind']=='live_monitor'

def test_synthetic_detector_performance_smoke():
    prefs=dict(fps=4,minimum_seconds=20,minimum_samples=3,maximum_gap=10,still_threshold=.02)
    r=LiveRun(1,1,'test',prefs);clock=[100.];r.clock=lambda:clock[0];r.start=100.;r.last=100.
    latencies=[]
    for i in range(40):
        clock[0]=100+(i+1)*.25;start=time.perf_counter();r.process(jpeg(),(i+1)*.25,None);latencies.append((time.perf_counter()-start)*1000)
    print(f'\nSynthetic 320x240 blank JPEG, Haar+tracker+fusion: n=40 median={np.median(latencies):.2f}ms p95={np.percentile(latencies,95):.2f}ms; no faces/hardware, not classroom throughput.')
    assert len(r.observer.tracker.tracks)==0 and r.frames==40


def test_exact_live_start_post_route_and_health_protocol(client):
    health=client.get('/api/health')
    assert health.status_code==200
    assert health.json['live_monitor']=={'protocol':1,'start_method':'POST','start_path':'/api/live/start'}
    rules=[rule for rule in client.application.url_map.iter_rules() if rule.rule=='/api/live/start']
    assert len(rules)==1 and 'POST' in rules[0].methods
    # A signed-in malformed POST reaches validation, never the SPA catch-all 405.
    response=client.post('/api/live/start',json={},headers=H)
    assert response.status_code==400 and response.json['error']['code']=='live_error'
    anonymous=client.application.test_client()
    response=anonymous.post('/api/live/start',json={},headers=H)
    assert response.status_code==401
    sid,student,run,clock=setup(client)
    assert run.sid==sid
    assert client.post(f'/api/live/{run.id}/end',headers=H).status_code==200
