(() => {
  const $ = (s) => document.querySelector(s),
    fmt = (n, d = 1) =>
      Number.isFinite(+n)
        ? (+n).toLocaleString("pt-BR", { maximumFractionDigits: d })
        : "—";
  const focus = { crypto: null };
  function visual(a) {
    if (a.signalTier === "confirmed")
      return a.dir === "BUY"
        ? { cls: "buy", icon: "🟢", tag: "CONFIRMADA" }
        : { cls: "sell", icon: "🔴", tag: "CONFIRMADA" };
    if (a.signalTier === "strong")
      return a.dir === "BUY"
        ? { cls: "strong-buy", icon: "🟩", tag: "FORTE" }
        : { cls: "strong-sell", icon: "🟠", tag: "FORTE" };
    if (a.signalTier === "initial")
      return a.dir === "BUY"
        ? { cls: "initial-buy", icon: "🟡", tag: "INICIAL" }
        : { cls: "initial-sell", icon: "🟨", tag: "INICIAL" };
    if (a.signalTier === "watch")
      return { cls: "watch", icon: "🔵", tag: "OBSERVAR" };
    return { cls: "neutral", icon: "⚪", tag: "SEM SINAL" };
  }
  function motorLine(a) {
    let ms = (a.motors || [])
      .map((m) => `${m.ok ? "✓" : "·"} ${m.name}`)
      .join(" • ");
    return ms || "Motores aguardando dados";
  }
  function pillars(a, market) {
    let p = [
      `Técnico ${a.technicalPillar ? "✓" : "○"}`,
      `Estrutura ${a.structurePillar ? "✓" : "○"}`,
      `Fluxo ${a.flowPillar ? "✓" : "○"}`,
    ];
    p.push(`MTF ${a.mtfPillar ? "✓" : "○"}`);
    return p.join(" • ");
  }
  function gateLine(x, market) {
    let g = window.EPReversalGate?.calc?.(x, market);
    if (!g) return "";
    let icon =
      g.score >= 85
        ? "🟣"
        : g.score >= 70
          ? "🔴"
          : g.score >= 50
            ? "🟠"
            : g.score >= 30
              ? "🟡"
              : "🟢";
    return `<div class="rgate-line"><b>REVERSAL GATE — SOMENTE LEITURA:</b> <span class="rgate-${g.cls}">${icon} ${g.score}/100 — ${g.level}</span><small> • não confirma, bloqueia, rebaixa ou cancela sinais</small></div>`;
  }
  
  function amplitude(x, market) {
    if (!x) return null;
    {
      let sym = x.sym || x.key,
        p = window.EPBackend24?.get?.(),
        s = (p?.state || []).find(
          (z) =>
            z.symbol === sym || z.asset === String(sym).replace("USDT", ""),
        );
      let f = s?.metrics?.fluctuation;
      if (f)
        return {
          score: +f.score || 0,
          dir: f.dir || "MIXED",
          level: f.level || "NORMAL",
          source: "backend 24/7",
        };
    }
    return null;
  }
  function ampLine(x, market, signalDir) {
    let f = amplitude(x, market);
    if (!f)
      return `<div class="rgate-line"><b>AMPLITUDE POTENCIAL:</b> <span>⏳ aguardando dados</span></div>`;
    let icon =
        f.score >= 8 ? "🔴" : f.score >= 6 ? "🟠" : f.score >= 4 ? "🔵" : "🟢",
      pressure =
        f.dir === "UP"
          ? "↑ PRESSÃO COMPRADORA"
          : f.dir === "DOWN"
            ? "↓ PRESSÃO VENDEDORA"
            : "↔ DIREÇÃO INDEFINIDA",
      align = "⚠️ NÃO CONFIRMADA",
      alignCls = "rgate-yellow";
    if (f.dir !== "MIXED" && (signalDir === "BUY" || signalDir === "SELL")) {
      let ok =
        (signalDir === "BUY" && f.dir === "UP") ||
        (signalDir === "SELL" && f.dir === "DOWN");
      align = ok ? "🟢 FAVORÁVEL AO SINAL" : "🔴 CONTRÁRIA AO SINAL";
      alignCls = ok ? "rgate-green" : "rgate-red";
    }
    return `<div class="rgate-line"><b>AMPLITUDE POTENCIAL:</b> <span>${icon} ${f.score}/11 — ${f.level} • ${pressure}</span><br><span class="${alignCls}"><b>${align}</b></span><small> • ${f.source}</small></div>`;
  }
  function ibcLine(x, market, signalDir, motors) {
    if (market !== "crypto" || !window.EPIBC?.calc) return "";
    let z = window.EPIBC.calc(x, market, signalDir);
    if (!z) return "";
    let premium =
      (motors === 2 || motors === 3) && z.score >= 75
        ? ` • <b>${motors}M PREMIUM</b>`
        : "";
    return `<div class="rgate-line"><b>IBC / FLUXO INSTITUCIONAL:</b> <span>${z.label} • ${z.score}/100${premium}</span>${z.parts?.length ? `<small> • confirma: ${z.parts.join(", ")}</small>` : ""}</div>`;
  }
  function earlyLegLine(x, market) {
    if (market !== "crypto" || !window.EPEarlyLegMotorV1?.calc) return "";
    const e = window.EPEarlyLegMotorV1.calc(x);
    if (!e || e.score < 35) return "";
    const cls = e.score >= 65 ? "rgate-green" : e.score >= 50 ? "rgate-yellow" : "";
    return `<div class="rgate-line"><b>🧪 INÍCIO DE PERNADA:</b> <span class="${cls}"><b>${e.phase} • ${e.score}/100</b></span><small> • ${e.pattern || "estrutura em formação"} • PRE-LEG ${e.preLegScore || 0} • Futuros ${e.futuresScore ?? "—"} • RSI ${fmt(e.rsi)}</small></div>`;
  }
  function earlyCandidate(map) {
    if (!map?.entries || !window.EPEarlyLegMotorV1?.calc) return null;
    return [...map.entries()].map(([key,x])=>({key,x,e:window.EPEarlyLegMotorV1.calc(x)}))
      .filter(z=>z.e?.score>=35).sort((a,b)=>b.e.score-a.e.score)[0]||null;
  }
  function earlyCard(z) {
    if(!z)return "";
    const e=z.e,name=String(z.key).replace("USDT","/USDT");
    return `<div class="decision-card watch"><div class="central-auto-head"><b>${name}</b><span>🧪 MOTOR 6 EXPERIMENTAL</span></div><div class="tier-badge watch">INÍCIO DE PERNADA</div><div class="decision-main">🔎 ${e.phase}</div><div class="decision-score"><b>Score ${e.score}/100</b> • RSI ${fmt(e.rsi)} • ${e.pattern||"estrutura em formação"}</div><div class="compact-info"><div><b>Padrões:</b> ${e.patterns.length?e.patterns.join(" • "):"aguardando padrão prioritário"}</div><div><b>PRE-LEG:</b> ${e.preLegScore||0}/100 • <b>Futuros:</b> ${e.futuresScore??"dados pendentes"}</div><div><b>Função:</b> antecipar acumulação/pressão antes da confirmação tardia dos 5 motores.</div></div><div class="action-box watch compact-action"><span>STATUS EXPERIMENTAL</span><b>ACOMPANHAR FORMAÇÃO — NÃO ALTERA O SINAL OFICIAL</b></div><div class="lop-actions"><button type="button" class="lop-btn" data-m6-track="1" data-asset="${z.key}">📡 MONITORAR SINAL MOTOR 6</button><span class="sub" data-m6-status="${z.key}"></span></div></div>`;
  }
  const motor6Immediate = new Map();
  function motor6Rows() {
    let stored=[], live=[]; try{stored=JSON.parse(localStorage.getItem('ep_motor6_watch_v1')||'[]')}catch{}
    try{live=window.EPMotor6Watch?.get?.()||[]}catch{}
    const all=[...(Array.isArray(stored)?stored:[]),...(Array.isArray(live)?live:[]),...motor6Immediate.values()], out=new Map();
    all.forEach(o=>{if(o?.id||o?.asset)out.set(o.id||o.asset,o)}); return [...out.values()];
  }
  function motor6WatchPanel() {
    let rows=motor6Rows();
    if(!Array.isArray(rows)||!rows.length) return '<div class="m6-watch-empty">Nenhum sinal selecionado. Use “📡 MONITORAR SINAL MOTOR 6”.</div>';
    return '<div class="m6-watch-grid">'+rows.map(o=>{
      const r=o.entryPrice?((+o.lastPrice-+o.entryPrice)/+o.entryPrice*100):0;
      const targets=[3,5,10,20,30,50].map(t=>'<span class="'+(o.targets?.[t]?'m6-hit':'')+'">+'+t+'% '+(o.targets?.[t]?'✓':'○')+'</span>').join(' ');
      const dir=o.lastDir||o.entryDir||'BUY',dirLabel=dir==='SELL'?'🔴 BAIXA / VENDA':'🟢 ALTA / COMPRA';return '<div class="m6-watch-card"><div class="m6-watch-head"><b>'+String(o.asset).replace('USDT','/USDT')+'</b><span>'+dirLabel+' • '+String(o.lastPhase||o.entryPhase||'MONITORANDO')+'</span></div><div class="m6-watch-main">'+(+o.entryPrice).toLocaleString('pt-BR',{maximumFractionDigits:6})+' → '+(+o.lastPrice).toLocaleString('pt-BR',{maximumFractionDigits:6})+' <b class="'+(r>=0?'m6-pos':'m6-neg')+'">'+(r>=0?'+':'')+r.toFixed(2)+'%</b></div><div class="compact-info"><b>Score:</b> '+(o.entryScore??'—')+' → '+(o.lastScore??'—')+' • <b>Padrão:</b> '+(o.lastPattern||o.entryPattern||'—')+'<br><b>RSI inicial:</b> '+fmt(o.entryRsi)+' • <b>PRE-LEG:</b> '+(o.entryPreLeg??'—')+' • <b>Futuros:</b> '+(o.entryFutures??'—')+'<br><b>MFE:</b> +'+(+o.best||0).toFixed(2)+'% • <b>MAE:</b> '+(+o.worst||0).toFixed(2)+'%</div><div class="m6-targets">'+targets+'</div><button type="button" class="lop-btn lop-close" data-m6-close="'+o.id+'">ENCERRAR MONITORAMENTO</button></div>';
    }).join('')+'</div>';
  }
  function renderMotor6Watch() {
    const el=document.getElementById('motor6WatchPanel'); if(!el)return; el.innerHTML=motor6WatchPanel();
    const historyEl=document.getElementById('motor6HistoryPanel');
    if(historyEl){const rows=window.EPMotor6Watch?.recordedHistory?.()||[];
      historyEl.innerHTML=rows.length?'<h3>Histórico registrado — Motor 6</h3><div style="overflow-x:auto"><table><thead><tr><th>Horário</th><th>Ativo</th><th>Registro</th><th>Entrada</th><th>Direção atual</th><th>Preço</th><th>Melhor / pior</th></tr></thead><tbody>'+rows.slice(0,50).map(r=>'<tr><td>'+new Date(r.observed_at).toLocaleString('pt-BR')+'</td><td>'+String(r.asset||'').replace('USDT','/USDT')+'</td><td>'+({ENTRY:'Entrada',CLOSE:'Encerramento',DIRECTION:'Mudança de direção',TARGET:'Meta atingida',SNAPSHOT:'Acompanhamento',BASELINE:'Registro inicial'}[r.event_type]||r.event_type)+'</td><td>'+(r.entry_dir||'—')+'</td><td>'+(r.last_dir||'—')+'</td><td>'+(+r.last_price).toLocaleString('pt-BR',{maximumFractionDigits:8})+'</td><td>+'+(+r.best_pct||0).toFixed(2)+'% / '+(+r.worst_pct||0).toFixed(2)+'%</td></tr>').join('')+'</tbody></table></div>':'<p class="sub">Aguardando registros do Motor 6.</p>'}
    el.querySelectorAll('[data-m6-close]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.m6Close, card=b.closest('.m6-watch-card');
      if(card){card.style.opacity='.45';b.disabled=true;b.textContent='ENCERRANDO…'}
      const ok=window.EPMotor6Watch?.close?.(id,'MANUAL');
      if(ok!==false){motor6Immediate.delete(id);renderMotor6Watch()}
      else {if(card)card.style.opacity='1';b.disabled=false;b.textContent='ENCERRAR MONITORAMENTO'}
    });
  }
  function trackButton(x, market) {
    let a = x?.sym || x?.key;
    if (!a) return "";
    return `<div class="lop-actions"><button class="lop-btn" data-live-track="1" data-market="${market}" data-asset="${a}">📌 ACOMPANHAR ATIVO</button></div>`;
  }
  function optionalLine(fn, label) {
    try { return fn(); }
    catch (error) {
      console.error("Central: indicador informativo indisponível — " + label, error);
      return `<div class="compact-info">${label}: leitura informativa indisponível</div>`;
    }
  }
  function ranked(map, market) {
    if (!map?.entries) return [];
    return [...map.entries()]
      .map(([key, x]) => {
        let a =
          window.EPDecision?.rank?.(x, market) ||
          window.EPDecision?.calc?.(x, market);
        return {
          key: key,
          x: x,
          a: a,
          m: +a?.motorAgree || 0,
          p: +a?.priority || 0,
          score: +a?.score || 0,
        };
      })
      .sort((u, v) => v.m - u.m || v.p - u.p || v.score - u.score);
  }
  function pick(map, market, excludeKey = null) {
    let list = ranked(map, market).filter((e) => e.key !== excludeKey);
    return list.find((e) => e.m >= 2) || list[0] || null;
  }
  function pickFocused(map, market, excludeKey = null) {
    let wanted = focus[market];
    if (wanted && map?.get) {
      let x = map.get(wanted) || map.get(String(wanted).replace("/", ""));
      if (x) {
        let key = map.has(wanted) ? wanted : String(wanted).replace("/", ""),
          a =
            window.EPDecision?.rank?.(x, market) ||
            window.EPDecision?.calc?.(x, market);
        return {
          key: key,
          x: x,
          a: a,
          m: +a?.motorAgree || 0,
          p: +a?.priority || 0,
          score: +a?.score || 0,
          manual: true,
        };
      }
    }
    return pick(map, market, excludeKey);
  }
  function head(key, market, a, manual) {
    let name = key
        ? String(key).replace("USDT", "/USDT")
        : "CRIPTO",
      m = a ? `${+a.motorAgree || 0}M` : "MOTORES INDISPONÍVEIS";
    return `<div class="central-auto-head"><b>${name}</b><span>${manual ? "📌 OPERAÇÃO" : "⚡ AUTOMÁTICO"} • ${m}</span></div>`;
  }
  function card(e, market) {
    let x = e?.x,
      a = e?.a,
      key = e?.key;
    if (!a)
      return `<div class="decision-card neutral">${head(key, market, a, e?.manual)}<div class="decision-main">AGUARDANDO DADOS</div></div>`;
    const candles = Array.isArray(x?.candles) ? x.candles : [];
    const lastCandle = candles.at(-1);
    const timestamp = Number(lastCandle?.t);
    const lastDate = Number.isFinite(timestamp) && timestamp > 0
      ? new Date(timestamp > 1e12 ? timestamp : timestamp * 1000).toLocaleDateString("pt-BR")
      : "indisponível";
    let dataNote = "";
    let v = visual(a),
      action = a.tradeAllowed
        ? a.dir === "BUY"
          ? "COMPRA — PAPER"
          : "VENDA — PAPER"
        : a.signalTier === "strong"
          ? "ACOMPANHAR DE PERTO — AGUARDAR CONFIRMAÇÃO"
          : a.signalTier === "initial"
            ? "MONITORAR FORMAÇÃO — NÃO ENTRAR"
            : a.level === "OBSERVAÇÃO"
              ? "OBSERVAR — NÃO ENTRAR"
              : "FICAR FORA",
      actionIcon = a.tradeAllowed
        ? "✅"
        : a.signalTier === "strong"
          ? "👀"
          : a.signalTier === "initial"
            ? "⏳"
            : a.signalTier === "watch"
              ? "🔎"
              : "⚪";
    return `<div class="decision-card ${v.cls}">${head(key, market, a, e?.manual)}${dataNote}<div class="tier-badge ${v.cls}">${v.tag}</div><div class="decision-main">${v.icon} ${a.decision}</div><div class="decision-score"><b>${a.level}</b> • Score ${a.score}/100 • ${a.extreme}</div><div class="indicator-strip"><span>Motores <b>${a.motorAgree || 0}/5</b></span><span>RSI <b>${fmt(a.rsi)}</b></span><span>CCI <b>${fmt(a.cci)}</b></span><span>MACD <b>${a.macd > 0 ? "COMPRADOR" : a.macd < 0 ? "VENDEDOR" : "NEUTRO"}</b></span></div>${optionalLine(() => gateLine(x, market), "Reversal Gate")}${optionalLine(() => ampLine(x, market, a.dir), "Amplitude")}${optionalLine(() => ibcLine(x, market, a.dir, a.motorAgree || 0), "IBC")}${optionalLine(() => earlyLegLine(x, market), "Início de Pernada")}<div class="compact-info"><div><b>Motores:</b> ${motorLine(a)}</div><div><b>4 pilares:</b> ${pillars(a, market)}</div><div><b>✓ Favorece:</b> ${a.reasons.length ? a.reasons.join(" • ") : "sem confirmação forte"}</div><div><b>⚠ Cuidado:</b> ${a.risks.length ? a.risks.join(" • ") : "sem alerta principal"}</div><div><b>→ Próximo:</b> ${a.next.join(" • ")}</div></div><div class="action-box ${v.cls} compact-action"><span>O QUE FAZER</span><b>${actionIcon} ${action}</b></div>${trackButton(x, market)}</div>`;
  }
  function ensureCss() {
    if ($("#centralAutoStyle")) return;
    let st = document.createElement("style");
    st.id = "centralAutoStyle";
    st.textContent = `.central-auto-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;min-height:31px}.central-auto-head>b{font-size:15px}.central-auto-head span{white-space:nowrap;font-size:11px;color:#7ff0c7;border:1px solid #2b6856;border-radius:999px;padding:4px 7px;background:#0b3028}`;
    document.head.appendChild(st);
  }
  function bindTrack(el) {
    el.querySelectorAll("[data-m6-track]").forEach(b => b.onclick = () => {
      const status = el.querySelector('[data-m6-status="'+b.dataset.asset+'"]');
      let monitor = window.EPMotor6Watch;
      if (!monitor?.add) {
        // Fallback embutido: o botão nunca depende do arquivo externo para iniciar o registro.
        const KEY='ep_motor6_watch_v1', norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
        let rows=[]; try{rows=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(rows))rows=[]}catch{rows=[]}
        monitor={add:(sym)=>{
          const n=norm(sym),map=window.CryptoApp?.getData?.(); let x=map?.get?.(sym)||map?.get?.(n);
          if(!x&&map?.entries) for(const [k,v] of map.entries()) if(norm(k)===n||norm(v?.sym)===n){x=v;break}
          const e=window.EPEarlyLegMotorV1?.calc?.(x),p=+(x?.livePrice??x?.price??x?.regularMarketPrice??x?.candles?.at?.(-1)?.c);
          if(!x||!e||!Number.isFinite(p)||p<=0){if(status)status.textContent=' Dados do ativo ainda não disponíveis.';return null}
          let o=rows.find(z=>norm(z.asset)===n);if(o)return o;
          const now=Date.now();o={id:'m6:'+n+':'+now,asset:n,entryAt:now,entryPrice:p,lastPrice:p,entryScore:e.score,entryPhase:e.phase,entryPattern:e.pattern,entryRsi:e.rsi,entryPreLeg:e.preLegScore,entryFutures:e.futuresScore,best:0,worst:0,targets:{},lastScore:e.score,lastPhase:e.phase};
          rows.push(o);try{localStorage.setItem(KEY,JSON.stringify(rows))}catch{};return o;
        }};
        window.EPMotor6Watch=monitor;
      }
      const before=(monitor.get?.()||[]).find(x=>String(x.asset||'').replace(/[^A-Z0-9]/gi,'').toUpperCase()===String(b.dataset.asset||'').replace(/[^A-Z0-9]/gi,'').toUpperCase());const o = monitor.add(b.dataset.asset);
      if (o) {
        motor6Immediate.set(o.id||o.asset,o);
        b.textContent='✅ SINAL EM MONITORAMENTO';
        b.disabled=true;
        if(status) status.textContent=before?' Ativo já estava em monitoramento.':' Registro iniciado e sincronizado.'; renderMotor6Watch(); document.getElementById('motor6WatchSection')?.scrollIntoView({behavior:'smooth',block:'center'});
      }
    });
    el.querySelectorAll("[data-live-track]").forEach(
      (b) =>
        (b.onclick = () =>
          window.EPLiveOperations?.add?.(b.dataset.market, b.dataset.asset)),
    );
  }
  let last = "";
  const diagnostics = { version: 58, errors: {} };
  function marketCard(market) {
    try {
      const app = window.CryptoApp;
      const map = app?.getData?.();
      let missing = !app ? "Módulo de dados não carregado"
        : !map?.size ? ("Nenhuma moeda carregada. Verifique Atualizar Cripto.")
        : !window.EPDecision?.calc ? "Módulo de interpretação não carregado" : "";
      if (missing) return { selected: null, html: `<div class="decision-card neutral">${head(null, market, null, false)}<div class="decision-main">AGUARDANDO LEITURA</div><div class="compact-info">${missing}</div></div>` };
      const selected = pickFocused(map, market);
      return { selected, html: card(selected, market) };
    } catch (error) {
      console.error("Central de interpretação: falha em " + market, error);
      diagnostics.errors[market] = error instanceof TypeError ? "Formato de dados incompatível" : "Falha no cálculo da interpretação";
      return { selected: null, html: `<div class="decision-card neutral">${head(null, market, null, false)}<div class="decision-main">LEITURA TEMPORARIAMENTE INDISPONÍVEL</div><div class="compact-info">${diagnostics.errors[market]}. Tentando atualizar a leitura automaticamente.</div></div>` };
    }
  }
  function render() {
    ensureCss();
    const app = window.CryptoApp, map = app?.getData?.(),
      el = $("#decisionCenter");
    if (!el) return;
    let first = marketCard("crypto"), second = null;
    if (map?.size && window.EPDecision?.calc) {
      const e = pick(map, "crypto", first.selected?.key || null);
      second = { selected: e, html: card(e, "crypto") };
    } else {
      second = { selected: null, html: '<div class="decision-card neutral"><div class="decision-main">AGUARDANDO SEGUNDO SINAL CRIPTO</div></div>' };
    }
    const early = earlyCandidate(map); let html = first.html + second.html + earlyCard(early);
    diagnostics.renderedAt = Date.now();
    if (html === last) return;
    last = html;
    el.innerHTML = html;
    bindTrack(el);
    const selection = {
      crypto: first.selected?.key || null,
      crypto2: second.selected?.key || null,
      ts: Date.now(),
    };
    window.EPCentralSelection = selection;
    window.dispatchEvent(
      new CustomEvent("ep-central-selection", { detail: selection }),
    );
  }
  function init() {
    [
      "crypto-data-updated",
      "mtf-updated",
      "news-impact-updated",
      "reversal-gate-ready",
      "live-operations-ready",
      "ep-early-leg-motor-ready",
      "ep-early-leg-updated",
      "ep-motor6-watch-ready",
      "ep-motor6-watch-changed",
      "ep-motor6-watch-updated",
    ].forEach((ev) => window.addEventListener(ev, render));
    window.addEventListener("ep-central-focus", (ev) => {
      let d = ev.detail || {};
      if (d.market === "crypto" && d.asset) {
        focus[d.market] = d.asset;
        last = "";
        render();
        $("#decisionCenter")
          ?.closest("section.card")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    $("#eventRisk")?.addEventListener("change", render);
    setInterval(() => {
      if (!document.hidden) render();
    }, 4e3);
    renderMotor6Watch();
    window.addEventListener("ep-motor6-watch-changed", renderMotor6Watch);
    window.addEventListener("ep-motor6-watch-updated", renderMotor6Watch);
    window.EPInterpretation = { render, getStatus: () => ({ ...diagnostics, errors: { ...diagnostics.errors } }) };
    render();
    window.EPCentralFocus = {
      set: (market, asset) => {
        if (market && asset) {
          focus[market] = asset;
          last = "";
          render();
        }
      },
      clear: (market) => {
        if (market) focus[market] = null;
        else {
          focus.crypto = null;
        }
        last = "";
        render();
      },
      get: () => ({ ...focus }),
    };
  }
  setTimeout(init, 700);
})();