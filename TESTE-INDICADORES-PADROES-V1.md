# Teste de Indicadores e Padrões V1

## Isolamento

- Branch experimental: `teste-indicadores-padroes-v1`.
- Base preservada: `backup-5-motores-antes-testes-padroes-2026-09-01`.
- Os cinco motores oficiais, o `decision-engine` e as regras operacionais não foram modificados.
- O teste não lê nem grava no Supabase e não chama o GNews.
- As consultas são manuais, uma por clique, para reduzir consumo da BRAPI.

## Configurações comparadas

| Configuração | RSI | CCI | MACD |
|---|---:|---:|---:|
| Controle atual | 7 | 14 | 20/30/60 |
| Candidata | 14 | 20 | 12/26/9 |

## Padrões avaliados

- Reversão: topo/fundo duplo, engolfo, martelo, estrela cadente, estrela da manhã e estrela da noite.
- Continuação: rompimento de 20 períodos, bandeira e triângulos ascendente/descendente.
- Neutros: doji, inside bar, triângulo simétrico e compressão sem rompimento.

Padrões neutros nunca geram direção de compra ou venda no laboratório.

## Resultado histórico

O teste mede a máxima excursão favorável após cada sinal nos alvos de 10%, 20%, 30%, 40% e 50%. O horizonte pode ser 24, 48 ou 96 candles. A pontuação mínima pode ser 60, 70 ou 80.

Os resultados são observacionais. A máxima futura é usada somente como rótulo de validação e nunca participa da formação do sinal.

