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
   - `EP_SUPABASE_ACCESS_TOKEN`: token pessoal Supabase com Database: Read-write restrito aos dois projetos.
   Não precisa de senha de banco, URL Postgres, serviço pooler ou chave service_role.
   No token, deixe os demais recursos sem acesso. Guarde o código somente nos Secrets.
4. Em Actions, abra `Archive EP histories` e clique Run workflow.
5. Confirme conclusão verde e a Release privada contendo `manifest.json` e arquivos `.jsonl.gz`.
6. A rotina então gravará um comprovante no banco; só depois a limpeza de registros com mais de 7 dias fica liberada.

## Funcionamento
Executa diariamente às 01h UTC (22h de Brasília do dia anterior), antes da limpeza às 03h17 UTC.
Exporta `public.ep_*` do EP Analítico e somente o schema `ep_market_history` da Gestão Farmacêutica.
Não seleciona pacientes, medicamentos, estoque ou dispensações.
Leitura pela Management API em páginas de 1.000 linhas, usando a chave primária e o maior identificador existente no início de cada tabela como limite. Novas chaves acima desse limite ficam para a próxima cópia. Atualizações de valores são lidas conforme cada página é exportada; não é um snapshot global nem um backup MVCC de um instante único. As chaves primárias devem permanecer estáveis. Confere contagem inicial, exportada e final no intervalo; se não conferir, tenta até três vezes e falha sem comprovante. Horários por tabela constam no manifesto. Os arquivos são divididos em blocos e compactados.
Cada arquivo é baixado do GitHub novamente e seu tamanho/SHA-256 é conferido antes do comprovante.
Arquivos ficam como assets de Releases no repositório privado, evitando crescimento do histórico Git do código.
Em falha, não grava comprovante. Sem comprovante recente, a limpeza do EP Analítico não apaga os registros.
As tabelas têm horários próprios; não é um snapshot global simultâneo dos dois projetos.
Não são incluídos dados existentes apenas no localStorage do navegador: precisam de coleta/exportação própria.
A retenção do mapa multitemporal mantém sua configuração anterior; apenas a limpeza diária do EP Analítico foi alterada.

## Capacidade e limitações
O projeto analítico estava no plano Free, com aproximadamente 356 MiB no momento da mudança.
A retenção de 7 dias pode exceder a capacidade do plano; enquanto o arquivo não estiver ativo a limpeza fica bloqueada e o banco cresce.
Não foi contratado plano nem alterada a frequência dos motores.
Ainda é necessário validar uma execução real com os Secrets antes de considerar o backup operacional.
Releases incompletas podem permanecer como drafts e não liberam a limpeza.

## Versão API — 30/09/2026
Script e workflow adaptados para token único Supabase. Sintaxe, paginação, compactação e rejeição de exportação incompleta foram testadas; consulta de visibilidade testada no banco. Execução completa com token do usuário ainda precisa ser confirmada em Actions. Use Run workflow em main (reexecutar a execução antiga mantém o programa antigo).
A Management API de consultas está em beta e pode mudar. O token Database permite operações amplas nos dois bancos; o programa limita a leitura aos históricos EP e a escrita ao comprovante privado. Não exporta tabelas da farmácia.

Correção 30/09/2026: uma execução falhou porque ep_early_leg_v2_events recebeu atualizações durante a exportação. A versão 3 do manifesto identifica a consistência como rolling-per-table-primary-key-high-watermark. Substituído filtro por xmin por limite de chave primária; acrescentado progresso a cada 10.000 registros. Testes verificaram aceitação de atualizações, paginação delimitada, tabelas vazias e rejeição de registros faltantes. Ainda é necessário validar a execução completa com os Secrets.
