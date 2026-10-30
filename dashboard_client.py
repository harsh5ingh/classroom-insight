"""Streamlit server-side client: loopback only, per-session cookies, no SQLite access."""
import requests
from urllib.parse import urlparse

class DashboardError(Exception): pass

class DashboardClient:
    def __init__(self,base='http://127.0.0.1:5000'):
        parsed=urlparse(base)
        if parsed.scheme!='http' or parsed.hostname not in ('127.0.0.1','localhost') or parsed.username or parsed.password or parsed.path not in ('','/') or parsed.query or parsed.fragment:
            raise ValueError('Use a loopback backend URL without credentials or paths.')
        self.base=base.rstrip('/');self.http=requests.Session();self.http.trust_env=False
        self.http.headers['Origin']='http://127.0.0.1:5000'
    def request(self,method,path,**kwargs):
        if not path.startswith('/api/') or '://' in path: raise DashboardError('Invalid application API path.')
        try:
            response=self.http.request(method,self.base+path,timeout=15,allow_redirects=False,**kwargs)
        except requests.RequestException:
            raise DashboardError('Local Flask backend is unavailable. Start it and retry.') from None
        if response.status_code==401: raise DashboardError('Sign in again; the demo session expired or credentials were rejected.')
        if not response.ok or 300<=response.status_code<400: raise DashboardError(f'Backend request failed (HTTP {response.status_code}). Check the core application.')
        try: return response.json()
        except ValueError: raise DashboardError('Backend returned an invalid JSON response.') from None
    def login(self,email,password): return self.request('POST','/api/auth/login',json={'email':email,'password':password})
    def get(self,path): return self.request('GET',path)
    def close(self):
        try:self.request('POST','/api/auth/logout',json={})
        finally:self.http.cookies.clear();self.http.close()
