import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ADMIN_UIDS = new Set((Deno.env.get('EP_ADMIN_UIDS') ?? '').split(',').map(v => v.trim()).filter(Boolean));
const ALLOWED_ORIGINS = new Set((Deno.env.get('EP_ALLOWED_ORIGINS') ?? '').split(',').map(v => v.trim()).filter(Boolean));
const MAX_LIMIT = 250;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = !origin || ALLOWED_ORIGINS.size === 0 || ALLOWED_ORIGINS.has(origin);
  return {
    allowed,
    headers: {
      'access-control-allow-origin': allowed && origin ? origin : 'null',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, OPTIONS',
      'vary': 'Origin',
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8'
    }
  };
}

function json(req: Request, body: unknown, status = 200) {
  const c = cors(req);
  return new Response(JSON.stringify(body), { status, headers: c.headers });
}

async function authorize(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return { ok: false as const, status: 401, error: 'TOKEN_AUSENTE' };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false as const, status: 401, error: 'TOKEN_INVALIDO' };
  if (ADMIN_UIDS.size === 0 || !ADMIN_UIDS.has(data.user.id)) {
    return { ok: false as const, status: 403, error: 'USUARIO_NAO_AUTORIZADO' };
  }
  return { ok: true as const, user: data.user };
}

function limitFrom(url: URL, fallback = 100) {
  const n = Number(url.searchParams.get('limit') ?? fallback);
  return Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(n) ? Math.floor(n) : fallback));
}

async function recent(table: string, orderColumn: string, limit: number) {
  const { data, error } = await admin.from(table).select('*').order(orderColumn, { ascending: false }).limit(limit);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

async function status() {
  const [runs, state, events] = await Promise.all([
    recent('ep_backend_runs', 'finished_at', 1),
    recent('ep_signal_state', 'updated_at', 250),
    recent('ep_signal_events', 'event_at', 25)
  ]);
  const lastRun = runs[0] ?? null;
  const lastFinished = lastRun?.finished_at ? new Date(lastRun.finished_at).getTime() : 0;
  return {
    ok: true,
    api: 'ep-admin-readonly',
    versao: '1.0.0',
    modo: 'SOMENTE_LEITURA',
    backend_online: Boolean(lastFinished && Date.now() - lastFinished < 180000),
    ultima_execucao: lastRun,
    sinais_ativos: state.length,
    ultimos_eventos: events,
    timestamp: new Date().toISOString()
  };
}

async function signals(url: URL) {
  const limit = limitFrom(url, 100);
  const minMotors = Math.max(0, Math.min(5, Number(url.searchParams.get('min_motors') ?? 0)));
  let q = admin.from('ep_signal_state').select('*').order('updated_at', { ascending: false }).limit(limit);
  if (minMotors > 0) q = q.gte('motors', minMotors);
  const asset = (url.searchParams.get('asset') ?? '').trim();
  if (asset) q = q.eq('asset', asset);
  const { data, error } = await q;
  if (error) throw new Error(`ep_signal_state: ${error.message}`);
  return { ok: true, total: data?.length ?? 0, dados: data ?? [] };
}

async function events(url: URL) {
  const limit = limitFrom(url, 100);
  let q = admin.from('ep_signal_events').select('*').order('event_at', { ascending: false }).limit(limit);
  const type = (url.searchParams.get('type') ?? '').trim();
  const asset = (url.searchParams.get('asset') ?? '').trim();
  if (type) q = q.eq('event_type', type);
  if (asset) q = q.eq('asset', asset);
  const { data, error } = await q;
  if (error) throw new Error(`ep_signal_events: ${error.message}`);
  return { ok: true, total: data?.length ?? 0, dados: data ?? [] };
}

async function runs(url: URL) {
  const limit = limitFrom(url, 30);
  return { ok: true, dados: await recent('ep_backend_runs', 'finished_at', limit) };
}

async function efficiency(url: URL) {
  const limit = limitFrom(url, 250);
  let q = admin.from('ep_signal_events').select('*').eq('event_type', 'CLOSED').order('event_at', { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(`ep_signal_events: ${error.message}`);
  const closed = (data ?? []).filter((e: any) => Number.isFinite(Number(e.return_pct)));
  const groups = [2, 3, 4, 5].map(m => {
    const rows = closed.filter((e: any) => Number(e.peak_motors ?? e.from_motors ?? e.motors) === m);
    const returns = rows.map((e: any) => Number(e.return_pct)).filter(Number.isFinite);
    const wins = returns.filter(v => v > 0).length;
    const avg = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
    return { motores: m, sinais: returns.length, favoraveis_pct: returns.length ? wins / returns.length * 100 : null, retorno_medio_pct: avg };
  });
  return { ok: true, amostra: closed.length, grupos: groups };
}

Deno.serve(async (req: Request) => {
  const c = cors(req);
  if (!c.allowed) return json(req, { ok: false, erro: 'ORIGEM_NAO_PERMITIDA' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c.headers });
  if (req.method !== 'GET') return json(req, { ok: false, erro: 'METODO_NAO_PERMITIDO', permitido: ['GET'] }, 405);

  const auth = await authorize(req);
  if (!auth.ok) return json(req, { ok: false, erro: auth.error }, auth.status);

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').filter(Boolean).at(-1) ?? 'status';
    if (path === 'status') return json(req, await status());
    if (path === 'signals') return json(req, await signals(url));
    if (path === 'events') return json(req, await events(url));
    if (path === 'runs') return json(req, await runs(url));
    if (path === 'efficiency') return json(req, await efficiency(url));
    return json(req, {
      ok: false,
      erro: 'ROTA_NAO_ENCONTRADA',
      rotas: ['/status', '/signals', '/events', '/runs', '/efficiency']
    }, 404);
  } catch (e) {
    console.error('ep-admin-readonly', e);
    return json(req, { ok: false, erro: 'FALHA_INTERNA', detalhe: e instanceof Error ? e.message : String(e) }, 500);
  }
});
