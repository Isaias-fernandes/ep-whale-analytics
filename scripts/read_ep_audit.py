#!/usr/bin/env python3
"""Reconstruct the 7-day audit window from isolated archives plus live EP rows."""
import argparse
import base64
import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
from archive_ep_histories import database_query
from transfer_ep_histories import SOURCE, DEST, TABLES

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--table', required=True, choices=[t for t, _ in TABLES])
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    stamp = dict(TABLES)[args.table]
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=7)
    with tempfile.TemporaryDirectory() as tmp:
        conn = sqlite3.connect(str(Path(tmp)/'audit.sqlite'))
        conn.execute('CREATE TABLE records (id INTEGER PRIMARY KEY, stamp TEXT, payload TEXT)')
        def add(line):
            row = json.loads(line)
            observed = dt.datetime.fromisoformat(row[stamp].replace('Z','+00:00'))
            if observed >= cutoff:
                conn.execute('INSERT OR REPLACE INTO records VALUES (?,?,?)', (row['id'],observed.isoformat(),line))
        cursor = None
        while True:
            after = '' if cursor is None else ' AND (archived_at,batch_sha256)>($3::timestamptz,$4::text)'
            params = [args.table, cutoff.isoformat()] + (list(cursor) if cursor else [])
            batches = database_query(DEST, "SELECT batch_sha256,archived_at::text archived_at,payload_sha256,encode(payload_gzip,'base64') data FROM ep_market_history.signal_archive_batches WHERE source_table=$1 AND last_observed_at>=$2::timestamptz"+after+' ORDER BY archived_at,batch_sha256 LIMIT 5', params)
            if not batches:
                break
            for batch in batches:
                data = base64.b64decode(batch['data'])
                if hashlib.sha256(data).hexdigest() != batch['payload_sha256']:
                    raise RuntimeError('Archive checksum mismatch')
                raw = gzip.decompress(data)
                if hashlib.sha256(raw).hexdigest() != batch['batch_sha256']:
                    raise RuntimeError('Uncompressed archive checksum mismatch')
                for line in raw.decode().splitlines():
                    add(line)
            cursor = (batches[-1]['archived_at'],batches[-1]['batch_sha256'])
        last = 0
        while True:
            rows = database_query(SOURCE, f'SELECT id::text id,to_jsonb(t)::text payload FROM public.{args.table} t WHERE id>$1::bigint AND {stamp}>=$2::timestamptz ORDER BY id LIMIT 1000', [last,cutoff.isoformat()])
            if not rows:
                break
            for row in rows:
                add(row['payload'])
            last = int(rows[-1]['id'])
        conn.commit()
        with Path(args.output).open('w', encoding='utf-8') as out:
            for (line,) in conn.execute('SELECT payload FROM records ORDER BY stamp,id'):
                out.write(line+'\n')
        print('Audit rows:',conn.execute('SELECT count(*) FROM records').fetchone()[0])

if __name__ == '__main__':
    main()
