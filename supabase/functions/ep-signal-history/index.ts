import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const INGEST_KEY = Deno.env.get('EP_HISTORY_INGEST_KEY') ?? '';
const ADMIN_UIDS = new Set((Deno.env.get('EP_ADMIN_UIDS') ?? '').split(',').map(v => v.trim()).filter(Boolean));
const ALLOWED_ORIGINS = new Set((Deno.env.get('EP_ALLOWED_ORIGINS') ?? '').split(',').map(v => v.trim()).filter(Boolean));
const TABLE = 'ep_signal_history_v1';
const MAX_READ = 5000;
const MAX_BATCH = 100;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

type Row = Record<string, any>;

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = !origin || ALLOWED_ORIGINS.size === 0 || ALLOWED_ORIGINS.has(origin);
  return {
    allowed,
    headers: {
      'access-control-allow-origin': allowed && origin ? origin : 'null',
      'access-control-allow-headers': 'authorization, content-type, x-ep-history-key',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'vary': 'Origin',
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8'
    }
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req).headers });
}

async function authorizeAdmin(req: Request) {
  const h = req.headers.get('authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return { ok: false as const, status: 401, error: 'TOKEN_AUSENTE' };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false as const, status: 401, error: 'TOKEN_INVALIDO' };
  if (ADMIN_UIDS.size === 0 || !ADMIN_UIDS.has(data.user.id)) {
    return { ok: false as const, status: 403, error: 'USUARIO_NAO_AUTORIZADO' };
  }
  return { ok: true as const, user: data.user };
}

function authorizeIngest(req: Request) {
  const key = req.headers.get('x-ep-history-key') ?? '';
  return Boolean(INGEST_KEY && key && key === INGEST_KEY);
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function cleanEvent(input: Row) {
  const market = String(input.market ?? '').toLowerCase();
  const asset = String(input.asset ?? '').trim().toUpperCase();
  const direction = String(input.direction ?? 'NEUTRAL').toUpperCase();
  const eventType = String(input.event_type ?? '').toUpperCase();
  const episodeId = String(input.episode_id ?? '').trim();

  if (!episodeId) throw new Error('episode_id obrigatório');
  if (!['crypto', 'b3'].includes(market)) throw new Error('market inválido');
  if (!asset) throw new Error('asset obrigatório');
  if (!['BUY', 'SELL', 'NEUTRAL'].includes(direction)) throw new Error('direction inválida');
  if (!['OPEN', 'SNAPSHOT', 'CLOSED'].includes(eventType)) throw new Error('event_type inválido');

  const motorCount = num(input.motor_count);
  if (motorCount != null && (motorCount < 0 || motorCount > 5)) throw new Error('motor_count inválido');

  return {
    episode_id: episodeId,
    market,
    asset,
    direction,
    event_type: eventType,
    observed_at: input.observed_at ? new Date(input.observed_at).toISOString() : new Date().toISOString(),
    price: num(input.price),
    entry_price: num(input.entry_price),
    exit_price: num(input.exit_price),
    return_pct: num(input.return_pct),
    decision_score: num(input.decision_score),
    signal_tier: input.signal_tier == null ? null : String(input.signal_tier),
    motor_count: motorCount == null ? null : Math.round(motorCount),
    motor_technical: boolOrNull(input.motor_technical),
    motor_structure: boolOrNull(input.motor_structure),
    motor_volatility: boolOrNull(input.motor_volatility),
    motor_squeeze: boolOrNull(input.motor_squeeze),
    motor_flow: boolOrNull(input.motor_flow),
    technical_score: num(input.technical_score),
    structure_score: num(input.structure_score),
    volatility_score: num(input.volatility_score),
    squeeze_score: num(input.squeeze_score),
    flow_score: num(input.flow_score),
    ibc_score: num(input.ibc_score),
    reversal_score: num(input.reversal_score),
    adaptive_v6_confidence: num(input.adaptive_v6_confidence),
    metrics: input.metrics && typeof input.metrics === 'object' ? input.metrics : {},
    source: String(input.source ?? 'ep-history-api-v1').slice(0, 100)
  };
}

function limitFrom(url: URL, fallback = 500) {
  const n = Number(url.searchParams.get('limit') ?? fallback);
  return Math.max(1, Math.min(MAX_READ, Number.isFinite(n) ? Math.floor(n) : fallback));
}

async function readRows(url: URL, closedOnly = false) {
  const limit = limitFrom(url);
  let q = admin.from(TABLE).select('*').order('observed_at', { ascending: false }).limit(limit);
  if (closedOnly) q = q.eq('event_type', 'CLOSED');
  const market = (url.searchParams.get('market') ?? '').trim().toLowerCase();
  const asset = (url.searchParams.get('asset') ?? '').trim().toUpperCase();
  const episode = (url.searchParams.get('episode_id') ?? '').trim();
  if (market) q = q.eq('market', market);
  if (asset) q = q.eq('asset', asset);
  if (episode) q = q.eq('episode_id', episode);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

function stats(rows: Row[]) {
  const vals = rows.map(r => num(r.return_pct)).filter((v): v is number => v != null);
  const wins = vals.filter(v => v > 0);
  const losses = vals.filter(v => v < 0);
  const gp = wins.reduce((a, b) => a + b, 0);
  const gl = Math.abs(losses.reduce((a, b) => a + b, 0));
  let equity = 0, peak = 0, drawdown = 0;
  for (const v of vals.slice().reverse()) {
    equity += v;
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, equity - peak);
  }
  return {
    sinais: vals.length,
    favoraveis: wins.length,
    desfavoraveis: losses.length,
    favoraveis_pct: vals.length ? wins.length / vals.length * 100 : null,
    retorno_medio_pct: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
    retorno_mediano_pct: vals.length ? vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)] : null,
    profit_factor: gl ? gp / gl : gp ? 99 : null,
    drawdown_acumulado_pct: vals.length ? drawdown : null
  };
}

function motorEfficiency(rows: Row[]) {
  const defs = [
    ['Técnico', 'motor_technical'],
    ['Estrutura / Microtendência', 'motor_structure'],
    ['Volatilidade / Supersinal', 'motor_volatility'],
    ['Bollinger / Keltner', 'motor_squeeze'],
    ['Volume / Fluxo', 'motor_flow']
  ] as const;
  return defs.map(([motor, key]) => {
    const active = rows.filter(r => r[key] === true);
    const inactive = rows.filter(r => r[key] === false);
    return { motor, ativo: stats(active), inativo: stats(inactive) };
  });
}

function combinationEfficiency(rows: Row[]) {
  const out: Row[] = [];
  for (let m = 0; m <= 5; m++) out.push({ grupo: `${m}M`, ...stats(rows.filter(r => Number(r.motor_count) === m)) });
  out.push({ grupo: 'IBC ≥75', ...stats(rows.filter(r => Number(r.ibc_score) >= 75)) });
  out.push({ grupo: '3M + IBC ≥75', ...stats(rows.filter(r => Number(r.motor_count) === 3 && Number(r.ibc_score) >= 75)) });
  out.push({ grupo: '4M+ + IBC ≥75', ...stats(rows.filter(r => Number(r.motor_count) >= 4 && Number(r.ibc_score) >= 75)) });
  return out;
}

function assetEfficiency(rows: Row[]) {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.market}:${r.asset}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return [...map.entries()].map(([key, ar]) => {
    const [market, asset] = key.split(':');
    const prices = ar.map(r => ({ entry: num(r.entry_price), exit: num(r.exit_price), ret: num(r.return_pct) }));
    return { market, asset, ...stats(ar), precos: prices.slice(0, 20) };
  }).sort((a, b) => b.sinais - a.sinais);
}

function pricePath(rows: Row[]) {
  const byEpisode = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byEpisode.has(r.episode_id)) byEpisode.set(r.episode_id, []);
    byEpisode.get(r.episode_id)!.push(r);
  }
  return [...byEpisode.entries()].map(([episode_id, ar]) => {
    ar.sort((a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime());
    const first = ar[0], last = ar.at(-1)!;
    const entry = num(first.entry_price) ?? num(first.price);
    const ps = ar.map(r => num(r.price)).filter((v): v is number => v != null);
    const dir = first.direction;
    let mfe: number | null = null, mae: number | null = null;
    if (entry && ps.length) {
      const rets = ps.map(p => (p - entry) / entry * 100 * (dir === 'SELL' ? -1 : 1));
      mfe = Math.max(...rets);
      mae = Math.min(...rets);
    }
    return {
      episode_id,
      market: first.market,
      asset: first.asset,
      direction: dir,
      snapshots: ar.length,
      entry_price: entry,
      last_price: num(last.price) ?? num(last.exit_price),
      return_pct: num(last.return_pct),
      mfe_pct: mfe,
      mae_pct: mae,
      opened_at: first.observed_at,
      last_at: last.observed_at
    };
  });
}

Deno.serve(async (req: Request) => {
  const c = cors(req);
  if (!c.allowed) return json(req, { ok: false, erro: 'ORIGEM_NAO_PERMITIDA' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c.headers });

  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const leaf = parts.at(-1) ?? '';
    const route = leaf === 'ep-signal-history' ? 'status' : leaf;

    if (req.method === 'POST') {
      if (!authorizeIngest(req)) return json(req, { ok: false, erro: 'INGEST_NAO_AUTORIZADO' }, 401);
      if (route !== 'ingest' && route !== 'ep-signal-history' && route !== 'status') {
        return json(req, { ok: false, erro: 'ROTA_POST_INVALIDA', rota: '/ingest' }, 404);
      }
      const body = await req.json();
      const raw = Array.isArray(body) ? body : Array.isArray(body?.events) ? body.events : [body];
      if (!raw.length || raw.length > MAX_BATCH) return json(req, { ok: false, erro: 'LOTE_INVALIDO', max: MAX_BATCH }, 400);
      const rows = raw.map(cleanEvent);
      const { data, error } = await admin.from(TABLE).insert(rows).select('id,episode_id,event_type,observed_at');
      if (error) throw new Error(error.message);
      return json(req, { ok: true, gravados: data?.length ?? 0, dados: data ?? [] }, 201);
    }

    if (req.method !== 'GET') return json(req, { ok: false, erro: 'METODO_NAO_PERMITIDO' }, 405);
    const auth = await authorizeAdmin(req);
    if (!auth.ok) return json(req, { ok: false, erro: auth.error }, auth.status);

    if (route === 'status') {
      const { count, error } = await admin.from(TABLE).select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return json(req, { ok: true, api: 'ep-signal-history', versao: '1.0.0', modo: 'ISOLADO', registros: count ?? 0, motores_alterados: false });
    }
    if (route === 'events') return json(req, { ok: true, dados: await readRows(url, false) });
    if (route === 'episodes') return json(req, { ok: true, dados: pricePath(await readRows(url, false)) });

    const closed = await readRows(url, true);
    if (route === 'efficiency') return json(req, { ok: true, amostra: closed.length, geral: stats(closed), combinacoes: combinationEfficiency(closed) });
    if (route === 'motors') return json(req, { ok: true, amostra: closed.length, motores: motorEfficiency(closed) });
    if (route === 'assets') return json(req, { ok: true, amostra: closed.length, ativos: assetEfficiency(closed) });
    if (route === 'report') {
      const all = await readRows(url, false);
      return json(req, {
        ok: true,
        amostra_fechada: closed.length,
        geral: stats(closed),
        motores: motorEfficiency(closed),
        combinacoes: combinationEfficiency(closed),
        ativos: assetEfficiency(closed),
        episodios: pricePath(all)
      });
    }

    return json(req, { ok: false, erro: 'ROTA_NAO_ENCONTRADA', rotas: ['/status','/events','/episodes','/efficiency','/motors','/assets','/report','POST /ingest'] }, 404);
  } catch (e) {
    console.error('ep-signal-history', e);
    return json(req, { ok: false, erro: 'FALHA_INTERNA', detalhe: e instanceof Error ? e.message : String(e) }, 500);
  }
});
