"""Secrets-scanning tools for any repository target.

Both tools apply to all repo types (C, Python, JS, etc.) since hard-coded
credentials can appear in any codebase.

Each tool returns a dict with ``findings``, ``total``, and ``error`` keys.
An ``error``-only result means the tool is not installed -- the calling
node skips the LLM call rather than escalating the install hint as a finding.
"""

import json
import os
import re
import subprocess

from langchain_core.tools import tool


_ENV_SECRET_KEY_RE = re.compile(
    r"(?i)(secret|token|password|passwd|api[_-]?key|private[_-]?key|access[_-]?key)"
)


def _looks_sensitive_value(value: str) -> bool:
    """Heuristic to catch plausible secret-like values in env files."""
    v = value.strip().strip('"').strip("'")
    if not v:
        return False
    if len(v) >= 20:
        return True
    return bool(re.search(r"[A-Za-z]", v) and re.search(r"\d", v) and len(v) >= 12)


@tool
def run_trufflehog(repo_path: str) -> dict:
    """Scan a repository for hardcoded secrets and credentials using trufflehog.

    Actual secret values are redacted before returning to prevent leakage
    into the LLM context or the report.

    Args:
        repo_path: Absolute path to the repository root.

    Returns:
        Dict with ``findings`` (capped at 20, secrets redacted), ``total``,
        and ``error``.
    """
    cmd = ["trufflehog", "filesystem", repo_path, "--json", "--no-update"]
    try:
        r = subprocess.run(
            cmd, check=False, capture_output=True, text=True, timeout=60
        )
        findings = []
        for line in r.stdout.strip().splitlines():
            if line:
                try:
                    findings.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        # Redact actual secret values before they reach the LLM.
        for f in findings:
            if "Raw" in f:
                f["Raw"] = "[REDACTED]"
            if "RawV2" in f:
                f["RawV2"] = "[REDACTED]"
        return {"findings": findings[:20], "total": len(findings), "error": ""}
    except FileNotFoundError:
        return {
            "findings": [], "total": 0,
            "error": (
                "trufflehog not found -- install via: "
                "go install github.com/trufflesecurity/trufflehog/v3@latest"
            ),
        }
    except subprocess.TimeoutExpired:
        return {"findings": [], "total": 0, "error": "trufflehog timed out after 60s"}


@tool
def run_detect_secrets(repo_path: str) -> dict:
    """Scan a repository for secret patterns using detect-secrets (Yelp).

    Args:
        repo_path: Absolute path to the repository root.

    Returns:
        Dict with ``findings`` (flattened, capped at 20), ``total``, and ``error``.
    """
    cmd = ["detect-secrets", "scan", repo_path]
    try:
        r = subprocess.run(
            cmd, check=False, capture_output=True, text=True, timeout=30
        )
        try:
            data = json.loads(r.stdout)
            results = data.get("results", {})
            flat = [
                {"file": f, "line_number": s["line_number"], "type": s["type"]}
                for f, secrets in results.items()
                for s in secrets
            ]
            return {"findings": flat[:20], "total": len(flat), "error": ""}
        except json.JSONDecodeError:
            return {
                "findings": [], "total": 0,
                "error": r.stderr[:500] if r.stderr else "",
            }
    except FileNotFoundError:
        return {
            "findings": [], "total": 0,
            "error": (
                "detect-secrets not found -- install via: pip install detect-secrets"
            ),
        }
    except subprocess.TimeoutExpired:
        return {
            "findings": [], "total": 0,
            "error": "detect-secrets timed out after 30s",
        }


@tool
def run_env_file_secret_scan(repo_path: str) -> dict:
    """Scan .env/.env.* files explicitly for likely hardcoded secrets.

    Args:
        repo_path: Absolute path to the repository root.

    Returns:
        Dict with ``findings`` (capped at 50), ``total``, and ``error``.
    """
    findings: list[dict] = []

    try:
        for root, _, files in os.walk(repo_path):
            for name in files:
                if not (name == ".env" or name.startswith(".env.")):
                    continue

                file_path = os.path.join(root, name)
                rel_path = os.path.relpath(file_path, repo_path)

                try:
                    with open(file_path, "r", encoding="utf-8", errors="ignore") as handle:
                        for line_number, raw in enumerate(handle, start=1):
                            line = raw.strip()
                            if not line or line.startswith("#") or "=" not in line:
                                continue

                            key, value = line.split("=", 1)
                            env_key = key.strip()
                            env_value = value.strip()

                            if not _ENV_SECRET_KEY_RE.search(env_key):
                                continue
                            if not _looks_sensitive_value(env_value):
                                continue

                            findings.append(
                                {
                                    "file": rel_path,
                                    "line_number": line_number,
                                    "type": "env_secret_candidate",
                                    "key": env_key,
                                    "value": "[REDACTED]",
                                }
                            )
                except OSError:
                    continue

        return {"findings": findings[:50], "total": len(findings), "error": ""}
    except OSError as exc:
        return {"findings": [], "total": 0, "error": f"env scan failed: {exc}"}
