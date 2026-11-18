# Teste sombra: Fear & Greed no EP

## Objetivo

Medir se o Crypto Fear & Greed Index acrescenta contexto útil aos sinais existentes do EP. Este teste é **somente analítico**: não altera os cinco motores, o Motor 6, os filtros, a coleta nem a execução de operações.

A fonte é a API pública da Alternative.me. O provedor descreve o índice como uma medida diária, centrada no mercado de Bitcoin, que combina volatilidade, momentum/volume, redes sociais, dominância e tendências de busca. Isso pode se sobrepor a dados que o EP já mede. Fonte e atribuição: [Alternative.me — metodologia e API](https://alternative.me/crypto/fear-and-greed-index/).

## Primeiro resultado histórico

Foi cruzado o histórico fechado de sinais de `public.ep_signal_history_v1` com o valor do índice do **dia UTC anterior** ao fechamento do episódio. Usar o dia anterior evita associar a um sinal um valor diário que talvez ainda não estivesse publicado quando ele ocorreu. Os intervalos foram agrupados como medo extremo (0–24), medo (25–44), neutro (45–54), ganância (55–74) e ganância extrema (75–100).

A base tinha **6.349 episódios fechados únicos em 57 ativos**, entre 25/10 e 18/11/2026. O período efetivamente cobre só 24 dias e não inclui sinais de 2024. Como o mesmo valor de sentimento se aplica a todos os ativos de um dia, o resultado abaixo apresenta também o número de dias e a média das métricas diárias; os milhares de episódios não são milhares de observações independentes.

| Faixa | Direção | Dias | Episódios | Acerto médio diário | Retorno médio diário registrado |
|---|---:|---:|---:|---:|---:|
| Medo extremo | Compra | 5 | 455 | 53,7% | +0,341% |
| Medo extremo | Venda | 4 | 418 | 47,4% | +0,148% |
| Medo | Compra | 13 | 1.888 | 48,6% | +0,182% |
| Medo | Venda | 13 | 1.807 | 61,5% | +0,429% |
| Neutro | Compra | 7 | 1.042 | 58,3% | +0,384% |
| Neutro | Venda | 7 | 739 | 57,6% | +0,381% |

Os retornos são os valores já armazenados pelo EP em `return_pct`; este relatório não recalcula custos, slippage ou execução. As faixas de ganância não aparecem porque não houve dias correspondentes nesse recorte após o deslocamento de um dia.

## Leitura

Nesse recorte, os sinais de compra em dias neutros tiveram resultados médios maiores que os de compra em medo. A amostra de medo extremo cobre apenas quatro ou cinco dias, e os sinais do mesmo dia compartilham o mesmo índice. Isso é insuficiente para concluir que o índice melhora o EP ou para ajustar pontuação/risco.

**Decisão inicial: manter como variável de pesquisa, sem peso nos motores e sem bloqueio de sinal.**

## Como repetir

Execute [`shadow-test.sql`](shadow-test.sql) no banco EP Whale Analytics, projeto Supabase `qhgclnkctpzumtybailv`. A consulta é somente leitura; os valores do índice estão congelados no CTE para deixar este primeiro resultado reproduzível.

## Próxima etapa recomendada

1. Registrar diariamente o valor, timestamp de atualização, classificação, fonte e variações de 3/7 dias em uma tabela experimental isolada, com histórico e controle de dados ausentes.
2. Anexar aos sinais o último valor conhecido no momento do sinal, sempre respeitando o timestamp de publicação.
3. Comparar o EP atual com uma versão sombra que apenas estratifique a confiança por sentimento. Não alterar decisões ao vivo.
4. Medir acerto, retorno médio/mediano, drawdown e excursões a +5/+10/+20%, por direção, faixa e número de motores.
5. Avaliar em janelas cronológicas separadas e exigir vários regimes de mercado antes de considerar qualquer uso operacional.

O índice da Alternative.me é agregado e predominantemente ligado ao Bitcoin; ele não representa diretamente o sentimento específico de cada altcoin. Como parte dos seus componentes se sobrepõe a volatilidade, volume e dominância, qualquer benefício precisa aparecer **além** do desempenho do EP sem o índice.
