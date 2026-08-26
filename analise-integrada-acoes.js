(()=>{
  const limitar=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number.isFinite(+n)?+n:0));
  const media=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
  const existe=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(+v);

  function pontuarFaixa(valor,faixas){
    if(!existe(valor)) return null;
    const v=+valor;
    for(const f of faixas){ if(f.teste(v)) return f.pontos; }
    return 0;
  }

  function qualidadeEmpresa(d={}){
    let pontos=0,peso=0,detalhes=[];
    const add=(nome,nota,p)=>{ if(nota===null)return; pontos+=nota*p; peso+=p; detalhes.push({nome,nota}); };
    add('Rentabilidade',pontuarFaixa(d.roe,[{teste:v=>v>=20,pontos:100},{teste:v=>v>=15,pontos:85},{teste:v=>v>=10,pontos:65},{teste:v=>v>0,pontos:40},{teste:()=>true,pontos:10}]),0.25);
    add('Crescimento dos lucros',pontuarFaixa(d.crescimentoLucro3a,[{teste:v=>v>=15,pontos:100},{teste:v=>v>=8,pontos:80},{teste:v=>v>=0,pontos:60},{teste:v=>v>=-10,pontos:35},{teste:()=>true,pontos:10}]),0.25);
    add('Geração de caixa',pontuarFaixa(d.qualidadeCaixa,[{teste:v=>v>=1.2,pontos:100},{teste:v=>v>=1,pontos:85},{teste:v=>v>=0.7,pontos:60},{teste:v=>v>=0.4,pontos:35},{teste:()=>true,pontos:10}]),0.2);
    add('Saúde financeira',pontuarFaixa(d.saudeFinanceira,[{teste:v=>v>=80,pontos:100},{teste:v=>v>=65,pontos:80},{teste:v=>v>=50,pontos:60},{teste:v=>v>=35,pontos:35},{teste:()=>true,pontos:10}]),0.2);
    add('Consistência',pontuarFaixa(d.consistenciaResultados,[{teste:v=>v>=80,pontos:100},{teste:v=>v>=60,pontos:80},{teste:v=>v>=40,pontos:55},{teste:()=>true,pontos:25}]),0.1);
    return {nota:peso?Math.round(pontos/peso):null,detalhes};
  }

  function precoJusto(d={}){
    let notas=[];
    const rel=(atual,referencia,invertido=false)=>{ if(!existe(atual)||!existe(referencia)||+referencia===0)return null; const r=+atual/+referencia; const n=invertido?100-(r-1)*80:100-Math.abs(r-1)*80; return limitar(n); };
    const pl=rel(d.pl,d.plSetor,true); if(pl!==null)notas.push({nome:'P/L vs setor',nota:pl});
    const pvp=rel(d.pvp,d.pvpSetor,true); if(pvp!==null)notas.push({nome:'P/VP vs setor',nota:pvp});
    const ev=rel(d.evEbitda,d.evEbitdaSetor,true); if(ev!==null)notas.push({nome:'EV/EBITDA vs setor',nota:ev});
    if(existe(d.dividendYield)){const n=limitar((+d.dividendYield/8)*100);notas.push({nome:'Dividendos',nota:n});}
    return {nota:notas.length?Math.round(media(notas.map(x=>x.nota))):null,detalhes:notas};
  }

  function tendenciaTecnica(x={}){
    let nota=50,detalhes=[];
    if(existe(x.trend)){ if(+x.trend>0){nota+=20;detalhes.push('Tendência de alta');} else if(+x.trend<0){nota-=20;detalhes.push('Tendência de baixa');} }
    if(existe(x.price)&&existe(x.vwap)){ if(+x.price>+x.vwap){nota+=12;detalhes.push('Preço acima da VWAP');} else nota-=12; }
    if(existe(x.macd?.h)){ if(+x.macd.h>0)nota+=10; else nota-=10; }
    if(existe(x.rsi)){ const r=+x.rsi; if(r>=52&&r<=72)nota+=8; else if(r>80||r<20)nota-=8; }
    return {nota:Math.round(limitar(nota)),detalhes};
  }

  function confirmacaoVolume(x={}){
    let nota=50,detalhes=[];
    const vr=existe(x.volRatio)?+x.volRatio:null,chg=existe(x.change)?+x.change:null;
    if(vr!==null){ if(vr>=2){nota+=30;detalhes.push('Volume muito acima da média');} else if(vr>=1.5){nota+=22;detalhes.push('Volume forte');} else if(vr>=1.2){nota+=12;detalhes.push('Volume confirma');} else if(vr<0.8){nota-=18;detalhes.push('Volume fraco');} }
    if(chg!==null&&vr!==null){ if(chg>0&&vr>=1.2)nota+=10; if(chg>0&&vr<0.8)nota-=15; if(chg<0&&vr>=1.5)nota-=10; }
    return {nota:Math.round(limitar(nota)),detalhes};
  }

  function qualidadeEntrada(x={}){
    let nota=50,detalhes=[];
    if(existe(x.price)&&existe(x.vwap)){ const dist=Math.abs((+x.price-+x.vwap)/(+x.vwap||1))*100; if(dist<=1.5){nota+=18;detalhes.push('Preço próximo de referência');} else if(dist>=5){nota-=12;detalhes.push('Preço esticado');} }
    if(existe(x.atr)&&existe(x.price)){ const atrPct=(+x.atr/(+x.price||1))*100; if(atrPct>=1&&atrPct<=4)nota+=12; else if(atrPct>6)nota-=10; }
    if(existe(x.volRatio)&&+x.volRatio>=1.2)nota+=10;
    if(existe(x.trend)&&+x.trend>0)nota+=10;
    return {nota:Math.round(limitar(nota)),detalhes};
  }

  function analisar(acao={},fundamentos={}){
    const blocos={
      'Qualidade da Empresa':qualidadeEmpresa(fundamentos),
      'Preço Justo e Valuation':precoJusto(fundamentos),
      'Tendência e Força Técnica':tendenciaTecnica(acao),
      'Confirmação por Volume':confirmacaoVolume(acao),
      'Qualidade da Entrada':qualidadeEntrada(acao)
    };
    const pesos={'Qualidade da Empresa':30,'Preço Justo e Valuation':20,'Tendência e Força Técnica':20,'Confirmação por Volume':15,'Qualidade da Entrada':15};
    let soma=0,pesoDisponivel=0;
    Object.entries(blocos).forEach(([nome,b])=>{if(b.nota!==null){soma+=b.nota*pesos[nome];pesoDisponivel+=pesos[nome];}});
    const cobertura=Math.round(pesoDisponivel);
    const notaIntegrada=pesoDisponivel?Math.round(soma/pesoDisponivel):null;
    let classificacao='DADOS INSUFICIENTES';
    if(notaIntegrada!==null){classificacao=notaIntegrada>=85?'OPORTUNIDADE MUITO FORTE':notaIntegrada>=75?'OPORTUNIDADE FORTE':notaIntegrada>=65?'OPORTUNIDADE MODERADA':notaIntegrada>=55?'ACOMPANHAR':'EVITAR / AGUARDAR';}
    const alertas=[];
    const q=blocos['Qualidade da Empresa'].nota,v=blocos['Preço Justo e Valuation'].nota,t=blocos['Tendência e Força Técnica'].nota;
    if(q!==null&&q>=75&&v!==null&&v<50)alertas.push('Empresa forte, mas preço pouco atrativo');
    if(t!==null&&t>=75&&q!==null&&q<50)alertas.push('Técnico comprador, fundamentos fracos');
    if(blocos['Confirmação por Volume'].nota<45)alertas.push('Movimento sem confirmação suficiente de volume');
    return {tipo:'AÇÃO',notaIntegrada,cobertura,classificacao,blocos,alertas,isolado:true,alteraMotores:false};
  }

  window.EPAnaliseIntegradaAcoes={analisar,versao:'1.0.0-isolada',somenteAcoes:true};
})();