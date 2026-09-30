#!/usr/bin/env python3
"""Archive EP database histories to verified assets in a PRIVATE GitHub release."""
import datetime as dt
import gzip
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request
import urllib.error
import uuid
import psycopg
from psycopg import sql

API = "https://api.github.com"
CHUNK_BYTES = 24 * 1024 * 1024
PROJECTS = [
    ("ep-analytics", "EP_ANALYTICS_DATABASE_URL", "qhgclnkctpzumtybailv"),
    ("ep-market-history", "EP_MARKET_DATABASE_URL", "iayxjarkeefbzjbpfurl"),
]

def api(path, token, payload=None, method=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
        headers={"Authorization": "Bearer " + token,
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.load(res)

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as src:
        for block in iter(lambda: src.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def discover(conn):
    return conn.execute("""
        SELECT n.nspname, c.relname
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p')
          AND ((n.nspname='public' AND c.relname LIKE 'ep\\_%' ESCAPE '\\')
               OR n.nspname='ep_market_history')
          AND NOT c.relispartition
        ORDER BY n.nspname,c.relname
    """).fetchall()

def export_project(label, dsn, project_ref, root):
    counts, files = {}, []
    with psycopg.connect(dsn, sslmode="require", connect_timeout=30) as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        conn.execute("SET LOCAL statement_timeout='10min'")
        snapshot = conn.execute("SELECT transaction_timestamp()").fetchone()[0]
        tables = discover(conn)
        if not tables:
            raise RuntimeError("No EP tables discovered for " + label)
        if label == "ep-analytics":
            required = {"ep_pre_signal_history", "ep_signal_events", "ep_signal_history_v1",
                        "ep_whale_ignition_events", "ep_shadow_v3_history", "ep_backend_runs",
                        "ep_motor6_history", "ep_early_leg_v2_events"}
            if not required.issubset({t for _, t in tables}):
                raise RuntimeError("Required analytics tables missing")
        elif ("ep_market_history", "samples") not in tables:
            raise RuntimeError("Market samples table missing")
        for schema, table in tables:
            key = schema + "." + table
            count, part, chunk_size, stream = 0, 0, 0, None
            path = None
            def finish():
                nonlocal stream
                if stream is None:
                    return
                stream.close()
                files.append({"name": path.name, "table": key, "bytes": path.stat().st_size,
                              "sha256": digest(path)})
                stream = None
            try:
                with conn.cursor(name="ep_export_" + str(len(counts))) as cur:
                    cur.itersize = 1000
                    cur.execute(sql.SQL("SELECT row_to_json(t)::text FROM {}.{} AS t")
                                .format(sql.Identifier(schema), sql.Identifier(table)))
                    for (row,) in cur:
                        line = (row + "\n").encode("utf-8")
                        if stream is None or chunk_size + len(line) > CHUNK_BYTES:
                            finish()
                            part += 1
                            path = root / f"{label}--{schema}--{table}--{part:05d}.jsonl.gz"
                            stream = gzip.open(path, "wb")
                            chunk_size = 0
                        stream.write(line)
                        chunk_size += len(line)
                        count += 1
                finish()
            finally:
                if stream:
                    stream.close()
            counts[key] = count
    return {"label": label, "project_ref": project_ref,
            "snapshot_at": snapshot.isoformat(), "table_counts": counts, "files": files}

def upload_and_verify(repo, token, release, path, expected):
    base = release["upload_url"].split("{")[0]
    req = urllib.request.Request(base + "?name=" + path.name, data=path.read_bytes(), method="POST",
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/octet-stream",
                 "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=180) as res:
        asset = json.load(res)
    req = urllib.request.Request(asset["url"], headers={
        "Authorization": "Bearer " + token, "Accept": "application/octet-stream",
        "X-GitHub-Api-Version": "2022-11-28"})
    h = hashlib.sha256()
    total = 0
    with urllib.request.urlopen(req, timeout=180) as res:
        for block in iter(lambda: res.read(1024 * 1024), b""):
            h.update(block)
            total += len(block)
    if total != path.stat().st_size or h.hexdigest() != expected:
        raise RuntimeError("Remote archive verification failed")
    return asset["id"]

def main():
    repo = os.environ.get("EP_ARCHIVE_REPOSITORY", "").strip()
    token = os.environ.get("EP_ARCHIVE_TOKEN", "")
    if not repo or not token or any(not os.environ.get(env) for _, env, _ in PROJECTS):
        raise RuntimeError("Configure the four archive Secrets; no archive or deletion was performed")
    metadata = api("/repos/" + repo, token)
    if not metadata.get("private"):
        raise RuntimeError("Archive destination must be private")
    run_id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        projects = [export_project(label, os.environ[env], ref, root)
                    for label, env, ref in PROJECTS]
        manifest = {"schema_version": 1, "archive_id": run_id, "projects": projects,
                    "scope": "All central EP tables only; browser-local records require separate collection"}
        manifest_path = root / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        manifest_hash = digest(manifest_path)
        release = api("/repos/" + repo + "/releases", token, {
            "tag_name": "ep-history-" + run_id, "name": "EP history " + run_id,
            "draft": True, "body": "Daily EP snapshot; gzip JSONL; SHA-256 verified. No pharmacy patient data."})
        for project in projects:
            for entry in project["files"]:
                upload_and_verify(repo, token, release, root / entry["name"], entry["sha256"])
        upload_and_verify(repo, token, release, manifest_path, manifest_hash)
        api("/repos/" + repo + "/releases/" + str(release["id"]), token,
            {"draft": False}, method="PATCH")
        # Receipt is committed ONLY after all assets were downloaded and verified.
        label, env, ref = PROJECTS[0]
        project = next(p for p in projects if p["label"] == label)
        with psycopg.connect(os.environ[env], sslmode="require", connect_timeout=30) as conn:
            conn.execute("""
              INSERT INTO private.ep_github_archive_receipts
                (archive_id,snapshot_at,repository,release_url,manifest_sha256,table_counts)
              VALUES (%s,%s,%s,%s,%s,%s::jsonb)
            """, (run_id, project["snapshot_at"], repo, release["html_url"],
                  manifest_hash, json.dumps(project["table_counts"])))
        print("Verified archive complete:", run_id)
        for project in projects:
            print(project["label"], "tables:", len(project["table_counts"]),
                  "rows:", sum(project["table_counts"].values()))

if __name__ == "__main__":
    main()
