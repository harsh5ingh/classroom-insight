import json
import os
import numpy as np

def config_status():
    key = os.getenv('GEMINI_API_KEY','').strip()
    supplied = bool(key and key not in ('your_actual_api_key_here','replace_me'))
    return {'credential_supplied':supplied, 'access':'unverified' if supplied else 'not_configured',
            'model':os.getenv('GEMINI_MODEL','gemini-2.5-flash')}

def verify_model(timeout_ms=20000):
    if not config_status()['credential_supplied']:
        return None, 'No Gemini credential supplied. Local recommendations remain available.'
    from google import genai
    client = genai.Client(api_key=os.environ['GEMINI_API_KEY'], http_options={'timeout':timeout_ms})
    try:
        model = client.models.get(model=config_status()['model'])
        if 'generateContent' not in (model.supported_actions or []):
            client.close()
            return None, 'This model does not advertise content generation. Local rules will be used.'
        return client, None
    except Exception:
        client.close()
        return None, 'Gemini access could not be verified. Check the key, model, quota and network. Local rules remain available.'

def summarize(analysis, attendance):
    video, audio = (analysis or {}).get('video'), (analysis or {}).get('audio')
    metrics = {'attendance':attendance, 'data_kind':(analysis or {}).get('kind','no_media')}
    if video:
        values = [p['activity'] for p in video['points'] if p['activity'] is not None]
        metrics['scene_change_mean'] = round(float(np.mean(values)),2) if values else None
        metrics['scene_change_range'] = round(max(values)-min(values),2) if values else None
        # Runs span the intervals ending at each low-change sample.
        longest = current = 0
        for point in video['points']:
            current = current + video['sample_seconds'] if point['activity'] is not None and point['activity'] < 3 else 0
            longest = max(longest,current)
        metrics['low_scene_change_seconds'] = round(longest)
    if audio:
        metrics['sound_active_fraction'] = audio['active_fraction']
    return metrics

def local_rules(metrics):
    items = []
    attendance = metrics['attendance']
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
    if not items:
        items.append({'title':'Add context to your next review', 'body':'Compare these observations with the lesson format and your own notes. No additional rule threshold was met; that does not establish engagement.',
                      'evidence':f"{attendance['present']} confirmed present; {attendance['total']} roster records. Media source: {metrics['data_kind']}."})
    return items

def generate(metrics, use_gemini=False):
    fallback = local_rules(metrics)
    if not use_gemini:
        return {'source':'local', 'items':fallback, 'note':'Advisory suggestions from transparent local thresholds.'}
    client, error = verify_model()
    if not client:
        return {'source':'local', 'items':fallback, 'note':error}
    try:
        response = client.models.generate_content(model=config_status()['model'], contents=(
            'Suggest up to three practical classroom teaching actions from these aggregate metrics only. '
            'Never infer identity, emotion, attention, ability or motivation. Scene changes and sound energy are weak proxies. '
            'State uncertainty. No student data or raw media is included. Return a JSON array of objects with title, body, evidence strings. '
            + json.dumps(metrics)), config={'response_mime_type':'application/json', 'temperature':0.2})
        items = json.loads(response.text)
        if not isinstance(items,list) or not 1 <= len(items) <= 3:
            raise ValueError('Invalid output')
        for item in items:
            if not isinstance(item,dict) or any(not isinstance(item.get(k),str) or not 1 <= len(item[k]) <= 1500 for k in ('title','body','evidence')):
                raise ValueError('Invalid output')
        return {'source':'gemini', 'items':items, 'note':'AI-generated advisory text. Review against the measurements; statements may be inaccurate.'}
    except Exception:
        return {'source':'local','items':fallback,'note':'Gemini generation was unavailable or returned invalid output. Local rules were used.'}
    finally:
        client.close()
