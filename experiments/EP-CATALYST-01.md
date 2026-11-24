# Experimento: catalisadores fundamentais e reação das criptomoedas

**ID:** EP-CATALYST-01  
**Estado:** protótipo em modo sombra na branch `experiment/fundamental-catalyst-study`; ainda não publicado em produção  
**Hipótese:** notícias ou eventos fundamentais positivos podem anteceder retornos positivos; parte do avanço das altcoins pode ser explicada pela alta do BTC, enquanto o retorno excedente representa movimento específico do ativo. A hipótese é exploratória e não presume causalidade.

## Perguntas do experimento

1. Após um catalisador positivo, o ativo sobe mais do que o BTC e do que a cesta de altcoins?
2. O movimento já começou antes da publicação do evento?
3. Os motores do EP detectam o movimento antes, durante ou depois do catalisador?
4. O efeito muda conforme o tipo de evento, o regime do BTC e o score/confluência dos motores?

## Unidade de observação

Um evento identificado, com horário da primeira publicação verificável, ativo(s) relacionado(s), polaridade e fonte. Eventos repetidos sobre o mesmo fato devem ser deduplicados por URL/canonicalização e janela de 24 horas. Não registrar uma interpretação retrospectiva como se fosse informação disponível antes do movimento.

### Campos mínimos do evento

- `event_id`: identificador estável e único
- `published_at`: horário original da publicação em UTC
- `captured_at`: horário em que o EP registrou o evento
- `symbols`: ativos explicitamente afetados; usar `MARKET` para macro geral
- `category`: `PROJECT_UPDATE`, `PARTNERSHIP`, `REGULATION`, `LISTING`, `TOKENOMICS`, `SECURITY`, `ADOPTION`, `MACRO`, `OTHER`
- `polarity`: `POSITIVE`, `NEGATIVE`, `MIXED`, `NEUTRAL`
- `source_url` e `source_name`
- `summary`: resumo factual curto, sem recomendação
- `confidence`: baixa, média ou alta, com justificativa

## Janelas e medidas

Usar candles spot H1 já coletados, quando disponíveis. O preço-base é o fechamento do candle completo imediatamente anterior a `published_at`; arredondar o evento ao próximo fechamento H1 e conservar ambos os horários para auditoria.

Medir para cada ativo nos horizontes **24h, 72h e 7 dias**:

- retorno percentual do ativo;
- retorno do BTC no mesmo intervalo;
- retorno excedente do ativo vs. BTC: retorno ativo menos retorno BTC;
- retorno da cesta igualitária das altcoins monitoradas, excluindo o próprio ativo e stablecoins;
- retorno excedente vs. cesta;
- máxima favorável (MFE), máxima adversa (MAE), drawdown até o horizonte;
- variação de volume e volatilidade frente aos 7 dias anteriores;
- na primeira versão, o painel não grava snapshots dos motores; a comparação com sinais do EP exige integração futura com o histórico de sinais;
- dados disponíveis, lacunas de candles e qualidade/cobertura.

Retorno excedente simples é descritivo, não é beta-ajustado nem prova que a notícia causou a variação.

## Controles e comparação

- **Janela pré-evento:** calcular retorno de -24h a 0h para detectar antecipação/vazamento ou movimento que já estava em curso.
- **Controle temporal:** comparar com eventos sem catalisador identificado, no mesmo ativo e regime do BTC, escolhidos em janelas próximas e sem sobreposição.
- **Estratos:** polaridade; categoria; BTC em alta/queda/lateral; score dos motores abaixo de 45, 45–64, 65–79 e 80+.
- Se houver vários eventos do mesmo ativo dentro de 7 dias, marcar sobreposição e não tratá-los como observações independentes na análise principal.
- Resultados devem mostrar quantidade de eventos e cobertura; não apresentar taxa percentual com denominador pequeno sem o número absoluto.

## Critério de leitura

Relatar separadamente:

1. reação bruta do ativo;
2. movimento comum explicado pela referência BTC/cesta;
3. retorno excedente;
4. antecipação pré-evento;
5. desempenho dos motores e qualidade dos dados.

Uma hipótese ganha apoio preliminar apenas se houver amostra suficiente, cobertura adequada e retorno excedente consistente em mais de um horizonte, contra controles pareados. O estudo não gera ordem de compra, alvo, stop ou promessa de valorização.

## Limites do primeiro ciclo

- Sem fornecedor de notícias integrado, a curadoria e registro de eventos é manual e requer URL verificável.
- O protótipo mantém os dados no armazenamento local do navegador; não sincroniza entre dispositivos e não grava no TiDB/Dashcloud.
- A falta de evento registrado não significa ausência de notícia.
- Publicação, horário de captura e horário em que o mercado tomou conhecimento podem diferir.
- O estudo não deve alterar score, regras de entrada ou motores ativos durante a coleta.
- Primeira revisão após **30 dias de coleta**, ou quando houver pelo menos 30 eventos elegíveis, o que ocorrer por último. Com poucos eventos, apresentar apenas contagens e casos individuais, sem concluir eficácia.

## Casos iniciais sugeridos para análise retrospectiva

GRT e QNT podem ser examinadas como estudos de caso mencionados pelo usuário, mas só entram na análise principal se for possível recuperar uma fonte e o horário original do catalisador. Caso contrário, ficam marcadas como casos sem evento verificado e não contam como evidência do experimento.
