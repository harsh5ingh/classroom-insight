"""Local single-user provider manager. SQLite contains metadata, never credentials."""
import json
import os
import re
import sys
from uuid import uuid4
from flask import current_app, jsonify, request
from .db import db, now

SETTING = 'ai_provider_manager'
NAMES = ('gemini', 'groq')


class ProviderError(Exception):
    def __init__(self, code, message, status=400):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)


def environment_key(name):
    variables = ('GEMINI_API_KEY', 'GOOGLE_API_KEY') if name == 'gemini' else ('GROQ_API_KEY',)
    return next((os.environ[v].strip() for v in variables if os.getenv(v, '').strip() and os.environ[v].strip() not in
                 ('your_actual_api_key_here', 'replace_me', 'your_api_key_here')), '')


def vault():
    # Never accept keyrings.alt, environment-selected plaintext backends, or a chainer.
    if current_app.testing and 'TEST_CREDENTIAL_VAULT' in current_app.config:
        return current_app.config['TEST_CREDENTIAL_VAULT']
    try:
        if sys.platform != 'win32':
            raise RuntimeError()
        from keyring.backends.Windows import WinVaultKeyring
        result = WinVaultKeyring()
        if result.priority <= 0:
            raise RuntimeError()
        return result
    except Exception:
        raise ProviderError('vault_unavailable', 'Windows Credential Manager is unavailable. Run Flask as your Windows user with keyring installed. No plaintext fallback is permitted.', 503) from None


def vault_call(method, name, identifier, *args):
    try:
        return getattr(vault(), method)('ClassroomInsight/' + name + '/' + identifier, 'api-key', *args)
    except ProviderError:
        raise
    except Exception:
        raise ProviderError('vault_failed', 'Windows Credential Manager could not complete the operation. Check your Windows user session and retry; no plaintext fallback was used.', 503) from None


def state():
    row = db().execute('SELECT value FROM settings WHERE key=?', (SETTING,)).fetchone()
    if row:
        return json.loads(row[0])
    return {'revision': 0, 'active': 'gemini' if environment_key('gemini') else None,
            'providers': {n: {'model': os.getenv('GEMINI_MODEL', 'gemini-2.5-flash') if n == 'gemini' else os.getenv('GROQ_MODEL', ''),
                              'credential_id': None, 'environment_allowed': True, 'access': 'unverified',
                              'checked_at': None, 'last_success_at': None, 'message': '', 'error_code': None} for n in NAMES}}


def persist(value):
    value['revision'] += 1
    db().execute('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                 (SETTING, json.dumps(value)))


def resolve(name, value=None):
    item = (value or state())['providers'][name]
    if item['credential_id']:
        key = vault_call('get_password', name, item['credential_id'])
        if not key:
            raise ProviderError('vault_missing', 'The saved vault entry is unavailable. Replace the credential in Settings.', 503)
        return key, 'settings'
    return (environment_key(name), 'environment') if item['environment_allowed'] else ('', 'none')


def metadata():
    value = state()
    result = {'revision': value['revision'], 'active': value['active'], 'providers': {}}
    for name, item in value['providers'].items():
        public = {k: item[k] for k in ('model', 'access', 'checked_at', 'last_success_at', 'message', 'error_code')}
        public.update(managed=bool(item['credential_id']), active=value['active'] == name)
        try:
            key, source = resolve(name, value)
            public.update(configured=bool(key), source=source if key else 'none', mask='••••••••' if key else '')
            if source == 'environment' and key and item.get('environment_check_id') != current_app.extensions.setdefault('ai_environment_instance', uuid4().hex):
                public.update(access='unverified', message='', error_code=None)
            if not key:
                public['access'] = 'not_configured'
        except ProviderError as exc:
            public.update(configured=False, source='settings', mask='', access='failed', error_code=exc.code, message=exc.message)
        result['providers'][name] = public
    return result


def model_name(name):
    return state()['providers'][name]['model']


def reset_check(item):
    item.update(access='unverified', checked_at=None, last_success_at=None, message='', error_code=None)


def change(name, operation, data):
    if name not in NAMES:
        raise ProviderError('invalid_provider', 'Choose Gemini or Groq.')
    connection = db()
    new_id = old_key = None
    old_id = None
    connection.execute('BEGIN IMMEDIATE')
    try:
        value = state()
        item = value['providers'][name]
        old_id = item['credential_id']
        if operation == 'credential':
            key = data.get('key')
            if set(data) != {'key'} or not isinstance(key, str) or not 16 <= len(key) <= 512 or not re.fullmatch(r'[A-Za-z0-9_.\-]+', key):
                raise ProviderError('invalid_key_input', 'Enter a 16–512 character API key without spaces. Do not enter tokens or service-account JSON.')
            new_id = uuid4().hex
            vault_call('set_password', name, new_id, key)
            if vault_call('get_password', name, new_id) != key:
                raise ProviderError('vault_failed', 'Credential save could not be verified. The previous configuration is unchanged.', 503)
            item.update(credential_id=new_id, environment_allowed=False)
            reset_check(item)
        elif operation == 'delete':
            if data != {'confirm': True}:
                raise ProviderError('confirmation_required', 'Confirm credential deletion explicitly.')
            if old_id:
                old_key = vault_call('get_password', name, old_id)
                if old_key:
                    vault_call('delete_password', name, old_id)
            item.update(credential_id=None, environment_allowed=False)
            reset_check(item)
            if value['active'] == name:
                value['active'] = None
        elif operation == 'activation':
            if set(data) != {'enabled'} or type(data['enabled']) is not bool:
                raise ProviderError('invalid_activation', 'Enabled must be true or false.')
            if data['enabled']:
                if not resolve(name, value)[0]:
                    raise ProviderError('not_configured', 'Configure an API key before enabling this provider.')
                value['active'] = name
            elif value['active'] == name:
                value['active'] = None
        elif operation == 'model':
            model = data.get('model')
            if set(data) != {'model'} or not isinstance(model, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_./:\-]{0,159}', model):
                raise ProviderError('invalid_model', 'Enter a model ID from your provider account (maximum 160 characters).')
            item['model'] = model
            reset_check(item)
        else:
            raise ProviderError('invalid_operation', 'Unsupported provider operation.')
        persist(value)
        connection.commit()
    except Exception:
        connection.rollback()
        # Versioned vault writes make failed saves leave the previous key intact.
        if new_id:
            try: vault_call('delete_password', name, new_id)
            except ProviderError: pass
        if operation == 'delete' and old_key:
            try: vault_call('set_password', name, old_id, old_key)
            except ProviderError: pass
        raise
    # Retire the old version only after SQLite points to the new version.
    if new_id and old_id:
        try: vault_call('delete_password', name, old_id)
        except ProviderError:
            # Non-secret maintenance notice; obsolete vault entry is never used.
            current_app.logger.warning('An obsolete provider vault entry could not be retired; review Windows Credential Manager.')
    return metadata()


def safe_error(exc):
    if isinstance(exc, ProviderError):
        return exc
    status = getattr(exc, 'status_code', None) or getattr(exc, 'code', None)
    if 'API_KEY_INVALID' in str(exc).upper() or 'API KEY NOT VALID' in str(exc).upper():
        return ProviderError('invalid_key', 'Authentication failed. Replace the API key with a valid provider API key.', 503)
    if isinstance(exc, (ImportError, ModuleNotFoundError)):
        return ProviderError('sdk_unavailable', 'Install the project requirements in the Flask environment and restart.', 503)
    if isinstance(exc, (ValueError, TypeError, KeyError, IndexError)):
        return ProviderError('invalid_response', 'The provider did not return the required JSON response. Check model support and retry.', 502)
    mapping = {400: ('invalid_request', 'The provider rejected the request. Check key type and model JSON support.'),
               401: ('invalid_key', 'Authentication failed. Replace the API key with a valid provider API key.'),
               403: ('permission_denied', 'Access was denied. Check key restrictions, project permissions and model access.'),
               404: ('model_unavailable', 'This model is unavailable to the account. Choose an available model and retry.'),
               429: ('quota_exhausted', 'Rate limit or quota exceeded. Check provider quota/billing and retry later.')}
    code, message = mapping.get(status, ('provider_unavailable', 'The provider could not complete the request. Check network access and service availability. Local recommendations remain available.'))
    if status not in mapping and (isinstance(exc, TimeoutError) or 'TIMEOUT' in type(exc).__name__.upper()):
        code, message = 'timeout', 'The provider timed out. Check network access and retry.'
    return ProviderError(code, message, 503)


class GeminiProvider:
    def generate(self, key, model, prompt, schema=None):
        from google import genai
        with genai.Client(api_key=key, vertexai=False, http_options={'timeout': 45000}) as client:
            available = client.models.get(model=model)
            if 'generateContent' not in (available.supported_actions or []):
                raise ProviderError('model_unavailable', 'This model does not support generation.', 503)
            config = {'response_mime_type': 'application/json', 'max_output_tokens': 4096, 'temperature': 0.2}
            if schema: config['response_json_schema'] = schema
            return json.loads(client.models.generate_content(model=model, contents=prompt, config=config).text or '')


class GroqProvider:
    def models(self, key):
        from groq import Groq
        with Groq(api_key=key, timeout=30, max_retries=0) as client:
            return [m.id for m in client.models.list().data if getattr(m, 'active', True)]

    def generate(self, key, model, prompt, schema=None):
        from groq import Groq
        with Groq(api_key=key, timeout=45, max_retries=0) as client:
            if model not in [m.id for m in client.models.list().data if getattr(m, 'active', True)]:
                raise ProviderError('model_unavailable', 'Choose a model available to this Groq account.', 503)
            if schema: prompt += '\nReturn JSON matching this schema: ' + json.dumps(schema)
            response = client.chat.completions.create(model=model, messages=[{'role': 'user', 'content': prompt}],
                response_format={'type': 'json_object'}, temperature=0.2, max_completion_tokens=4096)
            return json.loads(response.choices[0].message.content or '')


def cloud_json(prompt, schema=None, provider=None):
    name = provider or state()['active']
    if not name:
        raise ProviderError('local_mode', 'Cloud AI is disabled. Local recommendations are available.', 503)
    key, _ = resolve(name)
    if not key:
        raise ProviderError('not_configured', 'Configure an API key in Settings first.', 503)
    model = model_name(name)
    if not model:
        raise ProviderError('model_required', 'Choose a model in Settings before testing or generating.', 400)
    try:
        return name, (GeminiProvider() if name == 'gemini' else GroqProvider()).generate(key, model, prompt, schema)
    except Exception as exc:
        raise safe_error(exc) from None


def test_connection(name):
    before = state()
    result = {'access': 'verified', 'error_code': None, 'message': 'Authenticated generation succeeded and its JSON response was validated.', 'checked_at': now()}
    try:
        _, output = cloud_json('Connection test. Return only the JSON object {"status":"ok"}.', provider=name)
        if output != {'status': 'ok'}:
            raise ValueError()
    except Exception as exc:
        error = safe_error(exc)
        result.update(access='failed', error_code=error.code, message=error.message)
    db().execute('BEGIN IMMEDIATE')
    value = state()
    if value['revision'] != before['revision']:
        db().rollback()
        raise ProviderError('configuration_changed', 'Configuration changed during verification. Test the current settings again.', 409)
    value['providers'][name].update(result)
    value['providers'][name]['environment_check_id'] = current_app.extensions.setdefault('ai_environment_instance', uuid4().hex)
    if result['access'] == 'verified':
        value['providers'][name]['last_success_at'] = result['checked_at']
    persist(value)
    db().commit()
    return metadata()


def register_providers(app):
    @app.errorhandler(ProviderError)
    def provider_error(exc):
        return jsonify(error={'code': exc.code, 'message': exc.message}), exc.status

    @app.before_request
    def protect_provider_settings():
        if request.path.startswith('/api/settings/ai'):
            from .portal import signed_in
            if not signed_in():
                raise ProviderError('session_required', 'Sign in before managing AI providers.', 401)
            if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                if request.headers.get('Origin') not in ('http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5000', 'http://localhost:5000', 'http://127.0.0.1:4173', 'http://localhost:4173') or request.headers.get('X-Classroom-Settings') != '1':
                    raise ProviderError('csrf_rejected', 'This settings action requires a same-origin application request.', 403)
                request.max_content_length = 2048
                if not request.is_json:
                    raise ProviderError('invalid_json', 'Send a JSON settings request.', 415)

    @app.get('/api/settings/ai')
    def ai_settings():
        return jsonify(metadata())

    @app.post('/api/settings/ai/<name>/<operation>')
    def ai_change(name, operation):
        from .portal import rate_limit
        if name not in NAMES:
            raise ProviderError('invalid_provider', 'Choose Gemini or Groq.')
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise ProviderError('invalid_json', 'Send a JSON object.')
        limited = rate_limit('ai_settings', 30, 60)
        if limited: return limited
        if operation in ('test', 'models'):
            if data: raise ProviderError('invalid_input', 'This action accepts an empty JSON object only.')
            limited = rate_limit('ai_verification', 6, 60)
            if limited: return limited
            if operation == 'test': return jsonify(test_connection(name))
            if name != 'groq': raise ProviderError('invalid_provider', 'Model discovery is available for Groq.')
            key, _ = resolve(name)
            if not key: raise ProviderError('not_configured', 'Save a Groq API key first.')
            try: return jsonify(models=GroqProvider().models(key))
            except Exception as exc: raise safe_error(exc) from None
        return jsonify(change(name, operation, data))
