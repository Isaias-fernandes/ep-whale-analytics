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
import time

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


def database_query(ref, query, parameters=None, read_only=True):
    req = urllib.request.Request("https://api.supabase.com/v1/projects/" + ref + "/database/query",
        data=json.dumps({"query": query, "parameters": parameters or [],
                         "read_only": read_only}).encode(), method="POST",
        headers={"Authorization": "Bearer " + os.environ["EP_SUPABASE_ACCESS_TOKEN"].strip(),
                 "Content-Type": "application/json"})
    for attempt in range(4):
        # Bound Management API request rate; retries only for read-only queries.
        time.sleep(0.6)
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                result = json.load(res)
            break
        except urllib.error.HTTPError as exc:
            if read_only and exc.code in (429, 502, 503, 504) and attempt < 3:
                time.sleep(2 ** (attempt + 1))
                continue
            raise RuntimeError(f"Supabase API HTTP {exc.code} for {ref}") from None
    if not isinstance(result, list):
        raise RuntimeError("Unexpected Supabase query response")
    return result

def ident(value):
    return '"' + value.replace('"', '""') + '"'

def discover(ref):
    scope = ("n.nspname='public' AND left(c.relname,3)='ep_'"
             if ref == PROJECTS[0][2] else "n.nspname='ep_market_history'")
    return database_query(ref, """
        SELECT n.nspname AS schema, c.relname AS name,
          COALESCE((SELECT json_agg(json_build_object('name',a.attname,
                   'type',format_type(a.atttypid,a.atttypmod)) ORDER BY k.ord)
            FROM pg_index i
            CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ord)
            JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
            WHERE i.indrelid=c.oid AND i.indisprimary),'[]'::json) AS pk
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p') AND NOT c.relispartition AND (""" + scope + """)
        ORDER BY n.nspname,c.relname
    """)

def export_table(label, ref, table, root):
    schema, name, pk = table["schema"], table["name"], table["pk"]
    if not pk:
        raise RuntimeError("Table has no primary key: " + schema + "." + name)
    relation = ident(schema) + "." + ident(name)
    columns = ",".join("t." + ident(c["name"]) for c in pk)
    # Rolling export: stable primary keys define membership. Updates are read
    # as encountered; inserts above the initial high-water mark wait for next run.
    # This is not a point-in-time MVCC backup.
    descending = ",".join("t." + ident(c["name"]) + " DESC" for c in pk)
    boundary = database_query(ref, f"""
        SELECT statement_timestamp()::text AS snapshot_at,
               count(*)::text AS expected,
               (SELECT json_build_array({columns})::text FROM {relation} t
                ORDER BY {descending} LIMIT 1) AS upper_key FROM {relation}
    """)[0]
    upper = json.loads(boundary["upper_key"]) if boundary["upper_key"] else []
    upper_casts = ",".join("$" + str(i+1) + "::" + c["type"] for i,c in enumerate(pk))
    visible = f"ROW({columns}) <= ROW({upper_casts})" if upper else "FALSE"
    expected = int(boundary["expected"])
    count, part, chunk_size, stream, last = 0, 0, 0, None, None
    files, path = [], None
    def finish():
        nonlocal stream
        if stream is not None:
            stream.close()
            files.append({"name": path.name, "table": schema + "." + name,
                          "bytes": path.stat().st_size, "sha256": digest(path)})
            stream = None
    try:
        print(label, schema + "." + name, "starting rows:", expected, flush=True)
        while True:
            params, after = list(upper), ""
            if last is not None:
                casts = ",".join("$" + str(i+len(pk)+1) + "::" + c["type"] for i,c in enumerate(pk))
                after = f" AND ROW({columns}) > ROW({casts})"
                params.extend(last)
            rows = database_query(ref,
                f"SELECT row_to_json(t)::text AS row, "
                f"json_build_array({columns})::text AS cursor FROM {relation} t "
                f"WHERE {visible}{after} ORDER BY {columns} LIMIT 1000", params)
            if not rows:
                break
            for entry in rows:
                line = (entry["row"] + "\n").encode("utf-8")
                if stream is None or chunk_size + len(line) > CHUNK_BYTES:
                    finish()
                    part += 1
                    path = root / f"{label}--{schema}--{name}--{part:05d}.jsonl.gz"
                    stream = gzip.open(path, "wb")
                    chunk_size = 0
                stream.write(line)
                chunk_size += len(line)
                count += 1
            next_cursor = json.loads(rows[-1]["cursor"])
            if next_cursor == last:
                raise RuntimeError("Export cursor did not advance")
            last = next_cursor
            if count % 10000 == 0:
                print(label, schema + "." + name, "copied:", count, "/", expected, flush=True)
        finish()
        remaining = int(database_query(ref,
            f"SELECT count(*)::text AS count FROM {relation} t WHERE {visible}",
            upper)[0]["count"])
        if count != expected or remaining != expected:
            raise RuntimeError("Table changed during export: " + schema + "." + name)
    finally:
        if stream is not None:
            stream.close()
    return count, files, boundary["snapshot_at"]

def export_project(label, unused, ref, root):
    tables = discover(ref)
    names = {t["schema"] + "." + t["name"] for t in tables}
    required = ({"public." + n for n in (
        "ep_pre_signal_history", "ep_signal_events", "ep_signal_history_v1",
        "ep_whale_ignition_events", "ep_shadow_v3_history", "ep_backend_runs",
        "ep_motor6_history", "ep_early_leg_v2_events")} if label == "ep-analytics"
        else {"ep_market_history.samples"})
    if not required.issubset(names):
        raise RuntimeError("Required history tables missing for " + label)
    counts, files, snapshots = {}, [], {}
    for table in tables:
        key = table["schema"] + "." + table["name"]
        for attempt in range(3):
            try:
                count, entries, snapshot = export_table(label, ref, table, root)
                break
            except RuntimeError as exc:
                if "Table changed during export:" not in str(exc) or attempt == 2:
                    raise
                for path in root.glob(f"{label}--{table['schema']}--{table['name']}--*.jsonl.gz"):
                    path.unlink()
        counts[key], snapshots[key] = count, snapshot
        files.extend(entries)
        print(label, key, "rows:", count, flush=True)
    return {"label": label, "project_ref": ref,
            "snapshot_at": min(snapshots.values()), "table_snapshots": snapshots,
            "table_counts": counts, "files": files}

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
    if not repo or not token or not os.environ.get("EP_SUPABASE_ACCESS_TOKEN"):
        raise RuntimeError("Configure EP_SUPABASE_ACCESS_TOKEN and the two GitHub archive Secrets; no archive or deletion was performed")
    metadata = api("/repos/" + repo, token)
    if not metadata.get("private"):
        raise RuntimeError("Archive destination must be private")
    run_id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        projects = [export_project(label, None, ref, root)
                    for label, env, ref in PROJECTS]
        manifest = {"schema_version": 3, "consistency": "rolling-per-table-primary-key-high-watermark", "archive_id": run_id, "projects": projects,
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
        database_query(ref, """
          INSERT INTO private.ep_github_archive_receipts
            (archive_id,snapshot_at,repository,release_url,manifest_sha256,table_counts)
          VALUES ($1,$2::timestamptz,$3,$4,$5,$6::jsonb)
          ON CONFLICT (archive_id) DO NOTHING RETURNING archive_id
        """, [run_id, project["snapshot_at"], repo, release["html_url"],
              manifest_hash, json.dumps(project["table_counts"])], read_only=False)
        print("Verified archive complete:", run_id)
        for project in projects:
            print(project["label"], "tables:", len(project["table_counts"]),
                  "rows:", sum(project["table_counts"].values()))

if __name__ == "__main__":
    main()
