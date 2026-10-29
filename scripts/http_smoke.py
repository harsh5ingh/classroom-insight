r"""Exercise a running local backend using disposable synthetic records only.

Run: .venv\Scripts\python.exe scripts/http_smoke.py
Creates a uniquely named test student/session, uploads generated signals, verifies
the asynchronous worker, recommendations and exports, then deletes its own records.
"""
import json
import os
import time
import uuid
from pathlib import Path
import requests
from dotenv import load_dotenv

BASE='http://127.0.0.1:5000/api'
ROOT=Path(__file__).resolve().parents[1]
load_dotenv(ROOT/'.env')
HTTP=requests.Session()

def request(method,path,**kwargs):
    response=HTTP.request(method,BASE+path,timeout=30,**kwargs)
    response.raise_for_status()
    return response

def main():
    token=uuid.uuid4().hex[:8]
    student_id=session_id=None
    signed_in=False
    results=[]
    try:
        assert request('GET','/health').json()['status']=='ok'
        request('POST','/auth/login',json={'email':os.getenv('DEMO_LOGIN_EMAIL','instructor@classroom.demo'),'password':os.getenv('DEMO_LOGIN_PASSWORD','ClassroomDemo!2026')})
        signed_in=True
        student_id=request('POST','/students',json={'identifier':f'QA-{token}','name':'Synthetic smoke test','cohort':'Disposable QA'}).json()['id']
        session_id=request('POST','/sessions',json={'title':f'Synthetic HTTP test {token}','date':'2026-10-29','instructor':'QA runner'}).json()['id']
        attendance=request('PUT',f'/sessions/{session_id}/attendance',json={'records':[{'student_id':student_id,'status':'present'}]}).json()
        assert attendance['present']==1
        for filename in ('synthetic-tone.wav','synthetic-scene.avi'):
            with (ROOT/'data'/'verification'/filename).open('rb') as media:
                job=request('POST',f'/sessions/{session_id}/media',files={'file':(filename,media)}).json()['id']
            deadline=time.monotonic()+45
            while time.monotonic()<deadline:
                analysis=next(row for row in request('GET',f'/analyses?session_id={session_id}').json() if row['id']==job)
                if analysis['status'] in ('complete','failed'):
                    break
                time.sleep(.25)
            assert analysis['status']=='complete',analysis.get('error')
            signal=analysis['result']
            if filename.endswith('.wav'):
                assert signal['audio']['active_fraction']==.5
                assert signal['audio']['duration_seconds']==4
            else:
                assert signal['video']['frames_sampled']>=1
                assert signal['video']['detector']
            results.append({'file':filename,'status':analysis['status'],'kind':signal['kind'],'unavailable':signal['unavailable']})
            assert request('GET',f'/sessions/{session_id}/attendance').json()['summary']['present']==1
        recommendations=request('POST','/recommendations',json={'session_id':session_id,'use_gemini':False}).json()
        assert recommendations['source']=='local'
        export=request('GET',f'/export/attendance.csv?session_id={session_id}')
        assert f'QA-{token}' in export.text
        analytics=request('GET',f'/analytics?session_id={session_id}').json()
        assert analytics['summary']['analyzed']==1
        print(json.dumps({'health':'ok','uploads':results,'recommendations':'local','csv':'verified','analytics':'verified','attendance_unchanged_by_analysis':True},indent=2))
    finally:
        if session_id:
            request('DELETE',f'/sessions/{session_id}')
        if student_id:
            request('DELETE',f'/students/{student_id}')
        if signed_in:
            request('POST','/auth/logout')

if __name__=='__main__':
    main()
