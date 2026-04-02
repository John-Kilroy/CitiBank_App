import json
import os
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

def _b64url(data):
    if isinstance(data, dict):
        data = json.dumps(data, separators=(',', ':')).encode()
    elif isinstance(data, str):
        data = data.encode()
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

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

def handler(event=None, context=None):
    event = event or {}
    http_ctx = event.get('requestContext', {}).get('http', {})
    method = (http_ctx.get('method') or event.get('httpMethod', 'GET')).upper()
    raw_path = event.get('rawPath') or event.get('path', '')

    if method == 'OPTIONS':
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    # Extract record ID from path. Works for both:
    #   /ACH-001                       (direct Lambda URL via proxy)
    #   /api/achievements/ACH-001     (via CloudFront)
    _SEGMENT_NAMES = {'api', 'individuals', 'teams', 'achievements', 'metadata'}
    path_parts = [p for p in raw_path.strip('/').split('/') if p]
    record_id = path_parts[-1] if path_parts and path_parts[-1] not in _SEGMENT_NAMES else None

    # Authenticate user
    user = get_current_user(event)
    if not user:
        return {"statusCode": 401, "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Unauthorized"})}

    try:
        is_local = os.environ.get('IS_LOCAL', 'false') == 'true'
        mongo_port = int(os.environ.get('MONGO_PORT', 27017))
        mongo_user = os.environ.get('MONGO_USER', '').strip()
        mongo_pass = os.environ.get('MONGO_PASS', '').strip()

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
            candidate_hosts = []
            upstream_host = os.environ.get('MONGO_HOST', 'localhost').strip()
            if upstream_host:
                candidate_hosts.append(upstream_host)
            candidate_hosts.extend(['host.docker.internal', '172.17.0.1', 'localhost'])
            candidate_hosts = list(dict.fromkeys(candidate_hosts))
            client = None
            last_exc = None
            for h in candidate_hosts:
                try:
                    client = _connect(h)
                    client.server_info()
                    break
                except Exception as ex:
                    last_exc = ex
            if client is None:
                raise last_exc or RuntimeError('Unable to connect to local MongoDB')
        else:
            client = _connect(os.environ.get('MONGO_HOST', 'localhost'))

        collection = client['Workshop']['achievements']

        if method == 'GET':
            docs = list(collection.find({}, {'_id': 0}))
            return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps(docs, default=str)}

        elif method == 'POST':
            if user['role'] != 'Leader':
                return {"statusCode": 403, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Only leaders can create achievements"})}
            body = json.loads(event.get('body') or '{}')
            collection.insert_one(body)
            body.pop('_id', None)
            return {"statusCode": 201, "headers": CORS_HEADERS, "body": json.dumps(body, default=str)}

        elif method == 'PUT':
            if user['role'] != 'Leader':
                return {"statusCode": 403, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Only leaders can edit achievements"})}
            if not record_id:
                return {"statusCode": 400, "headers": CORS_HEADERS, "body": json.dumps({"error": "Missing ID in path"})}
            body = json.loads(event.get('body') or '{}')
            body.pop('_id', None)
            result = collection.replace_one({'ID': record_id}, body)
            if result.matched_count == 0:
                return {"statusCode": 404, "headers": CORS_HEADERS, "body": json.dumps({"error": "Not found"})}
            return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps(body, default=str)}

        elif method == 'DELETE':
            if user['role'] != 'Leader':
                return {"statusCode": 403, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Only leaders can delete achievements"})}
            if not record_id:
                return {"statusCode": 400, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Missing ID in path"})}
            result = collection.delete_one({'ID': record_id})
            if result.deleted_count == 0:
                return {"statusCode": 404, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Not found"})}
            return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"deleted": record_id})}

        else:
            return {"statusCode": 405, "headers": CORS_HEADERS, "body": json.dumps({"error": "Method not allowed"})}

    except Exception as e:
        return {"statusCode": 500, "headers": CORS_HEADERS, "body": json.dumps({"error": str(e)})}

if __name__ == "__main__":
    print(handler())
