import json
import sqlite3
import time
from types import SimpleNamespace
import pytest
from backend.app import create_app
from backend.db import db
from backend.portal import COOKIE, digest
from backend.readiness import Brief, generate_brief, BriefUnavailable, PRODUCT

@pytest.fixture
def app(tmp_path, monkeypatch):
    for key in ('GEMINI_API_KEY','DEMO_LOGIN_EMAIL','DEMO_LOGIN_PASSWORD'):
        monkeypatch.delenv(key,raising=False)
    return create_app({'TESTING':True,'DATABASE':str(tmp_path/'test.sqlite3'),'UPLOAD_FOLDER':str(tmp_path/'media')})

@pytest.fixture
def client(app):
    return app.test_client()

def login(client,remember=False):
    return client.post('/api/auth/login',json={'email':'instructor@classroom.demo','password':'ClassroomDemo!2026','remember':remember})

def enquiry():
    return dict(contact_name='Evaluation Contact',work_email='evaluation@example.org',role='Teaching lead',organization_name='Illustrative College',organization_type='College or university',work_phone='',country='India',region='Delhi',learner_count=200,location_count=2,attendance_method='Spreadsheets',requirements=['Digital attendance records','Reports and exports'],problem='We need consistent attendance records across teaching sessions.',success_criteria='A consented pilot that reduces manual reconciliation work.',deployment_model='Local/on-premises',timeline='Exploring options',notes='',contact_consent=False)

def workflow():
    return dict(organization_type='College or university',workflow='Instructors maintain attendance with spreadsheets and manual reconciliation.',goals='Explore a small consented attendance pilot with instructor review.',deployment_model='Local/on-premises',requirements=['Digital attendance records'])

def valid_brief():
    return dict(summary='A college wants a local attendance pilot with instructor confirmation.',capability_ids=['attendance','exports'],pilot_scope=['Start with one instructor and a small course roster.'],privacy_considerations=['Confirm permissions and a retention policy before the pilot.'],implementation_questions=['Who will manage local access and backup responsibilities?'],next_steps=['Agree operational success criteria with the instructor.'],unanswered_questions=['Integration and cloud deployment need separate technical discovery.'])

def test_demo_login_cookie_rotation_logout_and_guard(app,client):
    assert client.get('/api/auth/session').json=={'authenticated':False,'mode':'demo'}
    assert client.get('/api/students').status_code==401
    assert client.post('/api/auth/login',json={'email':'wrong@example.org','password':'bad'}).status_code==401
    assert client.post('/api/auth/login',json={'email':[],'password':None}).status_code==400
    response=login(client,True)
    cookie=response.headers['Set-Cookie']
    assert 'HttpOnly' in cookie and 'SameSite=Strict' in cookie and 'Max-Age=604800' in cookie
    old=client.get_cookie(COOKIE).value
    assert client.get('/api/auth/session').json['authenticated']
    assert client.get('/api/students').status_code==200
    login(client)
    rotated=client.get_cookie(COOKIE).value
    assert rotated!=old
    with app.app_context():
        assert db().execute('SELECT 1 FROM demo_sessions WHERE token_hash=?',(digest(old),)).fetchone() is None
        assert db().execute('SELECT 1 FROM demo_sessions WHERE token_hash=?',(digest(rotated),)).fetchone()
    assert client.post('/api/auth/logout').status_code==200
    client.set_cookie(COOKIE,rotated)
    assert not client.get('/api/auth/session').json['authenticated']
    assert client.get('/api/export/attendance.csv').status_code==401

def test_expiry_and_cross_origin(client,app):
    login(client)
    with app.app_context():
        db().execute('UPDATE demo_sessions SET expires_at=?',(int(time.time())-1,));db().commit()
    assert client.get('/api/sessions').status_code==401
    assert client.post('/api/auth/login',json={},headers={'Origin':'https://untrusted.example'}).status_code==403
    assert client.post('/api/enquiries',json=enquiry(),headers={'Sec-Fetch-Site':'cross-site'}).status_code==403

def test_enquiry_persistence_idempotency_and_restart(client,app):
    headers={'Idempotency-Key':'a'*32}
    first=client.post('/api/enquiries',json=enquiry(),headers=headers)
    assert first.status_code==201
    assert first.json['reference'].startswith('CI-') and not first.json['email_sent']
    duplicate=client.post('/api/enquiries',json=enquiry(),headers=headers)
    assert duplicate.status_code==200 and duplicate.json['duplicate']
    assert duplicate.json['reference']==first.json['reference']
    changed=enquiry();changed['notes']='Changed details'
    assert client.post('/api/enquiries',json=changed,headers=headers).status_code==409
    with app.app_context():
        row=db().execute('SELECT * FROM institutional_enquiries').fetchone()
        assert row['status']=='New' and row['consent']==0
        assert json.loads(row['details'])==enquiry()
        assert db().execute('SELECT COUNT(*) FROM institutional_enquiries').fetchone()[0]==1
    restarted=create_app({'TESTING':True,'DATABASE':app.config['DATABASE'],'UPLOAD_FOLDER':app.config['UPLOAD_FOLDER']})
    with restarted.app_context():
        assert db().execute('SELECT reference FROM institutional_enquiries').fetchone()[0]==first.json['reference']
    assert client.get('/api/enquiries').status_code==404
    assert client.get('/api/enquiries/'+first.json['reference']).status_code==404

@pytest.mark.parametrize('field,value',[('work_email','bad'),('contact_name',''),('organization_type','Invented'),('requirements',['Invented']),('requirements',['Reports and exports','Reports and exports']),('learner_count',True),('location_count',0),('problem','too short'),('notes','x'*2001),('timeline','Tomorrow'),('contact_consent','yes'),('deployment_model','magic')])
def test_enquiry_invalid_fields(client,app,field,value):
    data=enquiry();data[field]=value
    response=client.post('/api/enquiries',json=data,headers={'Idempotency-Key':'b'*32})
    assert response.status_code==400 and field in response.json['error']['fields']
    with app.app_context():
        assert db().execute('SELECT COUNT(*) FROM institutional_enquiries').fetchone()[0]==0

def test_enquiry_limits_and_server_identity(client):
    assert client.post('/api/enquiries',json=enquiry()).status_code==400
    assert client.post('/api/enquiries',data='x'*25000,content_type='application/json').status_code==413
    data=enquiry();data.update(reference='CLIENT-ID',status='Closed')
    response=client.post('/api/enquiries',json=data,headers={'Idempotency-Key':'c'*32})
    assert response.status_code==201 and response.json['reference']!='CLIENT-ID'

def test_public_config_missing_key_and_readiness_validation(client):
    config=client.get('/api/public/config').json
    assert config['enquiries_available'] and not config['email_delivery']
    assert config['readiness']=={'credential_supplied':False,'access':'not_configured'}
    response=client.post('/api/readiness-brief',json=workflow())
    assert response.status_code==503 and 'No AI brief' in response.json['error']['message']
    data=workflow();data['student_name']='Private Person'
    assert client.post('/api/readiness-brief',json=data).status_code==400
    data=workflow();data['workflow']='Contact private@example.org for our existing records.'
    assert client.post('/api/readiness-brief',json=data).status_code==400

def test_structured_generation_and_authoritative_capabilities(monkeypatch):
    calls=[]
    def generation(prompt,schema):
        calls.append((prompt,schema))
        return 'gemini',valid_brief()
    monkeypatch.setattr('backend.readiness.cloud_json',generation)
    result=generate_brief(workflow())
    assert result['source']=='gemini'
    assert result['brief']['capabilities']==[PRODUCT['capabilities']['attendance'],PRODUCT['capabilities']['exports']]
    assert result['brief']['limitations']==PRODUCT['limitations']
    assert calls[0][1]==Brief.model_json_schema()
    assert json.loads(calls[0][0].split('User workflow JSON: ')[1])==workflow()

@pytest.mark.parametrize('bad',[{},dict(valid_brief(),capability_ids=['facial_recognition']),dict(valid_brief(),summary='x'),dict(valid_brief(),secret='unexpected')])
def test_invalid_model_output_is_never_displayed(monkeypatch,bad):
    client=SimpleNamespace(models=SimpleNamespace(generate_content=lambda **_:SimpleNamespace(text=json.dumps(bad))),close=lambda:None)
    monkeypatch.setattr('backend.readiness.cloud_json',lambda *args: ('gemini',bad))
    with pytest.raises(BriefUnavailable):generate_brief(workflow())

def test_quota_failure_sanitized_and_rate_limited(client,monkeypatch):
    class QuotaError(Exception):code=429
    def fail(*args,**_):raise QuotaError('Sensitive provider request details')
    provider=SimpleNamespace(models=SimpleNamespace(generate_content=fail),close=lambda:None)
    monkeypatch.setattr('backend.readiness.cloud_json',fail)
    response=client.post('/api/readiness-brief',json=workflow())
    assert response.status_code==429 and response.json['error']['code']=='provider_quota'
    assert 'Sensitive' not in response.text
    for _ in range(8):response=client.post('/api/readiness-brief',json=workflow())
    assert response.status_code==429 and 'Retry-After' in response.headers

def test_database_error_does_not_disclose_details(client,monkeypatch):
    def fail():raise sqlite3.OperationalError('private-file-location')
    monkeypatch.setattr('backend.portal.db',fail)
    response=client.post('/api/enquiries',json=enquiry(),headers={'Idempotency-Key':'d'*32})
    assert response.status_code==500
    assert 'private-file-location' not in response.text

@pytest.mark.parametrize('code',[401,403,404,None])
def test_provider_access_and_timeout_errors_are_transparent(client,monkeypatch,code):
    def fail(*args,**_):
        error=TimeoutError('private provider details')
        error.code=code
        raise error
    provider=SimpleNamespace(models=SimpleNamespace(generate_content=fail),close=lambda:None)
    monkeypatch.setattr('backend.readiness.cloud_json',fail)
    result=client.post('/api/readiness-brief',json=workflow())
    assert result.status_code==503
    assert result.json['error']['code']==('provider_access' if code else 'generation_unavailable')
    assert 'private provider details' not in result.text
