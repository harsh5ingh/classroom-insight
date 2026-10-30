import json
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import pytest
from backend.app import create_app
from backend.db import db, preferences
from backend import providers as p
from backend.recommendations import generate

KEY='fictional-test-credential-1234567890'
HEADERS={'Origin':'http://localhost:5000','X-Classroom-Settings':'1'}

class MemoryVault:
    def __init__(self): self.entries={};self.fail=False
    def get_password(self,s,u):
        if self.fail: raise RuntimeError(KEY)
        return self.entries.get((s,u))
    def set_password(self,s,u,k):
        if self.fail: raise RuntimeError(KEY)
        self.entries[s,u]=k
    def delete_password(self,s,u):
        if self.fail: raise RuntimeError(KEY)
        self.entries.pop((s,u),None)

@pytest.fixture
def app(tmp_path,monkeypatch):
    for v in ('GEMINI_API_KEY','GOOGLE_API_KEY','GROQ_API_KEY','GROQ_MODEL','DEMO_LOGIN_EMAIL','DEMO_LOGIN_PASSWORD'):
        monkeypatch.delenv(v,raising=False)
    return create_app({'TESTING':True,'DATABASE':str(tmp_path/'db.sqlite3'),'UPLOAD_FOLDER':str(tmp_path/'uploads'),'TEST_CREDENTIAL_VAULT':MemoryVault()})

@pytest.fixture
def client(app):
    c=app.test_client()
    c.post('/api/auth/login',json={'email':'instructor@classroom.demo','password':'ClassroomDemo!2026'})
    return c

def post(c,name,action,data=None):
    return c.post(f'/api/settings/ai/{name}/{action}',json=data or {},headers=HEADERS)

def test_save_replace_mask_delete_and_no_leak(client,app,caplog):
    assert post(client,'gemini','activation',{'enabled':True}).status_code==400
    response=post(client,'gemini','credential',{'key':KEY})
    assert response.status_code==200 and response.json['providers']['gemini']['mask']=='••••••••'
    assert KEY not in response.text
    assert post(client,'gemini','activation',{'enabled':True}).json['active']=='gemini'
    new=KEY+'replacement'
    assert post(client,'gemini','credential',{'key':new}).status_code==200
    vault=app.config['TEST_CREDENTIAL_VAULT']
    assert list(vault.entries.values())==[new]
    with app.app_context():
        assert p.resolve('gemini')==(new,'settings')
        assert new not in '\n'.join(db().iterdump())
        assert p.SETTING not in preferences()
    assert post(client,'gemini','delete').status_code==400
    deleted=post(client,'gemini','delete',{'confirm':True})
    assert deleted.json['active'] is None and not deleted.json['providers']['gemini']['configured']
    assert not vault.entries and KEY not in caplog.text
    assert KEY not in client.get('/api/config').text

def test_environment_precedence_and_delete_tombstone(client,app,monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY','environment-only-secret')
    assert client.get('/api/settings/ai').json['active']=='gemini'
    assert client.get('/api/settings/ai').json['providers']['gemini']['source']=='environment'
    post(client,'gemini','credential',{'key':KEY})
    with app.app_context(): assert p.resolve('gemini')==(KEY,'settings')
    post(client,'gemini','delete',{'confirm':True})
    with app.app_context(): assert p.resolve('gemini')==('','none')
    assert __import__('os').environ['GEMINI_API_KEY']=='environment-only-secret'

def test_vault_failure_keeps_previous_configuration(client,app,caplog):
    post(client,'gemini','credential',{'key':KEY});post(client,'gemini','activation',{'enabled':True})
    with app.app_context(): before=p.state()
    app.config['TEST_CREDENTIAL_VAULT'].fail=True
    for operation,data in [('credential',{'key':KEY+'new'}),('delete',{'confirm':True}),('activation',{'enabled':True})]:
        response=post(client,'gemini',operation,data)
        assert response.status_code==503 and KEY not in response.text
    with app.app_context(): assert p.state()==before
    assert client.get('/api/settings/ai').json['providers']['gemini']['access']=='failed'
    assert KEY not in caplog.text

def test_sqlite_failure_after_vault_save_keeps_old_key(client,app,monkeypatch):
    post(client,'gemini','credential',{'key':KEY})
    with app.app_context(): before=p.state()
    def fail(_):raise RuntimeError('not exposed')
    monkeypatch.setattr(p,'persist',fail)
    assert post(client,'gemini','credential',{'key':KEY+'new'}).status_code==500
    with app.app_context(): assert p.state()==before and p.resolve('gemini')[0]==KEY
    assert list(app.config['TEST_CREDENTIAL_VAULT'].entries.values())==[KEY]

def test_secure_backend_fails_closed(app,monkeypatch):
    del app.config['TEST_CREDENTIAL_VAULT']
    monkeypatch.setattr(p.sys,'platform','linux')
    with app.app_context(),pytest.raises(p.ProviderError,match='Windows Credential Manager'):
        p.vault()

def test_switching_persistence_and_concurrent_requests(client,app):
    for name in p.NAMES:post(client,name,'credential',{'key':KEY+name})
    for name in p.NAMES:
        response=post(client,name,'activation',{'enabled':True}).json
        assert response['active']==name and sum(v['active'] for v in response['providers'].values())==1
    def switch(name):
        thread_client=app.test_client()
        thread_client.set_cookie('classroom_demo',client.get_cookie('classroom_demo').value)
        response=post(thread_client,name,'activation',{'enabled':True})
        assert response.status_code==200
        return response.json
    with ThreadPoolExecutor(4) as pool:
        for result in pool.map(switch,['gemini','groq']*6):
            assert sum(v['active'] for v in result['providers'].values())==1
    restarted=create_app(dict(app.config))
    with app.app_context(): before=p.state()
    with restarted.app_context():
        assert p.state()==before
        assert all(p.resolve(n)[0]==KEY+n for n in p.NAMES)

def test_auth_csrf_input_size_and_rate_limit(app,client):
    assert app.test_client().get('/api/settings/ai').status_code==401
    assert client.post('/api/settings/ai/groq/credential',json={'key':KEY}).status_code==403
    assert client.post('/api/settings/ai/groq/credential',json={'key':KEY},headers={**HEADERS,'Origin':'https://evil.example'}).status_code==403
    assert client.post('/api/settings/ai/groq/credential',json={'key':KEY},headers={**HEADERS,'Sec-Fetch-Site':'cross-site'}).status_code==403
    assert client.post('/api/settings/ai/groq/credential',data='x'*3000,content_type='application/json',headers=HEADERS).status_code==413
    assert post(client,'unknown','credential',{'key':KEY}).status_code==400
    assert post(client,'groq','credential',{'key':KEY,'extra':'field'}).status_code==400
    assert post(client,'groq','credential',{'key':'bad\nkey'}).status_code==400
    for _ in range(7): response=post(client,'groq','test')
    assert response.status_code==429 and response.headers['Retry-After']

@pytest.mark.parametrize('provider',['gemini','groq'])
def test_sdk_generation_and_persisted_verification(provider,client,app,monkeypatch):
    calls=[]
    class Client:
        def __init__(self,**kwargs):
            assert kwargs['api_key']==KEY
            self.models=self;self.chat=SimpleNamespace(completions=self)
        def __enter__(self):return self
        def __exit__(self,*_):calls.append('closed')
        def get(self,**_):return SimpleNamespace(supported_actions=['generateContent'])
        def list(self):return SimpleNamespace(data=[SimpleNamespace(id='account-test-model',active=True)])
        def generate_content(self,**kwargs):calls.append(kwargs);return SimpleNamespace(text='{"status":"ok"}')
        def create(self,**kwargs):calls.append(kwargs);return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"status":"ok"}'))])
    monkeypatch.setattr('google.genai.Client' if provider=='gemini' else 'groq.Groq',Client)
    post(client,provider,'credential',{'key':KEY})
    post(client,provider,'model',{'model':'account-test-model'})
    result=post(client,provider,'test')
    assert result.json['providers'][provider]['access']=='verified'
    assert result.json['providers'][provider]['last_success_at']
    assert any(isinstance(c,dict) for c in calls) and 'closed' in calls
    assert result.json['active'] is None # Testing is not activation.
    restarted=create_app(dict(app.config))
    with restarted.app_context(): assert p.metadata()['providers'][provider]['access']=='verified'
    post(client,provider,'model',{'model':'another-model'})
    assert client.get('/api/settings/ai').json['providers'][provider]['access']=='unverified'

@pytest.mark.parametrize('code,expected',[(400,'invalid_request'),(401,'invalid_key'),(403,'permission_denied'),(404,'model_unavailable'),(429,'quota_exhausted'),(500,'provider_unavailable')])
def test_safe_errors_and_fallback(code,expected,client,app,monkeypatch,caplog):
    post(client,'groq','credential',{'key':KEY});post(client,'groq','model',{'model':'model'});post(client,'groq','activation',{'enabled':True})
    def fail(*args):
        error=RuntimeError(KEY);error.status_code=code;raise error
    monkeypatch.setattr(p.GroqProvider,'generate',fail)
    response=post(client,'groq','test')
    assert response.json['providers']['groq']['error_code']==expected
    assert KEY not in response.text and KEY not in caplog.text
    with app.app_context():
        result=generate({'attendance':{'present':0,'unconfirmed':1,'total':1}},True)
        assert result['source']=='local' and result['items'] and KEY not in json.dumps(result)

def test_local_mode_never_calls_cloud_and_stale_probe_is_rejected(client,app,monkeypatch):
    post(client,'gemini','credential',{'key':KEY})
    def fail(*_):raise AssertionError('Cloud must not be invoked')
    monkeypatch.setattr(p.GeminiProvider,'generate',fail)
    with app.app_context():
        result=generate({'attendance':{'present':0,'unconfirmed':1,'total':1}},True)
        assert result['source']=='local' and 'disabled' in result['note']
    def changed(*args):
        p.change('gemini','model',{'model':'changed-during-probe'})
        return {'status':'ok'}
    monkeypatch.setattr(p.GeminiProvider,'generate',changed)
    assert post(client,'gemini','test').status_code==409
    assert client.get('/api/settings/ai').json['providers']['gemini']['access']=='unverified'

def test_groq_account_models_and_invalid_generation(client,monkeypatch):
    post(client,'groq','credential',{'key':KEY})
    monkeypatch.setattr(p.GroqProvider,'models',lambda *args:['account-model'])
    assert post(client,'groq','models').json=={'models':['account-model']}
    post(client,'groq','model',{'model':'account-model'})
    monkeypatch.setattr(p.GroqProvider,'generate',lambda *args:{'status':'invented'})
    assert post(client,'groq','test').json['providers']['groq']['error_code']=='invalid_response'

@pytest.mark.parametrize('name',['gemini','groq'])
def test_recommendations_use_only_selected_provider(name,client,app,monkeypatch):
    post(client,name,'credential',{'key':KEY});post(client,name,'model',{'model':'test-model'});post(client,name,'activation',{'enabled':True})
    output={'items':[{'title':'Review session','body':'Consider a discussion.','evidence':'One record unconfirmed.'}]}
    calls=[]
    def response(*args):calls.append(name);return output
    monkeypatch.setattr(p.GeminiProvider if name=='gemini' else p.GroqProvider,'generate',response)
    with app.app_context():
        assert generate({'attendance':{'present':0,'unconfirmed':1,'total':1}},True)['source']==name
    assert calls==[name]

def test_delete_database_failure_restores_vault_key(client,app,monkeypatch):
    post(client,'gemini','credential',{'key':KEY})
    with app.app_context(): before=p.state()
    monkeypatch.setattr(p,'persist',lambda _: (_ for _ in ()).throw(RuntimeError('private diagnostic')))
    result=post(client,'gemini','delete',{'confirm':True})
    assert result.status_code==500 and 'private diagnostic' not in result.text
    with app.app_context(): assert p.state()==before and p.resolve('gemini')[0]==KEY

def test_missing_vault_entry_never_uses_environment(client,app,monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY','do-not-fallback-secret')
    post(client,'gemini','credential',{'key':KEY})
    app.config['TEST_CREDENTIAL_VAULT'].entries.clear()
    with app.app_context(),pytest.raises(p.ProviderError,match='vault entry'):
        p.resolve('gemini')
    item=client.get('/api/settings/ai').json['providers']['gemini']
    assert item['access']=='failed' and item['error_code']=='vault_missing'
    assert post(client,'gemini','delete',{'confirm':True}).status_code==200

def test_environment_verification_resets_on_restart(client,app,monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY',KEY)
    monkeypatch.setattr(p.GeminiProvider,'generate',lambda *args:{'status':'ok'})
    assert post(client,'gemini','test').json['providers']['gemini']['access']=='verified'
    restarted=create_app(dict(app.config))
    with restarted.app_context():
        item=p.metadata()['providers']['gemini']
        assert item['access']=='unverified' and item['last_success_at']
