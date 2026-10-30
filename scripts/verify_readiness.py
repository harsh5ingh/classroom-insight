"""One explicit selected-provider request with fictional workflow data.

Run from the project root. Never prints credentials or provider exception details.
The generated brief is saved under ignored data/verification/ for local review.
"""
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.app import create_app
from backend import portal
from backend.readiness import generate_brief, BriefUnavailable

def main():
    app=create_app()
    diagnostics={}
    def checked_generate(data):
        try:return generate_brief(data)
        except BriefUnavailable as exc:
            cause=exc.__context__
            diagnostics['failure_type']=type(cause).__name__ if cause else 'model_access'
            diagnostics['provider_status']=getattr(cause,'code',None)
            if '--diagnose' in sys.argv and cause:
                # Vault secrets need not exist in os.environ; never print raw exceptions.
                diagnostics['diagnostic']='Provider details omitted; use the safe error code and Settings status.'
            raise
    portal.generate_brief=checked_generate
    response=app.test_client().post('/api/readiness-brief',json={
        'organization_type':'College or university',
        'workflow':'Instructors keep attendance in separate spreadsheets. Session review is informal. Recordings are only available for a small number of consented sessions.',
        'goals':'Test consistent attendance records and instructor-led session review in one course before considering a wider pilot. Avoid any individual attention scoring.',
        'deployment_model':'Local/on-premises',
        'requirements':['Digital attendance records','Session-level analytics','Reports and exports'],
    })
    result=response.get_json()
    if response.status_code!=200:
        print(json.dumps({'status':response.status_code,'error':result['error'],**diagnostics},indent=2))
        return 1
    assert result['source'] in ('gemini','groq')
    assert all(result['brief'][key] for key in ('summary','capabilities','pilot_scope','privacy_considerations','implementation_questions','next_steps','unanswered_questions','limitations'))
    target=Path(__file__).resolve().parents[1]/'data'/'verification'/'readiness-real.json'
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'status':200,'source':result['source'],'schema_validated':True,'summary':result['brief']['summary'],'pilot_scope':result['brief']['pilot_scope'],'saved':str(target)},indent=2))
    return 0

if __name__=='__main__':sys.exit(main())
