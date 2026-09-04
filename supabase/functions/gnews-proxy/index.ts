import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://isaias-fernandes.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-gnews-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const cache = new Map<string, { ts: number; body: unknown }>();
const CACHE_MS = 15 * 60 * 1000;
let disabledUntil = 0;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GNEWS_API_KEY");
    if (!apiKey) {
      return json({ available: false, articles: [], reason: "gnews_key_missing" });
    }

    const requestUrl = new URL(req.url);
    const query = (requestUrl.searchParams.get("q") || "").trim();
    const max = Math.max(1, Math.min(10, Number(requestUrl.searchParams.get("max") || 10)));
    if (!query) return json({ available: false, articles: [], reason: "query_missing" });

    const key = `${query}|${max}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_MS) return json(cached.body);

    if (Date.now() < disabledUntil) {
      return json({ available: false, articles: [], reason: "gnews_temporarily_unavailable", retryAfter: new Date(disabledUntil).toISOString() });
    }

    const gnewsUrl = new URL("https://gnews.io/api/v4/search");
    gnewsUrl.searchParams.set("q", query);
    gnewsUrl.searchParams.set("max", String(max));
    gnewsUrl.searchParams.set("sortby", "publishedAt");
    gnewsUrl.searchParams.set("apikey", apiKey);

    const response = await fetch(gnewsUrl.toString(), {
      headers: { "Accept": "application/json" },
    });

    let data: any = null;
    try { data = await response.json(); } catch { data = null; }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        disabledUntil = Date.now() + 60 * 60 * 1000;
      }
      return json({
        available: false,
        articles: [],
        reason: `gnews_http_${response.status}`,
        upstreamStatus: response.status,
      });
    }

    const body = {
      available: true,
      totalArticles: Number(data?.totalArticles || 0),
      articles: Array.isArray(data?.articles) ? data.articles : [],
    };
    cache.set(key, { ts: Date.now(), body });
    return json(body);
  } catch (error) {
    return json({ available: false, articles: [], reason: "gnews_proxy_error", details: String(error) });
  }
});
