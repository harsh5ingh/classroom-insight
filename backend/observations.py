"""Local, anonymous observations. No recognition or internal attention inference."""
import base64
import math
from pathlib import Path
import cv2
import numpy as np


def iou(a, b):
    x, y = max(a[0], b[0]), max(a[1], b[1])
    right, bottom = min(a[0]+a[2], b[0]+b[2]), min(a[1]+a[3], b[1]+b[3])
    intersection = max(0, right-x)*max(0, bottom-y)
    union = a[2]*a[3]+b[2]*b[3]-intersection
    return intersection/union if union else 0


class PresenceTracker:
    """One-to-one IoU association; unmatched observations break sustained runs.

    Track IDs are recording-local hypotheses, never identities. Ambiguous matches
    start new tracks instead of guessing. Sparse (>10s) sampling cannot qualify.
    """
    def __init__(self, sample_seconds, minimum_seconds=20, minimum_samples=3, still_threshold=.02):
        self.interval = sample_seconds
        self.minimum = minimum_seconds
        self.minimum_samples = minimum_samples
        self.still_threshold = still_threshold
        self.tracks = []
        self.active = []

    def update(self, second, boxes, previews=None, rolls=None):
        candidates = []
        for ti in self.active:
            track = self.tracks[ti]
            dt = second-track['last_seen']
            if 0 < dt <= min(15, self.interval*1.5):
                for bi, box in enumerate(boxes):
                    overlap = iou(track['box'], box)
                    if overlap >= .3:
                        candidates.append((overlap, ti, bi))
        # Any competing association is uncertain; do not bridge it.
        counts_t = {t:sum(x[1]==t for x in candidates) for _,t,_ in candidates}
        counts_b = {b:sum(x[2]==b for x in candidates) for _,_,b in candidates}
        matches = {b:t for _,t,b in candidates if counts_t[t]==1 and counts_b[b]==1}
        active = []
        for bi, box in enumerate(boxes[:100]):
            ti = matches.get(bi)
            if ti is None:
                if len(self.tracks) >= 100:
                    continue
                ti = len(self.tracks)
                self.tracks.append({'id':ti+1, 'first_seen':second, 'last_seen':second,
                    'samples':0, 'span_seconds':0, 'movement':[], 'still_seconds':0,
                    'longest_still_seconds':0, 'roll_degrees':[], 'preview':(previews or {}).get(bi),
                    'box':list(box), 'qualified':False})
            t = self.tracks[ti]
            if t['samples']:
                dt = second-t['last_seen']
                old = t['box']
                distance = math.hypot(box[0]+box[2]/2-old[0]-old[2]/2,
                                      box[1]+box[3]/2-old[1]-old[3]/2)
                speed = distance / max(old[2],1e-9) / dt
                t['movement'].append(round(speed,4))
                t['still_seconds'] = t['still_seconds']+dt if speed < self.still_threshold else 0
                t['longest_still_seconds'] = max(t['longest_still_seconds'],t['still_seconds'])
            t['samples'] += 1
            t['last_seen'] = second
            t['span_seconds'] = round(second-t['first_seen'],2)
            t['box'] = list(box)
            roll = (rolls or {}).get(bi)
            if roll is not None:
                t['roll_degrees'].append(round(roll,1))
            t['qualified'] = (self.interval <= 10 and t['samples'] >= self.minimum_samples
                              and t['span_seconds'] >= self.minimum)
            active.append(ti)
        self.active = active
        return [self.tracks[t]['id'] for t in active]

    def result(self):
        return [{k:v for k,v in t.items() if k not in ('box','movement','still_seconds','roll_degrees')}
                | {'mean_motion_face_widths_per_second':round(float(np.mean(t['movement'])),4) if t['movement'] else None,
                   'mean_eye_line_roll_degrees':round(float(np.mean(t['roll_degrees'])),1) if t['roll_degrees'] else None,
                   'roll_samples':len(t['roll_degrees'])} for t in self.tracks]


class FaceObserver:
    def __init__(self, interval, prefs=None):
        prefs = prefs or {}
        self.retain_previews = prefs.get('retain_face_previews',False)
        self.observe_eye_line = prefs.get('observe_eye_line',True)
        self.tracker = PresenceTracker(interval,prefs.get('presence_seconds',20),prefs.get('presence_samples',3),prefs.get('still_motion_threshold',.02))
        self.last_count = 0
        self.detector = cv2.CascadeClassifier(str(Path(cv2.data.haarcascades)/'haarcascade_frontalface_default.xml'))
        self.eyes = cv2.CascadeClassifier(str(Path(cv2.data.haarcascades)/'haarcascade_eye_tree_eyeglasses.xml'))
        if self.detector.empty():
            raise ValueError('Bundled face detector unavailable.')

    def observe(self, frame, second):
        h,w = frame.shape[:2]
        scale = min(1,640/max(w,h))
        image = cv2.resize(frame,(max(1,round(w*scale)),max(1,round(h*scale))))
        gray = cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
        boxes = sorted(self.detector.detectMultiScale(gray,scaleFactor=1.1,minNeighbors=5,minSize=(28,28)),
                       key=lambda b:(int(b[0]),int(b[1])))[:100]
        self.last_count = len(boxes)
        previews,rolls = {},{}
        normalized = []
        for i,(x,y,bw,bh) in enumerate(boxes):
            x,y,bw,bh = map(int,(x,y,bw,bh))
            # One scale for both axes preserves Euclidean motion in face-width units.
            normalized.append((x/gray.shape[1],y/gray.shape[1],bw/gray.shape[1],bh/gray.shape[1]))
            if self.retain_previews:
                ok,jpeg = cv2.imencode('.jpg',cv2.resize(image[y:y+bh,x:x+bw],(96,96)),[cv2.IMWRITE_JPEG_QUALITY,65])
                if ok: previews[i] = base64.b64encode(jpeg).decode('ascii')
            if self.observe_eye_line and not self.eyes.empty():
                eyes = self.eyes.detectMultiScale(gray[y:y+bh//2,x:x+bw],minNeighbors=5,minSize=(8,8))
                if len(eyes)==2:
                    centers = sorted([(ex+ew/2,ey+eh/2) for ex,ey,ew,eh in eyes])
                    dx,dy = centers[1][0]-centers[0][0],centers[1][1]-centers[0][1]
                    if dx > bw*.2:
                        rolls[i] = math.degrees(math.atan2(dy,dx))
        return self.tracker.update(second,normalized,previews,rolls)


def fuse_signals(video, audio, audio_offset=0):
    """Timestamp-aligned, duration-weighted observable activity, never attention.

    Video differences cover the interval ending at each sample. Gaps >1.5x
    nominal spacing are missing. Audio is interval overlap, not interpolated RMS.
    """
    duration = max((video or {}).get('duration_seconds',0),
                   max(0,(audio or {}).get('duration_seconds',0)+audio_offset))
    if duration <= 0: return None
    window = max(10,math.ceil(duration/360))
    visual = []
    previous = None
    for p in (video or {}).get('points',[]):
        if previous is not None:
            dt = p['seconds']-previous['seconds']
            if p['activity'] is not None and 0 < dt <= video['sample_seconds']*1.5:
                visual.append((previous['seconds'],p['seconds'],min(1,max(0,p['activity']/10))))
        previous = p
    overlap = lambda a,b,c,d:max(0,min(b,d)-max(a,c))
    points = []
    for start in range(0,math.ceil(duration),window):
        end = min(duration,start+window)
        coverage = sum(overlap(start,end,a,b) for a,b,_ in visual)
        v = sum(overlap(start,end,a,b)*value for a,b,value in visual)/coverage if coverage else None
        audio_seconds = overlap(start,end,audio_offset,audio_offset+audio['duration_seconds']) if audio else 0
        joint_seconds = sum(overlap(max(start,audio_offset),min(end,audio_offset+audio['duration_seconds']),a,b) for a,b,_ in visual) if audio else 0
        active = sum(overlap(start,end,i['start']+audio_offset,i['end']+audio_offset) for i in audio['active_intervals']) if audio else 0
        a = active/audio_seconds if audio_seconds else None
        values = [x for x in (v,a) if x is not None]
        points.append({'seconds':start,'end_seconds':end,'visual':round(v*100,1) if v is not None else None,
                       'sound':round(a*100,1) if a is not None else None,
                       'score':round(sum(values)/len(values)*100,1) if values else None,
                       'modalities':len(values),'visual_coverage':round(coverage/(end-start),3),
                       'joint_coverage':round(joint_seconds/(end-start),3),
                       'audio_coverage':round(audio_seconds/(end-start),3)})
    supported = [p for p in points if p['score'] is not None]
    total = sum(p['end_seconds']-p['seconds'] for p in supported)
    return {'version':'observable-activity-v1','label':'Observable activity index (experimental)',
            'score':round(sum(p['score']*(p['end_seconds']-p['seconds']) for p in supported)/total,1) if total else None,
            'points':points,'window_seconds':window,'audio_offset_seconds':audio_offset,
            'joint_windows':sum(p['joint_coverage']>0 for p in points),
            'method':'Visual = min(scene change / 10%, 1); sound = active duration / available audio duration. Equal-weight mean of available signals; missing signals excluded. Duration-weighted window mean.',
            'limitations':'An explainable activity heuristic, not a validated engagement, attention or learning score. Camera changes and background sound affect it. One modality is explicitly partial.'}
