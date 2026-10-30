"""Load the project .env independently of cwd, preserving deployment values."""
import os
from pathlib import Path
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]

def load_environment(root=ROOT):
    # A deployment alias takes precedence over a different local-file alias.
    deployed_key = 'GEMINI_API_KEY' in os.environ or 'GOOGLE_API_KEY' in os.environ
    for name,value in dotenv_values(Path(root)/'.env').items():
        if value is not None and not (deployed_key and name in ('GEMINI_API_KEY','GOOGLE_API_KEY')):
            os.environ.setdefault(name,value)
