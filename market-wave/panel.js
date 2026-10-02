(()=>{
 'use strict';
 const W=window.EPWaveMath, root=document.getElementById('epWavePanel');if(!W||!root)return;
 const WAVE_API='https://iayxjarkeefbzjbpfurl.supabase.co/functions/v1/ep-wave-read';
 const pairs=window.CryptoApp?.getPairs?.()||[['BTCUSDT','BTC']];
 const fmt=(v,d=2)=>v!=null&&Number.isFinite(+v)?(+v).toLocaleString('pt-BR',{maximumFractionDigits:d}):'—';
 const time=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
 root.innerHTML=`<div class="wave-controls"><label>Ativo<select id="waveSymbol">${pairs.map(([s,k])=>`<option value="${s}">${k}/USDT</option>`).join('')}</select></label><button id="waveRefresh" type="button">Atualizar mapa</button></div><p id="waveStatus" role="status">Carregando...</p><div id="waveSummary"></div><div class="wave-scroll"><table class="price-track"><thead><tr><th>Janela</th><th>Fase descritiva</th><th>Variação</th><th>Mínima</th><th>Máxima</th><th>Posição na faixa</th><th>Amplitude</th><th>Recuo da máxima</th><th>Dist. mínima</th><th>Dist. máxima</th><th>RSI 14</th><th>CCI 14</th><th>MACD 12/26/9</th><th>ADX 14</th><th>ATR 14</th><th>OBV</th><th>Volume fechado</th><th>Volume x</th></tr></thead><tbody id="waveRows"></tbody></table></div><details><summary>Histórico isolado — coleta automática de 50 ativos</summary><p id="waveHistoryStatus"></p><div class="wave-scroll"><table class="price-track"><thead><tr><th>Janela</th><th>Preço inicial registrado</th><th>Preço final registrado</th><th>Variação</th><th>Posição</th><th>Amostras</th><th>Cobertura</th></tr></thead><tbody id="waveHistoryRows"></tbody></table></div><div class="wave-controls"><label>Leitura registrada em<input id="waveAnchor" type="datetime-local"></label><button id="waveOutcomes" type="button">Ver o que aconteceu depois</button></div><p id="waveOutcomeStatus"></p><div class="wave-scroll"><table class="price-track"><thead><tr><th>Após</th><th>Preço inicial</th><th>Preço posterior</th><th>Variação</th><th>Horário real</th></tr></thead><tbody id="waveOutcomeRows"></tbody></table></div><p class="sub">Histórico de preços amostrados a cada minuto, com retenção de 8 dias. Extremos entre amostras podem não aparecer. As janelas medem duração; os indicadores usam candles agregados do período correspondente. Nenhuma ordem é executada.</p></details>`;
 const el=id=>document.getElementById(id);let busy=false,epoch=0,lastLive=0;const cache=new Map();
 async function request(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Fonte HTTP ${r.status}`);return r.json()}
 async function candles(symbol){
  const old=cache.get(symbol);if(old&&Date.now()-old.at<60000)return old.data;
  const intervals=['1m','5m','1h','1d'];
  const limits={'1m':600,'5m':240,'1h':240,'1d':260};
  const settled=await Promise.allSettled(intervals.map(interval=>request(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limits[interval]}`)));
  const result={};settled.forEach((r,i)=>{if(r.status==='fulfilled'&&Array.isArray(r.value)&&r.value.length)result[intervals[i]]=W.analyze(r.value)});
  if(!result['1m']?.length)throw Error('Preço atual indisponível');
  if(Date.now()-result['1m'].at(-1).t>180000)throw Error('Candles da fonte estão atrasados');
  cache.set(symbol,{at:Date.now(),data:result});return result;
 }
 function renderLive(c){
  const now=Date.now(),price=c['1m'].at(-1).c;
  const rows=W.horizons.map(([label,minutes])=>{
   const base=minutes<=15?c['1m']:minutes===30?c['5m']:c['1h'];
   const baseMinutes=minutes<=15?1:minutes===30?5:60;
   if(!base)return {label,error:true};
   const cut=now-minutes*60000,windowCandles=base.filter(z=>z.t+baseMinutes*60000>cut);
   if(!windowCandles.length||base[0].t>cut)return {label,error:true};
   const m=W.metrics(windowCandles[0].o,Math.min(...windowCandles.map(z=>z.l)),Math.max(...windowCandles.map(z=>z.h)),price);
   return {label,minutes,...m,phase:W.classify(m),ind:minutes>=1440?(c['1d']?W.indicators(W.aggregate(c['1d'],minutes)):null):W.indicators(W.aggregate(base,minutes))};
  });
  el('waveRows').innerHTML=rows.map(r=>r.error?`<tr><td>${r.label}</td><td colspan="17">Fonte indisponível / janela incompleta</td></tr>`:`<tr><td><b>${r.label}</b></td><td>${r.phase}</td><td>${fmt(r.change)}%</td><td>${fmt(r.low,8)}</td><td>${fmt(r.high,8)}</td><td>${fmt(r.position,1)}%</td><td>${fmt(r.amplitude)}%</td><td>${fmt(r.giveback)}%</td><td>${fmt(r.supportDistance)}%</td><td>${fmt(r.resistanceDistance)}%</td><td>${fmt(r.ind?.rsi,1)}</td><td>${fmt(r.ind?.cci,1)}</td><td>${fmt(r.ind?.macd,8)}</td><td>${fmt(r.ind?.adx,1)}</td><td>${fmt(r.ind?.atr,8)}</td><td>${fmt(r.ind?.obv,0)}</td><td>${fmt(r.ind?.volume,2)}</td><td>${fmt(r.ind?.volumeRatio,2)}</td></tr>`).join('');
  const valid=rows.filter(r=>!r.error),up=valid.filter(r=>r.change>0).length;
  el('waveSummary').textContent=`Preço: ${fmt(price,8)} USDT • ${up}/${valid.length} janelas com deslocamento positivo. Máximas e mínimas são referências da janela; rompimento e suporte precisam de confirmação. Candles em formação e bordas aproximadas pela resolução da fonte.`;
  lastLive=now;
 }
 function renderHistory(h){
  if(!el('waveAnchor').value&&h.first_at){const date=new Date(h.first_at);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());el('waveAnchor').value=date.toISOString().slice(0,16)}
  const stale=!h.last_ok||Date.now()-Date.parse(h.last_ok)>180000;
  el('waveHistoryStatus').textContent=`${h.status} ${stale?'• DADOS ATRASADOS':''} • última coleta: ${time(h.last_ok)} • início: ${time(h.first_at)} • ${fmt(h.bytes/1048576)} MB / limite 64 MB. Pausa automática também ao atingir 420 MB no banco.`;
  el('waveHistoryRows').innerHTML=h.windows.map(r=>{
   const complete=r.opening!=null&&r.samples>=Math.floor(r.minutes*.95)+1;
   const m=W.metrics(r.opening,r.low,r.high,r.price);
   return `<tr><td>${r.label}</td><td>${fmt(r.opening,8)}</td><td>${fmt(r.price,8)}</td><td>${fmt(m.change)}${m.change==null?'':'%'}</td><td>${fmt(m.position,1)}%</td><td>${r.samples}</td><td>${complete?'COMPLETA':'INCOMPLETA / LACUNAS'}</td></tr>`;
  }).join('');
 }
 async function sync(){
  if(busy)return;busy=true;const ticket=epoch,symbol=el('waveSymbol').value;el('waveRefresh').disabled=true;
  el('waveStatus').textContent='Atualizando leitura e verificando o gravador...';
  try{
   const livePromise=candles(symbol);
   const historyPromise=request(WAVE_API+'?action=read&symbol='+encodeURIComponent(symbol));
   try{
    const live=await livePromise;
    if(ticket!==epoch)return;
    renderLive(live);
    el('waveStatus').textContent=`Leitura atualizada: ${time(lastLive)} • histórico carregando em segundo plano • interpretação experimental; sem probabilidade validada.`;
   }catch(e){
    if(ticket!==epoch)return;
    el('waveStatus').textContent=`LEITURA ATRASADA — ${e.message}. Última leitura: ${time(lastLive)}.`;
   }
   try{
    const history=await historyPromise;
    if(ticket!==epoch)return;
    renderHistory(history);
   }catch(e){
    if(ticket!==epoch)return;
    el('waveHistoryStatus').textContent='Histórico indisponível — não confirmado. '+e.message;
   }
  }finally{busy=false;el('waveRefresh').disabled=false;if(ticket!==epoch)sync()}
 }
 el('waveOutcomes').addEventListener('click',async()=>{
  const symbol=el('waveSymbol').value,ticket=epoch,date=new Date(el('waveAnchor').value);
  if(!Number.isFinite(date.getTime())){el('waveOutcomeStatus').textContent='Escolha a data e a hora.';return}
  el('waveOutcomes').disabled=true;
  try{const rows=await request(WAVE_API+'?action=outcomes&symbol='+encodeURIComponent(symbol)+'&at='+encodeURIComponent(date.toISOString()));if(ticket!==epoch)return;
   el('waveOutcomeStatus').textContent=rows.length?'Retornos observados. Horizontes futuros ficam pendentes; ausência de amostra fica como lacuna.':'Não há leitura registrada nesse horário.';
   el('waveOutcomeRows').innerHTML=rows.map(r=>`<tr><td>${r.label}</td><td>${fmt(r.entry_price,8)}</td><td>${fmt(r.final_price,8)}</td><td>${r.return_pct==null?(Date.parse(r.target_at)>Date.now()?'PENDENTE':'LACUNA'):fmt(r.return_pct)+'%'}</td><td>${time(r.actual_at)}</td></tr>`).join('');
  }catch(e){el('waveOutcomeStatus').textContent='Consulta indisponível: '+e.message}finally{el('waveOutcomes').disabled=false}
 });
 el('waveRefresh').addEventListener('click',sync);
 el('waveSymbol').addEventListener('change',()=>{epoch++;el('waveOutcomeRows').innerHTML='';el('waveOutcomeStatus').textContent='';el('waveAnchor').value='';el('waveRows').innerHTML='';el('waveHistoryRows').innerHTML='';el('waveSummary').textContent='';lastLive=0;sync()});
 sync();setInterval(()=>{if(!document.hidden)sync()},60000);
})();
