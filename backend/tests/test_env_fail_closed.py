# Regression test for GitHub issue #19
# OAuth env vars must fail-closed at import time.
# https://github.com/dgadling/connections-game/issues/19

import subprocess
import sys
import os

# backend/ directory containing app/
BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))


def test_discord_client_id_required():
    """DISCORD_CLIENT_ID missing → import app.auth raises KeyError"""
    code = """
import os
os.environ.pop('DISCORD_CLIENT_ID', None)
# keep other required vars so we fail specifically on CLIENT_ID
os.environ.setdefault('DISCORD_CLIENT_SECRET', 'x')
os.environ.setdefault('DISCORD_REDIRECT_URI', 'http://x/')
os.environ.setdefault('SESSION_SECRET', 'x'*32)
os.environ.setdefault('DISCORD_OAUTH_FERNET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
try:
    import importlib
    # force fresh import
    import sys
    for k in list(sys.modules.keys()):
        if k.startswith('app.'):
            del sys.modules[k]
    import app.auth
    print('FAIL: import succeeded with missing DISCORD_CLIENT_ID')
    exit(1)
except KeyError as e:
    if 'DISCORD_CLIENT_ID' in str(e):
        print('PASS')
        exit(0)
    print(f'FAIL: wrong KeyError: {e}')
    exit(1)
"""
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode == 0, f"Expected KeyError for missing DISCORD_CLIENT_ID, got stdout={result.stdout} stderr={result.stderr}"
    assert "PASS" in result.stdout


def test_discord_client_secret_required():
    """DISCORD_CLIENT_SECRET missing → import app.auth raises KeyError"""
    code = """
import os
os.environ.pop('DISCORD_CLIENT_SECRET', None)
os.environ.setdefault('DISCORD_CLIENT_ID', 'x')
os.environ.setdefault('DISCORD_REDIRECT_URI', 'http://x/')
os.environ.setdefault('SESSION_SECRET', 'x'*32)
os.environ.setdefault('DISCORD_OAUTH_FERNET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
try:
    import sys
    for k in list(sys.modules.keys()):
        if k.startswith('app.'):
            del sys.modules[k]
    import app.auth
    print('FAIL')
    exit(1)
except KeyError as e:
    if 'DISCORD_CLIENT_SECRET' in str(e):
        print('PASS')
        exit(0)
    print(f'FAIL: {e}')
    exit(1)
"""
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode == 0, f"stdout={result.stdout} stderr={result.stderr}"
    assert "PASS" in result.stdout


def test_discord_redirect_uri_required():
    """DISCORD_REDIRECT_URI missing → import app.auth raises KeyError"""
    code = """
import os
os.environ.pop('DISCORD_REDIRECT_URI', None)
os.environ.setdefault('DISCORD_CLIENT_ID', 'x')
os.environ.setdefault('DISCORD_CLIENT_SECRET', 'x')
os.environ.setdefault('SESSION_SECRET', 'x'*32)
os.environ.setdefault('DISCORD_OAUTH_FERNET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
try:
    import sys
    for k in list(sys.modules.keys()):
        if k.startswith('app.'):
            del sys.modules[k]
    import app.auth
    print('FAIL')
    exit(1)
except KeyError as e:
    if 'DISCORD_REDIRECT_URI' in str(e):
        print('PASS')
        exit(0)
    print(f'FAIL: {e}')
    exit(1)
"""
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode == 0, f"stdout={result.stdout} stderr={result.stderr}"
    assert "PASS" in result.stdout

