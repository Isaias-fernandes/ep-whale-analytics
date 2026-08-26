# API Administrativa EP v1 — Somente Leitura

## Objetivo

Adicionar uma camada administrativa própria para observabilidade do EP sem alterar os 5 motores, o IBC, a Central de Interpretação, a lógica B3, o Exit Intelligence ou qualquer outro componente de análise.

## Princípios de segurança

- Somente `GET`.
- Não aceita SQL arbitrário.
- Não possui `INSERT`, `UPDATE`, `DELETE`, `RPC` de escrita, `ALTER`, migrations ou comandos DDL.
- A `service_role` fica exclusivamente no servidor da Edge Function.
- O navegador nunca recebe a `service_role`.
- Acesso exige JWT válido do Supabase Auth e UID explicitamente listado em `EP_ADMIN_UIDS`.
- CORS pode ser limitado por `EP_ALLOWED_ORIGINS`.
- Limite máximo de 250 registros por requisição.
- Respostas usam `cache-control: no-store`.

## Arquitetura

EP atual / Central / ferramentas administrativas
→ API Administrativa EP v1
→ Supabase/PostgreSQL
→ tabelas observacionais do EP

Os motores continuam produzindo os mesmos sinais. A API apenas lê resultados já gravados.

## Rotas v1

### `/status`
Estado consolidado do backend, última execução, quantidade de sinais ativos e últimos eventos.

### `/signals`
Leitura de `ep_signal_state`.
Parâmetros opcionais:
- `limit`
- `min_motors`
- `asset`

### `/events`
Leitura de `ep_signal_events`.
Parâmetros opcionais:
- `limit`
- `type`
- `asset`

### `/runs`
Histórico recente de `ep_backend_runs`.
Parâmetro opcional:
- `limit`

### `/efficiency`
Resumo observacional dos sinais encerrados por pico de 2, 3, 4 e 5 motores, com quantidade, taxa favorável e retorno médio.

## Variáveis de ambiente necessárias

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EP_ADMIN_UIDS` — UIDs separados por vírgula.
- `EP_ALLOWED_ORIGINS` — origens permitidas separadas por vírgula.

## Implantação segura

1. Não alterar `main` antes dos testes.
2. Criar/deployar a função `ep-admin-readonly` em ambiente controlado.
3. Configurar `EP_ADMIN_UIDS` e `EP_ALLOWED_ORIGINS` como secrets do servidor.
4. Testar somente `/status` primeiro.
5. Confirmar que POST/PUT/PATCH/DELETE retornam 405.
6. Confirmar que usuário não listado retorna 403.
7. Confirmar que nenhuma chamada modifica contagens ou timestamps das tabelas, exceto logs normais da própria infraestrutura.
8. Só depois liberar as demais rotas de leitura.
9. O EP operacional não precisa trocar seu endpoint atual para esta API na v1.

## Eficiência

A API reduz a necessidade de múltiplas consultas administrativas dispersas e concentra diagnósticos em respostas pequenas e padronizadas. Ela não recalcula indicadores nem motores; consulta apenas dados já processados.

## Limites deliberados da v1

A v1 não possui escrita administrativa. Qualquer mudança futura deverá ser implementada como ação nomeada e específica, com validação própria, auditoria e autorização explícita. Não será criado endpoint genérico `/execute-sql`.

## Regra de evolução

Leitura → validação → auditoria → somente depois ações administrativas pontuais.

Mudanças estruturais de banco continuam por migrations versionadas no GitHub, nunca por SQL arbitrário exposto via API.
