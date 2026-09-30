# EP: arquivo de históricos e retenção de 7 dias

Estado em 30/09/2026:
- Retenção do EP Analítico alterada de 24 horas para 7 dias.
- Limpeza bloqueada até existir um arquivo verificado recente.
- Script e workflow publicados; cópia automática ainda depende dos Secrets abaixo.
- Não houve recuperação de detalhes anteriormente apagados.

## Ativação (sem enviar senhas no chat)
1. Crie um repositório GitHub PRIVADO chamado `ep-historicos`, com um README.
2. Crie um token de acesso com acesso apenas a esse repositório e permissão Contents: Read and write.
3. Em `ep-whale-analytics > Settings > Secrets and variables > Actions`, cadastre:
   - `EP_ARCHIVE_REPOSITORY`: `Isaias-fernandes/ep-historicos`
   - `EP_ARCHIVE_TOKEN`: token do destino privado.
   - `EP_ANALYTICS_DATABASE_URL`: conexão Postgres do projeto `qhgclnkctpzumtybailv`.
   - `EP_MARKET_DATABASE_URL`: conexão Postgres do projeto `iayxjarkeefbzjbpfurl`.
   Use conexão de sessão do Supabase (Session pooler) compatível com o runner; inclua a senha na URL e mantenha-a somente nos Secrets. O usuário precisa ler os históricos EP; no projeto analítico precisa inserir em `private.ep_github_archive_receipts`.
4. Em Actions, abra `Archive EP histories` e clique Run workflow.
5. Confirme conclusão verde e a Release privada contendo `manifest.json` e arquivos `.jsonl.gz`.
6. A rotina então gravará um comprovante no banco; só depois a limpeza de registros com mais de 7 dias fica liberada.

## Funcionamento
Executa diariamente às 01h UTC (22h de Brasília do dia anterior), antes da limpeza às 03h17 UTC.
Exporta todas as tabelas centrais `public.ep_*` dos dois projetos e o schema `ep_market_history`.
Não seleciona pacientes, medicamentos, estoque ou dispensações.
Cada projeto é lido em uma transação consistente; arquivos são divididos em blocos e compactados.
Cada arquivo é baixado do GitHub novamente e seu tamanho/SHA-256 é conferido antes do comprovante.
Arquivos ficam como assets de Releases no repositório privado, evitando crescimento do histórico Git do código.
Em falha, não grava comprovante. Sem comprovante recente, a limpeza do EP Analítico não apaga os registros.
Snapshots de projetos distintos têm horários próprios, informados no manifesto.
Não são incluídos dados existentes apenas no localStorage do navegador: precisam de coleta/exportação própria.
A retenção do mapa multitemporal mantém sua configuração anterior; apenas a limpeza diária do EP Analítico foi alterada.

## Capacidade e limitações
O projeto analítico estava no plano Free, com aproximadamente 356 MiB no momento da mudança.
A retenção de 7 dias pode exceder a capacidade do plano; enquanto o arquivo não estiver ativo a limpeza fica bloqueada e o banco cresce.
Não foi contratado plano nem alterada a frequência dos motores.
Ainda é necessário validar uma execução real com os Secrets antes de considerar o backup operacional.
Releases incompletas podem permanecer como drafts e não liberam a limpeza.
