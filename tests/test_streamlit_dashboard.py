import threading
import json
from pathlib import Path
import pytest
import requests
from werkzeug.serving import make_server
from backend.app import create_app
from dashboard_client import DashboardClient,DashboardError


def test_dashboard_client_loopback_and_safe_errors(monkeypatch):
    for base in ('https://example.com','http://127.0.0.1@evil.example','http://user:secret@localhost:5000','http://localhost:5000/private'):
        with pytest.raises(ValueError):DashboardClient(base)
    api=DashboardClient()
    def fail(*a,**k):raise requests.ConnectionError('private diagnostic sentinel')
    monkeypatch.setattr(api.http,'request',fail)
    with pytest.raises(DashboardError,match='Local Flask backend is unavailable') as caught:api.get('/api/sessions')
    assert 'sentinel' not in str(caught.value)
    with pytest.raises(DashboardError):api.get('http://other/api/records')


def test_streamlit_real_api_login_report_empty_history_and_logout(tmp_path,monkeypatch):
    pytest.importorskip('streamlit')
    from streamlit.testing.v1 import AppTest
    for k in ('GEMINI_API_KEY','GOOGLE_API_KEY','GROQ_API_KEY','DEMO_LOGIN_EMAIL','DEMO_LOGIN_PASSWORD'):monkeypatch.delenv(k,raising=False)
    app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'streamlit.sqlite3'),'UPLOAD_FOLDER':str(tmp_path/'uploads')})
    # Seed a disposable test fixture through the actual API, not the user's DB.
    c=app.test_client();c.post('/api/auth/login',json={'email':'instructor@classroom.demo','password':'ClassroomDemo!2026'})
    c.post('/api/sessions',json={'title':'Fictional Streamlit test','date':'2026-10-30','instructor':'QA'})
    c.post('/api/sessions',json={'title':'Fictional comparison','date':'2026-10-30','instructor':'QA'})
    from backend.db import db
    payload={'kind':'demo','video':{'face_tracking':{'tracks':[{'id':1,'presence_seconds':20,'first_seen':0,'last_seen':20,'qualified':True}]}},'audio':{'energy':[{'seconds':0,'energy':.1}]},'fusion':{'score':50,'points':[{'seconds':0,'end_seconds':10,'visual':40,'sound':60,'score':50,'visual_coverage':1,'audio_coverage':1,'joint_coverage':1,'modalities':2}],'window_seconds':10,'audio_offset_seconds':0,'joint_windows':1,'limitations':'Synthetic test observations only.'}}
    with app.app_context():
        db().execute("INSERT INTO analyses(session_id,filename,status,result,is_demo,created_at) VALUES(1,'fixture','complete',?,1,'2026-10-30')",(json.dumps(payload),))
        db().execute("INSERT INTO recommendations(session_id,source,items,note,created_at) VALUES(1,'local',?,'Synthetic fixture','2026-10-30')",(json.dumps([{'title':'Review observation','body':'Synthetic fixture advice.','evidence':'Synthetic window.'}]),))
        db().commit()
    server=make_server('127.0.0.1',0,app,threaded=True);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    monkeypatch.setattr('dashboard_client.DashboardClient',lambda:DashboardClient(f'http://127.0.0.1:{server.server_port}'))
    try:
        at=AppTest.from_file(str(Path('streamlit_app.py').resolve()),default_timeout=30).run()
        assert not at.exception
        at.text_input(key='login_email').input('instructor@classroom.demo')
        at.text_input(key='login_password').input('ClassroomDemo!2026')
        next(b for b in at.button if b.label=='Sign in').click().run()
        assert not at.exception and not at.error
        at.selectbox[0].select(1).run()
        assert at.selectbox[0].value==1 and not at.exception
        assert any('Fictional Streamlit test' in x.value for x in at.subheader)
        assert len(at.metric)==3
        assert any('Anonymous observed presence' in x.value for x in at.subheader)
        assert any('Analysis' in x.value for x in at.subheader)
        assert any('Synthetic fixture advice.' in x.value for x in at.markdown)
        at.multiselect[0].select(2).run()
        assert not at.exception and not at.error
        assert len(at.dataframe)>=4
        next(b for b in at.button if b.label=='Sign out').click().run()
        assert not at.exception and any(b.label=='Sign in' for b in at.button)
    finally:server.shutdown();server.server_close()


def test_streamlit_login_failure_is_actionable(monkeypatch):
    pytest.importorskip('streamlit')
    from streamlit.testing.v1 import AppTest
    class Broken:
        class HTTP:
            def close(self):pass
        http=HTTP()
        def login(self,*args):raise DashboardError('Local Flask backend is unavailable. Start it and retry.')
    monkeypatch.setattr('dashboard_client.DashboardClient',Broken)
    at=AppTest.from_file(str(Path('streamlit_app.py').resolve()),default_timeout=30).run()
    next(b for b in at.button if b.label=='Sign in').click().run()
    assert not at.exception and 'unavailable' in at.error[0].value
