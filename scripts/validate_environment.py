"""Read-only environment diagnostics. Never opens devices, initializes DB, or calls AI."""
import argparse
import importlib.metadata as metadata
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import urllib.request
ROOT=Path(__file__).resolve().parents[1]

def inspect(check_imports=False,base='http://127.0.0.1:5000'):
    result={'python':sys.version.split()[0],'supported_python':sys.version_info>=(3,12),'venv':sys.prefix!=sys.base_prefix,'packages':{},'ffmpeg':bool(shutil.which('ffmpeg')),'camera':'Not opened; use explicit browser permission in Live Monitor.','microphone':'Not opened; use explicit browser permission in Live Monitor.'}
    for package,module in [('Flask','flask'),('numpy','numpy'),('opencv-python-headless','cv2'),('librosa','librosa'),('scipy','scipy'),('streamlit','streamlit'),('mediapipe','mediapipe'),('google-genai','google.genai'),('groq','groq'),('keyring','keyring')]:
        try: installed=metadata.version(package)
        except metadata.PackageNotFoundError: installed=None
        status='not tested'
        if check_imports and installed:
            try:
                r=subprocess.run([sys.executable,'-B','-c',f'import importlib; importlib.import_module({module!r})'],cwd=ROOT,capture_output=True,timeout=90)
                status='passed' if r.returncode==0 else 'failed (details withheld; inspect dependency compatibility)'
            except subprocess.TimeoutExpired:status='timeout'
        result['packages'][package]={'version':installed,'import':status}
    path=ROOT/'data'/'classroom.sqlite3'
    if path.exists():
        try:
            with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as db:
                db.execute('SELECT 1');result['database']='read-only connection passed'
                row=db.execute("SELECT value FROM settings WHERE key='ai_provider_manager'").fetchone()
                result['active_provider']=json.loads(row[0]).get('active') if row else 'Settings/environment fallback not inspected'
        except sqlite3.Error:result['database']='read-only connection failed'
    else:result['database']='not initialized; diagnostics did not create it'
    try:
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(base+'/api/health',timeout=5) as response:result['backend']=json.load(response)
    except Exception:result['backend']='unavailable; start Flask'
    result['ai_verification']='Not requested; use Settings for an authenticated generation test.'
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--imports',action='store_true');args=parser.parse_args()
    report=inspect(args.imports);print(json.dumps(report,indent=2))
    sys.exit(0 if report['supported_python'] and report['venv'] else 1)
