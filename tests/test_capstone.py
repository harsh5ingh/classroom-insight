import io
import json
import wave
import numpy as np
import pytest
from backend.app import create_app
from backend.db import db
from backend.analysis import audio_metrics
from backend.scoring import explain_fusion
from backend.audio_features import AudioFeatures

@pytest.fixture
def client(tmp_path,monkeypatch):
    for k in ('GEMINI_API_KEY','GOOGLE_API_KEY','GROQ_API_KEY','DEMO_LOGIN_EMAIL','DEMO_LOGIN_PASSWORD'):monkeypatch.delenv(k,raising=False)
    app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'test.sqlite3'),'UPLOAD_FOLDER':str(tmp_path/'uploads')})
    c=app.test_client();assert c.post('/api/auth/login',json={'email':'instructor@classroom.demo','password':'ClassroomDemo!2026'}).status_code==200
    return c

def point(start,v,a,vc=1,ac=1):
    return {'seconds':start,'end_seconds':start+10,'visual':v,'sound':a,'visual_coverage':vc,'audio_coverage':ac,'joint_coverage':min(vc,ac),'modalities':2}

def test_weighted_score_missing_coverage_anomalies_and_immutability():
    original={'points':[point(0,0,20),point(10,80,100),point(20,None,50,0,1)]}
    result=explain_fusion(original,3,1)
    assert result['points'][0]['score']==5
    assert result['points'][1]['score']==85
    assert result['points'][2]['score']==50 and result['points'][2]['coverage']==.25
    assert result['points'][1]['contributions']=={'visual':60,'sound':25}
    assert len(result['anomalies'])==1 and result['anomalies'][0]['delta']==80
    assert 'score' not in original['points'][0]
    assert explain_fusion({'points':[point(0,90,None,1,0)]},0,1)['score'] is None
    # Missing coverage and non-adjacent periods cannot be called abrupt changes.
    assert not explain_fusion({'points':[point(0,0,0,.1,.1),point(20,100,100)]})['anomalies']

@pytest.mark.parametrize('weights',[(0,0),(float('nan'),1),(-1,1),(11,1),(True,1)])
def test_invalid_scoring_weights(weights):
    with pytest.raises(ValueError):explain_fusion(None,*weights)

def wav(path,signal,rate=8000,channels=1):
    with wave.open(str(path),'wb') as f:
        f.setnchannels(channels);f.setsampwidth(2);f.setframerate(rate);f.writeframes((np.clip(signal,-1,1)*30000).astype('<i2').tobytes())

def test_actual_librosa_tone_silence_noise_and_normalization(tmp_path):
    pytest.importorskip('librosa')
    rng=np.random.default_rng(42);rate=8000
    signal=np.concatenate([np.zeros(rate),.4*np.sin(np.arange(rate)*2*np.pi*440/rate),rng.normal(0,.2,rate)])
    path=tmp_path/'audio.wav';wav(path,np.column_stack([signal,signal]),channels=2)
    result=audio_metrics(path);s=result['spectral']
    assert s['engine']=='librosa' and s['normalized_sample_rate']==16000
    assert len(s['features'])==3 and s['features'][0]['category']=='silence'
    assert 350<s['features'][1]['centroid_hz']<550
    assert s['features'][2]['zcr']>s['features'][1]['zcr']
    assert s['features'][2]['category']=='broadband_activity'
    assert len(s['spectrogram'])==3 and len(s['spectrogram'][0]['db'])==32
    assert all(np.isfinite(v) for p in s['spectrogram'] for v in p['db'])
    assert s['waveform'][0]['maximum']==0

def test_optional_audio_missing_falls_back_and_buffers_are_bounded(monkeypatch):
    monkeypatch.setattr('backend.audio_features.librosa_engine',lambda:None)
    f=AudioFeatures(7200)
    for second in range(7200):
        # Low-rate synthetic input keeps this bound test cheap; not classroom audio.
        f.add(np.zeros(32),32,second)
    result=f.result()
    assert result['engine']=='numpy_fallback' and len(result['features'])==360
    assert result['silence_fraction']==1 and result['normalized_sample_rate'] is None

def test_diagnostics_requires_authentication_and_never_returns_credentials(client,monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY','secret-sentinel-never-return')
    assert client.application.test_client().get('/api/analytics/diagnostics').status_code==401
    result=client.get('/api/analytics/diagnostics')
    assert result.status_code==200 and result.json['database']=='connected'
    assert 'secret-sentinel' not in result.text and 'credential_id' not in result.text
    assert result.json['privacy']['live_raw_retention']=='none'

def seed(client):
    student=client.post('/api/students',json={'identifier':'CAP-1','name':'=Fictional Student','cohort':'QA'}).json['id']
    sid=client.post('/api/sessions',json={'title':'Synthetic capstone test','date':'2026-10-30','instructor':'QA'}).json['id']
    fusion=explain_fusion({'points':[point(0,20,60)],'window_seconds':10,'audio_offset_seconds':0,'joint_windows':1},3,1)
    result={'kind':'measured','video':{'face_tracking':{'tracks':[{'id':1,'first_seen':0,'last_seen':22,'presence_seconds':20,'qualified':True,'preview':'private-image-sentinel','box':[0,0,1,1]}]}},'audio':None,'fusion':fusion}
    with client.application.app_context():
        aid=db().execute("INSERT INTO analyses(session_id,filename,status,result,created_at) VALUES(?,?,'complete',?,?)",(sid,'private-file',json.dumps(result),'2026-10-30')).lastrowid
        from backend.db import record_attendance
        record_attendance(sid,student,'present','instructor_live_confirmation',aid,1);db().commit()
    return sid,student

def test_reports_history_csv_privacy_student_evidence_and_readonly_weights(client):
    sid,student=seed(client)
    result=client.get(f'/api/analytics/sessions/{sid}/report').json
    assert result['summary']['present']==1
    assert result['tracks'][0]['confirmations'][0]['student_id']==student
    assert 'private-image' not in json.dumps(result) and '"box"' not in json.dumps(result)
    assert result['analyses'][0]['result']['fusion']['score']==30
    preview=client.get(f'/api/analytics/sessions/{sid}/report?visual_weight=0&audio_weight=1').json
    assert preview['weight_preview'] and preview['analyses'][0]['result']['fusion']['score']==60
    assert client.get(f'/api/analytics/sessions/{sid}/report').json['analyses'][0]['result']['fusion']['score']==30
    assert client.get(f'/api/analytics/sessions/{sid}/report?visual_weight=nan').status_code==400
    csv=client.get(f'/api/analytics/sessions/{sid}/report?format=csv')
    assert csv.status_code==200 and "'=Fictional Student" in csv.text and 'instructor_live_confirmation' in csv.text
    evidence=client.get(f'/api/analytics/students/{student}').json
    assert evidence['confirmed_attendance_duration'] is None and evidence['participation'] is None
    assert evidence['confirmed_tracks'][0]['observed_presence_seconds']==20
    assert client.get('/api/analytics/sessions/99999/report').status_code==404
    assert client.application.test_client().get(f'/api/analytics/sessions/{sid}/report').status_code==401

def test_settings_weights_validate_atomically(client):
    baseline=client.get('/api/config').json['preferences']
    assert client.put('/api/settings',json={**baseline,'visual_weight':0,'audio_weight':0}).status_code==400
    assert client.get('/api/config').json['preferences']==baseline
    assert client.put('/api/settings',json={**baseline,'visual_weight':3,'audio_weight':1,'audio_rms_threshold':.03}).status_code==200
    assert client.get('/api/config').json['preferences']['visual_weight']==3

def test_generated_advice_cannot_supply_fabricated_numbers_or_evidence(client,monkeypatch):
    from backend.recommendations import generate
    metrics={'attendance':{'present':1,'unconfirmed':0,'total':1},'data_kind':'measured'}
    monkeypatch.setattr('backend.providers.cloud_json',lambda *a:('gemini',{'items':[{'title':'Try discussion','body':'Invite a question.','evidence':'Fake evidence 999'}]}))
    with client.application.app_context():
        result=generate(metrics,True)
        assert result['source']=='gemini' and '999' not in result['items'][0]['evidence']
        monkeypatch.setattr('backend.providers.cloud_json',lambda *a:('gemini',{'items':[{'title':'99% participation','body':'Invented claim','evidence':'Fake'}]}))
        assert generate(metrics,True)['source']=='local'


def test_stereo_channel_normalization_precedes_energy(tmp_path):
    rate=8000;signal=.4*np.sin(np.arange(rate)*2*np.pi*440/rate)
    path=tmp_path/'antiphase.wav';wav(path,np.column_stack([signal,-signal]),channels=2)
    result=audio_metrics(path)
    assert result['energy'][0]['energy']==0 and result['spectral']['features'][0]['rms']==0


def test_recommendations_missing_signals_and_high_activity_are_evidence_linked():
    from backend.recommendations import summarize,local_rules
    attendance={'present':1,'unconfirmed':0,'total':1}
    missing=local_rules(summarize(None,attendance))
    assert any(i['title']=='Check capture coverage' and 'video, audio' in i['evidence'] for i in missing)
    result={'kind':'measured','video':{'sample_seconds':10,'points':[]},'fusion':{'score':90,'joint_windows':1,'limitations':'experimental','points':[dict(point(0,90,90),score=90)]}}
    items=local_rules(summarize(result,attendance))
    assert any(i['title']=='Review an active session segment' for i in items)
