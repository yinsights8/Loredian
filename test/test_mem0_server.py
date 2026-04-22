"""
Test all mem0_server.py endpoints. Start the sidecar first:
  python python-sidecar/mem0_server.py
Then in another terminal:
  python test/test_mem0_server.py
"""
import json
import urllib.request
import urllib.error
import sys

BASE = 'http://127.0.0.1:7264'
PASS = []
FAIL = []

def req(method, path, body=None):
    """Make HTTP request, return (status_code, response_body)"""
    data = json.dumps(body).encode() if body else None
    headers = {'Content-Type': 'application/json'} if data else {}
    r = urllib.request.Request(f'{BASE}{path}', data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r) as res:
            return res.status, json.loads(res.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())
    except urllib.error.URLError as e:
        print(f'ERROR: Cannot connect to {BASE}')
        print('Start the sidecar first: python python-sidecar/mem0_server.py')
        sys.exit(1)

def check(name, status, body, expect_status=200, expect_keys=()):
    """Verify response matches expectations"""
    ok = status == expect_status and all(k in (body or {}) for k in expect_keys)
    tag = '✓' if ok else '✗'
    print(f'  {tag} {name}: HTTP {status}')
    if body and isinstance(body, dict):
        if 'detail' in body:
            detail = str(body.get('detail', ''))
            print(f'    → {detail[:100]}...' if len(detail) > 100 else f'    → {detail}')
    (PASS if ok else FAIL).append(name)

print('\n=== Testing mem0_server.py endpoints ===\n')

# 1. Health (before init — should be 503)
print('1. Health check (before init — expect 503):')
s, b = req('GET', '/health')
check('health (not initialized)', s, b, 503)

# 2. Init
print('\n2. Initialize Mem0 with Ollama:')
s, b = req('POST', '/init', {
    'ollama_host': 'http://127.0.0.1:11434',
    'model': 'gemma4:e4b',
    'embedding_model': 'nomic-embed-text',
    'embedding_dims': 1024  # nomic-embed-text outputs 1024 dimensions
})
check('init', s, b, 200, ('status',))

# 3. Health (after init — should be 200)
print('\n3. Health check (after init — expect 200):')
s, b = req('GET', '/health')
check('health (initialized)', s, b, 200, ('status',))

# 4. Add a memory
print('\n4. Add a memory:')
s, b = req('POST', '/add', {
    'messages': [{'role': 'user', 'content': 'I love hiking in the mountains every weekend'}]
})
check('add memory', s, b, 200, ('memoryIds',))
added_ids = b.get('memoryIds', []) if isinstance(b, dict) else []
if added_ids:
    print(f'    → Added {len(added_ids)} memory/memories')

# 5. Search
print('\n5. Search for a memory:')
s, b = req('POST', '/search', {
    'query': 'what do I like doing on weekends',
    'limit': 5
})
check('search', s, b, 200)
if isinstance(b, list):
    print(f'    → Found {len(b)} result(s)')
    if b:
        print(f'    → Top result: "{b[0].get("memory", "")[:60]}..." (score: {b[0].get("score", 0):.2f})')

# 6. Get all memories
print('\n6. Get all memories:')
s, b = req('GET', '/memories')
check('get all memories', s, b, 200)
if isinstance(b, list):
    print(f'    → Total memories: {len(b)}')

# 7. Delete single memory (if add returned an id)
print('\n7. Delete single memory:')
if added_ids:
    s, b = req('DELETE', f'/memories/{added_ids[0]}')
    check('delete single memory', s, b, 200, ('status',))
else:
    print('  ⊘ Skipped (no memory ID from add)')

# 8. Delete all
print('\n8. Delete all memories:')
s, b = req('DELETE', '/memories')
check('delete all memories', s, b, 200, ('status',))

# Summary
print(f'\n=== Results: {len(PASS)} passed, {len(FAIL)} failed ===\n')
if FAIL:
    print(f'Failed tests: {", ".join(FAIL)}')
    sys.exit(1)
else:
    print('All tests passed! ✓')
    sys.exit(0)
