"""Bounded local live observations. Frames are decoded transiently, never saved."""
import json
import math
import threading
import time
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import cv2
import numpy as np
from flask import request, jsonify, current_app
from .capture import jpeg_dimensions
from .observations import FaceObserver, iou
from .db import db, now, event, record_attendance, preferences
from .portal import signed_in, digest, COOKIE


class LiveError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


class LiveTracker:
    """Spatial hypotheses, not identities. Missing intervals never count as stillness."""
    def __init__(self, fps=4, minimum=20, samples=3, gap=10, still=.02):
        self.interval=1/fps; self.minimum=minimum; self.minimum_samples=samples
        self.gap=gap; self.still_threshold=still; self.tracks=[]

    def update(self, second, boxes, previews=None, rolls=None):
        eligible=[t for t in self.tracks if second-t['last_seen']<=self.gap and not t.get('expired')]
        pairs=[(t,b) for t in eligible for b,box in enumerate(boxes[:100]) if iou(t['box'],box)>=.3]
        matches={b:t for t,b in pairs if sum(x[0]['id']==t['id'] for x in pairs)==1 and sum(x[1]==b for x in pairs)==1}
        for t in self.tracks:
            t['visible']=False
            if second-t['last_seen']>self.gap:t['expired']=True
        ids=[]
        for b,box in enumerate(boxes[:100]):
            t=matches.get(b)
            if t is None:
                if len(self.tracks)>=200:continue
                t={'id':len(self.tracks)+1,'first_seen':second,'last_seen':second,'samples':0,'span_seconds':0,
                   'presence_seconds':0.,'box':list(box),'qualified':False,'visible':False,'expired':False,
                   'movement':None,'still_seconds':0.,'longest_still_seconds':0.,'inactivity_intervals':[],'confirmed_student_id':None}
                self.tracks.append(t)
            dt=second-t['last_seen']
            if t['samples'] and dt>0:
                # Credit only bounded observed intervals, not ten seconds of occlusion.
                t['presence_seconds']+=min(dt,2*self.interval)
                if dt<=max(.75,2*self.interval):
                    old=t['box']; speed=math.hypot(box[0]+box[2]/2-old[0]-old[2]/2,box[1]+box[3]/2-old[1]-old[3]/2)/max(old[2],.001)/dt
                    t['movement']=round(speed,4)
                    t['still_seconds']=t['still_seconds']+dt if speed<self.still_threshold else 0.
                    t['longest_still_seconds']=max(t['longest_still_seconds'],t['still_seconds'])
                    if t['still_seconds']>=2:
                        start=second-t['still_seconds'];interval={'start':round(start,2),'end':round(second,2)}
                        if t['inactivity_intervals'] and abs(t['inactivity_intervals'][-1]['start']-start)<.1:t['inactivity_intervals'][-1]=interval
                        else:t['inactivity_intervals']=(t['inactivity_intervals']+[interval])[-10:]
                else:t['movement']=None;t['still_seconds']=0.
            t.update(last_seen=second,span_seconds=second-t['first_seen'],box=list(box),visible=True,samples=t['samples']+1)
            t['qualified']=t['presence_seconds']>=self.minimum and t['samples']>=self.minimum_samples
            ids.append(t['id'])
        return ids

    def break_continuity(self):
        for t in self.tracks:t.update(expired=True,visible=False)

    def result(self):
        return [{**t,'span_seconds':round(t['span_seconds'],2),'presence_seconds':round(t['presence_seconds'],2),
                 'preview':None,'mean_motion_face_widths_per_second':t['movement'],
                 'mean_eye_line_roll_degrees':None,'roll_samples':0} for t in self.tracks]


class Windows:
    """At most 360 ten-second numeric windows. Audio samples themselves never arrive."""
    def __init__(self,weights=(1,1)):self.items={};self.weights=weights
    def add(self,start,end,kind,value):
        if end<=start:return
        for i in range(max(0,int(start//10)),min(359,int((end-1e-8)//10))+1):
            duration=max(0,min(end,(i+1)*10)-max(start,i*10))
            w=self.items.setdefault(i,{'visual_sum':0.,'visual_time':0.,'audio_sum':0.,'audio_time':0.,'visual_ranges':[],'audio_ranges':[]})
            w[kind+'_sum']+=value*duration;w[kind+'_time']+=duration
            ranges=w[kind+'_ranges'];a,b=max(start,i*10),min(end,(i+1)*10)
            if ranges and abs(ranges[-1][1]-a)<1e-6:ranges[-1][1]=b
            elif len(ranges)<100:ranges.append([a,b])
    def result(self,elapsed):
        points=[]
        for i,w in sorted(self.items.items()):
            duration=max(.001,min(elapsed,(i+1)*10)-i*10)
            v=w['visual_sum']/w['visual_time']*100 if w['visual_time'] else None
            a=w['audio_sum']/w['audio_time']*100 if w['audio_time'] else None
            values=[x for x in (v,a) if x is not None]
            points.append({'seconds':i*10,'end_seconds':min(elapsed,(i+1)*10),'visual':v,'sound':a,
                'score':sum(values)/len(values) if values else None,'modalities':len(values),
                'visual_coverage':min(1,w['visual_time']/duration),'audio_coverage':min(1,w['audio_time']/duration),
                'joint_coverage':min(1,sum(max(0,min(b,d)-max(a,c)) for a,b in w['visual_ranges'] for c,d in w['audio_ranges'])/duration)})
        from .scoring import explain_fusion
        return explain_fusion({"points":points},*self.weights)["points"]


class LiveRun:
    def __init__(self,sid,aid,owner,prefs,clock=time.monotonic):
        self.id=uuid4().hex;self.sid=sid;self.aid=aid;self.owner=owner;self.clock=clock
        self.start=clock();self.wall=now();self.last=self.start;self.checkpoint=self.start
        self.fps=prefs['fps'];self.lock=threading.Lock();self.closed=False
        self.observer=FaceObserver(1/self.fps,{'retain_face_previews':False,'observe_eye_line':False})
        self.observer.tracker=LiveTracker(self.fps,prefs['minimum_seconds'],prefs['minimum_samples'],prefs['maximum_gap'],prefs['still_threshold'])
        self.previous=None;self.previous_time=None;self.audio_end=0.;self.seconds=0.;self.frames=0;self.latency=0.;self.windows=Windows((prefs.get('visual_weight',1),prefs.get('audio_weight',1)))
        self.last_audio=None;self.scene=None;self.warning='';self.aspect=1.;self.confirmed=0;self.audio_intervals=[]

    def process(self,data,second,audio):
        started=self.clock();elapsed=started-self.start
        if not math.isfinite(second) or not 0<=second<=elapsed+2 or (self.frames and second<=self.seconds):raise LiveError('Frame clock is invalid or out of order.')
        if elapsed>3600:raise LiveError('One-hour monitoring limit reached. End this session and start another.',410)
        if len(data)>256*1024:raise LiveError('Live JPEG exceeds 256 KiB.',413)
        try:w,h=jpeg_dimensions(data)
        except ValueError:raise LiveError('Send a valid JPEG frame.') from None
        if not 16<=w<=640 or not 16<=h<=480:raise LiveError('Resize live frames to at most 640 × 480.')
        if audio is not None:
            if not isinstance(audio,dict) or set(audio)!={'start','end','rms','active_fraction','intervals'} or any(type(audio[k]) not in (int,float) or not math.isfinite(audio[k]) for k in ('start','end','rms','active_fraction')):raise LiveError('Invalid numeric audio window.')
            if not self.audio_end<=audio['start']<audio['end']<=second+.1 or audio['end']-audio['start']>5 or not 0<=audio['rms']<=1 or not 0<=audio['active_fraction']<=1:raise LiveError('Audio window is out of order or outside the frame clock.')
            if not isinstance(audio['intervals'],list) or len(audio['intervals'])>100:raise LiveError('Too many acoustic intervals.')
            end=audio['start']
            for i in audio['intervals']:
                if not isinstance(i,dict) or set(i)!={'start','end'} or any(type(v) not in (int,float) or not math.isfinite(v) for v in i.values()) or not end<=i['start']<i['end']<=audio['end']:raise LiveError('Acoustic intervals must be ordered inside the audio window.')
                end=i['end']
        frame=cv2.imdecode(np.frombuffer(data,np.uint8),cv2.IMREAD_COLOR)
        if frame is None or frame.shape[:2]!=(h,w):raise LiveError('Camera frame cannot be decoded.')
        gray=cv2.resize(cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY),(160,90))
        self.scene=float(np.mean(cv2.absdiff(gray,self.previous)))/255*100 if self.previous is not None else None
        self.warning=''
        if self.scene is not None and self.scene>20:
            self.observer.tracker.break_continuity();self.warning='Large scene/lighting change: track continuity reset; review the camera.'
        if self.previous_time is not None and 0<second-self.previous_time<=max(.75,2/self.fps):
            self.windows.add(self.previous_time,second,'visual',min(1,self.scene/10))
        self.previous=gray;self.previous_time=second;self.aspect=w/h
        self.observer.observe(frame,elapsed) # Trusted server monotonic clock qualifies presence.
        if audio is not None:
            self.windows.add(audio['start'],audio['end'],'audio',audio['active_fraction']);self.audio_end=audio['end'];self.last_audio=audio
            self.audio_intervals=(self.audio_intervals+audio['intervals'])[-100:]
        elif second-self.audio_end>1:self.last_audio=None
        self.frames+=1;self.seconds=second;self.last=self.clock();self.latency=(self.last-started)*1000
        return self.snapshot()

    def snapshot(self):
        tracks=self.observer.tracker.result()
        elapsed=self.clock()-self.start
        for t in tracks:
            t['box']=[t['box'][0],t['box'][1]*self.aspect,t['box'][2],t['box'][3]*self.aspect]
            if elapsed-t['last_seen']>max(1,2/self.fps):t['visible']=False
            t['state']='visible' if t['visible'] else 'expired' if t['expired'] or elapsed-t['last_seen']>self.observer.tracker.gap else 'temporarily_missing'
            start=datetime.fromisoformat(self.wall)
            t['first_detected_at']=(start+timedelta(seconds=t['first_seen'])).isoformat(timespec='seconds')
            t['last_detected_at']=(start+timedelta(seconds=t['last_seen'])).isoformat(timespec='seconds')
        return {'id':self.id,'session_id':self.sid,'analysis_id':self.aid,'started_at':self.wall,'elapsed_seconds':elapsed,'frames_processed':self.frames,
                'processing_ms':round(self.latency,1),'processed_fps':round(self.frames/max(elapsed,.001),2),'tracks':tracks,
                'visible':sum(t['visible'] for t in tracks),'qualified':sum(t['qualified'] for t in tracks),'confirmed':self.confirmed,
                'windows':self.windows.result(self.seconds),'audio':self.last_audio,'scene_change':self.scene,'warning':self.warning,
                'closed':self.closed,'track_limit_reached':len(tracks)>=200,'audio_intervals':self.audio_intervals}

    def analysis(self,reason='Monitoring ended'):
        s=self.snapshot();tracker=self.observer.tracker
        points=s['windows'];scores=[p for p in points if p['score'] is not None]
        duration=sum(p['end_seconds']-p['seconds'] for p in scores)
        return {'kind':'measured','source':{'kind':'live_monitor','started_at':self.wall,'target_fps':self.fps,'clock':'Presence: server monotonic time. Video/audio: browser monotonic windows; network latency adds alignment uncertainty.'},
            'video':{'duration_seconds':self.seconds,'frames_sampled':self.frames,'sample_seconds':10,'detector':None,
                'points':[{'seconds':p['end_seconds'],'activity':p['visual']/10 if p['visual'] is not None else None,'count':None,'faces':None} for p in points],
                'method':'Live sampled grayscale scene difference clipped at 10%; ten-second numerical summaries.',
                'limitations':'No raw recording retained. Haar can miss small, occluded or non-frontal faces. Tracks are spatial hypotheses, not identities.',
                'face_tracking':{'tracks':[{k:v for k,v in t.items() if k!='box'} for t in s['tracks']], 'minimum_seconds':tracker.minimum,
                    'minimum_samples':tracker.minimum_samples,'maximum_gap':tracker.gap,'eligible_sampling':False,
                    'method':'Live conservative IoU tracking; gaps bounded; manual live confirmation only.',
                    'pose_method':'Head pose unsupported. No gaze or emotion estimates.', 'limitations':'Review and confirm while monitoring; no source media exists for later identity review.'}},
            'audio':None,
            'fusion':{'weights':{'visual':self.windows.weights[0],'audio':self.windows.weights[1]},'version':'live-activity-v2','label':'Experimental live activity index','score':sum(p['score']*(p['end_seconds']-p['seconds']) for p in scores)/duration if duration else None,
                'points':points,'window_seconds':10,'audio_offset_seconds':0,'joint_windows':sum(p['joint_coverage']>0 for p in points),
                'method':'Visual=min(scene difference / 10%, 1); audio=fraction of measured RMS samples >=0.02. Configured weighted mean of available signals x100; missing coverage excluded. See saved weights.',
                'limitations':'Browser audio energy heuristic, not speech or attention. Camera and lighting changes affect visual activity; clock alignment includes transport uncertainty.'},
            'unavailable':['Head pose, gaze, speech recognition and speaker identity unsupported. Raw live replay unavailable by design.'],
            'live_audio_intervals':self.audio_intervals,'notes':[reason,'Raw camera JPEGs discarded after processing; microphone waveforms remain in ephemeral browser buffers. Numeric summaries and explicit attendance history are retained.']}


def register_live(app):
    registry={};guard=threading.Lock()
    app.extensions['live_runs']=registry
    def finish(run,reason):
        if run.closed:return
        run.closed=True
        db().execute("UPDATE analyses SET status='complete',progress=100,result=? WHERE id=?",(json.dumps(run.analysis(reason)),run.aid))
        event('Live monitoring ended; numerical observations retained without raw media')
        db().commit();run.previous=None
    def sweep():
        with guard:
            for key,run in list(registry.items()):
                if run.clock()-run.last>20 and run.lock.acquire(blocking=False):
                    try:finish(run,'Connection inactive for 20 seconds; monitoring expired.');registry.pop(key,None)
                    finally:run.lock.release()
    app.extensions['live_sweep']=sweep
    if not app.testing:
        def reaper():
            while True:
                time.sleep(5)
                try:
                    with app.app_context():sweep()
                except Exception:pass # Never log media or request contents.
        threading.Thread(target=reaper,daemon=True).start()
    def get_run(key):
        run=registry.get(key)
        if not run or run.closed:raise LiveError('Live session expired or backend restarted. Restart monitoring explicitly.',410)
        if run.owner!=digest(request.cookies.get(COOKIE,'')):raise LiveError('This live session belongs to a different browser login.',403)
        if not run.lock.acquire(blocking=False):raise LiveError('Processor busy; drop this frame and retry the next sample.',429)
        return run
    @app.errorhandler(LiveError)
    def live_error(exc):return jsonify(error={'code':'live_error','message':exc.message}),exc.status
    @app.before_request
    def protect_live():
        if request.path.startswith('/api/live'):
            if not signed_in():raise LiveError('Sign in before live monitoring.',401)
            if request.method=='POST' and (request.headers.get('Origin') not in ('http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5000','http://localhost:5000','http://127.0.0.1:4173','http://localhost:4173') or request.headers.get('X-Classroom-Live')!='1'):
                raise LiveError('Use the local live-monitoring interface to perform this action.',403)
            request.max_content_length=300*1024 if request.path.endswith('/frame') else 4096
    @app.post('/api/live/start')
    def start():
        data=request.get_json(silent=True) or {}
        if not isinstance(data,dict) or data.get('consent') is not True or type(data.get('session_id')) is not int:raise LiveError('Select a session and explicitly confirm recording/processing authorization.')
        fps=data.get('fps',4);minimum=data.get('minimum_seconds',20);samples=data.get('minimum_samples',3);gap=data.get('maximum_gap',10)
        if any(type(v) is not int for v in (fps,minimum,samples,gap)) or not 1<=fps<=5 or not 20<=minimum<=300 or not 3<=samples<=100 or not 1<=gap<=10:raise LiveError('Use 1–5 FPS, 20–300s presence, 3–100 observations and 1–10s maximum gap.')
        session=db().execute('SELECT is_demo FROM sessions WHERE id=?',(data['session_id'],)).fetchone()
        if not session or session['is_demo']:raise LiveError('Choose an existing non-sample session.')
        sweep()
        with guard:
            if registry:raise LiveError('Another live monitor is active. End it or wait for its inactivity timeout.',409)
            run=LiveRun(data['session_id'],None,digest(request.cookies.get(COOKIE,'')),dict(fps=fps,minimum_seconds=minimum,minimum_samples=samples,maximum_gap=gap,still_threshold=preferences()['still_motion_threshold'],visual_weight=preferences()['visual_weight'],audio_weight=preferences()['audio_weight']))
            run.aid=db().execute("INSERT INTO analyses(session_id,filename,status,progress,created_at) VALUES(?,?,'processing',0,?)",(run.sid,'Live monitoring · numerical observations',now())).lastrowid
            run.confirmed=db().execute("SELECT COUNT(*) FROM attendance WHERE session_id=? AND status='present'",(run.sid,)).fetchone()[0]
            db().commit();registry[run.id]=run
        return jsonify(run.snapshot()),201
    @app.post('/api/live/<key>/frame')
    def frame(key):
        run=get_run(key)
        try:
            if run.frames and run.clock()-run.last<.8/run.fps:raise LiveError('Sampling too quickly; drop the frame.',429)
            try:second=float(request.form.get('seconds',''));audio=json.loads(request.form['audio']) if 'audio' in request.form else None
            except (ValueError,TypeError):raise LiveError('Invalid frame timestamps/audio.') from None
            file=request.files.get('frame')
            if not file:raise LiveError('A JPEG frame is required.')
            try:result=run.process(file.read(256*1024+1),second,audio)
            except cv2.error:raise LiveError('OpenCV could not process this frame. Check the camera and restart.') from None
            if run.clock()-run.checkpoint>=10:
                db().execute('UPDATE analyses SET result=? WHERE id=?',(json.dumps(run.analysis('Live monitoring in progress; partial checkpoint.')),run.aid));db().commit();run.checkpoint=run.clock()
            return jsonify(result)
        finally:run.lock.release()
    @app.post('/api/live/<key>/end')
    def end(key):
        if key not in registry:return jsonify(ended=True)
        run=get_run(key)
        try:finish(run,'Instructor stopped monitoring.');registry.pop(key,None);return jsonify(ended=True,analysis_id=run.aid)
        finally:run.lock.release()
    @app.post('/api/live/<key>/confirm')
    def confirm(key):
        run=get_run(key)
        try:
            data=request.get_json(silent=True) or {}
            if not isinstance(data,dict):raise LiveError('Send a JSON confirmation object.')
            if data.get('identity_confirmed') is not True or any(type(data.get(k)) is not int for k in ('track_id','student_id')):raise LiveError('Select a roster student and explicitly confirm identity in the live classroom.')
            track=next((t for t in run.observer.tracker.tracks if t['id']==data['track_id']),None)
            if not track or not track['qualified'] or not track['visible'] or run.clock()-run.start-track['last_seen']>2:raise LiveError('Only a qualified, currently visible track can be confirmed. Check the live classroom.')
            db().execute('BEGIN IMMEDIATE')
            student=db().execute('SELECT status FROM attendance WHERE session_id=? AND student_id=?',(run.sid,data['student_id'])).fetchone()
            if not student:raise LiveError('Student is not in this session roster.')
            prior=db().execute('SELECT student_id FROM attendance_changes WHERE analysis_id=? AND track_id=?',(run.aid,track['id'])).fetchone()
            mapped=track['confirmed_student_id'] or (prior['student_id'] if prior else None)
            if mapped and mapped!=data['student_id']:raise LiveError('Track already confirmed for another student.',409)
            duplicate=bool(prior) or student['status']=='present'
            if not duplicate:
                record_attendance(run.sid,data['student_id'],'present','instructor_live_confirmation',run.aid,track['id'])
                event('Instructor confirmed a qualified live anonymous track against the session roster')
            db().commit();track['confirmed_student_id']=data['student_id']
            run.confirmed=db().execute("SELECT COUNT(*) FROM attendance WHERE session_id=? AND status='present'",(run.sid,)).fetchone()[0]
            return jsonify(duplicate=duplicate,confirmed=run.confirmed)
        finally:
            db().rollback();run.lock.release()
    @app.post('/api/live/<key>/suggestions')
    def suggestions(key):
        from .recommendations import summarize,generate
        from .portal import rate_limit
        limited=rate_limit('live_suggestions',4,60)
        if limited:return limited
        run=get_run(key)
        try:
            data=request.get_json(silent=True) or {}
            if not isinstance(data,dict):raise LiveError('Send a JSON suggestions object.')
            if type(data.get('cloud',False)) is not bool:raise LiveError('Cloud preference must be boolean.')
            counts={r['status']:r['n'] for r in db().execute('SELECT status,COUNT(*) n FROM attendance WHERE session_id=? GROUP BY status',(run.sid,))}
            attendance={k:counts.get(k,0) for k in ('present','absent','unconfirmed')};attendance['total']=sum(attendance.values())
            metrics=summarize(run.analysis(),attendance)
            windows=run.windows.result(run.seconds)
            audio=[p['sound']/100 for p in windows if p['sound'] is not None]
            if audio:metrics['sound_active_fraction']=sum(audio)/len(audio)
        finally:run.lock.release()
        return jsonify(generate(metrics,data.get('cloud',False)))
