import io
import json
import sqlite3
import time
import zipfile
import cv2
import numpy as np
import pytest
from backend.app import create_app
from backend.db import db
from backend.capture import jpeg_dimensions, analyze_camera
from backend.observations import FaceObserver, PresenceTracker


@pytest.fixture
def client(tmp_path,monkeypatch):
    for key in ('GEMINI_API_KEY','DEMO_LOGIN_EMAIL','DEMO_LOGIN_PASSWORD'):
        monkeypatch.delenv(key,raising=False)
    app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'capture.sqlite3'),'UPLOAD_FOLDER':str(tmp_path/'media')})
    c=app.test_client()
    assert c.post('/api/auth/login',json={'email':'instructor@classroom.demo','password':'ClassroomDemo!2026'}).status_code==200
    return c


def session(client):
    return client.post('/api/sessions',json={'title':'Capture test','date':'2026-10-29','instructor':'QA'}).json['id']


def jpeg(value=0,w=160,h=128):
    ok,data=cv2.imencode('.jpg',np.full((h,w,3),value%256,np.uint8))
    assert ok
    return data.tobytes()


def capture_body(times=(0,2,4),images=None,consent='true'):
    images=images or [jpeg(i*30) for i in range(len(times))]
    return {'consent':consent,'timestamps':json.dumps(times),'frames':[(io.BytesIO(data),'untrusted.jpg') for data in images]}


def test_camera_capture_end_to_end_frames_privacy_and_deletion(client):
    sid=session(client)
    response=client.post(f'/api/sessions/{sid}/capture',data=capture_body())
    assert response.status_code==202
    aid=response.json['id']
    analysis=client.get('/api/analyses').json[0]
    assert analysis['status']=='complete'
    result=analysis['result']
    assert result['source']['frame_seconds']==[0,2,4]
    assert result['video']['face_tracking']['tracks']==[]
    assert result['video']['points'][1]['activity']>0
    assert result['analysis_preferences']['retain_face_previews'] is False
    assert result['fusion']['joint_windows']==0
    assert 'Head pose unsupported' in result['video']['face_tracking']['pose_method']
    image=client.get(f'/api/analyses/{aid}/frames/1')
    assert image.status_code==200 and image.mimetype=='image/jpeg' and image.headers['Cache-Control']=='no-store'
    assert cv2.imdecode(np.frombuffer(image.data,np.uint8),cv2.IMREAD_COLOR) is not None
    assert client.get(f'/api/analyses/{aid}/frames/3').status_code==404
    assert client.application.test_client().get(f'/api/analyses/{aid}/frames/0').status_code==401
    assert client.application.test_client().post(f'/api/sessions/{sid}/capture',data=capture_body()).status_code==401
    archive=client.get(f'/api/analyses/{aid}/media')
    with zipfile.ZipFile(io.BytesIO(archive.data)) as z:
        assert set(z.namelist())=={'timestamps.json','0.jpg','1.jpg','2.jpg'}
    archive.close()
    assert client.delete(f'/api/analyses/{aid}?media_only=true').status_code==200
    assert client.get(f'/api/analyses/{aid}/frames/0').status_code==404
    assert client.get('/api/analyses').json[0]['result']['source']['frame_seconds']==[0,2,4]


@pytest.mark.parametrize('times',[(0,),[0,0],[0,121],[False,2],[0,float('nan')],[6,8],list(range(61))])
def test_camera_rejects_invalid_timestamps_without_persistence(client,times):
    sid=session(client)
    assert client.post(f'/api/sessions/{sid}/capture',data=capture_body(times)).status_code==400
    assert client.get('/api/analyses').json==[]


def test_camera_rejects_empty_corrupt_oversize_and_unconsented_frames(client):
    sid=session(client)
    for data in (b'',b'not-jpeg',b'x'*(512*1024+1),jpeg(w=1000)):
        assert client.post(f'/api/sessions/{sid}/capture',data=capture_body((0,2),[data,jpeg()])).status_code==400
    assert client.post(f'/api/sessions/{sid}/capture',data=capture_body(consent='false')).status_code==400
    assert client.post(f'/api/sessions/{sid}/capture',data={'consent':'true','timestamps':'invalid'}).status_code==400
    assert client.get('/api/analyses').json==[]
    # Lock is released on validation errors; a later valid submission works.
    assert client.post(f'/api/sessions/{sid}/capture',data=capture_body()).status_code==202


def test_configurable_thresholds_validation_snapshot_and_presence_guard(client):
    baseline=client.get('/api/config').json['preferences']
    valid={'sample_seconds':2,'person_detection':False,'presence_seconds':40,'presence_samples':5,'still_motion_threshold':.01,'retain_face_previews':False}
    for key,value in [('presence_seconds',1),('presence_samples',True),('still_motion_threshold',float('inf')),('retain_face_previews','yes')]:
        assert client.put('/api/settings',json={**valid,key:value}).status_code==400
        assert client.get('/api/config').json['preferences']==baseline
    assert client.put('/api/settings',json=valid).status_code==200
    student=client.post('/api/students',json={'identifier':'CAP1','name':'Fictional learner','cohort':''}).json['id']
    sid=session(client)
    aid=client.post(f'/api/sessions/{sid}/capture',data=capture_body()).json['id']
    result=client.get('/api/analyses').json[0]['result']
    assert result['video']['face_tracking']['minimum_seconds']==40
    assert result['video']['face_tracking']['minimum_samples']==5
    # Deliberately contradictory fixture: API must not trust the qualified flag alone.
    result['video']['face_tracking']['tracks']=[{'id':1,'qualified':True,'samples':3,'span_seconds':20}]
    with client.application.app_context():
        db().execute('UPDATE analyses SET result=? WHERE id=?',(json.dumps(result),aid));db().commit()
    assert client.post(f'/api/sessions/{sid}/presence-confirmations',json={'analysis_id':aid,'track_id':1,'student_id':student,'identity_confirmed':True}).status_code==400
    assert client.get(f'/api/sessions/{sid}/attendance').json['summary']['present']==0


def test_track_configurable_thresholds_and_preview_opt_out():
    t=PresenceTracker(10,40,5,.1)
    for sec in (0,10,20,30):t.update(sec,[(0,0,50,50)])
    assert not t.result()[0]['qualified']
    t.update(40,[(0,0,50,50)])
    assert t.result()[0]['qualified']
    observer=FaceObserver(2)
    class Detector:
        def detectMultiScale(self,*args,**kwargs):return np.array([[20,20,40,40]])
    observer.detector=Detector()
    observer.observe(np.zeros((128,160,3),np.uint8),0)
    assert observer.tracker.result()[0]['preview'] is None


def test_camera_strips_embedded_metadata_and_locked_media_is_recoverable(client,monkeypatch):
    from pathlib import Path
    sid=session(client)
    sentinel=b'PRIVATE-EXIF-LIKE-TRAILER'
    aid=client.post(f'/api/sessions/{sid}/capture',data=capture_body((0,2),[jpeg()+sentinel,jpeg()])).json['id']
    assert sentinel not in client.get(f'/api/analyses/{aid}/frames/0').data
    original=Path.unlink
    def locked(path,*args,**kwargs):
        if path.suffix=='.zip':raise PermissionError('locked')
        return original(path,*args,**kwargs)
    monkeypatch.setattr(Path,'unlink',locked)
    response=client.delete(f'/api/analyses/{aid}?media_only=true')
    assert response.status_code==409 and response.json['error']['code']=='media_in_use'
    assert client.get('/api/analyses').json[0]['has_media'] is True
    assert client.get(f'/api/analyses/{aid}/frames/0').status_code==200


def test_sixty_frame_capture_resource_bounds(tmp_path):
    archive=tmp_path/'bounded.zip'
    with zipfile.ZipFile(archive,'w') as z:
        z.writestr('timestamps.json',json.dumps(list(range(0,120,2))))
        for i in range(60):z.writestr(f'{i}.jpg',jpeg(w=640,h=480))
    start=time.perf_counter()
    result=analyze_camera(archive,{'face_detection':True},lambda _:None)
    elapsed=time.perf_counter()-start
    print(f'60 synthetic 640x480 camera frames processed in {elapsed:.3f}s; archive {archive.stat().st_size} bytes')
    assert result['video']['frames_sampled']==60
    assert len(result['fusion']['points'])<=360
    assert len(result['video']['face_tracking']['tracks'])<=100
    assert jpeg_dimensions(jpeg())==(160,128)


def test_existing_database_copy_initializes_without_changing_records(tmp_path):
    # Read-only snapshot of the actual existing DB; initialize ONLY the disposable copy.
    from pathlib import Path
    original=Path(__file__).resolve().parents[1]/'data'/'classroom.sqlite3'
    if not original.exists():pytest.skip('Existing local database unavailable for copy verification')
    target=tmp_path/'existing-copy.sqlite3'
    with sqlite3.connect(original.as_uri()+'?mode=ro',uri=True) as source, sqlite3.connect(target) as dest:source.backup(dest)
    with sqlite3.connect(target) as c:
        tables=[r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        before={t:c.execute('SELECT * FROM "'+t+'" ORDER BY rowid').fetchall() for t in tables}
        pending=c.execute("SELECT count(*) FROM analyses WHERE status IN ('queued','processing')").fetchone()[0]
    if pending:pytest.skip('Copy contains pending jobs; initialization intentionally marks interrupted jobs')
    create_app({'TESTING':True,'DATABASE':str(target),'UPLOAD_FOLDER':str(tmp_path/'copy-media')})
    with sqlite3.connect(target) as c:
        for table,expected in before.items():assert c.execute('SELECT * FROM "'+table+'" ORDER BY rowid').fetchall()==expected
