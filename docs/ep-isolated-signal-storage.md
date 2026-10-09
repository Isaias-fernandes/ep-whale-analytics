# Compartimento de auditoria do EP

Os dados da farmácia não são lidos nem modificados por esta rotina. O destino é exclusivamente `ep_market_history.signal_archive_batches` no projeto iayxjarkeefbzjbpfurl.

## Capacidade e segurança
- Teto autorizado para o conjunto EP: 250.000.000 bytes, incluindo índices.
- Admissão de arquivos para em 186.000.000 bytes do schema, reservando espaço para o coletor de preços existente.
- O coletor também pausa próximo de 248.000.000 bytes no conjunto EP.
- Transferência pausa quando o banco inteiro se aproxima de 400 MB; o coletor mantém sua proteção anterior do banco.
- Tabela com RLS. Consulta de mercado somente leitura para o painel, limitada ao EP e à janela recente. Nenhuma permissão de escrita para anon/authenticated. Tokens administrativos apenas em Secrets do Actions.
- Gzip sem perda: campos, números, preços, checkpoints e resultados são preservados.
- Cada lote é salvo e baixado do GitHub privado para conferir SHA-256; depois é salvo no destino e descomprimido para comparar com os dados originais.

## Retenção e consulta
- Dados ativos continuam no EP Analítico.
- Eventos early-leg v2 finalizados, com mais de 48 horas, podem sair da origem somente se seus dados ainda coincidirem exatamente com a cópia verificada.
- Observações dos cinco motores, pré-sinais, shadow e Motor 6 não são apagadas por esta rotina. Mantêm a retenção anterior na origem.
- Arquivos online cobrem sete dias. Lotes cujo último registro tenha mais de sete dias podem sair do destino, mantendo a cópia verificada no GitHub.
- Copiar dados não reduz imediatamente o arquivo físico da origem; manutenção posterior recupera o espaço de linhas removidas.
- O painel contém a seção AUDITORIA CENTRAL — HISTÓRICO DE 7 DIAS, com consulta sob demanda à origem e ao arquivo, conferência SHA-256, deduplicação por ID, filtro por ativo e download dos registros completos. A leitura da origem vem primeiro para reduzir lacunas durante transferências concorrentes. Para reconstruir a auditoria também por linha de comando, use `scripts/read_ep_audit.py --table ep_early_leg_v2_events --output audit.jsonl`, com o token Supabase em variável de ambiente. O leitor confere os hashes, remove IDs duplicados e prefere a linha atual da origem.
- A rotina usa leitura progressiva, não snapshot simultâneo das duas bases.

## Execução
Workflow `Transfer EP histories to isolated storage`: diariamente às 21h de Brasília (00:00 UTC), manualmente, ou por alteração de seu script/workflow. Compartilha o mesmo grupo de concorrência do backup para impedir execução simultânea.
O backup geral continua independente; os lotes transferidos também são incluídos nas próximas cópias do schema EP.

Sete dias servem para diagnóstico inicial. Avaliar ajustes dos cinco motores exige mais semanas, resultados favoráveis e desfavoráveis e validação em dados posteriores. Nenhuma regra dos motores foi alterada.

## Verificação de implantação — 01/10/2026
Consulta no painel testada com registros reais do Motor 6. Compactação limitada à tabela de laboratório concluída; EP Analítico medido em 357.280.915 bytes após a operação. A cópia inicial dos demais históricos ainda estava em execução nessa medição. O banco continua crescendo; 450 MB não é um teto físico imposto por esta rotina.
