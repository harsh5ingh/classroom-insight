"""Public visitor endpoints and explicitly demo-only employee sessions."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from pathlib import Path
from flask import Blueprint, current_app, jsonify, request
from .db import db, now
from .recommendations import config_status
from .readiness import generate_brief, BriefUnavailable

OPTIONS=json.loads((Path(__file__).resolve().parents[1]/'shared'/'institution-options.json').read_text(encoding='utf-8'))
COOKIE='classroom_demo'
DEMO_EMAIL='instructor@classroom.demo'
DEMO_PASSWORD='ClassroomDemo!2026'
portal=Blueprint('portal',__name__,url_prefix='/api')

class FormError(Exception):
    def __init__(self, fields):
        self.fields=fields

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def bounded_json(limit=24000):
    request.max_content_length=limit
    data=request.get_json(silent=True)
    if not isinstance(data,dict):
        raise FormError({'form':'Send a JSON object.'})
    return data

def text(data,key,errors,maximum=200,required=True,minimum=1):
    value=data.get(key,'')
    if not isinstance(value,str) or len(value.strip())>maximum or (required and len(value.strip())<minimum):
        errors[key]=f'Enter {minimum}–{maximum} characters.' if required else f'Use no more than {maximum} characters.'
        return ''
    return value.strip()

def choice(data,key,options,errors):
    value=data.get(key)
    if not isinstance(value,str) or value not in options:
        errors[key]='Choose one of the listed options.'
        return ''
    return value

def requirements(data,errors):
    values=data.get('requirements')
    if not isinstance(values,list) or not 1<=len(values)<=len(OPTIONS['requirements']) or any(not isinstance(v,str) or v not in OPTIONS['requirements'] for v in values) or len(set(values))!=len(values):
        errors['requirements']='Select at least one unique requirement from the list.'
        return []
    return sorted(values)

def validate_enquiry(data):
    errors={}
    result={key:text(data,key,errors,maximum,required,minimum) for key,maximum,required,minimum in [
        ('contact_name',100,True,2),('work_email',254,True,3),('role',120,True,2),('organization_name',160,True,2),
        ('work_phone',40,False,1),('country',80,True,2),('region',100,True,2),('problem',2000,True,20),
        ('success_criteria',2000,True,20),('notes',2000,False,1)]}
    result['work_email']=result['work_email'].lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',result['work_email']):
        errors['work_email']='Enter a valid work email address.'
    for key,options in [('organization_type','organization_types'),('attendance_method','attendance_methods'),('deployment_model','deployment_models'),('timeline','timelines')]:
        result[key]=choice(data,key,OPTIONS[options],errors)
    for key,maximum in [('learner_count',10000000),('location_count',100000)]:
        value=data.get(key)
        if type(value) is not int or not 1<=value<=maximum:
            errors[key]=f'Enter a whole number between 1 and {maximum:,}.'
        result[key]=value
    result['requirements']=requirements(data,errors)
    consent=data.get('contact_consent',False)
    if type(consent) is not bool:
        errors['contact_consent']='Consent must be true or false.'
    result['contact_consent']=consent
    if errors:
        raise FormError(errors)
    return result

def validate_readiness(data):
    errors={}
    result={'organization_type':choice(data,'organization_type',OPTIONS['organization_types'],errors),
            'workflow':text(data,'workflow',errors,1600,True,20),
            'goals':text(data,'goals',errors,1600,True,20),
            'deployment_model':choice(data,'deployment_model',OPTIONS['deployment_models'],errors),
            'requirements':requirements(data,errors)}
    # This endpoint has no reason to accept identity-linked or contact fields.
    if set(data)-set(result):
        errors['form']='Only organization type, workflow, goals, requirements and deployment preference are accepted.'
    if re.search(r'[^\s@]+@[^\s@]+\.[^\s@]+',result['workflow']+' '+result['goals']):
        errors['form']='Remove email addresses. Use non-identifying workflow descriptions only.'
    if errors:
        raise FormError(errors)
    return result

def rate_limit(scope,maximum,seconds):
    window=int(time.time())//seconds
    db().execute('DELETE FROM public_rate_limits WHERE scope=? AND window<?',(scope,window))
    count=db().execute('INSERT INTO public_rate_limits(scope,window,hits) VALUES(?,?,1) ON CONFLICT(scope,window) DO UPDATE SET hits=hits+1 RETURNING hits',(scope,window)).fetchone()[0]
    db().commit()
    if count>maximum:
        response=jsonify(error={'code':'rate_limited','message':'Too many requests. Please wait before trying again.'})
        response.headers['Retry-After']=str(seconds-(int(time.time())%seconds))
        return response,429
    return None

def signed_in():
    token=request.cookies.get(COOKIE,'')
    if not token or len(token)>128:
        return False
    return db().execute('SELECT 1 FROM demo_sessions WHERE token_hash=? AND expires_at>?',(digest(token),int(time.time()))).fetchone() is not None

@portal.get('/public/config')
def public_config():
    db().execute('SELECT 1')
    return jsonify(enquiries_available=True,email_delivery=False,authentication='demo_only',
                   readiness={'credential_supplied':config_status()['credential_supplied'],'access':config_status()['access']})

@portal.get('/auth/session')
def session_status():
    return jsonify(authenticated=signed_in(),mode='demo')

@portal.post('/auth/login')
def login():
    limited=rate_limit('login',12,60)
    if limited:return limited
    data=bounded_json(2048)
    email,password=data.get('email'),data.get('password')
    if not isinstance(email,str) or not isinstance(password,str) or len(email)>254 or len(password)>200 or type(data.get('remember',False)) is not bool:
        raise FormError({'form':'Enter a valid email and password.'})
    expected_email=os.getenv('DEMO_LOGIN_EMAIL',DEMO_EMAIL)
    expected_password=os.getenv('DEMO_LOGIN_PASSWORD',DEMO_PASSWORD)
    if not (hmac.compare_digest(email.strip().lower().encode(),expected_email.lower().encode()) and hmac.compare_digest(password.encode(),expected_password.encode())):
        return jsonify(error={'code':'invalid_login','message':'Those demo credentials do not match. Use the documented demo account.'}),401
    lifetime=7*86400 if data.get('remember',False) else 8*3600
    token=secrets.token_urlsafe(32)
    db().execute('DELETE FROM demo_sessions WHERE expires_at<=? OR token_hash=?',(int(time.time()),digest(request.cookies.get(COOKIE,''))))
    db().execute('INSERT INTO demo_sessions(token_hash,expires_at,created_at) VALUES(?,?,?)',(digest(token),int(time.time())+lifetime,now()))
    db().commit()
    response=jsonify(authenticated=True,mode='demo',message='Demo access granted.')
    response.set_cookie(COOKIE,token,max_age=lifetime if data.get('remember') else None,httponly=True,
                        secure=current_app.config['DEMO_COOKIE_SECURE'],samesite='Strict',path='/')
    return response

@portal.post('/auth/logout')
def logout():
    db().execute('DELETE FROM demo_sessions WHERE token_hash=?',(digest(request.cookies.get(COOKIE,'')),))
    db().commit()
    response=jsonify(authenticated=False)
    response.delete_cookie(COOKIE,path='/',httponly=True,samesite='Strict',secure=current_app.config['DEMO_COOKIE_SECURE'])
    return response

@portal.post('/enquiries')
def enquiry():
    data=validate_enquiry(bounded_json())
    key=request.headers.get('Idempotency-Key','')
    if not re.fullmatch(r'[A-Za-z0-9_-]{20,100}',key):
        raise FormError({'form':'A valid submission key is required. Refresh the form and try again.'})
    payload=json.dumps(data,sort_keys=True,ensure_ascii=False)
    key_hash,payload_hash=digest(key),digest(payload)
    prior=db().execute('SELECT reference,payload_hash FROM institutional_enquiries WHERE idempotency_hash=?',(key_hash,)).fetchone()
    if prior:
        if not hmac.compare_digest(prior['payload_hash'],payload_hash):
            return jsonify(error={'code':'submission_conflict','message':'This submission key already belongs to different details. Start a new enquiry.'}),409
        return jsonify(reference=prior['reference'],saved_locally=True,email_sent=False,duplicate=True),200
    limited=rate_limit('enquiry',20,600)
    if limited:return limited
    reference='CI-'+secrets.token_hex(6).upper()
    try:
        db().execute('INSERT INTO institutional_enquiries(reference,created_at,idempotency_hash,payload_hash,contact_name,work_email,organization_name,details,consent) VALUES(?,?,?,?,?,?,?,?,?)',
                     (reference,now(),key_hash,payload_hash,data['contact_name'],data['work_email'],data['organization_name'],payload,int(data['contact_consent'])))
        db().commit()
    except sqlite3.IntegrityError:
        db().rollback()
        prior=db().execute('SELECT reference,payload_hash FROM institutional_enquiries WHERE idempotency_hash=?',(key_hash,)).fetchone()
        if prior and hmac.compare_digest(prior['payload_hash'],payload_hash):
            return jsonify(reference=prior['reference'],saved_locally=True,email_sent=False,duplicate=True),200
        raise
    return jsonify(reference=reference,saved_locally=True,email_sent=False,duplicate=False),201

@portal.post('/readiness-brief')
def readiness():
    data=validate_readiness(bounded_json(10000))
    lock=current_app.extensions['readiness_lock']
    if not lock.acquire(blocking=False):
        return jsonify(error={'code':'busy','message':'A brief is already being prepared. Please retry shortly.'}),409
    try:
        limited=rate_limit('readiness',8,600)
        if limited:return limited
        return jsonify(generate_brief(data))
    finally:
        lock.release()

def register_portal(app):
    app.config.setdefault('DEMO_COOKIE_SECURE',os.getenv('DEMO_COOKIE_SECURE','false').lower()=='true')
    app.extensions['readiness_lock']=threading.Lock()
    app.register_blueprint(portal)
    @app.errorhandler(FormError)
    def form_error(exc):
        return jsonify(error={'code':'validation_error','message':'Please review the highlighted fields.','fields':exc.fields}),400
    @app.errorhandler(BriefUnavailable)
    def brief_error(exc):
        return jsonify(error={'code':exc.code,'message':exc.message}),exc.status
    @app.before_request
    def protect_dashboard_api():
        protected=('/api/students','/api/sessions','/api/attendance','/api/analyses','/api/analytics','/api/recommendations','/api/settings','/api/config','/api/export','/api/demo')
        if any(request.path==p or request.path.startswith(p+'/') for p in protected) and not signed_in():
            return jsonify(error={'code':'demo_session_required','message':'Sign in to the demo employee portal to continue.'}),401
