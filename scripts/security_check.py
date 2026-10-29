"""Read-only source/bundle secret check and Git ignore verification.

Only reports status and offending filenames, never secret values.
Does not initialize or change the project's Git repository.
"""
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from dotenv import dotenv_values

ROOT=Path(__file__).resolve().parents[1]
secrets=[v.encode() for k,v in dotenv_values(ROOT/'.env').items() if v and ('KEY' in k or 'SECRET' in k) and len(v)>16 and not v.startswith(('replace','your_'))]
files=[]
for folder in ('src','backend','docs','scripts','shared','dist'):
    files.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and p.suffix in ('.py','.tsx','.ts','.css','.html','.json','.md','.js'))
files.extend(ROOT/name for name in ('README.md','.env.example','package.json','package-lock.json'))
matches=[]
for path in files:
    data=path.read_bytes()
    if any(secret in data for secret in secrets) or re.search(rb'AIza[0-9A-Za-z_-]{30,}',data):
        matches.append(str(path.relative_to(ROOT)))
assert not matches, 'Possible credential in files: '+', '.join(matches)
with tempfile.TemporaryDirectory(prefix='classroom-ignore-check-') as directory:
    subprocess.run(['git','init','--quiet',directory],check=True,capture_output=True)
    shutil.copyfile(ROOT/'.gitignore',Path(directory)/'.gitignore')
    candidates=['.env','.env.local','data/classroom.sqlite3','data/uploads/private.mp4','.venv/example','node_modules/example','dist/index.html','.env.example']
    result=subprocess.run(['git','check-ignore','--no-index','-z','--stdin'],input=('\0'.join(candidates)+'\0').encode(),cwd=directory,capture_output=True,check=False)
    ignored=set(result.stdout.decode().strip('\0').split('\0'))
    assert all(path in ignored for path in candidates[:-1]) and '.env.example' not in ignored
git=subprocess.run(['git','rev-parse','--show-toplevel'],cwd=ROOT,capture_output=True,check=False)
print(json.dumps({'scanned_files':len(files),'configured_secrets_found_in_source_or_bundle':False,'gitignore_verified':True,'env_example_trackable':True,'git_repository':git.returncode==0,'commits_or_pushes_performed':False},indent=2))
