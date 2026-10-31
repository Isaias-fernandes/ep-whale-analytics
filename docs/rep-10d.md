# REP 10D — Caminho da Pernada

Versão `rep-10d-v1`, coleta prospectiva iniciada em 31/10/2026.

- Corrige o sinal do percentual de retração para alta e baixa. Mudanças de direção e novos ciclos reiniciam os extremos do episódio.
- Preserva os eventos originais de 24h e os cinco motores oficiais.
- Uma linha por episódio REP, com duas observações possíveis: observador corrigido (BUY e SELL) e compra seletiva experimental (BUY).
- A admissão seletiva usa somente velas M5 fechadas, recentes e contíguas: fundos recentes ascendentes, volume médio de 3 velas ≥1,2× a base, OBV positivo em 10 velas, desequilíbrio taker ≥10%, preço acima da média de 20, RSI simples 14 <74, movimento em seis velas entre 0 e 5% e proximidade de resistência ou reteste sustentado. Não altera os motores e não executa ordens.
- O seletivo pode entrar até 24h após o início do registro prospectivo do episódio; as duas entradas podem ter horários e preços diferentes. A comparação agregada não constitui um teste pareado de rentabilidade.
- A entrada simulada é a abertura da primeira vela M5 iniciada após a observação. Episódios já existentes passam a ser observados a partir da instalação; não se reconstrói um sinal retrospectivo como se fosse prospectivo.
- Cada entrada acompanha 240 horas: 1h, 6h, 12h, 24h, 48h, 72h, 120h, 168h e 240h. A simulação não para no alvo ou stop.
- Máximas e mínimas usam as velas M5 fechadas já carregadas pelo backend. O histórico recuperável em cada coleta é limitado às 220 velas existentes. Lacunas não são preenchidas com o preço atual e não entram nas médias completas.
- O tempo para +1%, +2%, +3%, +5%, +10% e +20% tem resolução de uma vela. Registra queda contrária antes da vela e até a vela do toque; não presume a ordem intravela. +5% e −3% na mesma vela ficam AMBIGUOUS, salvo abertura além de um nível que define a ordem.
- BTC usa a abertura e o fechamento das mesmas velas. Excesso BTC é diferença em pontos percentuais, ajustada à direção, não lucro de carteira nem comparação causal com mercado. Ausência de BTC exclui apenas a comparação BTC.
- Backend continua em `0 * * * *`. Não há novas consultas Binance. O RPC recebe as velas existentes e calcula no banco, sem transferir todos os episódios ao coletor.
- A tabela `ep_early_leg_episode_tracks` é acessível somente a `service_role`, com RLS. Funções SECURITY INVOKER e execução exclusiva do backend. A exportação diária `public.ep_*` inclui essa tabela; não se introduz limpeza sem arquivo verificado.
- O painel consulta a rota `ep-24x7-status?view=rep-10d` sob demanda e mantém cache local de uma hora; preservados o cache de 5 minutos do navegador e o wrapper protegido do servidor. Exporta somente os 30 episódios recentes presentes na resposta; o banco mantém o conjunto completo.

## Verificação

`node --test early-leg-episode-core.test.cjs motor6-*.test.cjs`

`node scripts/check-traffic-protection.mjs`

Testes transacionais no banco verificam 2.880 velas/10 dias, nove marcos, ambiguidade alvo/stop, direção SELL, lacunas e inserção por episódio com ambos os modelos; os dados de teste são revertidos.

## Fonte do coletor

A fonte versionada do monitor lê `EP_INTERNAL_KEY` do ambiente. O deployment atual preserva a autorização interna já existente; a chave não é publicada no Git. Uma reinstalação independente deve configurar o segredo no ambiente, mantendo o mesmo valor usado pelo agendamento.
