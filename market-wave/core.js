/* Independent wave mathematics; never reads or mutates the five motors. */
(function(root){
 const horizons=[['M1',1],['M5',5],['M15',15],['M30',30],['H1',60],['H2',120],['H3',180],['H5',300],['H6',360],['H24',1440],['2D',2880],['3D',4320],['7D',10080]];
 const pct=(a,b)=>a>0?(b-a)/a*100:null;
 function metrics(open,low,high,price){
  const range=high-low;
  const position=range>0?(price-low)/range*100:null;
  return {opening:open,low,high,price,change:pct(open,price),amplitude:pct(low,high),position,giveback:high>0?(high-price)/high*100:null,recovered:pct(low,price),supportDistance:pct(low,price),resistanceDistance:pct(price,high)};
 }
 function classify(m){
  if(m.position==null||m.change==null)return 'SEM CONFIRMAÇÃO';
  if(m.position<15)return m.change<0?'REGIÃO INFERIOR / QUEDA':'REGIÃO INFERIOR';
  if(m.position>85)return m.change>0?'ATAQUE À MÁXIMA':'REGIÃO SUPERIOR / RECUO';
  return m.change>0?'RECUPERAÇÃO':m.change<0?'DEVOLUÇÃO':'LATERAL';
 }
 function aggregate(c,minutes){
  const size=minutes*60000,groups=new Map();
  for(const x of c){const t=Math.floor(x.t/size)*size;let z=groups.get(t);if(!z){z={t,o:x.o,h:x.h,l:x.l,c:x.c,v:0};groups.set(t,z)}z.h=Math.max(z.h,x.h);z.l=Math.min(z.l,x.l);z.c=x.c;z.v+=x.v;}
  // A partial first bucket would bias indicators.
  return [...groups.values()].filter(z=>z.t>=c[0].t);
 }
 const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
 function ema(v,p){let r=[v[0]],k=2/(p+1);for(let i=1;i<v.length;i++)r.push(v[i]*k+r[i-1]*(1-k));return r}
 function indicators(c){
  if(c.length<35)return null;
  const v=c.map(z=>z.c),p=14;let gain=0,loss=0,tr=0,plus=0,minus=0,dx=[];
  for(let i=1;i<c.length;i++){
   const d=v[i]-v[i-1],u=c[i].h-c[i-1].h,n=c[i-1].l-c[i].l;
   const t=Math.max(c[i].h-c[i].l,Math.abs(c[i].h-v[i-1]),Math.abs(c[i].l-v[i-1]));
   if(i<=p){gain+=Math.max(d,0)/p;loss+=Math.max(-d,0)/p;tr+=t/p;plus+=(u>n&&u>0?u:0)/p;minus+=(n>u&&n>0?n:0)/p}
   else {gain=(gain*(p-1)+Math.max(d,0))/p;loss=(loss*(p-1)+Math.max(-d,0))/p;tr=(tr*(p-1)+t)/p;plus=(plus*(p-1)+(u>n&&u>0?u:0))/p;minus=(minus*(p-1)+(n>u&&n>0?n:0))/p}
   if(i>=p)dx.push(plus+minus?100*Math.abs(plus-minus)/(plus+minus):0);
  }
  let adx=avg(dx.slice(0,p));for(const d of dx.slice(p))adx=(adx*(p-1)+d)/p;
  const a=ema(v,12),b=ema(v,26),line=v.map((_,i)=>a[i]-b[i]),signal=ema(line,9);
  const tp=c.slice(-p).map(z=>(z.h+z.l+z.c)/3),mean=avg(tp),dev=avg(tp.map(z=>Math.abs(z-mean)));
  let obv=0;for(let i=1;i<c.length;i++)obv+=Math.sign(v[i]-v[i-1])*c[i].v;
  const last=c.at(-1),previous=c.at(-2),volBase=avg(c.slice(-21,-1).map(z=>z.v));
  return {rsi:gain+loss===0?50:loss?100-100/(1+gain/loss):100,cci:dev?(tp.at(-1)-mean)/(.015*dev):0,macd:line.at(-1)-signal.at(-1),adx,atr:tr,obv,volume:previous.v,volumeRatio:volBase?previous.v/volBase:null,provisional:true};
 }

 function swingTrend(input,side=2){
  const c=(input||[]).filter(z=>z&&[z.t,z.h,z.l,z.c].every(Number.isFinite));
  if(c.length<side*2+8)return {kind:'insufficient',label:'DADOS INSUFICIENTES',detail:'Poucos candles para confirmar topos e fundos',highs:[],lows:[]};
  const highs=[],lows=[];
  for(let i=side;i<c.length-side;i++){
   let isHigh=true,isLow=true,strictHigh=false,strictLow=false;
   for(let j=i-side;j<=i+side;j++){
    if(j===i)continue;
    if(c[j].h>c[i].h)isHigh=false;
    if(c[j].h<c[i].h)strictHigh=true;
    if(c[j].l<c[i].l)isLow=false;
    if(c[j].l>c[i].l)strictLow=true;
   }
   if(isHigh&&strictHigh)highs.push({price:c[i].h,t:c[i].t});
   if(isLow&&strictLow)lows.push({price:c[i].l,t:c[i].t});
  }
  if(highs.length<2||lows.length<2)return {kind:'insufficient',label:'DADOS INSUFICIENTES',detail:'Aguardando dois topos e dois fundos confirmados',highs,lows};
  const recent=c.slice(-Math.min(14,c.length)),meanPrice=avg(recent.map(z=>z.c));
  const meanRange=avg(recent.map(z=>z.h-z.l));
  const tolerance=Math.max(.001,meanPrice>0?(meanRange/meanPrice)*.35:.001);
  const direction=(a,b)=>{
   const change=(b.price-a.price)/Math.abs(a.price);
   return change>tolerance?'up':change< -tolerance?'down':'flat';
  };
  const hd=direction(highs.at(-2),highs.at(-1)),ld=direction(lows.at(-2),lows.at(-1));
  const word={up:'ascendentes',down:'descendentes',flat:'estáveis'};
  let kind='transition',label='TRANSIÇÃO';
  if(hd==='up'&&ld==='up'){kind='up';label='ALTA';}
  else if(hd==='down'&&ld==='down'){kind='down';label='BAIXA';}
  else if(hd==='flat'&&ld==='flat'){kind='sideways';label='LATERAL';}
  return {kind,label,detail:'Topos '+word[hd]+' • Fundos '+word[ld],highs:highs.slice(-2),lows:lows.slice(-2),tolerancePct:tolerance*100};
 }
 function analyze(raw,now=Date.now()){
  const candles=raw.map(a=>({t:+a[0],o:+a[1],h:+a[2],l:+a[3],c:+a[4],v:+a[5]}));
  if(candles.some(z=>![z.t,z.o,z.h,z.l,z.c,z.v].every(Number.isFinite)))throw Error('Candles inválidos');
  return candles.filter(c=>c.t<=now);
 }
 const api={horizons,pct,metrics,classify,aggregate,indicators,swingTrend,analyze};
 if(typeof module!=='undefined')module.exports=api;else root.EPWaveMath=api;
})(typeof window!=='undefined'?window:globalThis);
