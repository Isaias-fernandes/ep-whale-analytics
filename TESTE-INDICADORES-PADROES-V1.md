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

## Histórico local

- Ao clicar em `Executar e registrar`, os sinais elegíveis das duas configurações são guardados no `localStorage` do navegador.
- Um episódio ativo é atualizado nas execuções posteriores do mesmo ativo e timeframe.
- O histórico evita duplicar a mesma configuração, direção e padrão enquanto o episódio estiver ativo.
- O episódio é avaliado ao completar o horizonte ou alcançar 50%.
- São preservados no máximo 300 episódios no navegador.
- O botão `Exportar JSON` permite criar uma cópia externa dos resultados.
- Limpar dados do navegador também remove esse histórico; nesta versão não existe sincronização com Supabase.
- A janela do laboratório é exibida imediatamente acima da Central de Interpretação.
- Topos e fundos duplos exigem separação mínima, altura em ATR e rompimento da linha de pescoço.
- Sinais direcionais com volume abaixo de 0,8x ficam limitados a 64 pontos; abaixo de 1,2x ficam limitados a 79 pontos.
- Padrões neutros são armazenados como grupo de controle e medem o maior movimento absoluto posterior.
- A exportação V2 inclui os episódios e até 50 resumos completos de backtest.
