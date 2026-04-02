import json
import os
import re
import hmac
import hashlib
import base64
import time
from pymongo import MongoClient

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

JWT_SECRET = os.environ.get('JWT_SECRET', 'workshop-jwt-secret-key')
DEFAULT_PASSWORD = 'password123!'

# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(password):
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
    return base64.b64encode(salt + key).decode()

def verify_password(password, stored_hash):
    try:
        decoded = base64.b64decode(stored_hash.encode())
        salt, stored_key = decoded[:16], decoded[16:]
        new_key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
        return hmac.compare_digest(stored_key, new_key)
    except Exception:
        return False

def validate_password_strength(password):
    """Alphanumeric + at least one special character, min 8 chars."""
    if len(password) < 8:
        return False
    if not re.search(r'[a-zA-Z]', password):
        return False
    if not re.search(r'[0-9]', password):
        return False
    if not re.search(r'[^a-zA-Z0-9]', password):
        return False
    return True

# ── JWT helpers ───────────────────────────────────────────────────────────────

def _b64url(data):
    if isinstance(data, dict):
        data = json.dumps(data, separators=(',', ':')).encode()
    elif isinstance(data, str):
        data = data.encode()
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def create_token(emp_id, role, name):
    header  = _b64url({'alg': 'HS256', 'typ': 'JWT'})
    payload = _b64url({'sub': emp_id, 'role': role, 'name': name,
                       'exp': int(time.time()) + 86400 * 7})
    signing_input = f'{header}.{payload}'.encode()
    mac = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256)
    return f'{header}.{payload}.{_b64url(mac.digest())}'

def verify_token(token):
    try:
        header_b64, payload_b64, signature_b64 = token.split('.')
        signing_input = f'{header_b64}.{payload_b64}'.encode()
        expected_mac = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256)
        expected_sig = _b64url(expected_mac.digest())
        if not hmac.compare_digest(signature_b64, expected_sig):
            return None
        payload_json = base64.urlsafe_b64decode(payload_b64 + '==')
        payload = json.loads(payload_json)
        if payload.get('exp', 0) < time.time():
            return None
        return payload
    except:
        return None

def get_current_user(event):
    auth_header = event.get('headers', {}).get('Authorization') or event.get('headers', {}).get('authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    token = auth_header[7:]
    return verify_token(token)

# ── DB connection helper ──────────────────────────────────────────────────────

def get_client(is_local, mongo_port, mongo_user, mongo_pass):
    def _connect(host):
        kwargs = {'host': host, 'port': mongo_port, 'serverSelectionTimeoutMS': 3000}
        if not is_local:
            if mongo_user and mongo_pass:
                kwargs['username'] = mongo_user
                kwargs['password'] = mongo_pass
            kwargs['tls'] = True
            kwargs['tlsAllowInvalidCertificates'] = True
            kwargs['retryWrites'] = False
        return MongoClient(**kwargs)

    if is_local:
        upstream = os.environ.get('MONGO_HOST', 'localhost').strip()
        candidates = list(dict.fromkeys(
            ([upstream] if upstream else []) + ['host.docker.internal', '172.17.0.1', 'localhost']
        ))
        last_exc = None
        for h in candidates:
            try:
                c = _connect(h)
                c.server_info()
                return c
            except Exception as ex:
                last_exc = ex
        raise last_exc or RuntimeError('Unable to connect to local MongoDB')
    return _connect(os.environ.get('MONGO_HOST', 'localhost'))

_KNOWN = {'individuals', 'teams', 'achievements', 'locations', 'metadata', 'auth'}

# ── Handler ───────────────────────────────────────────────────────────────────

def handler(event=None, context=None):
    event = event or {}
    http_ctx = event.get('requestContext', {}).get('http', {})
    method   = (http_ctx.get('method') or event.get('httpMethod', 'GET')).upper()
    raw_path = event.get('rawPath') or event.get('path', '')

    if method == 'OPTIONS':
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    path_parts = [p for p in raw_path.strip('/').split('/') if p]

    # Detect auth sub-route  (/auth/login  or  /auth/register)
    is_auth     = 'auth' in path_parts
    auth_action = None
    if is_auth:
        if 'login' in path_parts:
            auth_action = 'login'
        elif 'register' in path_parts:
            auth_action = 'register'
    
    record_id   = None if is_auth else (
        path_parts[-1] if path_parts and path_parts[-1] not in _KNOWN else None
    )

    # Authenticate user for non-auth routes
    user = None if is_auth else get_current_user(event)
    if not is_auth and not user:
        return {"statusCode": 401, "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Unauthorized"})}

    try:
        is_local   = os.environ.get('IS_LOCAL', 'false') == 'true'
        mongo_port = int(os.environ.get('MONGO_PORT', 27017))
        mongo_user = os.environ.get('MONGO_USER', '').strip()
        mongo_pass = os.environ.get('MONGO_PASS', '').strip()
        client     = get_client(is_local, mongo_port, mongo_user, mongo_pass)
        col        = client['Workshop']['individuals']

        # ── AUTH ROUTES ──────────────────────────────────────────────────────

        if is_auth:
            if method != 'POST':
                return {"statusCode": 405, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Method not allowed"})}
            body = json.loads(event.get('body') or '{}')

            # LOGIN
            if auth_action == 'login':
                email    = (body.get('Email') or '').strip()
                password = body.get('Password') or ''
                if not email or not password:
                    return {"statusCode": 400, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "Email and password required"})}

                all_docs = list(col.find({}, {'_id': 0}))
                user = next((d for d in all_docs
                             if (d.get('Email') or '').strip().lower() == email.lower()), None)
                
                if not user:
                    return {"statusCode": 401, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "Invalid email or password"})}

                stored_hash = user.get('PasswordHash')
                
                # For development: allow login with default password for any existing user
                if password == DEFAULT_PASSWORD:
                    # Set password hash if not set
                    if not stored_hash:
                        col.update_one({'ID': user['ID']},
                                       {'$set': {'PasswordHash': hash_password(password)}})
                    
                    token = create_token(user['ID'], user['Role'],
                                         f"{user['Fname']} {user['Lname']}")
                    safe_user = {k: v for k, v in user.items() if k != 'PasswordHash'}
                    return {"statusCode": 200, "headers": CORS_HEADERS,
                            "body": json.dumps({"token": token, "user": safe_user})}
                
                # If not using default password, verify stored hash
                if stored_hash and verify_password(password, stored_hash):
                    token = create_token(user['ID'], user['Role'],
                                         f"{user['Fname']} {user['Lname']}")
                    safe_user = {k: v for k, v in user.items() if k != 'PasswordHash'}
                    return {"statusCode": 200, "headers": CORS_HEADERS,
                            "body": json.dumps({"token": token, "user": safe_user})}
                
                return {"statusCode": 401, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Invalid email or password"})}

            # REGISTER
            if auth_action == 'register':
                fname = (body.get('Fname') or '').strip()
                lname = (body.get('Lname') or '').strip()
                email = (body.get('Email') or '').strip()
                password = body.get('Password') or ''
                region   = body.get('Region') or 'NAM'
                org      = body.get('Organization') or 'Credit Cards'

                if not all([fname, lname, email, password]):
                    return {"statusCode": 400, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "All fields are required"})}
                if not validate_password_strength(password):
                    return {"statusCode": 400, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "Password must be at least 8 characters and include letters, numbers, and a special character"})}

                all_docs = list(col.find({}, {'_id': 0, 'Email': 1, 'PasswordHash': 1}))
                existing_user = next((d for d in all_docs
                                     if (d.get('Email') or '').lower() == email.lower()), None)
                if existing_user:
                    # If user exists but has no password hash, allow "registration" to set password
                    if not existing_user.get('PasswordHash'):
                        col.update_one({'Email': email},
                                       {'$set': {'PasswordHash': hash_password(password),
                                                 'Fname': fname, 'Lname': lname,
                                                 'Region': region, 'Organization': org,
                                                 'Role': 'Employee'}})
                        user = col.find_one({'Email': email}, {'_id': 0, 'PasswordHash': 0})
                        token = create_token(user['ID'], user['Role'], f"{fname} {lname}")
                        return {"statusCode": 200, "headers": CORS_HEADERS,
                                "body": json.dumps({"token": token, "user": user})}
                    else:
                        return {"statusCode": 409, "headers": CORS_HEADERS,
                                "body": json.dumps({"error": f"Email '{email}' is already in use"})}

                # Generate next EMP ID
                all_ids = list(col.find({}, {'_id': 0, 'ID': 1}))
                nums = []
                for d in all_ids:
                    id_val = d.get('ID') or ''
                    if id_val.startswith('EMP-'):
                        try:
                            num_part = id_val.replace('EMP-', '')
                            nums.append(int(num_part))
                        except ValueError:
                            # Skip invalid EMP IDs
                            continue
                emp_id = f"EMP-{str(max(nums, default=0) + 1).zfill(3)}"

                new_emp = {
                    'ID': emp_id, 'Fname': fname, 'Lname': lname, 'Email': email,
                    'Region': region, 'Organization': org, 'Role': 'Employee',
                    'PasswordHash': hash_password(password),
                }
                col.insert_one(new_emp)
                new_emp.pop('_id', None)
                new_emp.pop('PasswordHash', None)

                token = create_token(emp_id, 'Employee', f"{fname} {lname}")
                return {"statusCode": 201, "headers": CORS_HEADERS,
                        "body": json.dumps({"token": token, "user": new_emp})}

            # Invalid auth action
            else:
                return {"statusCode": 400, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Invalid auth action"})}

        # ── CRUD ROUTES ──────────────────────────────────────────────────────

        if method == 'GET':
            docs = list(col.find({}, {'_id': 0, 'PasswordHash': 0}))
            return {"statusCode": 200, "headers": CORS_HEADERS,
                    "body": json.dumps(docs, default=str)}

        elif method == 'POST':
            body  = json.loads(event.get('body') or '{}')
            body.pop('PasswordHash', None)   # never set via CRUD
            email = (body.get('Email') or '').strip()
            if email:
                all_docs = list(col.find({}, {'_id': 0, 'Email': 1, 'Fname': 1, 'Lname': 1}))
                conflict = next((d for d in all_docs
                                 if (d.get('Email') or '').strip().lower() == email.lower()), None)
                if conflict:
                    return {"statusCode": 409, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": f"Email '{email}' is already in use"})}
            col.insert_one(body)
            body.pop('_id', None)
            return {"statusCode": 201, "headers": CORS_HEADERS,
                    "body": json.dumps(body, default=str)}

        elif method == 'PUT':
            if not record_id:
                return {"statusCode": 400, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Missing ID in path"})}
            body = json.loads(event.get('body') or '{}')
            body.pop('_id', None)
            body.pop('PasswordHash', None)   # preserve existing hash
            email = (body.get('Email') or '').strip()
            if email:
                all_docs = list(col.find({'ID': {'$ne': record_id}},
                                         {'_id': 0, 'Email': 1, 'Fname': 1, 'Lname': 1}))
                conflict = next((d for d in all_docs
                                 if (d.get('Email') or '').strip().lower() == email.lower()), None)
                if conflict:
                    return {"statusCode": 409, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": f"Email '{email}' is already in use by {conflict.get('Fname')} {conflict.get('Lname')}"})}
            # Preserve existing PasswordHash during replace
            existing = col.find_one({'ID': record_id}, {'_id': 0, 'PasswordHash': 1}) or {}
            if existing.get('PasswordHash'):
                body['PasswordHash'] = existing['PasswordHash']
            result = col.replace_one({'ID': record_id}, body)
            if result.matched_count == 0:
                return {"statusCode": 404, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Not found"})}
            body.pop('PasswordHash', None)
            return {"statusCode": 200, "headers": CORS_HEADERS,
                    "body": json.dumps(body, default=str)}

        elif method == 'DELETE':
            if not record_id:
                return {"statusCode": 400, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Missing ID in path"})}
            result = col.delete_one({'ID': record_id})
            if result.deleted_count == 0:
                return {"statusCode": 404, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Not found"})}
            return {"statusCode": 200, "headers": CORS_HEADERS,
                    "body": json.dumps({"deleted": record_id})}

        return {"statusCode": 405, "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Method not allowed"})}

    except Exception as e:
        return {"statusCode": 500, "headers": CORS_HEADERS,
                "body": json.dumps({"error": str(e)})}

if __name__ == "__main__":
    print(handler())
