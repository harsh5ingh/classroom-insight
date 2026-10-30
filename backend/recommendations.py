import json
import os
import hashlib
import threading
from uuid import uuid4
from datetime import datetime, timezone
from flask import current_app, has_app_context
import numpy as np

_standalone = {}
_verification_lock = threading.Lock()

def credential():
    if has_app_context():
        from .providers import resolve, ProviderError
        try: return resolve('gemini')[0]
        except ProviderError: return ''
    for name in ('GEMINI_API_KEY','GOOGLE_API_KEY'):
        value=os.getenv(name,'').strip()
        if value and value not in ('your_actual_api_key_here','replace_me','your_api_key_here'):
            return value
    return ''

def configured_model():
    if has_app_context():
        from .providers import model_name
        return model_name('gemini')
    return os.getenv('GEMINI_MODEL','gemini-2.5-flash').strip() or 'gemini-2.5-flash'

def _state():
    cache=current_app.extensions.setdefault('gemini_verification',{}) if has_app_context() else _standalone
    signature=hashlib.sha256((credential()+'\0'+configured_model()).encode()).hexdigest()
    if cache.get('_signature')!=signature:
        cache.clear()
        cache.update(_signature=signature,access='unverified' if credential() else 'not_configured',checked_at=None,message='',error_code=None,
                     connection_id=uuid4().hex,revision=0)
    return cache

def config_status():
    state=_state()
    return {'credential_supplied':bool(credential()), 'access':state['access'],
            'model':configured_model(),
            'checked_at':state['checked_at'],'message':state['message'],'error_code':state['error_code'],
            'connection_id':state['connection_id'],'revision':state['revision']}

def safe_provider_error(exc):
    code=getattr(exc,'code',None)
    # Inspect known reason tags internally; never return raw provider text/URLs.
    detail=str(exc).upper()
    if isinstance(exc,(ImportError,ModuleNotFoundError)):
        return 'sdk_unavailable','Google Gen AI SDK is unavailable. Install the project requirements in the Flask virtual environment and restart.'
    if 'API_KEY_INVALID' in detail or 'API KEY NOT VALID' in detail or code==401:
        return 'invalid_key','Gemini rejected API-key authentication. Use a Gemini Developer API key from Google AI Studio; check key restrictions and restart Flask after updating .env. OAuth tokens and service-account JSON are not API keys.'
    if code==429:
        return 'quota_exhausted','Gemini rate limit or quota was exceeded. Check this project’s Gemini quota/billing, wait, then retry.'
    if code==403:
        return 'permission_denied','Gemini denied access. Check that the key/project permits the Generative Language API and the configured model; review key application restrictions and regional availability.'
    if code==404:
        return 'model_unavailable','The configured model was not found or is unavailable to this key. Check GEMINI_MODEL against models available to your project, then restart Flask.'
    if code==400:
        return 'invalid_request','Gemini rejected the request or key type. Check the Gemini Developer API key, API restrictions and configured model compatibility.'
    if isinstance(exc,TimeoutError) or 'TIMEOUT' in type(exc).__name__.upper():
        return 'timeout','Gemini timed out. Check network/proxy connectivity and retry.'
    return 'provider_unavailable','Gemini could not complete the request. Check network/proxy connectivity and service availability, then retry. Local rules remain available.'

def _record(access,message,error_code=None):
    state=_state()
    state.update(access=access,message=message,error_code=error_code,checked_at=datetime.now(timezone.utc).isoformat(timespec='seconds'),revision=state['revision']+1)

def _close(client):
    if client:
        try: client.close()
        except Exception: pass

def verify_model(timeout_ms=20000):
    if not config_status()['credential_supplied']:
        return None, 'No Gemini credential supplied. Local recommendations remain available.'
    client=None
    try:
        from google import genai
        client = genai.Client(api_key=credential(),vertexai=False,http_options={'timeout':timeout_ms})
        model = client.models.get(model=config_status()['model'])
        if 'generateContent' not in (model.supported_actions or []):
            _close(client)
            _record('failed','This model does not support content generation. Check GEMINI_MODEL.','model_unavailable')
            return None, 'This model does not advertise content generation. Local rules will be used.'
        return client, None
    except Exception as exc:
        _close(client)
        code,message=safe_provider_error(exc)
        _record('failed',message,code)
        return None,message

def verify_generation():
    if not credential():
        return {**config_status(),'message':'No Gemini credential supplied. Set GEMINI_API_KEY or GOOGLE_API_KEY on the backend and restart Flask. Local rules remain available.'}
    # Avoid overlapping explicit probes; no network request on config/page rendering.
    if not _verification_lock.acquire(blocking=False):
        return {**config_status(),'message':'A Gemini verification is already running. Refresh Settings shortly.'}
    client=None
    try:
        client,error=verify_model(timeout_ms=30000)
        if not client:return {**config_status(),'message':error}
        response=client.models.generate_content(model=config_status()['model'],
            contents='This is an application connection test. Return only the JSON object {"status":"ok"}.',
            config={'response_mime_type':'application/json','max_output_tokens':2048,'temperature':0})
        if json.loads(response.text or '')!={'status':'ok'}:
            raise ValueError('Unexpected verification output')
        _record('verified','Authenticated Gemini generation succeeded and the response was validated. This is a point-in-time check, not a guarantee of future quota.')
    except (ValueError,TypeError) as exc:
        _record('failed','Gemini returned no valid verification response. Retry, or check the configured model.','invalid_response')
    except Exception as exc:
        code,message=safe_provider_error(exc)
        _record('failed',message,code)
    finally:
        _close(client)
        _verification_lock.release()
    return config_status()

def summarize(analysis, attendance):
    video, audio = (analysis or {}).get('video'), (analysis or {}).get('audio')
    metrics = {'attendance':attendance, 'data_kind':(analysis or {}).get('kind','no_media')}
    if video:
        values = [p['activity'] for p in video['points'] if p['activity'] is not None]
        metrics['scene_change_mean'] = round(float(np.mean(values)),2) if values else None
        metrics['scene_change_range'] = round(max(values)-min(values),2) if values else None
        # Use actual timestamps; do not bridge missing/irregular frame gaps.
        longest = current = 0
        previous = None
        for point in video['points']:
            dt = point['seconds']-previous if previous is not None else 0
            current = current + dt if point['activity'] is not None and point['activity'] < 3 and 0 < dt <= video['sample_seconds']*1.5 else 0
            longest = max(longest,current)
            previous = point['seconds']
        metrics['low_scene_change_seconds'] = round(longest)
    if audio:
        metrics['sound_active_fraction'] = audio['active_fraction']
        metrics['sound_bouts'] = audio.get('activity_bouts')
        spectral=audio.get('spectral') or {}
        metrics['broadband_activity_fraction']=spectral.get('broadband_activity_fraction')
    fusion = (analysis or {}).get('fusion')
    if fusion:
        metrics['high_activity_window_count']=sum(p.get('score') is not None and p['score']>=80 and min(p.get('visual_coverage',0),p.get('audio_coverage',0))>=.8 for p in fusion.get('points',[]))
        metrics['observable_activity_index'] = fusion['score']
        metrics['joint_signal_windows'] = fusion['joint_windows']
        metrics['activity_index_caveat'] = fusion['limitations']
    metrics['missing_modalities']=[name for name,present in [('video',bool(video)),('audio',bool(audio) or any(p.get('sound') is not None for p in (fusion or {}).get('points',[])))] if not present]
    return metrics

def local_rules(metrics):
    items = []
    attendance = metrics['attendance']
    if 'joint_signal_windows' in metrics and metrics['joint_signal_windows']==0:
        items.append({'title':'Review signal coverage before comparing sessions',
                      'body':'Only partial signals support the activity index. Check recording alignment and available audio before comparing it with another session. It does not measure attention.',
                      'evidence':'No time window contains both visual change and audio activity observations.'})
    if attendance['unconfirmed']:
        items.append({'title':'Complete the attendance record', 'body':'Confirm outstanding students before interpreting the attendance rate.',
                      'evidence':f"{attendance['unconfirmed']} attendance records are unconfirmed."})
    if metrics.get('low_scene_change_seconds',0) >= 120:
        items.append({'title':'Plan a moment of interaction', 'body':'Consider a short discussion or exercise after this interval. Low visual change can also reflect quiet, focused work.',
                      'evidence':f"A sampled low scene-change run lasted about {metrics['low_scene_change_seconds']} seconds (below 3% intensity change)."})
    if metrics.get('scene_change_range',0) is not None and metrics.get('scene_change_range',0) > 15:
        items.append({'title':'Review the session’s transitions', 'body':'Review pacing around large visual changes. Check camera movement and lighting before drawing teaching conclusions.',
                      'evidence':f"Sampled scene-change range: {metrics['scene_change_range']} percentage points."})
    if 'sound_active_fraction' in metrics and metrics['sound_active_fraction'] < .2:
        items.append({'title':'Make space for discussion', 'body':'If discussion was intended, consider an open question or paired activity. Check microphone placement first; silence is not evidence of disengagement.',
                      'evidence':f"Sound exceeded the energy threshold in {metrics['sound_active_fraction']*100:.1f}% of the recording."})
    if metrics.get('broadband_activity_fraction') is not None and metrics['broadband_activity_fraction']>.5:
        items.append({'title':'Review sustained broadband sound','body':'Check microphone placement and the recording before considering a short classroom reset. Fans, music and equipment can produce this pattern; it is not verified disruption.','evidence':f"Broadband acoustic heuristic matched {metrics['broadband_activity_fraction']*100:.1f}% of decoded audio."})
    if metrics.get('high_activity_window_count',0)>0:
        items.append({'title':'Review an active session segment','body':'Compare these windows with your lesson notes. If the intended exercise was productive, consider repeating it; high observable activity alone does not establish successful learning.','evidence':f"{metrics['high_activity_window_count']} windows scored at least 80 with at least 80% coverage in both modalities."})
    if metrics.get('missing_modalities'):
        items.append({'title':'Check capture coverage','body':'Collect the missing signal only with appropriate permission, or review the available evidence on its own. Do not infer participation from missing data.','evidence':'Unavailable modalities: '+', '.join(metrics['missing_modalities'])})
    if not items:
        items.append({'title':'Add context to your next review', 'body':'Compare these observations with the lesson format and your own notes. No additional rule threshold was met; that does not establish engagement.',
                      'evidence':f"{attendance['present']} confirmed present; {attendance['total']} roster records. Media source: {metrics['data_kind']}."})
    return items

def generate(metrics, use_gemini=False):
    fallback = local_rules(metrics)
    if not use_gemini:
        return {'source':'local', 'items':fallback, 'note':'Advisory suggestions from transparent local thresholds.'}
    try:
        from .providers import cloud_json
        source, response = cloud_json(
            'Suggest up to three practical classroom teaching actions from these aggregate metrics only. '
            'Never infer identity, emotion, attention, ability or motivation. Scene changes and sound energy are weak proxies. '
            'State uncertainty. Do not include numeric claims in titles or bodies; the server attaches measured evidence. No student data or raw media is included. Return a JSON object with an items array of objects with title, body, evidence strings. '
            + json.dumps(metrics))
        items = response['items']
        if not isinstance(items,list) or not 1 <= len(items) <= 3:
            raise ValueError('Invalid output')
        for item in items:
            if not isinstance(item,dict) or any(not isinstance(item.get(k),str) or not 1 <= len(item[k]) <= 1500 for k in ('title','body','evidence')):
                raise ValueError('Invalid output')
        import re
        if any(re.search(r'[0-9]',item['title']+' '+item['body']) for item in items):
            raise ValueError('Numeric claims are not accepted in generated advice')
        evidence='Supplied aggregate observations: '+json.dumps(metrics,ensure_ascii=False,sort_keys=True)
        items=[{**item,'evidence':evidence} for item in items]
        return {'source':source, 'items':items, 'note':'AI-generated advisory text with server-attached measurements. Review suggestions against lesson context; prose may be inaccurate.'}
    except Exception as exc:
        from .providers import safe_error
        return {'source':'local','items':fallback,'note':safe_error(exc).message+' Local rules were used.'}
