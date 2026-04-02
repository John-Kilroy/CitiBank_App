#!/usr/bin/env python3
"""Seed the AWS/CloudFront API with sample data from the data/ directory."""

import json
import os
import sys
import hmac
import hashlib
import base64
import time
import urllib.request
import urllib.error

BASE_URL = "https://d2qeh70wvgm8cw.cloudfront.net"
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
JWT_SECRET = 'workshop-jwt-secret-key'

# ── JWT helpers ───────────────────────────────────────────────────────────────

def _b64url(data):
    if isinstance(data, dict):
        data = json.dumps(data, separators=(',', ':')).encode()
    elif isinstance(data, str):
        data = data.encode()
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def make_token(emp_id, role, name):
    header  = _b64url({'alg': 'HS256', 'typ': 'JWT'})
    payload = _b64url({'sub': emp_id, 'role': role, 'name': name,
                       'exp': int(time.time()) + 86400})
    signing_input = f'{header}.{payload}'.encode()
    mac = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256)
    return f'{header}.{payload}.{_b64url(mac.digest())}'

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def request(method, path, body=None, token=None):
    url = BASE_URL + path
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

# ── Load data files ───────────────────────────────────────────────────────────

def load(filename):
    with open(os.path.join(DATA_DIR, filename)) as f:
        return json.load(f)

# ── Main seeding logic ────────────────────────────────────────────────────────

def main():
    employees    = load('employees.json')
    teams        = load('teams.json')
    achievements = load('achievements.json')

    # Use a bootstrap token with the known default secret
    bootstrap_token = make_token('EMP-SEED', 'Leader', 'Seed Script')

    # ── 1. Seed all employees ─────────────────────────────────────────────────
    print(f"\nSeeding {len(employees)} employees...")
    for emp in employees:
        status, resp = request('POST', '/api/individuals', emp, bootstrap_token)
        if status in (200, 201):
            print(f"  ✓  {emp['ID']}  {emp['Fname']} {emp['Lname']}  ({emp['Role']})")
        elif status == 409:
            print(f"  –  {emp['ID']}  {emp['Fname']} {emp['Lname']}  (already exists)")
        else:
            print(f"  ✗  {emp['ID']}  {emp['Fname']} {emp['Lname']}  → {status}: {resp}")

    # ── 2. Register diana.reeves to give her a usable password ────────────────
    print("\nRegistering diana.reeves@acme.com with password 'password123!'...")
    status, resp = request('POST', '/api/individuals/auth/register', {
        'Fname': 'Diana', 'Lname': 'Reeves',
        'Email': 'diana.reeves@acme.com',
        'Region': 'NAM', 'Organization': 'Credit Cards',
        'Password': 'password123!',
    })
    if status in (200, 201):
        print("  ✓  Registered successfully")
    else:
        print(f"  –  {status}: {resp.get('error','')}")

    # ── 3. Restore diana's Leader role (register forces Employee) ─────────────
    print("\nRestoring diana.reeves to Leader role...")
    diana = next((e for e in employees if e['ID'] == 'EMP-001'), None)
    if diana:
        status, resp = request('PUT', '/api/individuals/EMP-001',
                               {**diana}, bootstrap_token)
        if status == 200:
            print("  ✓  Role restored to Leader")
        else:
            print(f"  ✗  {status}: {resp}")

    # ── 4. Login to verify and get a real token ───────────────────────────────
    print("\nVerifying login for diana.reeves@acme.com...")
    status, resp = request('POST', '/api/individuals/auth/login', {
        'Email': 'diana.reeves@acme.com',
        'Password': 'password123!',
    })
    if status == 200:
        real_token = resp['token']
        print(f"  ✓  Login successful — Role: {resp['user']['Role']}")
    else:
        print(f"  ✗  Login failed: {resp}")
        print("     Falling back to bootstrap token for remaining steps")
        real_token = bootstrap_token

    # ── 5. Seed teams ─────────────────────────────────────────────────────────
    print(f"\nSeeding {len(teams)} teams...")
    for team in teams:
        status, resp = request('POST', '/api/teams', team, real_token)
        if status in (200, 201):
            print(f"  ✓  {team['ID']}  {team['Name']}")
        elif status == 409:
            print(f"  –  {team['ID']}  {team['Name']}  (already exists)")
        else:
            print(f"  ✗  {team['ID']}  {team['Name']}  → {status}: {resp}")

    # ── 6. Seed achievements ──────────────────────────────────────────────────
    print(f"\nSeeding {len(achievements)} achievements...")
    for ach in achievements:
        status, resp = request('POST', '/api/achievements', ach, real_token)
        if status in (200, 201):
            print(f"  ✓  {ach['ID']}  (Team: {ach['TeamId']})")
        elif status == 409:
            print(f"  –  {ach['ID']}  (already exists)")
        else:
            print(f"  ✗  {ach['ID']}  → {status}: {resp}")

    print("\n✓ Seeding complete!")
    print("\nLeader account:")
    print("  Email:    diana.reeves@acme.com")
    print("  Password: password123!")

if __name__ == '__main__':
    main()
