"""Explicit local QA only: real HTTP, Windows vault and fixed-prompt generation.

Run ONLY with the server pointed to a disposable QA database. This script saves
and deletes uniquely versioned fictional test keys; it never copies an env key.
"""
import argparse
import json
import http.cookiejar
import urllib.request
import urllib.error


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--qa-database-confirmed',action='store_true',required=True)
    args=parser.parse_args()
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    base='http://127.0.0.1:5000'
    def call(path,data=None):
        headers={'Origin':base,'X-Classroom-Settings':'1','Content-Type':'application/json'}
        req=urllib.request.Request(base+'/api'+path,data=json.dumps(data).encode() if data is not None else None,headers=headers)
        try:
            with opener.open(req,timeout=100) as response:return response.status,json.load(response)
        except urllib.error.HTTPError as response:return response.code,json.load(response)
    status,_=call('/auth/login',{'email':'instructor@classroom.demo','password':'ClassroomDemo!2026'})
    assert status==200, 'QA login failed; no credential operations performed.'
    _,before=call('/settings/ai')
    assert not any(v['managed'] for v in before['providers'].values()), 'Use a fresh disposable QA database, never existing managed credentials.'
    report={}
    if before['providers']['gemini']['configured']:
        status,result=call('/settings/ai/gemini/test',{})
        item=result.get('providers',{}).get('gemini',{})
        report['real_gemini']={k:item.get(k) for k in ('access','error_code','model','checked_at')}
        report['real_gemini']['http_status']=status
        _,refresh=call('/settings/ai')
        assert refresh['providers']['gemini']['access']==item['access']
    else:report['real_gemini']='Not run: no configured credential.'
    saved=[]
    try:
        for name in ('gemini','groq'):
            for suffix in ('initial','replacement'):
                status,result=call(f'/settings/ai/{name}/credential',{'key':'fictional-qa-key-not-valid-'+suffix})
                if status!=200:
                    report['vault']={'http_status':status,'code':result.get('error',{}).get('code')}
                    print(json.dumps(report,indent=2));return
                if name not in saved:saved.append(name)
                assert result['providers'][name]['mask']=='••••••••'
                assert 'fictional-qa-key' not in json.dumps(result)
            status,result=call(f'/settings/ai/{name}/activation',{'enabled':True})
            assert status==200 and result['active']==name
            assert sum(v['active'] for v in result['providers'].values())==1
        status,result=call('/settings/ai/gemini/activation',{'enabled':True})
        assert result['active']=='gemini' and result['providers']['groq']['managed']
        report['vault']='Real Windows vault save, replacement, masking and exclusive switching passed.'
        # A fictional key exercises real rejection; it can never verify successfully.
        status,result=call('/settings/ai/gemini/test',{})
        assert status==200 and result['providers']['gemini']['access']=='failed'
        report['invalid_key']={'http_status':status,'error_code':result['providers']['gemini']['error_code']}
        call('/settings/ai/gemini/activation',{'enabled':False})
        _,result=call('/settings/ai')
        assert result['active'] is None
        report['both_off']='Local mode confirmed by live API.'
    finally:
        for name in saved:
            status,result=call(f'/settings/ai/{name}/delete',{'confirm':True})
            assert status==200 and not result['providers'][name]['configured'], 'QA vault cleanup failed; inspect QA metadata.'
        report['deletion']='Test credentials deleted; environment credentials not modified.'
    print(json.dumps(report,indent=2))


if __name__=='__main__':main()
