"""Real local HTTP with synthetic JPEG/audio metrics, never real hardware.

Only run against a disposable QA database. Creates one fictional QA session.
"""
import argparse
import json
import time
import threading
from pathlib import Path
import sys
import cv2
import httpx
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.app import create_app
from werkzeug.serving import make_server


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--qa-database-confirmed',action='store_true',required=True)
    parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    qa=root/'data'/'live-monitor-qa'/'http-smoke.sqlite3'
    app=create_app({'TESTING':True,'DATABASE':str(qa),'UPLOAD_FOLDER':str(qa.parent/'http-media')})
    server=make_server('127.0.0.1',0,app,threaded=True)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
    try:
        exercise(base)
    finally:
        server.shutdown();server.server_close()


def exercise(base):
    # Origin is the app's allowed frontend; destination is a unique isolated port.
    with httpx.Client(base_url=base,timeout=10,trust_env=False,headers={'Origin':'http://127.0.0.1:5173','X-Classroom-Live':'1'}) as c:
        assert c.get('/api/health').status_code==200
        assert c.post('/api/auth/login',json={'email':'instructor@classroom.demo','password':'ClassroomDemo!2026'}).status_code==200
        sid=c.post('/api/sessions',json={'title':'Synthetic live HTTP QA','date':'2026-10-30','instructor':'QA — synthetic inputs'}).json()['id']
        start=c.post('/api/live/start',json={'session_id':sid,'consent':True,'fps':4})
        assert start.status_code==201,start.status_code
        run=start.json();key=run['id'];clock=time.monotonic();latencies=[];previous=0.;sample=None
        try:
            jpeg=cv2.imencode('.jpg',np.zeros((240,320,3),np.uint8))[1].tobytes()
            for _ in range(42):
                time.sleep(.26)
                second=time.monotonic()-clock
                audio={'start':previous,'end':second,'rms':.05,'active_fraction':1.,'intervals':[{'start':previous,'end':second}]}
                started=time.perf_counter()
                response=c.post(f'/api/live/{key}/frame',data={'seconds':str(second),'audio':json.dumps(audio)},files={'frame':('qa.jpg',jpeg,'image/jpeg')})
                latencies.append((time.perf_counter()-started)*1000)
                assert response.status_code==200,response.status_code
                sample=response.json();previous=second
            assert sample['tracks']==[] and sample['frames_processed']==42
            assert sample['windows'][0]['modalities']==2 and sample['windows'][0]['joint_coverage']>0
            assert c.post(f'/api/live/{key}/confirm',json={'track_id':1,'student_id':1,'identity_confirmed':True}).status_code==400
            suggestion=c.post(f'/api/live/{key}/suggestions',json={'cloud':False})
            assert suggestion.status_code==200 and suggestion.json()['source']=='local'
        finally:
            assert c.post(f'/api/live/{key}/end',json={}).status_code==200
        analysis=next(a for a in c.get('/api/analyses').json() if a['id']==run['analysis_id'])
        assert analysis['status']=='complete' and not analysis['has_media']
        assert c.get(f"/api/analyses/{run['analysis_id']}/media").status_code==404
        print(json.dumps({'input':'Synthetic 320x240 blank JPEG and synthetic acoustic metrics; no camera/microphone',
            'frames_processed':sample['frames_processed'],'detected_tracks':len(sample['tracks']),
            'http_latency_median_ms':round(float(np.median(latencies)),2),'http_latency_p95_ms':round(float(np.percentile(latencies,95)),2),
            'aligned_windows':len(sample['windows']),'local_suggestions':True,'analysis_complete':True,'raw_media_retained':False},indent=2))


if __name__=='__main__':main()
