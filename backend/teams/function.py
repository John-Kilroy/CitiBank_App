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

def next_req_id(req_col):
    docs = list(req_col.find({}, {'_id': 0, 'ID': 1}))
    nums = [int(d['ID'].replace('REQ-', '')) for d in docs
            if (d.get('ID') or '').startswith('REQ-')]
    return f"REQ-{str(max(nums, default=0) + 1).zfill(3)}"

def handler(event=None, context=None):
    event    = event or {}
    http_ctx = event.get('requestContext', {}).get('http', {})
    method   = (http_ctx.get('method') or event.get('httpMethod', 'GET')).upper()
    raw_path = event.get('rawPath') or event.get('path', '')

    if method == 'OPTIONS':
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    path_parts = [p for p in raw_path.strip('/').split('/') if p]

    # Route: /api/teams/requests[/{id}]  vs  /api/teams[/{id}]
    is_requests = 'requests' in path_parts
    request_id  = None
    record_id   = None

    if is_requests:
        req_idx    = path_parts.index('requests')
        request_id = path_parts[req_idx + 1] if req_idx + 1 < len(path_parts) else None
    else:
        _KNOWN    = {'api', 'individuals', 'teams', 'achievements', 'metadata', 'requests'}
        record_id = path_parts[-1] if path_parts and path_parts[-1] not in _KNOWN else None

    # Authenticate user
    user = get_current_user(event)
    if not user:
        return {"statusCode": 401, "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Unauthorized"})}

    try:
        is_local   = os.environ.get('IS_LOCAL', 'false') == 'true'
        mongo_port = int(os.environ.get('MONGO_PORT', 27017))
        mongo_user = os.environ.get('MONGO_USER', '').strip()
        mongo_pass = os.environ.get('MONGO_PASS', '').strip()
        client     = get_client(is_local, mongo_port, mongo_user, mongo_pass)
        col        = client['Workshop']['teams']
        req_col    = client['Workshop']['team_requests']

        # ── JOIN REQUEST ROUTES ───────────────────────────────────────────────

        if is_requests:
            if method == 'GET':
                docs = list(req_col.find({}, {'_id': 0}))
                return {"statusCode": 200, "headers": CORS_HEADERS,
                        "body": json.dumps(docs, default=str)}

            elif method == 'POST':
                body       = json.loads(event.get('body') or '{}')
                team_id    = body.get('TeamId')
                employee_id = body.get('EmployeeId')
                if not team_id or not employee_id:
                    return {"statusCode": 400, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "TeamId and EmployeeId required"})}
                if employee_id != user['sub']:
                    return {"statusCode": 403, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "Can only create requests for yourself"})}

                # Check not already a member
                team = col.find_one({'ID': team_id}, {'_id': 0})
                if team and employee_id in (team.get('Members') or []):
                    return {"statusCode": 409, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "Already a member of this team"})}

                # Check no existing pending request
                existing = req_col.find_one({'TeamId': team_id, 'EmployeeId': employee_id,
                                             'Status': 'pending'}, {'_id': 0})
                if existing:
                    return {"statusCode": 409, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "Request already pending"})}

                new_req = {'ID': next_req_id(req_col), 'TeamId': team_id,
                           'EmployeeId': employee_id, 'Status': 'pending'}
                req_col.insert_one(new_req)
                new_req.pop('_id', None)
                return {"statusCode": 201, "headers": CORS_HEADERS,
                        "body": json.dumps(new_req)}

            elif method == 'PUT':
                if user['role'] != 'Leader':
                    return {"statusCode": 403, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "Only leaders can manage requests"})}
                if not request_id:
                    return {"statusCode": 400, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "Missing request ID in path"})}
                body   = json.loads(event.get('body') or '{}')
                status = body.get('Status')
                if status not in ('accepted', 'rejected'):
                    return {"statusCode": 400, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "Status must be 'accepted' or 'rejected'"})}

                request = req_col.find_one({'ID': request_id}, {'_id': 0})
                if not request:
                    return {"statusCode": 404, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "Request not found"})}

                if status == 'accepted':
                    team = col.find_one({'ID': request['TeamId']}, {'_id': 0})
                    if team:
                        members = list(team.get('Members') or [])
                        if len(members) >= 5:
                            return {"statusCode": 400, "headers": CORS_HEADERS,
                                    "body": json.dumps({"error": "Team is full (max 5 members)"})}
                        if request['EmployeeId'] not in members:
                            members.append(request['EmployeeId'])
                            col.update_one({'ID': request['TeamId']},
                                           {'$set': {'Members': members}})

                req_col.update_one({'ID': request_id}, {'$set': {'Status': status}})
                return {"statusCode": 200, "headers": CORS_HEADERS,
                        "body": json.dumps({"ID": request_id, "Status": status})}

            elif method == 'DELETE':
                if not request_id:
                    return {"statusCode": 400, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "Missing request ID in path"})}
                request = req_col.find_one({'ID': request_id}, {'_id': 0})
                if not request:
                    return {"statusCode": 404, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "Request not found"})}
                if user['sub'] != request['EmployeeId'] and user['role'] != 'Leader':
                    return {"statusCode": 403, "headers": CORS_HEADERS,
                            "body": json.dumps({"error": "Can only delete your own requests"})}
                req_col.delete_one({'ID': request_id})
                return {"statusCode": 200, "headers": CORS_HEADERS,
                        "body": json.dumps({"deleted": request_id})}

            return {"statusCode": 405, "headers": CORS_HEADERS,
                    "body": json.dumps({"error": "Method not allowed"})}

        # ── TEAM CRUD ROUTES ──────────────────────────────────────────────────

        if method == 'GET':
            docs = list(col.find({}, {'_id': 0}))
            return {"statusCode": 200, "headers": CORS_HEADERS,
                    "body": json.dumps(docs, default=str)}

        elif method == 'POST':
            if user['role'] != 'Leader':
                return {"statusCode": 403, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Only leaders can create teams"})}
            body    = json.loads(event.get('body') or '{}')
            members = body.get('Members', [])
            if len(members) > 5:
                return {"statusCode": 400, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Team cannot have more than 5 members"})}
            leader_id = body.get('LeaderId')
            if leader_id and leader_id not in members:
                return {"statusCode": 400, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Leader must be included in Members list"})}
            col.insert_one(body)
            body.pop('_id', None)
            return {"statusCode": 201, "headers": CORS_HEADERS,
                    "body": json.dumps(body, default=str)}

        elif method == 'PUT':
            if user['role'] != 'Leader':
                return {"statusCode": 403, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Only leaders can edit teams"})}
            if not record_id:
                return {"statusCode": 400, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Missing ID in path"})}
            body    = json.loads(event.get('body') or '{}')
            body.pop('_id', None)
            members = body.get('Members', [])
            if len(members) > 5:
                return {"statusCode": 400, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Team cannot have more than 5 members"})}
            leader_id = body.get('LeaderId')
            if leader_id and leader_id not in members:
                return {"statusCode": 400, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Leader must be included in Members list"})}
            result = col.replace_one({'ID': record_id}, body)
            if result.matched_count == 0:
                return {"statusCode": 404, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Not found"})}
            return {"statusCode": 200, "headers": CORS_HEADERS,
                    "body": json.dumps(body, default=str)}

        elif method == 'DELETE':
            if user['role'] != 'Leader':
                return {"statusCode": 403, "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Only leaders can delete teams"})}
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
