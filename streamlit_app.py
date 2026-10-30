"""Optional read-only institutional analytics UI; Flask remains the source of truth."""
import csv
import io
import json
import pandas as pd
import streamlit as st
from dashboard_client import DashboardClient,DashboardError

st.set_page_config(page_title='Classroom Insight - Analytics',layout='wide')
st.title('Classroom Insight')
st.caption('Optional analytics workspace · Demo authentication · Existing Flask API and SQLite records')
if 'api' not in st.session_state:
    st.info('Sign in with the same documented demo credentials as the core application. Provider API keys are never requested here.')
    with st.form('login',clear_on_submit=True):
        email=st.text_input('Work email',key='login_email')
        password=st.text_input('Password',type='password',key='login_password')
        submit=st.form_submit_button('Sign in')
    if submit:
        client=DashboardClient()
        try:
            client.login(email,password);st.session_state.api=client
            st.rerun()
        except DashboardError as exc:
            client.http.close();st.error(str(exc))
    st.stop()
api=st.session_state.api
if st.sidebar.button('Sign out'):
    try:api.close()
    except DashboardError:pass
    del st.session_state.api
    st.rerun()
st.sidebar.caption('Read-only analytics. Use React for attendance edits, media deletion, capture and provider settings.')
try:
    sessions=api.get('/api/sessions')
    if not sessions:
        st.info('No sessions. Create one in the core application; this dashboard does not seed data.');st.stop()
    ids=[s['id'] for s in sessions];labels={s['id']:s['title']+(' [illustrative sample]' if s['is_demo'] else '') for s in sessions}
    selected=st.selectbox('Session',ids,format_func=labels.get)
    report=api.get(f'/api/analytics/sessions/{selected}/report')
    st.subheader(labels[selected])
    cols=st.columns(3)
    for col,key in zip(cols,('present','absent','unconfirmed')):col.metric(key.title(),report['summary'][key])
    st.dataframe(pd.DataFrame(report['attendance']),hide_index=True)
    output=io.StringIO();fields=['student_id','name','identifier','status','confirmed_at','updated_at','source'];writer=csv.writer(output);writer.writerow(fields)
    for row in report['attendance']:
        writer.writerow([("'"+str(row.get(k))) if str(row.get(k) or '').lstrip().startswith(('=','+','-','@')) else row.get(k) for k in fields])
    st.download_button('Download attendance CSV',output.getvalue(),f'session-{selected}.csv','text/csv')
    st.download_button('Download JSON report',json.dumps(report,indent=2),f'session-{selected}.json','application/json')
    if report['tracks']:
        st.subheader('Anonymous observed presence')
        tracks=pd.DataFrame([{'track':f"{t['analysis_id']}/{t['id']}",'observed_seconds':t['observed_presence_seconds']} for t in report['tracks']])
        st.dataframe(tracks,hide_index=True)
        if tracks.observed_seconds.notna().any():st.bar_chart(tracks.set_index('track'))
        st.caption('Unknown sparse-recording durations remain missing; track observations are not verified attendance duration.')
    else:st.info('No anonymous track observations available.')
    for analysis in report['analyses']:
        result=analysis['result'] or {};fusion=result.get('fusion')
        st.caption(f"Analysis {analysis['id']} provenance: {result.get('kind','unknown')} / {(result.get('source') or {}).get('kind','recorded or legacy')}")
        if fusion and fusion.get('points'):
            st.subheader(f"Analysis {analysis['id']} - observable activity")
            frame=pd.DataFrame(fusion['points']).set_index('seconds')
            st.line_chart(frame[['visual','sound','score']],color=['#285943','#C58B43','#73776D'])
            st.caption(fusion['method']);st.warning(fusion['limitations'])
            st.dataframe(frame,hide_index=False)
            for alert in fusion.get('anomalies',[]):st.warning(f"{alert['seconds']}s: {alert['message']}")
        audio=result.get('audio')
        if audio and audio.get('energy'):
            st.subheader('Audio energy');st.line_chart(pd.DataFrame(audio['energy']).set_index('seconds'))
    st.subheader('Saved teaching recommendations')
    if not report['recommendations']:st.info('No saved recommendations. Request evidence-based suggestions in the core application.')
    for rec in report['recommendations']:
        st.caption(f"Source: {rec['source']} · {rec['created_at']}")
        for item in rec['items']:
            st.markdown('**'+item['title']+'**');st.write(item['body']);st.caption('Evidence: '+item['evidence'])
    comparison=st.multiselect('Compare sessions',[i for i in ids if i!=selected],format_func=labels.get,max_selections=3)
    compared=[report]+[api.get(f'/api/analytics/sessions/{i}/report') for i in comparison]
    st.dataframe(pd.DataFrame([{'session':r['session']['title'],'sample':bool(r['session']['is_demo']),**r['summary']} for r in compared]),hide_index=True)
    with st.expander('Track review and audit history'):
        st.dataframe(pd.DataFrame(report['attendance_changes']),hide_index=True)
        if report['history_truncated']:st.warning('Report history capped at 5000; original records remain intact.')
    for note in report['limitations']:st.caption(note)
except DashboardError as exc:
    st.error(str(exc));st.button('Retry')
