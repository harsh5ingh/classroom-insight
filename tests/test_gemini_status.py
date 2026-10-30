import builtins
import json
from types import SimpleNamespace
from pathlib import Path
import pytest
from backend.app import create_app
from backend.environment import load_environment, ROOT
from backend.recommendations import config_status,verify_generation,verify_model,credential,generate


@pytest.fixture
def app(tmp_path,monkeypatch):
    for name in ('GEMINI_API_KEY','GOOGLE_API_KEY','GEMINI_MODEL','DEMO_LOGIN_EMAIL','DEMO_LOGIN_PASSWORD'):
        monkeypatch.delenv(name,raising=False)
    return create_app({'TESTING':True,'DATABASE':str(tmp_path/'status.sqlite3'),'UPLOAD_FOLDER':str(tmp_path/'media')})


def provider(monkeypatch,text='{"status":"ok"}',error=None):
    calls=[]
    class Client:
        def __init__(self,**kwargs):
            assert kwargs['vertexai'] is False
            self.models=self
        def get(self,**kwargs):
            calls.append('model')
            return SimpleNamespace(supported_actions=['generateContent'])
        def generate_content(self,**kwargs):
            calls.append(kwargs)
            if error:raise error
            return SimpleNamespace(text=text)
        def close(self):calls.append('closed')
    monkeypatch.setattr('google.genai.Client',Client)
    return calls


def test_environment_root_is_absolute_and_deployment_alias_wins(tmp_path,monkeypatch):
    assert ROOT==Path(__file__).resolve().parents[1]
    envdir=tmp_path/'project';envdir.mkdir()
    (envdir/'.env').write_text('GEMINI_API_KEY=local-secret\nGEMINI_MODEL=local-model\n',encoding='utf-8')
    for name in ('GEMINI_API_KEY','GOOGLE_API_KEY','GEMINI_MODEL'):monkeypatch.delenv(name,raising=False)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv('GOOGLE_API_KEY','deployment-secret')
    monkeypatch.setenv('GEMINI_MODEL','deployment-model')
    load_environment(envdir)
    assert credential()=='deployment-secret'
    assert config_status()['model']=='deployment-model'
    assert 'GEMINI_API_KEY' not in __import__('os').environ
    monkeypatch.delenv('GOOGLE_API_KEY');monkeypatch.delenv('GEMINI_MODEL')
    load_environment(envdir)
    assert credential()=='local-secret' and config_status()['model']=='local-model'


def test_verification_states_cache_restart_and_key_change(app,monkeypatch):
    calls=provider(monkeypatch)
    with app.app_context():
        assert verify_generation()['access']=='not_configured' and calls==[]
        monkeypatch.setenv('GOOGLE_API_KEY','unit-only-secret')
        assert config_status()['access']=='unverified' and calls==[]
        assert verify_model()[0] is not None
        assert config_status()['access']=='unverified' # Metadata alone never verifies.
        result=verify_generation()
        assert result['access']=='verified' and result['checked_at']
        assert result['revision']==1 and result['connection_id']
        assert config_status()['connection_id']==result['connection_id']
        assert json.loads(next(c for c in calls if isinstance(c,dict))['contents'].split('object ')[1].rstrip('.'))=={'status':'ok'}
        assert config_status()['access']=='verified'
        assert 'unit-only-secret' not in json.dumps(result)
        monkeypatch.setenv('GEMINI_MODEL','changed-model')
        assert config_status()['access']=='unverified'
        assert config_status()['connection_id']!=result['connection_id']
        assert config_status()['revision']==0
    fresh=create_app(dict(app.config))
    with fresh.app_context():assert config_status()['access']=='unverified'


@pytest.mark.parametrize('code,tag',[(400,'invalid_request'),(401,'invalid_key'),(403,'permission_denied'),(404,'model_unavailable'),(429,'quota_exhausted'),(503,'provider_unavailable')])
def test_safe_provider_failures_and_local_fallback(app,monkeypatch,code,tag):
    monkeypatch.setenv('GEMINI_API_KEY','unit-private-secret')
    class Failure(Exception):pass
    error=Failure('unit-private-secret private request payload');error.code=code
    provider(monkeypatch,error=error)
    with app.app_context():
        status=verify_generation()
        assert status['access']=='failed' and status['error_code']==tag
        assert 'unit-private-secret' not in json.dumps(status) and 'private request payload' not in json.dumps(status)
        result=generate({'attendance':{'present':0,'unconfirmed':1,'total':1}},True)
        assert result['source']=='local' and result['items']
        assert 'unit-private-secret' not in json.dumps(result)


def test_invalid_response_timeout_sdk_and_constructor_errors(app,monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY','unit-test-key')
    with app.app_context():
        provider(monkeypatch,text='not-json')
        assert verify_generation()['error_code']=='invalid_response'
        provider(monkeypatch,error=TimeoutError('secret-url'))
        assert verify_generation()['error_code']=='timeout'
        original=builtins.__import__
        def unavailable(name,*args,**kwargs):
            if name=='google':raise ModuleNotFoundError('secret-path')
            return original(name,*args,**kwargs)
        with monkeypatch.context() as patch:
            patch.setattr(builtins,'__import__',unavailable)
            assert verify_generation()['error_code']=='sdk_unavailable'
        def fail(**kwargs):raise RuntimeError('secret-url')
        monkeypatch.setattr('google.genai.Client',fail)
        assert verify_generation()['access']=='failed'


def test_settings_endpoint_real_generation_contract_and_no_render_requests(app,monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY','unit-secret')
    calls=provider(monkeypatch)
    client=app.test_client()
    assert client.post('/api/config/verify-gemini').status_code==401
    client.post('/api/auth/login',json={'email':'instructor@classroom.demo','password':'ClassroomDemo!2026'})
    assert client.get('/api/config').json['gemini']['access']=='unverified' and calls==[]
    assert client.post('/api/config/verify-gemini').json['access']=='verified'
    count=len(calls)
    assert client.get('/api/config').json['gemini']['access']=='verified' and len(calls)==count
    assert client.get('/api/config').json['gemini']['revision']==1


def test_favicon_is_existing_brand_and_flask_returns_image(app):
    import re
    brand=(ROOT/'src'/'Brand.tsx').read_text(encoding='utf-8')
    svg=(ROOT/'public'/'favicon.svg').read_text(encoding='utf-8')
    assert re.findall(r'\bd="([^"]+)"',brand)==re.findall(r'\bd="([^"]+)"',svg)
    assert 'type="image/svg+xml" sizes="any" href="/favicon.svg?v=brand-1"' in (ROOT/'index.html').read_text()
    if not (ROOT/'dist'/'favicon.svg').exists():pytest.skip('Production favicon requires npm run build')
    response=app.test_client().get('/favicon.svg?v=brand-1')
    assert response.status_code==200 and response.mimetype=='image/svg+xml'
    assert response.data==(ROOT/'public'/'favicon.svg').read_bytes()
    assert app.test_client().get('/favicon.ico',follow_redirects=True).mimetype=='image/svg+xml'
