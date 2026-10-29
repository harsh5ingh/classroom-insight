"""Live HTTP verification; keeps one explicitly synthetic enquiry for evaluation.

Run with Flask and Vite running locally. Never sends email or calls Gemini.
Idempotency makes repeated runs retain exactly the same verification enquiry.
"""
import json
import os
import re
import sqlite3
from pathlib import Path
import requests
from dotenv import load_dotenv

ROOT=Path(__file__).resolve().parents[1]
load_dotenv(ROOT/'.env')
BASE='http://127.0.0.1:5000'
with requests.Session() as client:
    for path in ('/','/app','/app/attendance','/app/sessions','/app/analytics','/app/recommendations','/app/students','/app/reports','/app/settings'):
        page=client.get(BASE+path,timeout=15)
        assert page.status_code==200 and '<div id="root">' in page.text
    assets=re.findall(r'(?:href|src)="(/assets/[^\"]+)"',page.text)
    assert len(assets)>=4
    for asset in assets:
        response=client.get(BASE+asset,timeout=15)
        assert response.status_code==200 and len(response.content)>100
        assert 'text/html' not in response.headers.get('Content-Type','')
    config=client.get(BASE+'/api/public/config',timeout=15).json()
    assert config['enquiries_available'] and not config['email_delivery']
    assert client.get(BASE+'/api/students',timeout=15).status_code==401
    login=client.post(BASE+'/api/auth/login',json={'email':os.getenv('DEMO_LOGIN_EMAIL','instructor@classroom.demo'),'password':os.getenv('DEMO_LOGIN_PASSWORD','ClassroomDemo!2026')},timeout=15)
    assert login.status_code==200 and 'HttpOnly' in login.headers['Set-Cookie']
    for path in ('/students','/sessions','/analyses','/analytics','/recommendations','/config','/export/attendance.csv'):
        assert client.get(BASE+'/api'+path,timeout=15).status_code==200
    assert client.get('http://127.0.0.1:5173',timeout=15).status_code==200
    assert client.get('http://127.0.0.1:5173/api/public/config',timeout=15).json()['enquiries_available']
    payload=dict(contact_name='Synthetic Evaluation Contact',work_email='evaluation@example.org',role='Project evaluator',organization_name='Synthetic Evaluation Institution',organization_type='College or university',work_phone='',country='India',region='Delhi',learner_count=200,location_count=1,attendance_method='Spreadsheets',requirements=['Digital attendance records','Reports and exports'],problem='Synthetic verification: attendance spreadsheets need consistent review.',success_criteria='Synthetic verification: save a local enquiry and inspect its reference.',deployment_model='Local/on-premises',timeline='Exploring options',notes='Automated final-phase verification record. Not a real institutional enquiry.',contact_consent=False)
    headers={'Idempotency-Key':'classroom-final-phase-synthetic-enquiry-v1'}
    first=client.post(BASE+'/api/enquiries',json=payload,headers=headers,timeout=15)
    assert first.status_code in (200,201),first.status_code
    reference=first.json()['reference']
    repeat=client.post(BASE+'/api/enquiries',json=payload,headers=headers,timeout=15)
    assert repeat.status_code==200 and repeat.json()['duplicate'] and repeat.json()['reference']==reference
    with sqlite3.connect((ROOT/'data'/'classroom.sqlite3').as_uri()+'?mode=ro',uri=True) as connection:
        row=connection.execute('SELECT status,consent,details FROM institutional_enquiries WHERE reference=?',(reference,)).fetchone()
        assert row and row[0]=='New' and row[1]==0 and json.loads(row[2])==payload
    assert client.get(BASE+'/api/enquiries',timeout=15).status_code==404
    assert client.post(BASE+'/api/auth/logout',timeout=15).status_code==200
    assert not client.get(BASE+'/api/auth/session',timeout=15).json()['authenticated']
    assert client.get(BASE+'/api/sessions',timeout=15).status_code==401
    print(json.dumps({'spa_routes':9,'built_entry_and_font_assets':len(assets),'vite_and_proxy':'ok','login_cookie':'HttpOnly','dashboard_apis':'ok','enquiry_reference':reference,'sqlite_persistence':'verified','duplicate_replay':'same reference','email_sent':False,'sign_out_and_guard':'verified'},indent=2))
