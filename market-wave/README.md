# Mapa Multitemporal de Ondas — primeira versão

Painel independente em `index.html`, acima do Motor 6. Não chama funções de alteração nem redefine interfaces dos motores. Os cálculos próprios ficam em `core.js`.

O painel consulta candles spot USDT da Binance para o ativo selecionado (4 chamadas por minuto, cache local, sem atualizar em aba oculta). Mede 13 janelas de duração e agrega candles UTC para RSI14, CCI14, MACD12/26/9, ADX14, ATR14 e OBV. Candles em formação são provisórios; as bordas das janelas usam resolução de 1 minuto, 5 minutos, 1 hora ou 1 dia. Máxima/mínima são referências e não suporte/resistência validado por pivôs. Fases são descrições simples de localização e deslocamento; não são probabilidades, ordem de compra nem um modelo treinado. Não persiste os indicadores do navegador ou resultados dos motores.

## Histórico separado no projeto Gestão Farmacêutica

- Schema privado `ep_market_history`, duas tabelas novas, RLS e zero FK/trigger para tabelas existentes.
- Cron `ep-wave-isolated-minute` executa com o papel sem login `ep_wave_writer`, que recebe escrita somente nas tabelas novas. `collect()` é SECURITY INVOKER, sem entrada do usuário e com SQL fixo. Usa pg_net para uma consulta de 50 preços por minuto; processa a resposta no ciclo seguinte.
- Leitura pública de **dados de mercado exclusivamente**, por duas RPCs estreitas `ep_wave_read` e `ep_wave_outcomes`. SECURITY DEFINER com proprietário `ep_wave_reader`, sem login, sem permissões diretas de leitura de pacientes e sem escrita. Search path fixo, timeout, ativo em lista autorizada, nenhuma SQL dinâmica. Os avisos de advisor de RPC definer pública são intencionais para esse caso de leitura limitada; não autorizam funções de escrita.
- Registra uma amostra por minuto para os 50 ativos, com timestamp da resposta da fonte. Duplicatas são ignoradas. Não preenche lacunas com preços inventados. Retenção de 8 dias; não existe arquivo permanente dos registros removidos.
- Interrompe novas gravações ao atingir 64 MiB na tabela ou 420 MiB no banco; limpa apenas amostras deste schema com mais de 8 dias. O limite é verificado antes de cada lote, não um limite físico rígido. Não altera a franquia ou isola CPU, disco e rede do projeto compartilhado.
- `ep_wave_outcomes` mede retorno futuro M1...7D de qualquer amostra dentro da retenção, com tolerância máxima de 90 segundos e horário real visível. Ausência é lacuna; horizonte futuro é pendente. A interpretação deve considerar gaps e atraso da fonte.

## Operação

Status `COLETANDO`, `COLETA_PARCIAL`, `FALHA_FONTE_*`, `FALHA_RESPOSTA` e `PAUSADO_LIMITE_ARMAZENAMENTO`; o painel marca atraso >3min. Os horizontes longos exigem tempo desde o início da coleta. A janela 7D inicial completa após 7 dias de amostras suficientes.

Para pausar somente o módulo: `update ep_market_history.control set enabled=false where id=true;` ou desativar apenas o job com nome `ep-wave-isolated-minute`. Nunca executar limpeza genérica em `public`. `setup.sql` documenta a criação já aplicada e não deve ser executado novamente sem adaptação (roles/tabelas já existem). `outcomes.sql` documenta a segunda migração.

## Validação

`node market-wave/core.test.cjs` valida métricas, faixa plana, agregação H5 e indicadores neutros/direcionais. Conferência de API pública, cron e preços dos 50 ativos realizada em produção. O teste antigo `structure-volume-lab.test.cjs` falha previamente em Node por referir `window`; arquivos desse laboratório permaneceram intactos.
