import io
import json
import wave
import numpy as np
import cv2
import pytest
from backend.app import create_app
from backend.analysis import analyze_media, audio_metrics
from backend.recommendations import generate, local_rules

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY',raising=False)
    monkeypatch.delenv('DEMO_LOGIN_EMAIL',raising=False)
    monkeypatch.delenv('DEMO_LOGIN_PASSWORD',raising=False)
    app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'test.sqlite3'),'UPLOAD_FOLDER':str(tmp_path/'media')})
    client=app.test_client()
    assert client.post('/api/auth/login',json={'email':'instructor@classroom.demo','password':'ClassroomDemo!2026'}).status_code==200
    return client

def student(client, identifier='A-1', name='Alex Green'):
    return client.post('/api/students',json={'name':name,'identifier':identifier,'cohort':'Science'})

def session(client):
    return client.post('/api/sessions',json={'title':'Ecology','date':'2026-10-29','instructor':'Dr Green'})

def wav_bytes():
    output=io.BytesIO()
    with wave.open(output,'wb') as audio:
        audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(8000)
        # Two seconds of silence followed by two seconds of a tone.
        signal=np.concatenate([np.zeros(16000),np.sin(np.arange(16000)*2*np.pi*440/8000)*12000]).astype('<i2')
        audio.writeframes(signal.tobytes())
    return output.getvalue()

def test_initialization_and_empty_state(client):
    assert client.get('/api/health').json['status']=='ok'
    assert client.get('/api/students').json==[]
    assert client.get('/api/analytics').json['summary']['rate'] is None
    assert client.get('/api/not-a-route').status_code==404

def test_student_crud_and_validation(client):
    response=student(client);assert response.status_code==201
    sid=response.json['id']
    assert student(client,'a-1').status_code==409
    assert student(client,'unsafe id').status_code==400
    assert student(client,'A-2',' ').status_code==400
    assert client.post('/api/students',json=[]).status_code==400
    assert client.put(f'/api/students/{sid}',json={'identifier':'A-3','name':'Alex Updated','cohort':''}).status_code==200
    assert client.get('/api/students').json[0]['name']=='Alex Updated'
    assert client.delete(f'/api/students/{sid}').status_code==200
    assert client.get('/api/students').json==[]

def test_session_validation_and_attendance_math(client):
    one=student(client).json['id'];two=student(client,'A-2','Sam').json['id']
    sid=session(client).json['id']
    assert client.post('/api/sessions',json={'title':'x','date':'2026-02-30','instructor':'x'}).status_code==400
    assert client.get(f'/api/sessions/{sid}/attendance').json['summary']['unconfirmed']==2
    update=client.put(f'/api/sessions/{sid}/attendance',json={'records':[{'student_id':one,'status':'present'}]})
    assert update.json['rate']==50
    assert update.json['unconfirmed']==1
    assert client.put(f'/api/sessions/{sid}/attendance',json={'records':[{'student_id':two,'status':'absent'}]}).json['absent']==1
    assert client.put(f'/api/sessions/{sid}/attendance',json={'records':[{'student_id':999,'status':'present'}]}).status_code==400
    assert client.get('/api/students').json[0]['history'][0]['status']=='present'
    assert client.get('/api/analytics?start=2026-10-01&end=2026-10-30').json['summary']['rate']==50
    assert client.get('/api/analytics?start=2026-11-01&end=2026-10-01').status_code==400
    assert client.get('/api/analytics?start=2027-01-01').json['summary']['total']==0
    assert client.put(f'/api/sessions/{sid}',json={'title':'Changed','date':'2026-10-28','instructor':'Teacher'}).status_code==200
    assert client.get(f'/api/sessions/{sid}').json['title']=='Changed'
    assert client.delete(f'/api/sessions/{sid}').status_code==200
    assert client.get('/api/students').json[0]['history']==[]

def test_roster_is_snapshot_with_explicit_sync(client):
    student(client);sid=session(client).json['id'];student(client,'A-2')
    assert client.get(f'/api/sessions/{sid}/attendance').json['summary']['total']==1
    assert client.post(f'/api/sessions/{sid}/roster').json['total']==2

def test_csv_and_formula_safety(client):
    student(client,name='=HYPERLINK("bad")');sid=session(client).json['id']
    response=client.get(f'/api/export/attendance.csv?session_id={sid}')
    assert response.status_code==200
    assert 'attachment' in response.headers['Content-Disposition']
    assert "'=HYPERLINK" in response.text
    assert 'unconfirmed' in response.text

def test_missing_key_and_recommendation_fallback(client):
    student(client);sid=session(client).json['id']
    config=client.get('/api/config').json
    assert config['gemini']['access']=='not_configured'
    assert 'api_key' not in json.dumps(config).lower()
    assert client.post('/api/config/verify-gemini').json['access']=='not_configured'
    response=client.post('/api/recommendations',json={'session_id':sid,'use_gemini':True})
    assert response.status_code==201
    assert response.json['source']=='local'
    assert 'unconfirmed' in response.json['items'][0]['evidence']
    assert len(client.get('/api/recommendations').json)==1

def test_provider_failure_uses_local_rules(monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY','unit-test-not-a-real-key')
    class UnavailableClient:
        def __init__(self,**kwargs): self.models=self
        def get(self,**kwargs): raise RuntimeError('provider unavailable with sensitive text')
        def close(self): pass
    monkeypatch.setattr('google.genai.Client',UnavailableClient)
    result=generate({'attendance':{'present':0,'unconfirmed':1,'total':1}},True)
    assert result['source']=='local'
    assert 'sensitive text' not in result['note']

def test_rule_thresholds():
    result=local_rules({'attendance':{'present':1,'unconfirmed':0,'total':1},'low_scene_change_seconds':180,'scene_change_range':22,'sound_active_fraction':.1})
    assert len(result)==3
    assert all('evidence' in item for item in result)

def test_upload_validation_and_failed_decode(client):
    sid=session(client).json['id']
    assert client.post(f'/api/sessions/{sid}/media').status_code==400
    assert client.post(f'/api/sessions/{sid}/media',data={'file':(io.BytesIO(b'hello'),'bad.exe')}).status_code==400
    assert client.post(f'/api/sessions/{sid}/media',data={'file':(io.BytesIO(b''),'empty.wav')}).status_code==400
    response=client.post(f'/api/sessions/{sid}/media',data={'file':(io.BytesIO(b'not video'),'bad.mp4')})
    assert response.status_code==202
    analysis=client.get('/api/analyses').json[0]
    assert analysis['status']=='failed'
    assert analysis['error']
    assert 'stored_name' not in analysis

def test_upload_limit(client):
    client.application.config['MAX_CONTENT_LENGTH']=100
    sid=session(client).json['id']
    assert client.post(f'/api/sessions/{sid}/media',data={'file':(io.BytesIO(b'x'*200),'big.wav')}).status_code==413

def test_real_audio_analysis_and_deletion(client):
    student(client);sid=session(client).json['id']
    response=client.post(f'/api/sessions/{sid}/media',data={'file':(io.BytesIO(wav_bytes()),'audio.wav')})
    assert response.status_code==202
    analysis=client.get('/api/analyses').json[0]
    assert analysis['status']=='complete'
    assert analysis['result']['audio']['active_fraction']==.5
    assert analysis['result']['video'] is None
    assert client.get(f'/api/sessions/{sid}/attendance').json['summary']['present']==0
    aid=analysis['id']
    assert client.delete(f'/api/analyses/{aid}?media_only=true').status_code==200
    assert client.get('/api/analyses').json[0]['has_media'] is False
    assert client.delete(f'/api/analyses/{aid}').status_code==200
    assert client.get('/api/analyses').json==[]

def test_real_video_scene_change_and_disabled_detector(tmp_path):
    path=tmp_path/'test.avi'
    writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'MJPG'),5,(160,128))
    assert writer.isOpened()
    for i in range(30):
        frame=np.full((128,160,3),0 if i<15 else 150,dtype=np.uint8)
        writer.write(frame)
    writer.release()
    result=analyze_media(path,{'sample_seconds':2,'person_detection':False},lambda _:None)
    assert result['video']['frames_sampled']==3
    assert result['video']['points'][0]['activity'] is None
    assert result['video']['points'][-1]['activity']>50
    assert all(p['count'] is None for p in result['video']['points'])

def test_hog_can_run_on_synthetic_frame(tmp_path):
    path=tmp_path/'hog.avi'
    writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'MJPG'),1,(320,240))
    writer.write(np.zeros((240,320,3),dtype=np.uint8));writer.release()
    result=analyze_media(path,{'sample_seconds':10,'person_detection':True},lambda _:None)
    assert result['video']['detector']=='OpenCV HOG + SVM pedestrian detector'
    assert result['video']['points'][0]['count']==0

def test_empty_and_truncated_wav_are_rejected(tmp_path):
    empty=tmp_path/'empty.wav'
    with wave.open(str(empty),'wb') as audio:
        audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(8000)
    with pytest.raises(ValueError):
        audio_metrics(empty)
    truncated=tmp_path/'truncated.wav'
    truncated.write_bytes(wav_bytes()[:-1000])
    with pytest.raises(ValueError,match='truncated'):
        audio_metrics(truncated)

def test_detector_initialization_failure_keeps_scene_analysis(tmp_path,monkeypatch):
    path=tmp_path/'fallback.avi'
    writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'MJPG'),1,(160,128))
    writer.write(np.zeros((128,160,3),dtype=np.uint8));writer.release()
    class BrokenDetector:
        def setSVMDetector(self,_model):
            raise cv2.error('No detector')
    monkeypatch.setattr(cv2,'HOGDescriptor',BrokenDetector)
    result=analyze_media(path,{'sample_seconds':10,'person_detection':True},lambda _:None)
    assert result['video']['detector'] is None
    assert result['video']['points'][0]['count'] is None
    assert any('detector unavailable' in message for message in result['unavailable'])

def test_demo_is_labelled_idempotent_and_separate(client):
    real=student(client).json['id']
    assert client.post('/api/demo').status_code==201
    assert client.post('/api/demo').status_code==200
    assert len(client.get('/api/sessions').json)==6
    assert len(client.get('/api/students').json)==13
    sid=session(client).json['id']
    records=client.get(f'/api/sessions/{sid}/attendance').json['records']
    assert [r['id'] for r in records]==[real]
    assert client.get('/api/analytics').json['demo'] is True
    assert client.get('/api/analyses').json[0]['result']['kind']=='simulated'
    assert client.delete('/api/demo').status_code==200
    assert len(client.get('/api/students').json)==1
    assert len(client.get('/api/sessions').json)==1

def test_preferences_origin_and_unknown_records(client):
    assert client.put('/api/settings',json={'sample_seconds':1,'person_detection':True}).status_code==400
    assert client.put('/api/settings',json={'sample_seconds':20,'person_detection':False}).json['sample_seconds']==20
    assert client.get('/api/config').json['preferences']['person_detection'] is False
    assert client.post('/api/demo',headers={'Origin':'https://evil.example'}).status_code==403
    assert client.get('/api/health',headers={'Host':'evil.example'}).status_code==403
    assert client.delete('/api/students/999').status_code==404
