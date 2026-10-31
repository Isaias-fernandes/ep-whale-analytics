import './early-leg-episode-core.js';
const PAIRS = [
  ['BTCUSDT','BTC'],['ETHUSDT','ETH'],['SOLUSDT','SOL'],['BNBUSDT','BNB'],['XRPUSDT','XRP'],
  ['ADAUSDT','ADA'],['DOGEUSDT','DOGE'],['AVAXUSDT','AVAX'],['LINKUSDT','LINK'],['DOTUSDT','DOT'],
  ['LTCUSDT','LTC'],['BCHUSDT','BCH'],['TRXUSDT','TRX'],['UNIUSDT','UNI'],['AAVEUSDT','AAVE'],
  ['SUIUSDT','SUI'],['NEARUSDT','NEAR'],['APTUSDT','APT'],['ARBUSDT','ARB'],['OPUSDT','OP'],
  ['XLMUSDT','XLM'],['HBARUSDT','HBAR'],['PEPEUSDT','PEPE'],['ETCUSDT','ETC'],['ATOMUSDT','ATOM'],
  ['TIAUSDT','TIA'],['XTZUSDT','XTZ'],['LDOUSDT','LDO'],['SEIUSDT','SEI'],['FILUSDT','FIL'],
  ['INJUSDT','INJ'],['RUNEUSDT','RUNE'],['ALGOUSDT','ALGO'],['FETUSDT','FET'],['GALAUSDT','GALA'],
  ['SANDUSDT','SAND'],['MANAUSDT','MANA'],['CRVUSDT','CRV'],['DYDXUSDT','DYDX'],['JUPUSDT','JUP'],
  ['WIFUSDT','WIF'],['BONKUSDT','BONK'],['SHIBUSDT','SHIB'],['TONUSDT','TON'],['STXUSDT','STX'],
  ['IMXUSDT','IMX'],['RENDERUSDT','RENDER'],['THETAUSDT','THETA'],['VETUSDT','VET'],['ZECUSDT','ZEC']
];

const avg = (a:number[]) => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
const clamp = (n:number,a:number,b:number) => Math.max(a,Math.min(b,n));

const ema = (v:number[],p:number) => {
  if (!v.length) return [];
  const k = 2/(p+1), out = [v[0]];
  for (let i=1;i<v.length;i++) out.push(v[i]*k + out[i-1]*(1-k));
  return out;
};

const rsi = (v:number[],p=7) => {
  if (v.length<=p) return 50;
  let g=0,l=0;
  for(let i=1;i<=p;i++){
    const d=v[i]-v[i-1];
    d>=0 ? g+=d : l-=d;
  }
  let ag=g/p, al=l/p;
  for(let i=p+1;i<v.length;i++){
    const d=v[i]-v[i-1];
    ag=(ag*(p-1)+Math.max(d,0))/p;
    al=(al*(p-1)+Math.max(-d,0))/p;
  }
  return al ? 100-100/(1+ag/al) : 100;
};

const cci = (c:any[],p=14) => {
  const t=c.map(x=>(x.h+x.l+x.c)/3).slice(-p);
  const m=avg(t), d=avg(t.map(x=>Math.abs(x-m)));
  return d ? (t.at(-1)-m)/(.015*d) : 0;
};

const vwap = (c:any[]) => {
  let pv=0,v=0;
  c.forEach(x=>{
    const tp=(x.h+x.l+x.c)/3;
    pv+=tp*x.v;
    v+=x.v;
  });
  return pv/(v||1);
};

const macd = (v:number[]) => {
  const a=ema(v,20), b=ema(v,30);
  const line=v.map((_,i)=>(a[i]??0)-(b[i]??0));
  const sig=ema(line,60);
  return (line.at(-1)??0)-(sig.at(-1)??0);
};

const pct = (a:number,b:number) => a ? ((b-a)/a)*100 : 0;

async function fetchJson(url:string){
  const r=await fetch(url);
  if(!r.ok){
    const txt=await r.text().catch(()=> '');
    throw new Error(`HTTP ${r.status} ${url}${txt ? ` :: ${txt.slice(0,180)}` : ''}`);
  }
  return r.json();
}

async function safeJson(url:string,fallback:any){
  try { return await fetchJson(url); }
  catch { return fallback; }
}

/* Fallbacks para endpoints públicos spot da Binance.
   Evita derrubar os 25 pares se um host específico estiver indisponível
   na região do Supabase. */
async function binanceSpot(path:string){
  const hosts = [
    'https://api.binance.com',
    'https://api-gcp.binance.com',
    'https://data-api.binance.vision'
  ];
  const errors:string[] = [];
  for(const host of hosts){
    try{
      return await fetchJson(`${host}${path}`);
    }catch(e){
      errors.push(String(e));
    }
  }
  throw new Error(`BINANCE_SPOT_FALHOU :: ${errors.join(' || ')}`);
}

function score(x:any){
  let bull=0,bear=0;
  const add=(w:number,d:number)=>d>0?bull+=w:d<0?bear+=w:0;
  add(25,x.flow);
  if(Math.abs(x.flow)<.03){bull-=3;bear-=3}
  if(x.oiChange>.35)add(20,x.change);
  else if(x.oiChange<-.35)add(8,-x.change);
  if(x.vol>=1.5)add(15,x.flow);
  else if(x.vol<.8){bull-=4;bear-=4}
  add(15,x.price-x.vwap);
  add(6,x.macd);
  if(x.rsi>52&&x.rsi<80)add(2,1);
  if(x.rsi<48&&x.rsi>20)add(2,-1);
  if(x.cci>100)add(2,1);
  if(x.cci<-100)add(2,-1);
  if(x.funding>.08)add(5,-1);
  else if(x.funding<-.08)add(5,1);
  if(x.book>.08)add(8,1);
  if(x.book<-.08)add(8,-1);
  if(x.change>.4&&x.flow<-.04)bear+=12;
  if(x.change<-.4&&x.flow>.04)bull+=12;
  bull=clamp(Math.round(bull),0,100);
  bear=clamp(Math.round(bear),0,100);
  return {dir:bull>=bear?'BUY':'SELL',score:Math.max(bull,bear)};
}

function structure(c:any[],dir:string){
  if(c.length<25)return false;
  const last=c.at(-1);
  const prev=c.slice(-21,-1);
  const hi=Math.max(...prev.map(x=>x.h));
  const lo=Math.min(...prev.map(x=>x.l));
  const recent=c.slice(-8);
  const sl=(recent.at(-1).c-recent[0].c)/(recent[0].c||1);
  return dir==='BUY'
    ? (last.c>hi || (sl>0&&recent.at(-1).h>recent[0].h&&recent.at(-1).l>recent[0].l))
    : (last.c<lo || (sl<0&&recent.at(-1).l<recent[0].l&&recent.at(-1).h<recent[0].h));
}

function motorFingerprint(x:any,dir:string,sc:number){
  const technical=(dir==='BUY'
    ? x.macd>0&&x.price>x.vwap&&x.rsi>=50
    : x.macd<0&&x.price<x.vwap&&x.rsi<=50) && sc>=70;

  const st=structure(x.candles,dir);
  const buyFlow=(x.flow>.02?1:0)+(x.book>.04?1:0)+(x.oiChange>.2&&x.change>0?1:0)+(x.vol>=1.2?1:0);
  const sellFlow=(x.flow<-.02?1:0)+(x.book<-.04?1:0)+(x.oiChange>.2&&x.change<0?1:0)+(x.vol>=1.2?1:0);
  const flow=dir==='BUY'?buyFlow>=2:sellFlow>=2;

  const close=x.candles.map((z:any)=>z.c);
  const m21=avg(close.slice(-21));
  const volatility=dir==='BUY'?x.price>m21:x.price<m21;

  const w=close.slice(-20);
  const mid=avg(w);
  const sd=Math.sqrt(avg(w.map((n:number)=>(n-mid)**2)));
  const squeeze=dir==='BUY'?x.price>mid+2*sd:x.price<mid-2*sd;

  const list=[
    {id:'technical',name:'Técnico principal',ok:technical,strength:clamp(Math.round(sc),0,100)},
    {id:'structure',name:'Estrutura / microtendência',ok:st,strength:st?100:0},
    {id:'volatility',name:'Volatilidade / Supersinal',ok:volatility,strength:volatility?100:0},
    {id:'squeeze',name:'Bollinger / Keltner',ok:squeeze,strength:squeeze?100:0},
    {id:'flow',name:'Volume / fluxo',ok:flow,strength:clamp((dir==='BUY'?buyFlow:sellFlow)*25,0,100)}
  ];

  const active=list.filter(m=>m.ok).map(m=>m.id);
  return {
    count:active.length,
    active,
    list,
    signature:list.map(m=>m.ok?'1':'0').join(''),
    direction:dir
  };
}

function fluctuation(x:any){
  let s=0,up=0,down=0;
  const add=(cond:boolean,w=1)=>{if(cond)s+=w};
  add(Math.abs(x.ret5)>=Math.max(.35,x.atrPct*.8),2);
  add(Math.abs(x.ret15)>=Math.max(.65,x.atrPct*1.35),2);
  add(x.vol>=1.6,2);
  add(Math.abs(x.flow)>=.08,1);
  add(Math.abs(x.book)>=.12,1);
  add(Math.abs(x.oiChange)>=.55,1);
  add(x.breakout20,2);
  [x.ret5,x.ret15,x.flow*100,x.book*100,x.oiChange]
    .forEach(v=>v>0?up++:v<0?down++:0);
  const dir=up>down?'UP':down>up?'DOWN':'MIXED';
  const level=s>=8?'EXTREMA':s>=6?'ALTA':s>=4?'ATENCAO':'NORMAL';
  return {score:s,level,dir};
}

async function load(sym:string,asset:string){
  const [k,t,o,p,h,depth] = await Promise.all([
    binanceSpot(`/api/v3/klines?symbol=${sym}&interval=5m&limit=220`),
    binanceSpot(`/api/v3/ticker/24hr?symbol=${sym}`),
    safeJson(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`,{}),
    safeJson(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`,{}),
    safeJson(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=5m&limit=30`,[]),
    binanceSpot(`/api/v3/depth?symbol=${sym}&limit=100`).catch(()=>({bids:[],asks:[]}))
  ]);
  // FUTURES VALIDATOR EXPERIMENTAL: dados USD-M, sem alterar motores oficiais.
  const [futOiH1,futTaker] = await Promise.all([
    safeJson(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=1h&limit=7`,[]),
    safeJson(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${sym}&period=1h&limit=3`,[])
  ]);

  if(!Array.isArray(k) || k.length < 25){
    throw new Error(`KLINES_INVALIDOS_${sym}`);
  }

  const c=k.map((a:any[])=>({
    t:+a[0],o:+a[1],h:+a[2],l:+a[3],c:+a[4],v:+a[5],tb:+a[9]
  }));

  const close=c.map((z:any)=>z.c);
  const last=c.at(-1);
  if(!last) throw new Error(`SEM_CANDLE_${sym}`);

  const v20=avg(c.slice(-21,-1).map((z:any)=>z.v));
  const fs=c.slice(-20);
  const flow=fs.reduce((z:number,x:any)=>z+(2*x.tb-x.v),0) /
    (fs.reduce((z:number,x:any)=>z+x.v,0)||1);

  const oi0=+h?.[0]?.sumOpenInterest;
  const oi1=+h?.at?.(-1)?.sumOpenInterest;
  const oiChange=h?.length>1&&oi0?((oi1-oi0)/oi0)*100:0;

  const bv=(depth.bids||[]).reduce((z:number,a:any[])=>z+(+a[1]),0);
  const av=(depth.asks||[]).reduce((z:number,a:any[])=>z+(+a[1]),0);

  const trs=c.slice(-15).map((z:any,i:number,a:any[])=>
    i?Math.max(z.h-z.l,Math.abs(z.h-a[i-1].c),Math.abs(z.l-a[i-1].c)):z.h-z.l
  );
  const atr=avg(trs.slice(1));
  const hi20=Math.max(...c.slice(-21,-1).map((z:any)=>z.h));
  const lo20=Math.min(...c.slice(-21,-1).map((z:any)=>z.l));

  const x:any={
    sym,asset,
    price:+t.lastPrice||last.c,
    change:+t.priceChangePercent||0,
    rsi:rsi(close),
    cci:cci(c),
    macd:macd(close),
    vwap:vwap(c.slice(-80)),
    vol:last.v/(v20||last.v||1),
    flow,
    oi:+o.openInterest||0,
    oiChange,
    funding:(+p.lastFundingRate||0)*100,
    book:(bv-av)/(bv+av||1),
    candles:c,
    ret5:pct(c.at(-2)?.c??last.c,last.c),
    ret15:pct(c.at(-4)?.c??last.c,last.c),
    ret30:pct(c.at(-7)?.c??last.c,last.c),
    atrPct:last.c?atr/last.c*100:0,
    breakout20:last.c>hi20||last.c<lo20
  };

  // PRE-LEG FUTURES / validação derivativa em shadow mode.
  const foi0=+(futOiH1?.[0]?.sumOpenInterestValue||futOiH1?.[0]?.sumOpenInterest||0);
  const foi1=+(futOiH1?.at?.(-1)?.sumOpenInterestValue||futOiH1?.at?.(-1)?.sumOpenInterest||0);
  const futuresOiChangePct=foi0?((foi1-foi0)/foi0)*100:0;
  const ft=futTaker?.at?.(-1)||{};
  const fbuy=+ft.buyVol||0, fsell=+ft.sellVol||0;
  const futuresTakerImbalance=(fbuy+fsell)?(fbuy-fsell)/(fbuy+fsell):0;
  const futuresAvailable=!!(futOiH1?.length||futTaker?.length);
  let futuresScore:number|null=null;
  if(futuresAvailable){
    let fs=0;
    fs += futuresOiChangePct>=3?30:futuresOiChangePct>=1?22:futuresOiChangePct>=.25?12:futuresOiChangePct< -2?-12:0;
    fs += futuresTakerImbalance>=.12?25:futuresTakerImbalance>=.05?18:futuresTakerImbalance>0?8:futuresTakerImbalance<=-.12?-18:futuresTakerImbalance<0?-8:0;
    fs += Math.abs(x.funding)<=.03?20:Math.abs(x.funding)<=.06?12:Math.abs(x.funding)<=.10?4:-15;
    futuresScore=clamp(Math.round(fs),0,75);
  }
  x.futuresExperimental={
    version:'pre-leg-futures-v1',available:futuresAvailable,
    oiChangePct:futuresAvailable?futuresOiChangePct:null,
    takerBuySellRatio:futTaker?.length?(+ft.buySellRatio||0):null,
    takerImbalance:futTaker?.length?futuresTakerImbalance:null,
    fundingPct:futuresAvailable?x.funding:null,score:futuresScore,
    phase:!futuresAvailable?'DADOS INDISPONÍVEIS':futuresScore!>=60?'CONFIRMAÇÃO FORTE':futuresScore!>=48?'CONFIRMAÇÃO':futuresScore!>=35?'PARCIAL':'SEM CONFIRMAÇÃO',
    source:'binance-usdm',shadowMode:true
  };

  const s=score(x);
  const fp=motorFingerprint(x,s.dir,s.score);
  const m=fp.count;
  const tier=m>=4?'confirmed':m>=3?'strong':m>=2?'initial':m===1?'watch':'none';

  return {
    ...x,
    direction:s.dir,
    score:s.score,
    motors:m,
    tier,
    fluctuation:fluctuation(x),
    motorFingerprint:fp
  };
}


function seriesRsi(c:any[],p=7,lookback=4){
  const out:number[]=[];
  for(let i=Math.max(p+1,c.length-lookback);i<=c.length;i++){
    out.push(rsi(c.slice(0,i).map((z:any)=>z.c),p));
  }
  return out;
}

function seriesCci(c:any[],p=14,lookback=4){
  const out:number[]=[];
  for(let i=Math.max(p,c.length-lookback);i<=c.length;i++){
    out.push(cci(c.slice(0,i),p));
  }
  return out;
}

function seriesMacd(c:any[],lookback=4){
  const out:number[]=[];
  for(let i=Math.max(35,c.length-lookback);i<=c.length;i++){
    out.push(macd(c.slice(0,i).map((z:any)=>z.c)));
  }
  return out;
}

function slope(a:number[]){
  if(a.length<2)return 0;
  return (a.at(-1)!-a[0])/(a.length-1);
}

function preSignalObservation(x:any){
  const c=x.candles;
  const close=c.map((z:any)=>z.c);
  const last=c.at(-1);

  const rs=seriesRsi(c);
  const cs=seriesCci(c);
  const ms=seriesMacd(c);

  const atrPctAt=(end:number)=>{
    const q=c.slice(0,end).slice(-15);
    if(q.length<3)return 0;
    const tr=q.map((z:any,i:number,a:any[])=>
      i?Math.max(z.h-z.l,Math.abs(z.h-a[i-1].c),Math.abs(z.l-a[i-1].c)):z.h-z.l
    );
    const at=avg(tr.slice(1));
    return q.at(-1).c ? at/q.at(-1).c*100 : 0;
  };
  const atrNow=atrPctAt(c.length);
  const atrPrev=atrPctAt(c.length-3);
  const atrSlope=atrNow-atrPrev;

  const bwAt=(end:number)=>{
    const w=close.slice(0,end).slice(-20);
    if(w.length<20)return 0;
    const mid=avg(w);
    const sd=Math.sqrt(avg(w.map((n:number)=>(n-mid)**2)));
    return mid ? (4*sd/mid)*100 : 0;
  };
  const bw=bwAt(close.length);
  const bwPrev=bwAt(close.length-3);
  const bwSlope=bw-bwPrev;

  const volNow=avg(c.slice(-3).map((z:any)=>z.v));
  const volPrev=avg(c.slice(-6,-3).map((z:any)=>z.v));
  const volumeAcceleration=volPrev ? (volNow-volPrev)/volPrev : 0;

  const flowOf=(q:any[])=>{
    const den=q.reduce((s:number,z:any)=>s+z.v,0)||1;
    return q.reduce((s:number,z:any)=>s+(2*z.tb-z.v),0)/den;
  };
  const flowNow=flowOf(c.slice(-4));
  const flowPrev=flowOf(c.slice(-8,-4));
  const flowAcceleration=flowNow-flowPrev;

  const vw=x.vwap||last.c;
  const hi20=Math.max(...c.slice(-21,-1).map((z:any)=>z.h));
  const lo20=Math.min(...c.slice(-21,-1).map((z:any)=>z.l));

  let buy=0,sell=0;
  const add=(w:number,d:number)=>d>0?buy+=w:d<0?sell+=w:0;

  add(14,slope(rs));
  add(10,slope(cs));
  add(16,slope(ms));
  add(14,flowAcceleration);
  add(10,volumeAcceleration);
  add(10,x.oiChange);
  add(10,x.book);

  // Compressão recebe pontos para ambos os lados; a direção vem de momentum/fluxo.
  if(bwSlope<0){buy+=5;sell+=5}
  if(atrSlope<0){buy+=3;sell+=3}

  // Proximidade de VWAP: observacional, sem exigir rompimento.
  const distVwap=pct(vw,x.price);
  if(Math.abs(distVwap)<Math.max(.15,x.atrPct*.7)){buy+=3;sell+=3}

  buy=clamp(Math.round(buy),0,100);
  sell=clamp(Math.round(sell),0,100);
  const preDirection=Math.abs(buy-sell)<8?'NEUTRAL':buy>sell?'BUY':'SELL';

  return {
    direction_hint:preDirection,
    price:x.price,
    rsi:x.rsi,
    rsi_slope:slope(rs),
    cci:x.cci,
    cci_slope:slope(cs),
    macd:x.macd,
    macd_slope:slope(ms),
    atr_pct:x.atrPct,
    atr_slope:atrSlope,
    bollinger_width:bw,
    bollinger_width_slope:bwSlope,
    volume_ratio:x.vol,
    volume_acceleration:volumeAcceleration,
    taker_flow:x.flow,
    flow_acceleration:flowAcceleration,
    oi_change:x.oiChange,
    oi_acceleration:null,
    book_imbalance:x.book,
    book_change:null,
    vwap:vw,
    distance_vwap_pct:distVwap,
    distance_high20_pct:pct(x.price,hi20),
    distance_low20_pct:pct(lo20,x.price),
    ret5:x.ret5,
    ret15:x.ret15,
    ret30:x.ret30,
    pre_buy_score:buy,
    pre_sell_score:sell,
    pre_direction:preDirection,
    official_direction:x.direction,
    official_score:x.score,
    official_motor_count:x.motors,
    official_tier:x.tier,
    source:'pre-signal-observer-v1'
  };
}

async function savePreSignal(x:any,observedAt:string,pendingRows:any[],episodeId:string|null=null){
  pendingRows.push({observed_at:observedAt,market:'crypto',asset:x.sym,episode_id:episodeId,...preSignalObservation(x)});
}


// ============================================================
// WHALE IGNITION OBSERVER V1 — SHADOW MODE ONLY
// Não altera score, direção, motores, tier, OPEN/CLOSED ou histórico oficial.
// Thresholds congelados após teste de robustez em 2026-08-30.
// ============================================================
const WHALE_IGNITION_V1 = {
  absorptionWindowMs: 2 * 60 * 60 * 1000,
  evaluationWindowMs: 24 * 60 * 60 * 1000,
  absorptionCooldownMs: 60 * 60 * 1000,
  ignition: {
    oiChange: 0.40,
    atrSlope: 0.02,
    bollingerWidthSlope: 0.40
  }
};

function whaleAbsorptionV1(obs:any){
  return (
    obs?.rsi < 30 &&
    obs?.book_imbalance > 0 &&
    obs?.taker_flow < 0 &&
    obs?.atr_slope > 0 &&
    obs?.bollinger_width_slope > 0
  );
}

function whaleIgnitionV1(obs:any){
  return (
    obs?.oi_change >= WHALE_IGNITION_V1.ignition.oiChange &&
    obs?.atr_slope >= WHALE_IGNITION_V1.ignition.atrSlope &&
    obs?.bollinger_width_slope >= WHALE_IGNITION_V1.ignition.bollingerWidthSlope
  );
}

async function whaleObserverPostEvent(url:string,H:any,payload:any){
  const r=await fetch(`${url}/rest/v1/ep_whale_ignition_events`,{
    method:'POST',
    headers:H,
    body:JSON.stringify(payload)
  });
  if(!r.ok){
    throw new Error(`WHALE_EVENT_${r.status} :: ${await r.text()}`);
  }
}

async function whaleObserverUpsertState(payload:any,pendingRows:any[]){
  pendingRows.push(payload);
}

async function runWhaleIgnitionObserverV1(url:string,H:any,x:any,observedAt:string,pendingStates:any[],stateMap:Map<string,any>){
  const obs=preSignalObservation(x);
  const now=new Date(observedAt).getTime();

  const old=stateMap.get(x.sym)||null;

  let phase=old?.phase||'idle';
  let episodeId=old?.episode_id||null;
  let absorptionAt=old?.absorption_at||null;
  let absorptionPrice=old?.absorption_price?+old.absorption_price:null;
  let ignitionAt=old?.ignition_at||null;
  let ignitionPrice=old?.ignition_price?+old.ignition_price:null;
  let maxFav=old?.max_favorable_pct==null?0:+old.max_favorable_pct;
  let maxAdv=old?.max_adverse_pct==null?0:+old.max_adverse_pct;
  let hit1=!!old?.hit_1pct;
  let hit3=!!old?.hit_3pct;
  let hit5=!!old?.hit_5pct;
  let hit10=!!old?.hit_10pct;
  let hitMinus05=!!old?.hit_minus_05pct;
  let hitMinus1=!!old?.hit_minus_1pct;
  let hitMinus2=!!old?.hit_minus_2pct;
  const lastAbsorptionAt=old?.last_absorption_at||null;

  const absorptionNow=whaleAbsorptionV1(obs);
  const ignitionNow=whaleIgnitionV1(obs);

  // 1) Expira absorção que não virou ignição em até 2h.
  if(phase==='absorption' && absorptionAt){
    const age=now-new Date(absorptionAt).getTime();
    if(age>WHALE_IGNITION_V1.absorptionWindowMs){
      await whaleObserverPostEvent(url,H,{
        episode_id:episodeId,
        market:'crypto',asset:x.sym,event_type:'EXPIRED_NO_IGNITION',
        observed_at:observedAt,price:x.price,
        absorption_at:absorptionAt,absorption_price:absorptionPrice,
        official_direction:x.direction,official_score:x.score,
        official_motor_count:x.motors,official_tier:x.tier,
        metrics:{obs,thresholds:WHALE_IGNITION_V1,shadow_mode:true},
        source:'whale-ignition-observer-v1'
      });
      phase='idle';
      episodeId=null;
      absorptionAt=null;
      absorptionPrice=null;
      ignitionAt=null;
      ignitionPrice=null;
      maxFav=0;maxAdv=0;
      hit1=hit3=hit5=hit10=false;
      hitMinus05=hitMinus1=hitMinus2=false;
    }
  }

  // 2) Inicia episódio de absorção. Cooldown de 60m evita repetição excessiva.
  if(phase==='idle' && absorptionNow){
    const cooldownOk=!lastAbsorptionAt ||
      now-new Date(lastAbsorptionAt).getTime()>=WHALE_IGNITION_V1.absorptionCooldownMs;
    if(cooldownOk){
      episodeId=`${x.sym}-${observedAt}`;
      absorptionAt=observedAt;
      absorptionPrice=x.price;
      phase='absorption';
      maxFav=0;maxAdv=0;
      hit1=hit3=hit5=hit10=false;
      hitMinus05=hitMinus1=hitMinus2=false;

      await whaleObserverPostEvent(url,H,{
        episode_id:episodeId,
        market:'crypto',asset:x.sym,event_type:'ABSORPTION',
        observed_at:observedAt,price:x.price,
        absorption_at:absorptionAt,absorption_price:absorptionPrice,
        official_direction:x.direction,official_score:x.score,
        official_motor_count:x.motors,official_tier:x.tier,
        metrics:{obs,thresholds:WHALE_IGNITION_V1,shadow_mode:true},
        source:'whale-ignition-observer-v1'
      });
    }
  }

  // 3) Dentro da janela de 2h, detecta a ignição congelada.
  if(phase==='absorption' && absorptionAt && ignitionNow){
    const age=now-new Date(absorptionAt).getTime();
    if(age<=WHALE_IGNITION_V1.absorptionWindowMs){
      phase='ignition';
      ignitionAt=observedAt;
      ignitionPrice=x.price;
      const fromAbs=absorptionPrice?pct(absorptionPrice,x.price):null;

      await whaleObserverPostEvent(url,H,{
        episode_id:episodeId,
        market:'crypto',asset:x.sym,event_type:'IGNITION',
        observed_at:observedAt,price:x.price,
        absorption_at:absorptionAt,absorption_price:absorptionPrice,
        ignition_at:ignitionAt,ignition_price:ignitionPrice,
        return_from_absorption_pct:fromAbs,
        official_direction:x.direction,official_score:x.score,
        official_motor_count:x.motors,official_tier:x.tier,
        metrics:{obs,thresholds:WHALE_IGNITION_V1,shadow_mode:true},
        source:'whale-ignition-observer-v1'
      });
    }
  }

  // 4) Após ignição, acompanha 24h a partir da absorção.
  if(phase==='ignition' && absorptionAt && absorptionPrice){
    const ret=pct(absorptionPrice,x.price);
    maxFav=Math.max(maxFav,ret);
    maxAdv=Math.min(maxAdv,ret);
    hit1=hit1||ret>=1;
    hit3=hit3||ret>=3;
    hit5=hit5||ret>=5;
    hit10=hit10||ret>=10;
    hitMinus05=hitMinus05||ret<=-0.5;
    hitMinus1=hitMinus1||ret<=-1;
    hitMinus2=hitMinus2||ret<=-2;

    const age=now-new Date(absorptionAt).getTime();
    if(age>=WHALE_IGNITION_V1.evaluationWindowMs){
      await whaleObserverPostEvent(url,H,{
        episode_id:episodeId,
        market:'crypto',asset:x.sym,event_type:'EVALUATED_24H',
        observed_at:observedAt,price:x.price,
        absorption_at:absorptionAt,absorption_price:absorptionPrice,
        ignition_at:ignitionAt,ignition_price:ignitionPrice,
        max_favorable_pct:maxFav,max_adverse_pct:maxAdv,
        hit_1pct:hit1,hit_3pct:hit3,hit_5pct:hit5,hit_10pct:hit10,
        hit_minus_05pct:hitMinus05,hit_minus_1pct:hitMinus1,hit_minus_2pct:hitMinus2,
        official_direction:x.direction,official_score:x.score,
        official_motor_count:x.motors,official_tier:x.tier,
        metrics:{obs,thresholds:WHALE_IGNITION_V1,shadow_mode:true},
        source:'whale-ignition-observer-v1'
      });
      phase='idle';
      episodeId=null;
      absorptionAt=null;
      absorptionPrice=null;
      ignitionAt=null;
      ignitionPrice=null;
    }
  }

  await whaleObserverUpsertState({
    market:'crypto',
    asset:x.sym,
    phase,
    episode_id:episodeId,
    absorption_at:absorptionAt,
    absorption_price:absorptionPrice,
    ignition_at:ignitionAt,
    ignition_price:ignitionPrice,
    last_absorption_at:absorptionAt||lastAbsorptionAt,
    max_favorable_pct:maxFav,
    max_adverse_pct:maxAdv,
    hit_1pct:hit1,
    hit_3pct:hit3,
    hit_5pct:hit5,
    hit_10pct:hit10,
    hit_minus_05pct:hitMinus05,
    hit_minus_1pct:hitMinus1,
    hit_minus_2pct:hitMinus2,
    updated_at:observedAt,
    metrics:{
      current:obs,
      thresholds:WHALE_IGNITION_V1,
      absorption_now:absorptionNow,
      ignition_now:ignitionNow,
      shadow_mode:true
    }
  },pendingStates);
}

// ============================================================
// SHADOW V3 — TESTE DE SINAIS COMPLEMENTARES
// Camada estritamente observacional. Não altera score, direção,
// motorFingerprint, quantidade de motores, tier ou eventos oficiais.
// ============================================================
const SHADOW_V3 = {
  version:'shadow-v3.3-ema-stack-80',
  minDirectionalGap:15,
  minimumActiveSignals:2
};

function shadowBollingerWidth(c:any[],end=c.length){
  const w=c.slice(0,end).slice(-20).map((z:any)=>z.c);
  if(w.length<20)return 0;
  const mid=avg(w);
  const sd=Math.sqrt(avg(w.map((n:number)=>(n-mid)**2)));
  return mid ? 4*sd/mid*100 : 0;
}

function shadowAtrPct(c:any[],end=c.length){
  const q=c.slice(0,end).slice(-15);
  if(q.length<3)return 0;
  const tr=q.map((z:any,i:number,a:any[])=>
    i?Math.max(z.h-z.l,Math.abs(z.h-a[i-1].c),Math.abs(z.l-a[i-1].c)):z.h-z.l
  );
  const at=avg(tr.slice(1));
  return q.at(-1)?.c ? at/q.at(-1).c*100 : 0;
}

function shadowTrend(c:any[],bars:number){
  const q=c.slice(-bars).map((z:any)=>z.c);
  if(q.length<6)return 0;
  const baseline=avg(q);
  const slope=q.at(-1)!-q[Math.max(0,q.length-4)];
  const location=q.at(-1)!-baseline;
  return Math.sign(slope)*Math.abs(slope/(baseline||1))*100+
    Math.sign(location)*Math.abs(location/(baseline||1))*100;
}

function shadowV3Signals(x:any){
  const c=x.candles;
  const last=c.at(-1);
  const previous=c.at(-2);
  const candidates:any[]=[];
  const add=(id:string,name:string,direction:string,active:boolean,strength:number,details:any={})=>
    candidates.push({id,name,direction,active,strength:clamp(Math.round(strength),0,100),details});

  const bookDirection=x.book>.12?'BUY':x.book<-.12?'SELL':'NEUTRAL';
  add('book_imbalance','Desequilíbrio do livro',bookDirection,bookDirection!=='NEUTRAL',
    Math.abs(x.book)*300,{book:x.book,threshold:.12});

  const flowDirection=x.flow>.08?'BUY':x.flow<-.08?'SELL':'NEUTRAL';
  add('aggressive_flow','Fluxo agressor / CVD',flowDirection,flowDirection!=='NEUTRAL',
    Math.abs(x.flow)*300,{flow:x.flow,threshold:.08});

  const oiDirection=x.oiChange>=.4&&x.ret30>=.2?'BUY':
    x.oiChange>=.4&&x.ret30<=-.2?'SELL':'NEUTRAL';
  add('oi_price_alignment','Preço + Open Interest',oiDirection,oiDirection!=='NEUTRAL',
    Math.abs(x.oiChange)*70+Math.abs(x.ret30)*30,{oiChange:x.oiChange,ret30:x.ret30});

  const fundingDirection=x.funding<=-.03&&x.flow>.04?'BUY':
    x.funding>=.03&&x.flow<-.04?'SELL':'NEUTRAL';
  add('funding_extreme','Funding extremo com fluxo contrário',fundingDirection,
    fundingDirection!=='NEUTRAL',Math.abs(x.funding)*700+Math.abs(x.flow)*150,
    {funding:x.funding,flow:x.flow});

  // Pilha experimental EMA 20/30/50/60/200.
  // Não altera o MACD nem qualquer um dos cinco motores oficiais.
  const closes=c.map((z:any)=>z.c);
  const emaLast=(period:number,end=closes.length)=>{
    const q=ema(closes.slice(0,end),period);
    return q.at(-1)??last.c;
  };
  const e20=emaLast(20),e30=emaLast(30),e50=emaLast(50),e200=emaLast(200);
  const e20Prev=emaLast(20,closes.length-3);
  const e30Prev=emaLast(30,closes.length-3);
  const e50Prev=emaLast(50,closes.length-3);
  const macdLine=e20-e30;
  const macdSeries=closes.map((_,i)=>{
    const q=closes.slice(0,i+1);
    const a=ema(q,20).at(-1)??q.at(-1)??0;
    const b=ema(q,30).at(-1)??q.at(-1)??0;
    return a-b;
  });
  const macdSignal=ema(macdSeries,60).at(-1)??0;
  let emaBuy=0,emaSell=0;
  if(e20>e30)emaBuy+=20;else if(e20<e30)emaSell+=20;
  if(e30>e50)emaBuy+=20;else if(e30<e50)emaSell+=20;
  if(last.c>e200)emaBuy+=25;else if(last.c<e200)emaSell+=25;
  const rising=e20>e20Prev&&e30>e30Prev&&e50>e50Prev;
  const falling=e20<e20Prev&&e30<e30Prev&&e50<e50Prev;
  if(rising)emaBuy+=15;else if(falling)emaSell+=15;
  if(macdLine>macdSignal)emaBuy+=20;else if(macdLine<macdSignal)emaSell+=20;
  const emaDirection=Math.max(emaBuy,emaSell)>=80
    ? emaBuy>emaSell?'BUY':emaSell>emaBuy?'SELL':'NEUTRAL'
    : 'NEUTRAL';
  add('ema_stack_20_30_50_60_200','EMAs 20/30/50/200 + MACD sinal 60',
    emaDirection,emaDirection!=='NEUTRAL',Math.max(emaBuy,emaSell),
    {ema20:e20,ema30:e30,ema50:e50,ema200:e200,macdLine,macdSignal,
     rising,falling,buyScore:emaBuy,sellScore:emaSell,activationScore:80});

  const bwNow=shadowBollingerWidth(c);
  const bwPrev=shadowBollingerWidth(c,c.length-3);
  const atrNow=shadowAtrPct(c);
  const atrPrev=shadowAtrPct(c,c.length-3);
  const expansion=bwPrev>0&&atrPrev>0&&bwNow>=bwPrev*1.12&&atrNow>=atrPrev*1.08&&x.vol>=1.2;
  const expansionDirection=expansion?(x.ret15>=0?'BUY':'SELL'):'NEUTRAL';
  add('volatility_release','Liberação de compressão',expansionDirection,expansion,
    (bwNow/(bwPrev||bwNow||1)-1)*250+(atrNow/(atrPrev||atrNow||1)-1)*250+x.vol*15,
    {bwNow,bwPrev,atrNow,atrPrev,volumeRatio:x.vol});

  const prior=c.slice(-26,-6);
  const recent=c.slice(-6);
  const priorHigh=Math.max(...prior.map((z:any)=>z.h));
  const priorLow=Math.min(...prior.map((z:any)=>z.l));
  const brokeHigh=recent.slice(0,-1).some((z:any)=>z.h>priorHigh);
  const brokeLow=recent.slice(0,-1).some((z:any)=>z.l<priorLow);
  const tolerance=(last.c*atrNow/100)*.45;
  const retestBuy=brokeHigh&&last.l<=priorHigh+tolerance&&last.c>priorHigh&&x.flow>=0;
  const retestSell=brokeLow&&last.h>=priorLow-tolerance&&last.c<priorLow&&x.flow<=0;
  const retestDirection=retestBuy?'BUY':retestSell?'SELL':'NEUTRAL';
  add('breakout_retest','Rompimento com reteste',retestDirection,retestDirection!=='NEUTRAL',
    65+Math.abs(x.flow)*120,{priorHigh,priorLow,tolerance,flow:x.flow});

  const crossedUp=previous.c<=x.vwap&&last.c>x.vwap&&x.vol>=1;
  const crossedDown=previous.c>=x.vwap&&last.c<x.vwap&&x.vol>=1;
  const vwapDirection=crossedUp?'BUY':crossedDown?'SELL':'NEUTRAL';
  add('vwap_reclaim','Retomada/rejeição da VWAP',vwapDirection,vwapDirection!=='NEUTRAL',
    55+x.vol*15+Math.abs(x.flow)*100,{vwap:x.vwap,volumeRatio:x.vol,flow:x.flow});

  const move=Math.abs(x.ret5);
  const absorptionBuy=x.flow<-.10&&x.book>.08&&move<=Math.max(.18,atrNow*.45);
  const absorptionSell=x.flow>.10&&x.book<-.08&&move<=Math.max(.18,atrNow*.45);
  const absorptionDirection=absorptionBuy?'BUY':absorptionSell?'SELL':'NEUTRAL';
  add('absorption','Absorção de agressão',absorptionDirection,absorptionDirection!=='NEUTRAL',
    Math.abs(x.flow)*220+Math.abs(x.book)*180,{flow:x.flow,book:x.book,ret5:x.ret5,atrPct:atrNow});

  const trend5=shadowTrend(c,24);
  const trend15=shadowTrend(c,72);
  const trend1h=shadowTrend(c,216);
  const mtfBuy=trend5>0&&trend15>0&&trend1h>0;
  const mtfSell=trend5<0&&trend15<0&&trend1h<0;
  const mtfDirection=mtfBuy?'BUY':mtfSell?'SELL':'NEUTRAL';
  add('multi_timeframe','Alinhamento M5–M15–H1',mtfDirection,mtfDirection!=='NEUTRAL',
    (Math.abs(trend5)+Math.abs(trend15)+Math.abs(trend1h))*120,
    {trend5,trend15,trend1h});

  const donchianDirection=x.breakout20?(last.c>priorHigh?'BUY':last.c<priorLow?'SELL':'NEUTRAL'):'NEUTRAL';
  const donchianConfirmed=donchianDirection!=='NEUTRAL'&&x.vol>=1.2&&
    (donchianDirection==='BUY'?x.flow>.04:x.flow<-.04);
  add('donchian_confirmed','Rompimento Donchian confirmado',donchianDirection,
    donchianConfirmed,60+x.vol*15+Math.abs(x.flow)*100,
    {breakout20:x.breakout20,volumeRatio:x.vol,flow:x.flow});

  const active=candidates.filter(s=>s.active);
  const buy=active.filter(s=>s.direction==='BUY').reduce((z,s)=>z+s.strength,0);
  const sell=active.filter(s=>s.direction==='SELL').reduce((z,s)=>z+s.strength,0);
  const gap=Math.abs(buy-sell);
  const direction=active.length>=SHADOW_V3.minimumActiveSignals&&gap>=SHADOW_V3.minDirectionalGap
    ? buy>sell?'BUY':'SELL'
    : 'NEUTRAL';
  const score=active.length
    ? clamp(Math.round(Math.max(buy,sell)/active.length),0,100)
    : 0;

  return {version:SHADOW_V3.version,direction,score,activeCount:active.length,buy,sell,signals:candidates};
}

async function saveShadowV3(x:any,observedAt:string,pendingRows:any[],episodeId:string|null=null){
  const result=shadowV3Signals(x);
  const candleTime=new Date(x.candles.at(-1).t).toISOString();
  const payload={
    observed_at:observedAt,candle_time:candleTime,market:'crypto',asset:x.sym,episode_id:episodeId,price:x.price,
    experimental_direction:result.direction,experimental_score:result.score,
    active_signal_count:result.activeCount,signals:result.signals,
    official_direction:x.direction,official_score:x.score,
    official_motor_count:x.motors,official_tier:x.tier,
    metrics:{buy:result.buy,sell:result.sell,shadow_mode:true,official_unchanged:true},
    source:result.version
  };
  pendingRows.push(payload);
}


/* EARLY LEG V2 BACKEND — observacional. Não altera motores oficiais. */
function earlyLegMacd(c:any[]){
  const v=c.map((z:any)=>z.c),e12=ema(v,12),e26=ema(v,26);
  const line=v.map((_:any,i:number)=>(e12[i]??0)-(e26[i]??0)),sig=ema(line,9);
  const h=line.map((z:number,i:number)=>z-(sig[i]??0));
  return {h:h.at(-1)||0,accel:(h.at(-1)||0)-(h.at(-2)||0)};
}
function earlyLegAtr(c:any[],p=14){
  if(c.length<p+1)return 0;const tr:number[]=[];
  for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c)));
  return avg(tr.slice(-p));
}
function earlyLegAnalyze(x:any,old:any){
  const c=(x.candles||[]).slice(-80);if(c.length<30)return null;
  const p=+x.price||c.at(-1).c,last=c.at(-1),prior=c.slice(-31,-3),recent=c.slice(-6);
  const resistance=Math.max(...prior.map((z:any)=>z.h)),support=Math.min(...prior.map((z:any)=>z.l));
  const a=earlyLegAtr(c),atrPct=p?a/p*100:0;
  const range20=(Math.max(...c.slice(-20).map((z:any)=>z.h))-Math.min(...c.slice(-20).map((z:any)=>z.l)))/p*100;
  const ranges=c.slice(-20).map((z:any)=>(z.h-z.l)/(z.c||1)*100);
  const compression=avg(ranges.slice(-5))/(avg(ranges.slice(0,15))||1);
  const vBase=avg(c.slice(-26,-6).map((z:any)=>z.v)),vRecent=avg(recent.map((z:any)=>z.v)),volRatio=vBase?vRecent/vBase:1;
  const flow=+x.flow||0,oi=+x.oiChange||0,book=+x.book||0,vw=+x.vwap||0,m=earlyLegMacd(c);
  const r3=pct(c.at(-4).c,p),r6=pct(c.at(-7).c,p);
  const distR=pct(p,resistance),distS=pct(support,p);
  const nearR=Math.abs(distR)<=Math.max(.45,atrPct*.8),nearS=Math.abs(distS)<=Math.max(.45,atrPct*.8);
  const attacksR=c.slice(-16).filter((z:any)=>Math.abs(pct(z.h,resistance))<=Math.max(.35,atrPct*.65)).length;
  const attacksS=c.slice(-16).filter((z:any)=>Math.abs(pct(support,z.l))<=Math.max(.35,atrPct*.65)).length;
  const lows=recent.map((z:any)=>z.l),highs=recent.map((z:any)=>z.h);
  const higherLows=lows.slice(1).filter((v:number,i:number)=>v>=lows[i]).length;
  const lowerHighs=highs.slice(1).filter((v:number,i:number)=>v<=highs[i]).length;
  const bull=(flow>.02?18:0)+(book>.05?14:0)+(oi>.15?10:0)+(volRatio>1.15?10:0)+(p>vw?8:0)+(m.h>0?8:0)+(m.accel>0?8:0)+(higherLows>=3?12:0)+(r3>0?6:0);
  const bear=(flow<-.02?18:0)+(book<-.05?14:0)+(oi>.15?10:0)+(volRatio>1.15?10:0)+(p<vw?8:0)+(m.h<0?8:0)+(m.accel<0?8:0)+(lowerHighs>=3?12:0)+(r3<0?6:0);
  const dir=bull>=bear?'BUY':'SELL',pressure=Math.max(bull,bear),dist=dir==='BUY'?distR:distS,attacks=dir==='BUY'?attacksR:attacksS;
  const broke=dir==='BUY'?p>resistance:p<support,breakPct=dir==='BUY'?pct(resistance,p):pct(p,support);
  const accepted=dir==='BUY'?c.slice(-2).every((z:any)=>z.c>resistance):c.slice(-2).every((z:any)=>z.c<support);
  const rejection=dir==='BUY'?(last.h-last.c)/(last.h-last.l||1):(last.c-last.l)/(last.h-last.l||1);
  const stretched=Math.abs(r6)>=Math.max(3,atrPct*4),priorState=old?.direction===dir?old?.phase:null;
  let phase='COMPRESSÃO';
  if(compression<=.78&&range20<Math.max(5,atrPct*8))phase='COMPRESSÃO';
  if(phase==='COMPRESSÃO'&&((dir==='BUY'&&higherLows>=3)||(dir==='SELL'&&lowerHighs>=3))&&volRatio<1.25)phase='ABSORÇÃO';
  if(pressure>=38)phase='PRESSÃO';
  if(pressure>=52&&Math.abs(dist)<=Math.max(1.5,atrPct*2.2))phase='PRÉ-IGNIÇÃO';
  if(pressure>=58&&attacks>=2&&((dir==='BUY'&&nearR)||(dir==='SELL'&&nearS)))phase='ATAQUE À RESISTÊNCIA';
  if(broke&&breakPct>=0)phase='ROMPIMENTO';
  if(broke&&accepted&&volRatio>=1.05)phase='ACEITAÇÃO';
  if(accepted&&pressure>=65&&Math.abs(r3)>=Math.max(.6,atrPct*1.1))phase='ACELERAÇÃO';
  if(stretched&&(Math.abs(r6)>=4||(+x.rsi||0)>=78||(+x.rsi||0)<=22))phase='ESTICAMENTO';
  if((priorState==='ESTICAMENTO'||stretched)&&((volRatio<1&&rejection>.45)||(dir==='BUY'&&m.accel<0)||(dir==='SELL'&&m.accel>0)))phase='EXAUSTÃO';
  const level=dir==='BUY'?resistance:support,peak=Math.max(old?.direction===dir?+(old?.peak_price||p):p,p),trough=Math.min(old?.direction===dir?+(old?.trough_price||p):p,p);
  const retr=dir==='BUY'&&peak>level?-pct(peak,p):dir==='SELL'&&trough<level?pct(trough,p):0;
  const backNear=dir==='BUY'?Math.abs(pct(level,p))<=Math.max(.8,atrPct*1.4):Math.abs(pct(p,level))<=Math.max(.8,atrPct*1.4);
  if(['ESTICAMENTO','EXAUSTÃO','RETRAÇÃO'].includes(priorState)&&retr>Math.max(.5,atrPct))phase='RETRAÇÃO';
  if(['RETRAÇÃO','EXAUSTÃO'].includes(priorState)&&backNear)phase='RETESTE';
  const score=clamp(Math.round(pressure+(attacks>=2?8:0)+(Math.abs(dist)<=1?8:0)+(broke?10:0)+(accepted?8:0)-(stretched?8:0)),0,100);
  return {phase,dir,price:p,score,resistance,support,attacks,peak,trough,metrics:{dist,compression,volRatio,flow,oi,book,macdH:m.h,macdAccel:m.accel,r3,r6,atrPct,breakPct,accepted,futuresValidation:x.futuresExperimental||null}};
}
function earlyLegFetch(url:string,init:any={}){
  return fetch(url,{...init,signal:AbortSignal.timeout(5000)});
}
async function runEarlyLegV2(url:string,H:any,x:any,observedAt:string,pendingUpdates:any[],pendingEvents:any[],pendingStates:any[],stateMap:Map<string,any>,pendingEventsByAsset:Map<string,any[]>){
  const old=stateMap.get(x.sym)||null,r=earlyLegAnalyze(x,old);if(!r)return null;
  const now=new Date(observedAt).getTime();
  const priorId=old?.episode_id||null;
  const priorStarted=old?.episode_started_at||null;
  const priorStartedMs=priorStarted?new Date(priorStarted).getTime():0;
  const priorAgeMs=priorStartedMs?now-priorStartedMs:0;
  const directionChanged=!!priorId&&!!old?.direction&&old.direction!==r.dir;
  const cycleRestart=priorId&&old?.phase==='RETESTE'&&['COMPRESSÃO','ABSORÇÃO','PRESSÃO','PRÉ-IGNIÇÃO'].includes(r.phase);
  const expired=!!priorId&&priorAgeMs>=7*24*60*60*1000;
  const startsNew=!priorId||directionChanged||cycleRestart||expired;
  const episodeId=startsNew?('rep-v1:'+x.sym+':'+crypto.randomUUID()):priorId;
  const episodeStartedAt=startsNew?observedAt:priorStarted||observedAt;
  const episodeEntryPrice=startsNew?r.price:(old?.episode_entry_price==null?r.price:+old.episode_entry_price);
  if(!old||old.phase!==r.phase||old.direction!==r.dir||startsNew){
    pendingEvents.push({
      observed_at:observedAt,market:'crypto',asset:x.sym,direction:r.dir,from_phase:old?.phase||null,phase:r.phase,
      entry_price:r.price,episode_id:episodeId,episode_started_at:episodeStartedAt,episode_entry_price:episodeEntryPrice,
      score:r.score,resistance:r.resistance,support:r.support,attacks:r.attacks,
      volume_ratio:r.metrics.volRatio,taker_flow:r.metrics.flow,oi_change:r.metrics.oi,book_imbalance:r.metrics.book,
      source:'early-leg-observer-v2-backend'
    });
  }
  const pending=pendingEventsByAsset.get(x.sym)||[];
  const horizons=[1,3,6,12,24];
  for(const e of pending||[]){
    const age=(now-new Date(e.observed_at).getTime())/36e5;
    const raw=pct(+e.entry_price,r.price),fav=e.direction==='SELL'?-raw:raw;
    const maxFav=Math.max(+e.max_favorable_pct||0,fav),maxAdv=Math.min(+e.max_adverse_pct||0,fav);
    const cp={...(e.checkpoints||{})};
    for(const h of horizons)if(age>=h&&!cp[String(h)])cp[String(h)]={hours:h,price:r.price,return_pct:fav,recorded_at:observedAt};
    const done=age>=24;
    const oldMaxFav=+e.max_favorable_pct||0,oldMaxAdv=+e.max_adverse_pct||0;
    const checkpointsChanged=JSON.stringify(cp)!==JSON.stringify(e.checkpoints||{});
    if(maxFav!==oldMaxFav||maxAdv!==oldMaxAdv||checkpointsChanged||done){
      pendingUpdates.push({id:e.id,max_favorable_pct:maxFav,max_adverse_pct:maxAdv,checkpoints:cp,completed_24h:done});
    }
  }
  const body={market:'crypto',asset:x.sym,phase:r.phase,direction:r.dir,price:r.price,score:r.score,resistance:r.resistance,support:r.support,attacks:r.attacks,peak_price:startsNew?r.price:r.peak,trough_price:startsNew?r.price:r.trough,episode_id:episodeId,episode_started_at:episodeStartedAt,episode_entry_price:episodeEntryPrice,updated_at:observedAt,metrics:r.metrics};
  pendingStates.push(body);
  return episodeId;
}
function historyFields(x:any){
  const list=x?.motorFingerprint?.list||[];
  const by=(id:string)=>list.find((m:any)=>m.id===id);
  return {
    motor_count:x?.motors??null,
    motor_technical:!!by('technical')?.ok,
    motor_structure:!!by('structure')?.ok,
    motor_volatility:!!by('volatility')?.ok,
    motor_squeeze:!!by('squeeze')?.ok,
    motor_flow:!!by('flow')?.ok,
    technical_score:by('technical')?.strength??null,
    structure_score:by('structure')?.strength??null,
    volatility_score:by('volatility')?.strength??null,
    squeeze_score:by('squeeze')?.strength??null,
    flow_score:by('flow')?.strength??null
  };
}

async function sendHistory(url:string,key:string,ingestKey:string,payload:any){
  if(!ingestKey)return;
  const send=async(body:any)=>{
    const r=await fetch(url+'/functions/v1/ep-signal-history/ingest',{
      method:'POST',
      headers:{
        'apikey':key,
        'Authorization':'Bearer '+key,
        'Content-Type':'application/json',
        'x-ep-history-key':ingestKey
      },
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(15000)
    });
    if(!r.ok){
      console.error('ep-signal-history',r.status,(await r.text()).slice(0,400));
      return false;
    }
    return true;
  };
  try{
    if(await send(payload))return;
  }catch(e){
    console.error('ep-signal-history',String(e));
  }
  if(Array.isArray(payload)&&payload.length>1){
    for(const row of payload){
      try{await send(row);}catch(e){console.error('ep-signal-history-row',String(e));}
    }
  }
}

async function fetchPendingEarlyEventsMap(url:string,H:any,assets:string[]){
  const map=new Map<string,any[]>();
  for(const asset of assets)map.set(asset,[]);
  if(!assets.length)return map;
  const batchUrl=new URL(`${url}/rest/v1/ep_early_leg_v2_events`);
  batchUrl.searchParams.set('select','asset,id,observed_at,entry_price,direction,max_favorable_pct,max_adverse_pct,checkpoints');
  batchUrl.searchParams.set('market','eq.crypto');
  batchUrl.searchParams.set('asset',`in.(${assets.map(encodeURIComponent).join(',')})`);
  batchUrl.searchParams.set('completed_24h','eq.false');
  batchUrl.searchParams.set('order','observed_at.asc');
  batchUrl.searchParams.set('limit',String(assets.length*40));
  const response=await fetch(batchUrl,{headers:H,signal:AbortSignal.timeout(5000)}).catch(()=>null);
  if(response?.ok){
    const rows=await response.json().catch(()=>[]);
    for(const row of rows||[]){
      const group=map.get(row.asset);
      if(group&&group.length<40)group.push(row);
    }
    return map;
  }
  console.error('EARLY_EVENTS_BATCH_READ_FAILED',response?.status||'timeout');
  const singles=await Promise.all(assets.map(async asset=>{
    const one=new URL(`${url}/rest/v1/ep_early_leg_v2_events`);
    one.searchParams.set('select','asset,id,observed_at,entry_price,direction,max_favorable_pct,max_adverse_pct,checkpoints');
    one.searchParams.set('market','eq.crypto');
    one.searchParams.set('asset',`eq.${encodeURIComponent(asset)}`);
    one.searchParams.set('completed_24h','eq.false');
    one.searchParams.set('order','observed_at.asc');
    one.searchParams.set('limit','40');
    const r=await fetch(one,{headers:H,signal:AbortSignal.timeout(5000)}).catch(()=>null);
    if(!r?.ok)return [asset,[]] as [string,any[]];
    return [asset,await r.json().catch(()=>[])] as [string,any[]];
  }));
  for(const [asset,rows] of singles)map.set(asset,rows);
  return map;
}

async function fetchStateMap(url:string,H:any,table:string,select:string,filterKey:string,values:string[],label:string){
  const map=new Map<string,any>();
  if(!values.length)return map;
  const fields=Array.from(new Set([filterKey,...select.split(',')])).join(',');
  const batchUrl=new URL(`${url}/rest/v1/${table}`);
  batchUrl.searchParams.set('select',fields);
  batchUrl.searchParams.set('market','eq.crypto');
  batchUrl.searchParams.set(filterKey,`in.(${values.map(encodeURIComponent).join(',')})`);
  const response=await fetch(batchUrl,{headers:H,signal:AbortSignal.timeout(5000)}).catch(()=>null);
  if(response?.ok){
    const rows=await response.json().catch(()=>[]);
    for(const row of rows||[])map.set(row[filterKey],row);
    return map;
  }
  console.error(label+'_BATCH_READ_FAILED',response?.status||'timeout');
  const singles=await Promise.all(values.map(async value=>{
    const one=new URL(`${url}/rest/v1/${table}`);
    one.searchParams.set('select',fields);
    one.searchParams.set('market','eq.crypto');
    one.searchParams.set(filterKey,`eq.${value}`);
    one.searchParams.set('limit','1');
    const r=await fetch(one,{headers:H,signal:AbortSignal.timeout(5000)}).catch(()=>null);
    if(!r?.ok)return null;
    return (await r.json().catch(()=>[]))?.[0]||null;
  }));
  for(const row of singles)if(row)map.set(row[filterKey],row);
  return map;
}

async function flushRestRows(url:string,H:any,path:string,rows:any[],prefer:string|null,label:string){
  if(!rows.length)return;
  const headers={...H,'Prefer':prefer?`${prefer},return=minimal`:'return=minimal'};
  const send=(payload:any)=>fetch(`${url}/rest/v1/${path}`,{
    method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
  });
  let response=await send(rows);
  if(response.ok)return;
  console.error(label+'_FAILED',response.status,(await response.text().catch(()=> '')).slice(0,400));
  response=await send(rows);
  if(response.ok)return;
  console.error(label+'_RETRY_FAILED',response.status,(await response.text().catch(()=> '')).slice(0,400));
  for(let i=0;i<rows.length;i+=10){
    const results=await Promise.all(rows.slice(i,i+10).map((row:any)=>send(row)));
    for(let j=0;j<results.length;j++)if(!results[j].ok){
      console.error(label+'_ROW_FAILED',results[j].status);
      await results[j].text().catch(()=> '');
    }
  }
}

Deno.serve(async(req)=>{
const internalKey=Deno.env.get('EP_INTERNAL_KEY')||'';
if(req.method!=='POST'||req.headers.get('x-ep-internal-key')!==internalKey)return new Response(JSON.stringify({ok:false,error:'unauthorized'}),{status:401,headers:{'content-type':'application/json'}});
  const url=Deno.env.get('SUPABASE_URL')!;
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const H={
    'apikey':key,
    'Authorization':`Bearer ${key}`,
    'Content-Type':'application/json'
  };

  // Fail fast if PostgREST cannot read its schema cache, avoiding a burst of doomed observer writes.
  let preflight:Response;
  try{
    preflight=await fetch(`${url}/rest/v1/ep_signal_state?select=market&limit=1`,{
      headers:H,signal:AbortSignal.timeout(3000)
    });
  }catch(e){
    console.error('DB_PREFLIGHT',String(e));
    return new Response(JSON.stringify({ok:false,status:'database_unavailable'}),{status:503,headers:{'content-type':'application/json'}});
  }
  if(!preflight.ok){
    const detail=await preflight.text();
    console.error('DB_PREFLIGHT',preflight.status,detail);
    return new Response(JSON.stringify({ok:false,status:'database_unavailable'}),{status:503,headers:{'content-type':'application/json'}});
  }

  const run=await fetch(`${url}/rest/v1/ep_backend_runs?select=id`,{
    method:'POST',
    headers:{...H,'Prefer':'return=representation'},
    body:JSON.stringify({status:'running'})
  }).then(r=>r.json());

  const runId=run?.[0]?.id;
  let ok=0,err=0;
  const errors:any[]=[];
  const pendingEarlyLegUpdates:any[]=[];
  const episodeSamples:any[]=[];
  const pendingPreSignalRows:any[]=[];
  const pendingEarlyLegEvents:any[]=[];
  const pendingEarlyLegStateRows:any[]=[];
  const pendingWhaleStateRows:any[]=[];
  const pendingShadowRows:any[]=[];
  const pendingSignalStateRows:any[]=[];
  const pendingSignalEvents:any[]=[];
  const pendingHistoryRows:any[]=[];

  const allSymbols=PAIRS.map(([sym])=>sym);
    const [signalStateMap,whaleStateMap,earlyStateMap]=await Promise.all([
      fetchStateMap(url,H,'ep_signal_state','symbol,motors,direction,durations,started_at,entry_price,entry_score,stage_started_at,peak_motors,metrics->>maxFavPct,metrics->>maxAdvPct,metrics->>historyEpisodeId','symbol',allSymbols,'SIGNAL_STATE'),
      fetchStateMap(url,H,'ep_whale_ignition_state','phase,episode_id,absorption_at,absorption_price,ignition_at,ignition_price,max_favorable_pct,max_adverse_pct,hit_1pct,hit_3pct,hit_5pct,hit_10pct,hit_minus_05pct,hit_minus_1pct,hit_minus_2pct,last_absorption_at','asset',allSymbols,'WHALE_STATE'),
      fetchStateMap(url,H,'ep_early_leg_v2_state','phase,direction,updated_at,episode_id,episode_started_at,episode_entry_price,peak_price,trough_price','asset',allSymbols,'EARLY_STATE')

    ]);

  for(let i=0;i<PAIRS.length;i+=5){
    const pairGroup=PAIRS.slice(i,i+5);
    const pendingEventsByAsset=await fetchPendingEarlyEventsMap(url,H,pairGroup.map(([sym])=>sym));
    await Promise.all(
      pairGroup.map(async([sym,asset])=>{
        try{
          const x=await load(sym,asset);
          const now=Date.now();

          // CAMADA OBSERVADORA: não altera score, motores, tier, OPEN ou CLOSED.
          // Falhas aqui não derrubam o processamento oficial do ativo.
          const observedAt=new Date(now).toISOString();
          const earlyEpisodeId=await runEarlyLegV2(url,H,x,observedAt,pendingEarlyLegUpdates,pendingEarlyLegEvents,pendingEarlyLegStateRows,earlyStateMap,pendingEventsByAsset).catch(e=>{
            console.error('EARLY_LEG_V2_BACKEND',sym,String(e));
            return null;
          });

          const repState=pendingEarlyLegStateRows.find(row=>row.asset===sym);
          if(repState){const core=(globalThis as any).EPEarlyEpisodeCore;
            episodeSamples.push({current:repState,candidate:core.selective(x.candles,repState.phase,repState.direction,now),
              bars:core.closed(x.candles,now).map((c:any)=>[c.t,c.o,c.h,c.l,c.c])});}

          await savePreSignal(x,observedAt,pendingPreSignalRows,earlyEpisodeId).catch(e=>
            console.error('PRE_SIGNAL_OBSERVER',sym,String(e))
          );

                    // WHALE IGNITION OBSERVER V1 — shadow-only.
          // Qualquer falha aqui é isolada e não interfere no motor oficial.
          await runWhaleIgnitionObserverV1(url,H,x,observedAt,pendingWhaleStateRows,whaleStateMap).catch(e=>
            console.error('WHALE_IGNITION_OBSERVER',sym,String(e))
          );

          // SHADOW V3 — sinais complementares em teste, sem influência oficial.
          await saveShadowV3(x,observedAt,pendingShadowRows,earlyEpisodeId).catch(e=>
            console.error('SHADOW_V3_OBSERVER',sym,String(e))
          );

          const old=signalStateMap.get(sym)||null;
          let dur=old?.durations||{'1':0,'2':0,'3':0,'4':0,'5':0};
          let started=old?.started_at;
          let entryPrice=old?.entry_price?+old.entry_price:null;
          let entryScore=old?.entry_score?+old.entry_score:null;
          let stage=old?.stage_started_at;
          let peak=Math.max(old?.peak_motors||0,x.motors);
          const oldM={
            maxFavPct:old?.maxFavPct,
            maxAdvPct:old?.maxAdvPct,
            historyEpisodeId:old?.historyEpisodeId
          };
          let maxFav=+oldM.maxFavPct||0;
          let maxAdv=+oldM.maxAdvPct||0;
          let event='SNAPSHOT';

          if(old&&old.motors>=1&&stage){
            const d=now-new Date(stage).getTime();
            dur[String(old.motors)]=(dur[String(old.motors)]||0)+Math.max(0,d);
          }

          if(!old||old.motors!==x.motors||old.direction!==x.direction){
            event=!old?'START':
              x.motors<=1&&old.motors>=2?'CLOSED':
              x.motors>old.motors?'UPGRADE':
              x.motors<old.motors?'DOWNGRADE':'REVERSAL';
            stage=new Date(now).toISOString();
          }

          let historyOpened=false;
          if(x.motors>=2&&!started){
            started=new Date(now).toISOString();
            entryPrice=x.price;
            entryScore=x.score;
            peak=x.motors;
            dur={'1':0,'2':0,'3':0,'4':0,'5':0};
            maxFav=0;
            maxAdv=0;
            historyOpened=true;
          }

          if(started&&entryPrice){
            const rr=pct(entryPrice,x.price)*
              ((old?.direction||x.direction)==='SELL'?-1:1);
            maxFav=Math.max(maxFav,rr);
            maxAdv=Math.min(maxAdv,rr);
          }

          const episodeId = started ? `${sym}-${started}` : null;
          const historyKnown = !!episodeId && oldM?.historyEpisodeId === episodeId;

          const metrics={
            rsi:x.rsi,cci:x.cci,macd:x.macd,vol:x.vol,flow:x.flow,
            oiChange:x.oiChange,funding:x.funding,book:x.book,
            ret5:x.ret5,ret15:x.ret15,ret30:x.ret30,atrPct:x.atrPct,
            breakout20:x.breakout20,fluctuation:x.fluctuation,
            maxFavPct:maxFav,maxAdvPct:maxAdv,
            motorFingerprint:x.motorFingerprint,
            historyEpisodeId:(started&&x.motors>=2)?episodeId:null
          };

          let historyEvent:null|'OPEN'|'SNAPSHOT'|'CLOSED'=null;
          if(x.motors<=1&&old?.motors>=2){
            historyEvent='CLOSED';
          }else if(started&&x.motors>=2){
            historyEvent=(historyOpened||!historyKnown)?'OPEN':'SNAPSHOT';
          }

          if(historyEvent&&started){
            const dirForHistory=
              historyEvent==='OPEN'?x.direction:(old?.direction||x.direction);
            const epForHistory=entryPrice||old?.entry_price||x.price;
            const returnForHistory=
              historyEvent==='CLOSED'
                ? pct(epForHistory,x.price)*(dirForHistory==='SELL'?-1:1)
                : null;

            pendingHistoryRows.push({
              episode_id:`${sym}-${started}`,
              market:'crypto',
              asset:sym,
              direction:dirForHistory,
              event_type:historyEvent,
              observed_at:new Date(now).toISOString(),
              price:x.price,
              entry_price:epForHistory,
              exit_price:historyEvent==='CLOSED'?x.price:null,
              return_pct:returnForHistory,
              decision_score:x.score,
              signal_tier:x.tier,
              ...historyFields(x),
              ibc_score:null,
              reversal_score:null,
              adaptive_v6_confidence:null,
              metrics,
              source:'ep-24x7-monitor-v3-open-guard'
            });
          }

          if(x.motors<=1&&old?.motors>=2){
            const duration=started?now-new Date(started).getTime():null;
            const dir=old.direction||x.direction;
            const ep=entryPrice||old.price||x.price;
            const r=pct(ep,x.price)*(dir==='SELL'?-1:1);

            pendingSignalEvents.push({
              episode_id:episodeId,market:'crypto',symbol:sym,asset,event_type:'CLOSED',
              direction:dir,from_motors:old.motors,motors:x.motors,
              score:x.score,tier:x.tier,entry_score:entryScore,
              peak_motors:peak,entry_price:ep,price:x.price,
              return_pct:r,max_favorable_pct:maxFav,
              max_adverse_pct:maxAdv,duration_ms:duration,
              durations:dur,metrics
            });

            started=null;
            entryPrice=null;
            entryScore=null;
            peak=x.motors;
            maxFav=0;
            maxAdv=0;
          }else if(event!=='SNAPSHOT'){
            pendingSignalEvents.push({
              episode_id:episodeId,market:'crypto',symbol:sym,asset,event_type:event,
              direction:x.direction,from_motors:old?.motors??null,
              motors:x.motors,score:x.score,tier:x.tier,
              entry_score:entryScore,peak_motors:peak,
              entry_price:entryPrice,price:x.price,
              return_pct:null,max_favorable_pct:maxFav,
              max_adverse_pct:maxAdv,duration_ms:null,
              durations:dur,metrics
            });
          }

          const body={
            market:'crypto',symbol:sym,asset,
            direction:x.direction,score:x.score,motors:x.motors,
            tier:x.tier,entry_score:entryScore,entry_price:entryPrice,
            price:x.price,peak_motors:peak,started_at:started,
            stage_started_at:stage||new Date(now).toISOString(),
            updated_at:new Date(now).toISOString(),
            durations:dur,metrics
          };

          pendingSignalStateRows.push(body);

          ok++;
        }catch(e){
          err++;
          const msg=String(e);
          console.error('ERRO_SIMBOLO',sym,msg);
          errors.push({sym,error:msg});
        }
      })
    );

    if(i+5<PAIRS.length){
      await new Promise(r=>setTimeout(r,350));
    }
  }

  await flushRestRows(url,H,'ep_signal_history_v1',pendingHistoryRows.filter(row=>row.event_type==='OPEN'||row.event_type==='CLOSED'),null,'SIGNAL_HISTORY_BATCH');
  await flushRestRows(url,H,'ep_pre_signal_history',pendingPreSignalRows,null,'PRE_SIGNAL_BATCH');
  await flushRestRows(url,H,'ep_early_leg_v2_events',pendingEarlyLegEvents,null,'EARLY_EVENT_BATCH');
  await flushRestRows(url,H,'ep_whale_ignition_state?on_conflict=market,asset',pendingWhaleStateRows,'resolution=merge-duplicates','WHALE_STATE_BATCH');
  await flushRestRows(url,H,'ep_shadow_v3_history?on_conflict=market,asset,candle_time,source',pendingShadowRows,'resolution=merge-duplicates','SHADOW_V3_BATCH');
  await flushRestRows(url,H,'ep_early_leg_v2_state?on_conflict=market,asset',pendingEarlyLegStateRows,'resolution=merge-duplicates','EARLY_STATE_BATCH');
  await flushRestRows(url,H,'ep_signal_events',pendingSignalEvents,null,'SIGNAL_EVENT_BATCH');
  await flushRestRows(url,H,'ep_signal_state?on_conflict=market,symbol',pendingSignalStateRows,'resolution=merge-duplicates','SIGNAL_STATE_BATCH');

  if(pendingEarlyLegUpdates.length){
    let batchResponse=await fetch(`${url}/rest/v1/rpc/ep_update_early_leg_v2_events_batch`,{
      method:'POST',
      headers:H,
      body:JSON.stringify({p_updates:pendingEarlyLegUpdates}),
      signal:AbortSignal.timeout(15000)
    });
    if(!batchResponse.ok){
      const detail=await batchResponse.text().catch(()=> '');
      console.error('EARLY_BATCH_UPDATE_FAILED',batchResponse.status,detail.slice(0,500));
      batchResponse=await fetch(`${url}/rest/v1/rpc/ep_update_early_leg_v2_events_batch`,{
        method:'POST',
        headers:H,
        body:JSON.stringify({p_updates:pendingEarlyLegUpdates}),
        signal:AbortSignal.timeout(15000)
      });
      if(!batchResponse.ok){
        console.error('EARLY_BATCH_UPDATE_RETRY_FAILED',batchResponse.status,(await batchResponse.text().catch(()=> '')).slice(0,500));
      }
    }
  }

  let episodeTrackingOk=true;
  if(episodeSamples.length){try{
    const response=await fetch(`${url}/rest/v1/rpc/ep_collect_rep_10d`,{method:'POST',headers:H,
      body:JSON.stringify({p_samples:episodeSamples}),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error('HTTP '+response.status+' '+(await response.text()).slice(0,250));
  }catch(e){episodeTrackingOk=false;console.error('REP_10D',String(e));}}

  if(runId){
    await fetch(`${url}/rest/v1/ep_backend_runs?id=eq.${runId}`,{
      method:'PATCH',
      headers:H,
      body:JSON.stringify({
        finished_at:new Date().toISOString(),
        status:err?'partial':'ok',
        symbols_ok:ok,
        symbols_error:err,
        details:{errors,total:PAIRS.length,episodeTrackingOk}
      })
    });
  }

  return new Response(
    JSON.stringify({
      ok:true,
      symbols_ok:ok,
      symbols_error:err,
      total:PAIRS.length,
      errors:errors.slice(0,5),
      episodeTrackingOk,
      at:new Date().toISOString()
    }),
    {headers:{'content-type':'application/json'}}
  );
});

