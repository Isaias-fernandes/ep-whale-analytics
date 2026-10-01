#!/usr/bin/env python3
"""Lossless EP archive in an isolated schema; only completed lab events move out."""
import base64
import datetime as dt
import gzip
import hashlib
import json
import os
from pathlib import Path
import tempfile
from archive_ep_histories import api, database_query, upload_and_verify

SOURCE = 'qhgclnkctpzumtybailv'
DEST = 'iayxjarkeefbzjbpfurl'
TABLES = [('ep_early_leg_v2_events', 'observed_at'),
          ('ep_pre_signal_history', 'observed_at'),
          ('ep_signal_events', 'event_at'),
          ('ep_shadow_v3_history', 'observed_at'),
          ('ep_motor6_history', 'observed_at')]

def run():
    repo = os.environ['EP_ARCHIVE_REPOSITORY'].strip()
    token = os.environ['EP_ARCHIVE_TOKEN']
    if not api('/repos/' + repo, token).get('private'):
        raise RuntimeError('Private archive required')
    release = None
    moved = 0
    # Only batches already verified on GitHub can age out of the online archive.
    database_query(DEST, "DELETE FROM ep_market_history.signal_archive_batches WHERE last_observed_at < now()-interval '7 days' AND github_release_url LIKE 'https://github.com/%/releases/%'", read_only=False)
    with tempfile.TemporaryDirectory() as tmp:
        for table, stamp in TABLES:
            last = 0
            eligibility = ('AND completed_24h IS TRUE' if table == 'ep_early_leg_v2_events'
                           else "AND status='CLOSED'" if table == 'ep_motor6_history' else '')
            boundary = database_query(SOURCE, f"SELECT now()::text cutoff,max(id)::text upper_id FROM public.{table}")[0]
            upper = boundary['upper_id']
            if upper is None:
                continue
            while True:
                rows = database_query(SOURCE, f"SELECT id::text id,to_jsonb(t)::text row,{stamp}::text observed_at FROM public.{table} t WHERE id>$1::bigint AND id<=$2::bigint AND {stamp}>=$3::timestamptz-interval '7 days' AND {stamp}<$3::timestamptz-interval '48 hours' {eligibility} ORDER BY id LIMIT 1000", [last, upper, boundary['cutoff']])
                if not rows:
                    break
                last = int(rows[-1]['id'])
                raw = ''.join(r['row']+'\n' for r in rows).encode()
                batch_hash = hashlib.sha256(raw).hexdigest()
                compressed = gzip.compress(raw, mtime=0)
                zipped_hash = hashlib.sha256(compressed).hexdigest()
                found = database_query(DEST, 'SELECT payload_sha256,encode(sha256(payload_gzip),\'hex\') verified FROM ep_market_history.signal_archive_batches WHERE batch_sha256=$1', [batch_hash])
                if not found:
                    if release is None:
                        tag = 'ep-transfer-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
                        release = api('/repos/'+repo+'/releases', token, {'tag_name':tag,'name':tag,'draft':False,'body':'Lossless EP JSONL batches. No pharmacy data. Each batch verified before source removal.'})
                    path = Path(tmp)/(table+'--'+batch_hash+'.jsonl.gz')
                    path.write_bytes(compressed)
                    upload_and_verify(repo, token, release, path, zipped_hash)
                    dates = [dt.datetime.fromisoformat(r['observed_at'].replace('Z','+00:00')) for r in rows]
                    payload = {'batch_sha256':batch_hash,'source_project':SOURCE,'source_table':table,'first_id':int(rows[0]['id']),'last_id':last,'first_observed_at':min(dates).isoformat(),'last_observed_at':max(dates).isoformat(),'row_count':len(rows),'payload_base64':base64.b64encode(compressed).decode(),'payload_sha256':zipped_hash,'github_release_url':release['html_url']}
                    database_query(DEST, 'SELECT ep_market_history.store_signal_archive($1::jsonb)', [json.dumps(payload)], read_only=False)
                    # Read the bytes back, then decompress and compare to the original.
                    check = database_query(DEST, "SELECT encode(payload_gzip,'base64') data FROM ep_market_history.signal_archive_batches WHERE batch_sha256=$1", [batch_hash])
                    if not check or gzip.decompress(base64.b64decode(check[0]['data'])) != raw:
                        raise RuntimeError('Destination round-trip verification failed')
                elif found[0]['verified'] != zipped_hash or found[0]['payload_sha256'] != zipped_hash:
                    raise RuntimeError('Existing destination batch checksum mismatch')
                # Official motor observations retain their current 7-day source window.
                # Only finalized early-leg lab rows are removed; changed rows stay put.
                if table == 'ep_early_leg_v2_events':
                    fingerprints = [{'id':r['id'],'hash':hashlib.sha256(r['row'].encode()).hexdigest()} for r in rows]
                    result = database_query(SOURCE, "WITH fingerprints AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id bigint,hash text)), removed AS (DELETE FROM public.ep_early_leg_v2_events t USING fingerprints f WHERE t.id=f.id AND t.completed_24h IS TRUE AND t.observed_at<now()-interval '48 hours' AND encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')=f.hash RETURNING t.id) SELECT count(*)::text removed FROM removed", [json.dumps(fingerprints)], read_only=False)
                    moved += int(result[0]['removed'])
                print(table, 'verified batch rows:', len(rows), 'source removed:', moved, flush=True)
        print('Transfer complete. Completed lab rows moved:', moved, flush=True)

if __name__ == '__main__':
    run()
