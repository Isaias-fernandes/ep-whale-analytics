# API de Histórico de Sinais V1

## Objetivo

Criar uma camada **isolada** para registrar e consultar sinais do EP Whale Analytics sem alterar os 5 motores, o `decision-engine`, a Central de Interpretação ou a lógica operacional atual.

A API foi criada na branch `api-historico-sinais-v1` e **não está ligada ao EP em produção**.

## Componentes

- Migration: `supabase/migrations/20260827_ep_signal_history_v1.sql`
- Edge Function: `supabase/functions/ep-signal-history/index.ts`

## Segurança

- A tabela `ep_signal_history_v1` usa RLS.
- Não há policy pública.
- Leitura administrativa exige JWT de usuário cujo UID esteja em `EP_ADMIN_UIDS`.
- Escrita exige o secret de servidor `EP_HISTORY_INGEST_KEY` enviado em `x-ep-history-key`.
- O `service_role` fica somente na Edge Function.
- Não existe SQL livre, RPC genérica, UPDATE, DELETE ou DDL na API.
- POST aceita apenas campos previamente definidos e no máximo 100 eventos por chamada.

## Secrets necessários

- `EP_ADMIN_UIDS` — já usado pela API administrativa.
- `EP_ALLOWED_ORIGINS` — já usado pela API administrativa.
- `EP_HISTORY_INGEST_KEY` — novo secret aleatório, exclusivo para o backend que gravará histórico.

## Rotas de leitura

Todas exigem `Authorization: Bearer <JWT do administrador>`.

- `GET /status` — status e quantidade de registros.
- `GET /events` — eventos/snapshots brutos.
- `GET /episodes` — trajetória por episódio, incluindo MFE e MAE quando houver snapshots de preço.
- `GET /efficiency` — eficiência geral e 0M–5M, IBC ≥75 e combinações.
- `GET /motors` — eficiência individual de cada um dos 5 motores, comparando motor ativo x inativo.
- `GET /assets` — eficiência por ativo, com entrada, saída e retorno.
- `GET /report` — relatório consolidado: motores + combinações + ativos + episódios.

Filtros aceitos nas leituras: `market`, `asset`, `episode_id` e `limit` (máximo 5000).

## Rota de gravação

`POST /ingest`

Header obrigatório:

```text
x-ep-history-key: <EP_HISTORY_INGEST_KEY>
```

Exemplo de evento:

```json
{
  "episode_id": "BTCUSDT-20260827-001",
  "market": "crypto",
  "asset": "BTCUSDT",
  "direction": "BUY",
  "event_type": "SNAPSHOT",
  "observed_at": "2026-08-27T18:00:00Z",
  "price": 64820.5,
  "entry_price": 64500,
  "decision_score": 82,
  "signal_tier": "strong",
  "motor_count": 3,
  "motor_technical": true,
  "motor_structure": true,
  "motor_volatility": false,
  "motor_squeeze": false,
  "motor_flow": true,
  "technical_score": 84,
  "structure_score": 76,
  "flow_score": 81,
  "ibc_score": 79,
  "reversal_score": 22,
  "adaptive_v6_confidence": 74,
  "metrics": {
    "rsi": 58.3,
    "cci": 121.7,
    "macd": 15.4,
    "vwap": 64380,
    "flow": 0.043,
    "book": 0.071,
    "oiChange": 0.42,
    "vol": 1.36
  }
}
```

Para encerramento, usar `event_type: "CLOSED"` com `exit_price` e `return_pct`.

## O que a análise passa a medir

### Por motor

- Técnico principal
- Estrutura / Microtendência
- Volatilidade / Supersinal
- Bollinger / Keltner
- Volume / Fluxo

Para cada motor: número de sinais, favoráveis, desfavoráveis, taxa favorável, retorno médio, mediano, Profit Factor e drawdown acumulado.

### Por combinação

- 0M a 5M
- IBC ≥75
- 3M + IBC ≥75
- 4M+ + IBC ≥75

### Por ativo

Eficiência individual por BTC, ETH, SOL, PETR4, VALE3 etc., com preços de entrada/saída e retorno.

### Trajetória de preço

Se o backend enviar snapshots periódicos durante o sinal, `/episodes` calcula:

- MFE: maior excursão favorável desde a entrada.
- MAE: maior excursão adversa desde a entrada.
- número de snapshots.
- preço de entrada e último preço.

Isso permite estudar não apenas se o sinal terminou positivo, mas **quanto o preço andou a favor e contra enquanto o sinal esteve ativo**.

## Etapas de implantação

1. Revisar a branch sem merge.
2. Aplicar a migration no Supabase manualmente.
3. Criar o secret `EP_HISTORY_INGEST_KEY`.
4. Implantar somente a Edge Function `ep-signal-history`.
5. Testar `/status` e uma gravação de teste.
6. Só depois criar um adaptador no backend 24/7 para enviar `OPEN`, `SNAPSHOT` e `CLOSED`.
7. O adaptador deve ser observacional e não alterar qualquer retorno dos 5 motores.

## Estado atual

**Preparado no GitHub, não implantado e não conectado ao EP operacional.**
