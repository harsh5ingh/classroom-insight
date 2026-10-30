"""Bounded local analysis. HOG is an estimate, energy is not verified speech."""
import json
import math
import shutil
import subprocess
import wave
from pathlib import Path
import cv2
import numpy as np
from .db import db, event
from .observations import FaceObserver, fuse_signals

MAX_DURATION = 7200
MAX_SAMPLES = 360

def audio_metrics(path):
    with wave.open(str(path), 'rb') as audio:
        width, channels, rate, frames = audio.getsampwidth(), audio.getnchannels(), audio.getframerate(), audio.getnframes()
        duration = frames / rate if rate else 0
        if width not in (1, 2, 4) or not 1 <= channels <= 8 or not 1 <= rate <= 192000 or not 0 < duration <= MAX_DURATION:
            raise ValueError('Use PCM WAV (8, 16 or 32 bit), up to two hours and eight channels.')
        energies = []
        speechlike_seconds = 0.0
        speechlike_intervals=[]
        speechlike_truncated=False
        # Stream one-second windows; no whole-recording allocation.
        for second in range(math.ceil(duration)):
            data = audio.readframes(rate)
            expected_frames = min(rate, frames - second * rate)
            if len(data) != expected_frames * channels * width:
                raise ValueError('The WAV recording is truncated or has invalid frame metadata.')
            samples = np.frombuffer(data, dtype={1:np.uint8, 2:'<i2', 4:'<i4'}[width]).astype(np.float64)
            samples = (samples - 128) / 128 if width == 1 else samples / (2 ** (width * 8 - 1))
            energy = float(np.sqrt(np.mean(samples ** 2))) if samples.size else 0.0
            energies.append({'seconds':second, 'energy':round(energy, 6)})
            mono = samples.reshape(-1,channels).mean(axis=1)
            frame_size = max(1,round(rate*.03))
            for offset in range(0,len(mono),frame_size):
                frame = mono[offset:offset+frame_size]
                if len(frame)<rate*.02: continue
                rms = float(np.sqrt(np.mean(frame**2)))
                crossings = float(np.mean(np.diff(np.signbit(frame))!=0))
                spectrum = np.abs(np.fft.rfft(frame*np.hanning(len(frame))))**2
                frequencies = np.fft.rfftfreq(len(frame),1/rate)
                band = float(spectrum[(frequencies>=100)&(frequencies<=min(3800,rate*.45))].sum()/max(spectrum.sum(),1e-15))
                if rms>.015 and .02<=crossings<=.35 and band>.65:
                    speechlike_seconds += len(frame)/rate
                    start,end=second+offset/rate,second+(offset+len(frame))/rate
                    if speechlike_intervals and abs(speechlike_intervals[-1]['end']-start)<1e-6:
                        speechlike_intervals[-1]['end']=end
                    elif len(speechlike_intervals)<360:
                        speechlike_intervals.append({'start':start,'end':end})
                    else: speechlike_truncated=True
    threshold = max(.015, float(np.percentile([r['energy'] for r in energies], 20)) * 2) if energies else .015
    active = [r for r in energies if r['energy'] > threshold]
    intervals = []
    for row in active:
        if intervals and intervals[-1]['end'] == row['seconds']:
            intervals[-1]['end'] = min(duration, row['seconds'] + 1)
        else:
            intervals.append({'start':row['seconds'], 'end':min(duration, row['seconds'] + 1)})
    active_seconds = sum(r['end'] - r['start'] for r in intervals)
    # Downsample visualization only; duty fraction is calculated from every window.
    step = max(1, math.ceil(len(energies) / MAX_SAMPLES))
    chart = [{'seconds':chunk[0]['seconds'], 'energy':round(float(np.mean([r['energy'] for r in chunk])),6)}
             for i in range(0,len(energies),step) if (chunk := energies[i:i+step])]
    return {'duration_seconds':duration, 'energy':chart, 'active_fraction':round(active_seconds / duration, 4) if duration else 0,
            'threshold':threshold, 'active_intervals':intervals,
            'activity_bouts':len(intervals), 'bouts_per_minute':round(len(intervals)*60/duration,2),
            'speech_like_fraction':round(speechlike_seconds/duration,4),
            'speech_like_intervals':speechlike_intervals,'speech_like_intervals_truncated':speechlike_truncated,
            'speech_method':'Experimental 30ms energy, zero-crossing and speech-band heuristic. Tones/music/noise can match; not verified speech, speaker turns or conversation understanding.',
            'method':'One-second RMS energy; adaptive threshold. Sound activity, not verified speech.'}

def analyze_media(path, prefs, progress):
    suffix = path.suffix.lower()
    result = {'kind':'measured', 'video':None, 'audio':None, 'unavailable':[], 'notes':[
        'No identity matching, emotion inference or individual attention scores are performed.']}
    wav_path = path if suffix == '.wav' else None
    temporary = path.with_suffix('.extracted.wav')
    if suffix != '.wav' and shutil.which('ffmpeg'):
        try:
            subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(path),'-t',str(MAX_DURATION + 1),'-vn','-ac','1','-ar','16000',str(temporary)],
                           check=True, capture_output=True, timeout=180)
            wav_path = temporary
        except (subprocess.SubprocessError, OSError):
            result['unavailable'].append('Audio extraction failed or no decodable audio track was found.')
    elif suffix != '.wav':
        result['unavailable'].append('Audio extraction unavailable: install FFmpeg or upload PCM WAV audio.')
    try:
        if suffix in ('.mp4','.mov','.avi','.webm','.mkv'):
            capture = cv2.VideoCapture(str(path))
            try:
                fps, total = capture.get(cv2.CAP_PROP_FPS), capture.get(cv2.CAP_PROP_FRAME_COUNT)
                if not capture.isOpened() or fps <= 0 or total <= 0:
                    raise ValueError('The video could not be decoded. Try an MP4 or AVI with a supported codec.')
                duration = total / fps
                if not math.isfinite(duration) or duration > MAX_DURATION:
                    raise ValueError('Video must be no longer than two hours.')
                interval = max(prefs['sample_seconds'], duration / MAX_SAMPLES)
                faces = None
                if prefs.get('face_detection',True):
                    try:
                        faces = FaceObserver(interval,prefs)
                    except (cv2.error,ValueError,AttributeError):
                        result['unavailable'].append('Face detection unavailable; no face tracking or pose results produced.')
                else:
                    result['unavailable'].append('Face observations disabled in analysis preferences.')
                detector = None
                if prefs['person_detection']:
                    try:
                        detector = cv2.HOGDescriptor()
                        detector.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
                    except cv2.error:
                        detector = None
                        result['unavailable'].append('Person detector unavailable; scene-change analysis only.')
                else:
                    result['unavailable'].append('Person count estimation is disabled in analysis preferences.')
                points, previous = [], None
                times = np.arange(0, duration, interval)
                for i, second in enumerate(times):
                    capture.set(cv2.CAP_PROP_POS_MSEC, float(second) * 1000)
                    ok, frame = capture.read()
                    if not ok:
                        continue
                    gray = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (160,90))
                    activity = round(float(np.mean(cv2.absdiff(gray, previous))) / 255 * 100, 2) if previous is not None else None
                    previous = gray
                    count = None
                    if detector is not None:
                        height, width = frame.shape[:2]
                        scale = min(640 / width, 640 / height)
                        resized = cv2.resize(frame, (max(64,round(width * scale)), max(128,round(height * scale))))
                        try:
                            boxes, _ = detector.detectMultiScale(resized, winStride=(8,8), padding=(8,8), scale=1.05)
                            count = len(boxes)
                        except cv2.error:
                            detector = None
                            result['unavailable'].append('Person estimation failed; scene-change analysis continues. Earlier count estimates may be available.')
                    face_ids = None
                    if faces:
                        try:
                            face_ids = faces.observe(frame,float(second))
                        except (cv2.error,ValueError):
                            faces = None
                            result['unavailable'].append('Face processing failed; face results unavailable for this analysis.')
                    points.append({'seconds':round(float(second),1), 'count':count, 'activity':activity,
                                   'faces':faces.last_count if face_ids is not None else None})
                    progress(10 + round((i+1) / len(times) * 75))
                if not points:
                    raise ValueError('No readable frames were found in this recording.')
                result['video'] = {'duration_seconds':round(duration,2), 'sample_seconds':round(interval,2), 'frames_sampled':len(points),
                    'points':points, 'detector':'OpenCV HOG + SVM pedestrian detector' if detector else None,
                    'method':'Mean absolute grayscale difference between sampled frames (% of intensity range).',
                    'limitations':'HOG estimates upright visible people and often misses seated or occluded participants. Camera motion and lighting affect scene change. Counts are not attendance.'}
                result['video']['face_tracking'] = {
                    'method':'Bundled OpenCV frontal-face Haar cascade; conservative one-to-one IoU tracking. IDs are anonymous and recording-local.',
                    'tracks':faces.tracker.result(), 'minimum_seconds':faces.tracker.minimum, 'minimum_samples':faces.tracker.minimum_samples,
                    'still_motion_threshold':faces.tracker.still_threshold,
                    'eligible_sampling':interval<=10,
                    'limitations':'At most 100 tracks. Missed/ambiguous detections break tracks. Crossings and occlusion may swap apparent identity; review original media. Qualification uses the saved minimum duration/sample thresholds and sampling <=10s. This never marks attendance automatically.',
                    'pose_method':'Head pose unsupported. Eye-line roll is only a 2D image heuristic when two eyes are detected, not a head-pose estimate. No yaw/pitch or gaze inference. Stillness is not inattention.'
                } if faces else None
            finally:
                capture.release()
        if wav_path:
            try:
                result['audio'] = audio_metrics(wav_path)
            except (wave.Error, ValueError, EOFError) as exc:
                if suffix == '.wav':
                    raise ValueError('Invalid or unsupported PCM WAV recording.') from exc
                result['unavailable'].append('Audio track could not be analyzed as PCM WAV.')
        if not result['video'] and not result['audio']:
            raise ValueError('No signals could be decoded. Upload PCM WAV audio, or install FFmpeg for other audio formats.')
        result['fusion'] = fuse_signals(result['video'],result['audio'])
        progress(95)
        return result
    finally:
        temporary.unlink(missing_ok=True)

def process_job(app, analysis_id, path, prefs):
    with app.app_context():
        def progress(value):
            db().execute("UPDATE analyses SET status='processing',progress=? WHERE id=?", (value,analysis_id))
            db().commit()
        try:
            progress(2)
            if Path(path).suffix=='.zip':
                from .capture import analyze_camera
                result = analyze_camera(Path(path),prefs,progress)
            else:
                result = analyze_media(Path(path), prefs, progress)
            result['analysis_preferences'] = prefs
            db().execute("UPDATE analyses SET status='complete',progress=100,result=? WHERE id=?", (json.dumps(result),analysis_id))
            event('Recording analysis completed')
        except Exception as exc:
            # Never return decoder stderr, filesystem paths or provider credentials.
            error = str(exc) if isinstance(exc, ValueError) else 'Analysis failed. Check the format and try a shorter recording.'
            db().execute("UPDATE analyses SET status='failed',error=? WHERE id=?", (error,analysis_id))
            event('Recording analysis could not be completed')
        db().commit()
