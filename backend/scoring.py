"""Explainable reweighting of observed windows; coverage is not confidence in attention."""
import math

def explain_fusion(fusion, visual_weight=1.0, audio_weight=1.0):
    if any(type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=10 for v in (visual_weight,audio_weight)) or visual_weight+audio_weight<=0:
        raise ValueError('Use finite weights from 0 to 10, with at least one positive weight.')
    if not fusion: return None
    points=[]; anomalies=[]; previous=None
    for original in fusion.get('points',[]):
        p=dict(original); terms=[]
        for key,coverage,weight in [('visual','visual_coverage',visual_weight),('sound','audio_coverage',audio_weight)]:
            value=p.get(key)
            if value is not None and weight>0 and p.get(coverage,0)>0:
                terms.append((key,max(0,min(100,value)),weight,max(0,min(1,p[coverage]))))
        denominator=sum(t[2] for t in terms)
        p['contributions']={key:round(value*weight/denominator,3) for key,value,weight,_ in terms} if denominator else {}
        p['score']=round(sum(value*weight for _,value,weight,_ in terms)/denominator,2) if denominator else None
        p['coverage']=round(sum(weight*coverage for _,_,weight,coverage in terms)/(visual_weight+audio_weight),3)
        p['period']='unavailable' if p['score'] is None else 'low' if p['score']<20 else 'high' if p['score']>80 else 'moderate'
        p['missing_signals']=[key for key,cov,w in [('visual','visual_coverage',visual_weight),('sound','audio_coverage',audio_weight)] if w and (p.get(key) is None or p.get(cov,0)<1)]
        # Compare adjacent, substantially covered windows with the same contributing modalities.
        if previous and p['score'] is not None and previous['score'] is not None and p['seconds']==previous['end_seconds'] and p['coverage']>=.8 and previous['coverage']>=.8 and p['contributions'].keys()==previous['contributions'].keys():
            delta=p['score']-previous['score']
            if abs(delta)>=30: anomalies.append({'seconds':p['seconds'],'delta':round(delta,2),'message':'Experimental abrupt activity change; review camera, sound and lesson context.'})
        points.append(p);previous=p
    supported=[p for p in points if p['score'] is not None]
    duration=sum(max(0,p['end_seconds']-p['seconds']) for p in supported)
    return {**fusion,'version':'observable-activity-v2','points':points,'weights':{'visual':visual_weight,'audio':audio_weight},
            'score':round(sum(p['score']*(p['end_seconds']-p['seconds']) for p in supported)/duration,2) if duration else None,
            'anomalies':anomalies,'method':'Visual = min(scene change / 10%, 1) x100; audio = active fraction x100. Sum(value x configured weight) / sum(available positive weights). Session mean is duration weighted. Coverage = weighted observed coverage / all configured weights; it is not statistical confidence.',
            'limitations':fusion.get('limitations','')+' Presence and movement are contextual observations, not extra score terms: adding them would double-count visual evidence. Noise is not verified speech; this index cannot measure learning.'}
