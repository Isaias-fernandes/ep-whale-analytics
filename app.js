const PAIRS=[
  {symbol:'BTCUSDT',name:'Bitcoin',key:'BTC'},
  {symbol:'ETHUSDT',name:'Ethereum',key:'ETH'},
  {symbol:'SOLUSDT',name:'Solana',key:'SOL'},
  {symbol:'BNBUSDT',name:'BNB',key:'BNB'},
  {symbol:'XRPUSDT',name:'XRP',key:'XRP'}
];
const $=s=>document.querySelector(s);
let marketData=new Map();
let selected='BTCUSDT';
let timer=null;
const H1_LAB_URL='https://qhgclnkctpzumtybailv.supabase.co/functions/v1/ep-h1-signal-lab';

const fmt=(n,d=2)=>Number.isFinite(+n)?(+n).toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const pct=n=>Number.isFinite(+n)?`${n>=0?'+':''}${fmt(n,2)}%`:'—';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;

function ema(values,period){
  if(!values.length)return [];
  const k=2/(period+1),out=[values[0]];
  for(let i=1;i<values.length;i++)out.push(values[i]*k+out[i-1]*(1-k));
  return out;
}
function rsi(values,period=7){
  if(values.length<=period)return NaN;
  let gains=0,losses=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>=0)gains+=d;else losses-=d;}
  let ag=gains/period,al=losses/period;
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];ag=(ag*(period-1)+Math.max(d,0))/period;al=(al*(period-1)+Math.max(-d,0))/period;}
  if(al===0)return 100; const rs=ag/al; return 100-(100/(1+rs));
}
function cci(candles,period=14){
  if(candles.length<period)return NaN;
  const tps=candles.map(c=>(c.h+c.l+c.c)/3),slice=tps.slice(-period),ma=avg(slice);
  const md=avg(slice.map(x=>Math.abs(x-ma)));
  return md? (slice.at(-1)-ma)/(0.015*md):0;
}
function atr(candles,period=14){
  if(candles.length<period+1)return NaN;
  const trs=[];
  for(let i=1;i<candles.length;i++)trs.push(Math.max(candles[i].h-candles[i].l,Math.abs(candles[i].h-candles[i-1].c),Math.abs(candles[i].l-candles[i-1].c)));
  return avg(trs.slice(-period));
}
function macd203060(values){
  const e20=ema(values,20),e30=ema(values,30); const line=values.map((_,i)=>e20[i]-e30[i]); const signal=ema(line,60);
  return {line:line.at(-1),signal:signal.at(-1),hist:line.at(-1)-signal.at(-1),prevHist:line.at(-2)-signal.at(-2)};
}
function vwap(candles){
  let pv=0,v=0; for(const c of candles){const tp=(c.h+c.l+c.c)/3;pv+=tp*c.v;v+=c.v;} return v?pv/v:NaN;
}
function patterns(c){
  if(c.length<22)return {name:'Sem padrão forte',bias:0};
  const a=c.at(-2),b=c.at(-1); const body=Math.abs(b.c-b.o),range=b.h-b.l||1; const lower=Math.min(b.o,b.c)-b.l,upper=b.h-Math.max(b.o,b.c);
  const bullEng=b.c>b.o&&a.c<a.o&&b.c>=a.o&&b.o<=a.c;
  const bearEng=b.c<b.o&&a.c>a.o&&b.o>=a.c&&b.c<=a.o;
  const hammer=lower>body*2&&upper<body&&body/range<.45;
  const shooting=upper>body*2&&lower<body&&body/range<.45;
  const prevHigh=Math.max(...c.slice(-21,-1).map(x=>x.h)),prevLow=Math.min(...c.slice(-21,-1).map(x=>x.l));
  if(b.c>prevHigh)return {name:'Rompimento de máxima (20)',bias:2};
  if(b.c<prevLow)return {name:'Rompimento de mínima (20)',bias:-2};
  if(bullEng)return {name:'Engolfo de alta',bias:1.5};
  if(bearEng)return {name:'Engolfo de baixa',bias:-1.5};
  if(hammer)return {name:'Martelo',bias:1};
  if(shooting)return {name:'Estrela cadente',bias:-1};
  return {name:'Sem padrão forte',bias:0};
}
function newsSentiment(items,pair){
  if(!items?.length)return {score:0,items:[]};
  const aliases=[pair.key,pair.name.toLowerCase(),pair.symbol.toLowerCase()];
  const rel=items.filter(n=>aliases.some(a=>`${n.title||''} ${n.body||''} ${n.tags||''}`.toLowerCase().includes(a.toLowerCase()))).slice(0,6);
  const pos=['surge','rally','bull','bullish','approval','adoption','inflow','record high','gain','breakout','partnership','launch'];
  const neg=['crash','drop','bear','bearish','hack','lawsuit','outflow','ban','liquidation','fraud','selloff','exploit'];
  let s=0; for(const n of rel){const t=`${n.title||''} ${n.body||''}`.toLowerCase();pos.forEach(w=>{if(t.includes(w))s++});neg.forEach(w=>{if(t.includes(w))s--});}
  return {score:clamp(s,-3,3),items:rel};
}
function scoreSignal(x){
  let long=0,short=0,why=[];
  const add=(l,s,t)=>{long+=l;short+=s;if(t)why.push(t)};
  if(x.price>x.vwap)add(8,0,'Preço acima da VWAP');else add(0,8,'Preço abaixo da VWAP');
  if(x.macd.hist>0)add(10,0,'MACD comprador');else add(0,10,'MACD vendedor');
  if(x.macd.hist>x.macd.prevHist)add(4,0,'Histograma MACD acelerando');else add(0,4,'Histograma MACD enfraquecendo');
  if(x.rsi>=52&&x.rsi<80)add(8,0,'RSI 7 favorável à alta');
  if(x.rsi<=48&&x.rsi>20)add(0,8,'RSI 7 favorável à baixa');
  if(x.rsi<=20)add(7,0,'RSI 7 em sobrevenda');
  if(x.rsi>=80)add(0,7,'RSI 7 em sobrecompra');
  if(x.cci>100)add(7,0,'CCI 14 acima de +100'); else if(x.cci<-100)add(0,7,'CCI 14 abaixo de -100');
  if(x.volumeRatio>=1.5){const w=clamp((x.volumeRatio-1)*7,4,12); if(x.flowBias>=0)add(w,0,'Volume relativo elevado');else add(0,w,'Volume relativo elevado');}
  if(x.flowBias>.08)add(12,0,'Agressão/taker buy dominante'); else if(x.flowBias<-.08)add(0,12,'Agressão/taker sell dominante');
  if(x.cvd>0)add(7,0,'CVD aproximado positivo');else add(0,7,'CVD aproximado negativo');
  if(x.oiChange>0.5){if(x.change24>=0)add(7,0,'Open Interest subindo com preço');else add(0,7,'Open Interest subindo com queda');}
  if(x.funding>0.05)add(0,3,'Funding elevado (risco de long squeeze)');else if(x.funding<-0.05)add(3,0,'Funding negativo (risco de short squeeze)');
  if(x.pattern.bias>0)add(7*x.pattern.bias/2,0,x.pattern.name);else if(x.pattern.bias<0)add(0,7*Math.abs(x.pattern.bias)/2,x.pattern.name);
  if(x.news.score>0)add(x.news.score*2,0,'Notícias com viés positivo');else if(x.news.score<0)add(0,Math.abs(x.news.score)*2,'Notícias com viés negativo');
  const base=30; long=clamp(Math.round(base+long),0,100);short=clamp(Math.round(base+short),0,100);
  const dir=long>=short?'BUY':'SELL',score=Math.max(long,short);
  return {long,short,dir,score,why:why.slice(0,7)};
}
function whaleType(x,s){
  if(s.score<60)return {name:'Sem confirmação',cls:'neutral',desc:'Fluxo sem confluência suficiente para classificar atuação de grande participante.'};
  if(s.dir==='BUY'&&x.volumeRatio>1.5&&x.flowBias>.08&&x.oiChange>=0)return {name:'Possível acumulação institucional',cls:'acc',desc:'Volume, agressão compradora e derivativos estão alinhados com entrada de capital.'};
  if(s.dir==='SELL'&&x.volumeRatio>1.5&&x.flowBias<-.08&&x.oiChange>=0)return {name:'Possível distribuição institucional',cls:'dist',desc:'Volume, agressão vendedora e derivativos estão alinhados com saída/posição vendedora.'};
  if(s.dir==='BUY'&&x.funding<-.03)return {name:'Possível short squeeze',cls:'acc',desc:'Pressão compradora com funding negativo pode forçar encerramento de shorts.'};
  if(s.dir==='SELL'&&x.funding>.03)return {name:'Possível long squeeze',cls:'dist',desc:'Pressão vendedora com funding positivo pode forçar encerramento de longs.'};
  return {name:'Confluência direcional',cls:s.dir==='BUY'?'acc':'dist',desc:'Há alinhamento técnico, mas sem assinatura completa de acumulação/distribuição.'};
}
async function fetchJSON(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);return r.json();}
async function getNews(){
  try{const j=await fetchJSON('https://min-api.cryptocompare.com/data/v2/news/?lang=EN');return j.Data||[];}catch(e){return []}
}
async function getPair(pair,tf,allNews){
  const [k,tick,oi,prem,oiHist]=await Promise.allSettled([
    fetchJSON(`https://api.binance.com/api/v3/klines?symbol=${pair.symbol}&interval=${tf}&limit=220`),
    fetchJSON(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair.symbol}`),
    fetchJSON(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${pair.symbol}`),
    fetchJSON(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair.symbol}`),
    fetchJSON(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${pair.symbol}&period=5m&limit=30`)
  ]);
  if(k.status!=='fulfilled')throw k.reason;
  const candles=k.value.map(a=>({t:+a[0],o:+a[1],h:+a[2],l:+a[3],c:+a[4],v:+a[5],qv:+a[7],trades:+a[8],tb:+a[9]}));
  const closes=candles.map(c=>c.c),last=candles.at(-1),vol20=avg(candles.slice(-21,-1).map(c=>c.v));
  const flow20=candles.slice(-20).reduce((s,c)=>s+(2*c.tb-c.v),0),volSum=candles.slice(-20).reduce((s,c)=>s+c.v,0)||1;
  const flowBias=flow20/volSum;
  const cvd=candles.slice(-40).reduce((s,c)=>s+(2*c.tb-c.v),0);
  let oiChange=0;
  if(oiHist.status==='fulfilled'&&oiHist.value.length>1){const a=+oiHist.value[0].sumOpenInterest,b=+oiHist.value.at(-1).sumOpenInterest;oiChange=a?((b-a)/a)*100:0;}
  const funding=prem.status==='fulfilled'?+prem.value.lastFundingRate*100:0;
  const change24=tick.status==='fulfilled'?+tick.value.priceChangePercent:0;
  const news=newsSentiment(allNews,pair);
  const x={pair,price:last.c,change24,rsi:rsi(closes,7),cci:cci(candles,14),macd:macd203060(closes),atr:atr(candles,14),vwap:vwap(candles.slice(-80)),volumeRatio:last.v/(vol20||last.v),flowBias,cvd,oi:oi.status==='fulfilled'?+oi.value.openInterest:NaN,oiChange,funding,pattern:patterns(candles),news,candles};
  x.signal=scoreSignal(x);x.whale=whaleType(x,x.signal);
  const risk=x.atr*1.5,entry=x.price;
  if(x.signal.dir==='BUY'){x.levels={entry,stop:entry-risk,t1:entry+risk*1.5,t2:entry+risk*2.5,t3:entry+risk*4};}
  else{x.levels={entry,stop:entry+risk,t1:entry-risk*1.5,t2:entry-risk*2.5,t3:entry-risk*4};}
  return x;
}
function renderScanner(){
  const min=+$(' #minScore'.trim()).value;
  $('#scanner').innerHTML=PAIRS.map(p=>{const x=marketData.get(p.symbol);if(!x)return `<div class="scan-card"><div class="pair">${p.key}/USDT</div><div class="muted">Carregando...</div></div>`;const s=x.signal,ok=s.score>=min,cls=!ok?'wait':s.dir==='BUY'?'buy':'sell';const label=!ok?'AGUARDAR':s.dir==='BUY'?'COMPRA':'VENDA';return `<div class="scan-card" data-pair="${p.symbol}"><div class="scan-head"><div class="pair">${p.key}/USDT</div><span class="pill ${cls}">${label}</span></div><div class="score ${cls}">${ok?s.score:'<'+min}%</div><div class="muted small">Probabilidade estimada / confluência</div><div class="metric-row"><span>Preço</span><b>${fmt(x.price,x.price<10?4:2)}</b></div><div class="metric-row"><span>24h</span><b>${pct(x.change24)}</b></div><div class="metric-row"><span>Volume rel.</span><b>${fmt(x.volumeRatio,2)}x</b></div><div class="metric-row"><span>RSI 7</span><b>${fmt(x.rsi,1)}</b></div></div>`}).join('');
  document.querySelectorAll('.scan-card[data-pair]').forEach(el=>el.onclick=()=>{selected=el.dataset.pair;$('#detailPair').value=selected;renderDetail()});
}
function renderDetail(){
  const x=marketData.get(selected); if(!x)return;
  const s=x.signal,min=+$('#minScore').value,valid=s.score>=min,cls=!valid?'wait':s.dir==='BUY'?'buy':'sell',label=!valid?'AGUARDAR':s.dir==='BUY'?'COMPRA':'VENDA';
  $('#signalDetail').innerHTML=`<div class="signal-box"><div class="signal-title"><div><div class="pair">${x.pair.key}/USDT</div><span class="pill ${cls}">${label}</span></div><div class="score ${cls}">${valid?s.score:'<'+min}%</div></div><p class="muted">${valid?'Sinal liberado por confluência mínima.':'Sinal bloqueado: score abaixo do mínimo configurado.'}</p><div class="levels"><div class="level"><b>Entrada</b>${fmt(x.levels.entry,x.price<10?4:2)}</div><div class="level"><b>Stop</b>${fmt(x.levels.stop,x.price<10?4:2)}</div><div class="level"><b>T1</b>${fmt(x.levels.t1,x.price<10?4:2)}</div><div class="level"><b>T2</b>${fmt(x.levels.t2,x.price<10?4:2)}</div><div class="level"><b>T3</b>${fmt(x.levels.t3,x.price<10?4:2)}</div></div><h3 style="margin-top:16px">Motivos</h3>${s.why.map(w=>`<div class="metric-row"><span>${w}</span><b>✓</b></div>`).join('')}</div>`;
  $('#whalePanel').innerHTML=`<div class="whale-flag ${x.whale.cls}"><h3>${x.whale.name}</h3><p>${x.whale.desc}</p></div><div class="metric-row"><span>Score BUY</span><b class="ok-text">${s.long}%</b></div><div class="metric-row"><span>Score SELL</span><b class="error">${s.short}%</b></div><div class="metric-row"><span>Open Interest</span><b>${fmt(x.oi,0)}</b></div><div class="metric-row"><span>Variação OI (contexto)</span><b>${pct(x.oiChange)}</b></div><div class="metric-row"><span>Funding</span><b>${pct(x.funding)}</b></div>`;
  $('#indicators').innerHTML=`<div class="metric-row"><span>RSI 7 (80/20)</span><b>${fmt(x.rsi,1)}</b></div><div class="metric-row"><span>CCI 14</span><b>${fmt(x.cci,1)}</b></div><div class="metric-row"><span>MACD 20/30/60</span><b>${x.macd.hist>=0?'Comprador':'Vendedor'}</b></div><div class="metric-row"><span>VWAP</span><b>${fmt(x.vwap,x.price<10?4:2)}</b></div><div class="metric-row"><span>ATR 14</span><b>${fmt(x.atr,x.price<10?4:2)}</b></div><div class="metric-row"><span>Volume relativo</span><b>${fmt(x.volumeRatio,2)}x</b></div><div class="metric-row"><span>Fluxo taker</span><b>${x.flowBias>0?'Comprador':'Vendedor'} (${fmt(x.flowBias*100,1)}%)</b></div><div class="metric-row"><span>CVD aproximado</span><b>${fmt(x.cvd,2)}</b></div><div class="metric-row"><span>Padrão</span><b>${x.pattern.name}</b></div>`;
  if(x.news.items.length){$('#newsPanel').innerHTML=`<div class="metric-row"><span>Viés agregado</span><b>${x.news.score>0?'Positivo':x.news.score<0?'Negativo':'Neutro'}</b></div>`+x.news.items.map(n=>`<div class="news-item"><a href="${n.url}" target="_blank" rel="noopener">${n.title}</a><div class="muted small">${n.source_info?.name||n.source||''}</div></div>`).join('');}else{$('#newsPanel').innerHTML='<div class="muted">Sem notícias específicas disponíveis nesta atualização. O fator notícias ficou neutro.</div>'}
}
async function scan(){
  clearTimeout(timer);$('#feedStatus').textContent='Atualizando...';$('#refreshBtn').disabled=true;
  const tf=$('#timeframe').value; const allNews=await getNews();
  const results=await Promise.all(PAIRS.map(async p=>{try{return await getPair(p,tf,allNews)}catch(e){console.error(p.symbol,e);return {pair:p,error:e.message}}}));
  results.forEach(x=>{if(!x.error)marketData.set(x.pair.symbol,x)});
  renderScanner(); renderDetail();
  const ok=results.filter(x=>!x.error).length;$('#feedStatus').textContent=ok===PAIRS.length?'Mercado online':`Parcial ${ok}/${PAIRS.length}`;$('#lastUpdate').textContent=new Date().toLocaleTimeString('pt-BR');$('#scanInfo').textContent=`${tf} • ${ok} ativos atualizados`;
  $('#refreshBtn').disabled=false; const secs=+$('#refreshSeconds').value; timer=setTimeout(scan,secs*1000);
}
function init(){
  $('#detailPair').innerHTML=PAIRS.map(p=>`<option value="${p.symbol}">${p.key}/USDT</option>`).join('');
  $('#detailPair').value=selected;$('#detailPair').onchange=e=>{selected=e.target.value;renderDetail()};
  $('#refreshBtn').onclick=scan;$('#timeframe').onchange=scan;$('#minScore').onchange=()=>{renderScanner();renderDetail()};$('#refreshSeconds').onchange=scan;
  $('#h1Refresh').onclick=loadH1Lab;
  scan();loadH1Lab();
}

function h1Pill(value){const cls=value==='PASS'?'buy':value==='WATCH'?'wait':'sell';return `<span class="pill ${cls}">${value}</span>`}
async function loadH1Lab(){
  const btn=$('#h1Refresh');btn.disabled=true;
  try{
    const data=await fetchJSON(H1_LAB_URL),state=data.state||[],events=data.events||[];
    const promising=state.filter(x=>+x.score>=80&&x.reversal_gate==='PASS');
    $('#h1Summary').innerHTML=`<div><b>${state.filter(x=>x.market==='crypto').length}</b><span>Cripto avaliadas</span></div><div><b>${state.filter(x=>x.market==='b3').length}</b><span>B3 avaliadas</span></div><div><b>${promising.length}</b><span>Promissores liberados</span></div><div><b>${state.filter(x=>x.reversal_gate==='WATCH').length}</b><span>Em observação</span></div>`;
    $('#h1Radar').innerHTML=state.sort((a,b)=>+b.score-+a.score).map(x=>`<tr><td>${x.market==='b3'?'B3':'Cripto'}</td><td><b>${x.asset.replace('USDT','')}</b></td><td>${x.direction}</td><td>${fmt(x.score,0)}</td><td>${h1Pill(x.reversal_gate)}</td><td>${(x.gate_reasons||[]).join(' • ')}</td></tr>`).join('')||'<tr><td colspan="6">Aguardando o primeiro ciclo.</td></tr>';
    const targets=[5,10,20,30,50];$('#h1Targets').innerHTML=targets.map(t=>`<div><b>${events.filter(e=>e['hit_'+t+'pct']).length}</b><span>Atingiram ${t}%</span></div>`).join('');
    $('#h1Results').innerHTML=events.map(e=>`<tr><td>${e.market==='b3'?'B3':'Cripto'}</td><td><b>${e.asset.replace('USDT','')}</b></td><td>${fmt(e.entry_price,+e.entry_price<10?4:2)}</td><td>${e.direction}</td><td>${pct(e.max_favorable_pct)}</td><td>${pct(e.max_adverse_pct)}</td><td>${e.status}</td></tr>`).join('')||'<tr><td colspan="7">Nenhum sinal liberado ainda.</td></tr>';
  }catch(e){$('#h1Summary').innerHTML='<div class="error">Falha ao carregar laboratório H1.</div>';console.error(e)}finally{btn.disabled=false}
}
init();
