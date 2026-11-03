# MM Validação v1 — filtros e saídas em modo observador

Teste prospectivo iniciado em 03/11/2026. Sem ordens e sem alterações em score, direção, tiers, entradas ou saídas oficiais. As regras ficam fixas nesta versão; novos parâmetros exigem uma nova versão para evitar selecionar retrospectivamente o melhor resultado.

## Hipóteses avaliadas

| Versão | Admissão | Saída |
| --- | --- | --- |
| Referência por motores | ≥3 motores | Perda para ≤1 motor ou mudança de direção |
| Técnico + Estrutura | Referência + ambos `ok:true` | Igual à referência |
| OI/funding | Referência + derivativos disponíveis e filtros abaixo | Igual à referência |
| Combinados | Técnico + Estrutura + OI/funding | Igual à referência |
| ATR | Igual à referência | Proteção por ATR |
| Combinados + ATR | Todos os filtros | Proteção por ATR |

Filtro derivativo: exclui |funding| >0,08% ou queda de OI inferior a −0,35% quando o preço avançou na direção indicada na mesma janela de início/fim do OI. Usa os closes M5 conhecidos nos horários de OI, com tolerância de uma vela. Ausência de dados é distinta de zero e bloqueia apenas as versões dependentes desses dados. Os limiares são hipóteses, não recomendações de investimento.

## Ciclo e execução simulada

- Uma admissão por ativo/direção até perder para ≤1 motor ou mudar de direção; contagem 2 mantém o ciclo. Reversões encerram a referência antiga e abrem novo episódio se já houver ≥3 motores.
- Esta referência prospectiva segmenta corretamente as reversões. Não reproduz o defeito do histórico legado que podia manter a mesma entrada durante troca de direção.
- As seis versões recebem a mesma abertura M5 posterior à observação original, quando aceitas. Uma rejeição é definitiva para aquele caso, sem esperar um resultado favorável para mudar a admissão.
- Saída por sinal é agendada para a próxima abertura M5 após a coleta detectar o encerramento/reversão. Se o sinal acabar antes da entrada planejada, a entrada é cancelada, sem custo fictício.
- ATR inicial usa 14 true ranges anteriores à entrada. Proteção a 3× ATR M5. Após cada vela fechada, a máxima favorável e o ATR atualizam a proteção da próxima vela; a proteção nunca afrouxa.
- BUY e SELL são calculados separadamente. Se a abertura ultrapassar o stop, a saída usa a abertura, incorporando o gap. Se o toque ocorrer dentro da vela, o horário registrado é o fechamento da vela como limite superior; não se inventa a trajetória intravela.
- Limite comum de 48h, custo hipotético total de 0,20% por operação. Sem alavancagem, funding acumulado, tamanho de posição ou slippage adicional fora dos gaps. Não representa retorno de carteira nem taxas reais da conta.
- Lacunas, entrada ausente ou ATR ausente ficam explícitos e saem das médias com cobertura completa. As excursões da vela de saída por stop são desconhecidas e não entram como extremos exatos.

## Comparação

Cada caso mantém todas as versões. O relatório mostra o controle nos mesmos casos admitidos, delta pareado de saída quando ambos completaram, prejuízos do controle evitados pelos filtros e lucros do controle que os filtros teriam descartado. Diferenças agregadas entre amostras não são tratadas como efeitos causais. Significância e resultados fora da amostra ainda precisam de dados.

## Consumo e persistência

A coleta continua `0 * * * *`. Nenhuma nova consulta Binance; são usadas as mesmas 220 velas M5. Um RPC em lote recebe as observações e calcula no banco, sem exportar todos os casos ao coletor. A nova tabela `ep_multimotor_shadow_tests` adiciona armazenamento e processamento; não há promessa de consumo total zero. O arquivo diário existente de `public.ep_*` inclui esta tabela. Não foi adicionada limpeza que apague o histórico.

O painel consulta sob demanda, com cache de uma hora, pela rota protegida `ep-24x7-status?view=mm-validation`. Os caches existentes permanecem. A exportação do painel contém somente os 30 casos recentes da resposta, além do resumo global. A tabela tem RLS, sem acesso direto de anon/authenticated; o acesso é pelo backend.

## Testes

- `node --test multimotor-test-core.test.cjs`: isolamento dos filtros, indisponibilidade, BUY/SELL, ATR sem uso de velas futuras e lacunas.
- `scripts/test-mm-validation.sql`: teste transacional com rollback de entradas/saídas, ATR BUY/SELL, gaps, custo, limite 48h, cancelamento, idempotência e segmentação de reversões.
- `node scripts/check-traffic-protection.mjs`: caches e proteção de tráfego.
