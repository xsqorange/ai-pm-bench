# -*- coding: utf-8 -*-
"""Git credential management via askpass script (no .git/config writes).

Approach:
  1. Create a temporary askpass shell script that echoes username/token
  2. Pass it to git subprocess via GIT_ASKPASS env var + GIT_TERMINAL_PROMPT=0
  3. Delete the script after operation completes

Works around the common case where .git/config is read-only on the system.
"""
from __future__ import annotations
import os
import re
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Optional


def get_global_credentials():
    return os.environ.get("GIT_USERNAME"), os.environ.get("GIT_TOKEN")


def _sanitize_token(token):
    return re.sub(r"\s+", "", token) if token else ""


def _write_askpass_script(username, token):
    script_path = Path(tempfile.gettempdir()) / ("workbench-askpass-" + uuid.uuid4().hex[:8] + ".sh")
    token_clean = _sanitize_token(token)
    content = "#!/bin/sh\necho \x27" + username + "\x27\necho \x27" + token_clean + "\x27\n"
    script_path.write_text(content, encoding="utf-8")
    try:
        os.chmod(script_path, 0o700)
    except OSError:
        pass
    return script_path


def _cleanup_askpass_script(path):
    try:
        if path and path.exists():
            path.unlink()
    except OSError:
        pass


def run_git_with_credentials(repo_path, args, username=None, token=None, timeout=60):
    u = username or os.environ.get("GIT_USERNAME")
    t = token or os.environ.get("GIT_TOKEN")

    askpass_path = None
    env = os.environ.copy()
    if u and t:
        askpass_path = _write_askpass_script(u, t)
        env["GIT_ASKPASS"] = str(askpass_path)
    env["GIT_TERMINAL_PROMPT"] = "0"

    try:
        return subprocess.run(
            ["git"] + args,
            cwd=str(repo_path),
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    finally:
        _cleanup_askpass_script(askpass_path)