# Dashboard de Manutenção da Frota LOKAL

Painel de indicadores de manutenção (com pneus) e de cadastro/conformidade da frota de veículos pesados da LOKAL.
Pedágio e mobilização/desmobilização ficam para uma fase posterior.

> **Hoje não existe nenhum lançamento real de manutenção.** Os números de manutenção do painel vêm de
> dados de exemplo fictícios (`origem_dado = EXEMPLO`), sinalizados por uma faixa amarela em cada página.
> Tudo o que é de cadastro (frota, idade, seguro, rastreador, obras) é dado real.

## 1. Instalar (uma vez)

Requer Python 3.11 ou mais novo.

```bash
cd lokal-bi
python -m pip install -r requirements.txt
```

## 2. Rodar

```bash
python src/pipeline.py          # trata o cadastro, gera dimensões, valida lançamentos, gera dicionário de KPIs
streamlit run dashboard/app.py  # abre o painel no navegador (http://localhost:8501)
```

Quando os lançamentos reais começarem, rode `python src/pipeline.py --sem-exemplo` para não gerar mais exemplos
e, no painel, desligue **Mostrar dados de exemplo** na barra lateral (ele já começa desligado quando há dado real).

## 3. Atualizar os dados

### Cadastro da frota
1. Substitua `data/raw/FROTA ATUALIZADA - LOKAL.xlsx` pela versão nova (mesmo nome, aba `Planilha1`).
2. Rode `python src/pipeline.py`.
3. Confira `docs/relatorio_qualidade.xlsx`: problemas linha a linha, veículos irregulares e dados a obter.

Grafias novas (um fabricante de implemento, um responsável, um cliente) se corrigem em `config/mapeamentos.yaml`, sem mexer no código.

### Sistema de Lançamentos (Planilhas Google por filial)

Segunda frente, em construção: página de lançamento por link de filial (funciona com várias contas Google e no celular). Plano e guia para continuar no VS Code: `PLANO_PAGINAS.md`.

Decidido em 16/10/2026: cada responsável lança as notas fiscais numa planilha Google própria, com botões (Apps Script).
Plano em `PLANO_LANCAMENTOS.md`; instalação em `docs/instalacao_google.md`; código em `apps_script/`.
A carga inicial sai de `python src/carga_inicial.py`. Teste sem Google: `node tests/apps_script/simulador.js`.
A ligação da dashboard com a planilha de CONSOLIDAÇÃO é a próxima etapa.

### Lançamentos de manutenção: duas formas de entrada

**A. Formulário no celular (recomendado).** A aprovação do serviço vira o registro.

1. Criar o formulário (uma vez): abra <https://script.google.com>, crie um projeto, cole o conteúdo de
   `docs/formulario_google/criar_formulario.gs` e execute `criarFormulario`. O log mostra o link do formulário,
   o link de edição e a planilha de respostas. Já vêm carregadas as 407 placas e os grupos/subgrupos de peças.
2. No formulário, adicione à mão uma pergunta de upload "Foto da nota fiscal" na seção *Fechar OS*
   (o Google não permite criar upload por script).
3. Uso: ao aprovar um serviço, **Abrir OS** (um envio por item, mesmo nº de OS). Quando o veículo voltar a rodar,
   **Fechar OS** com a data/hora e o valor final da nota. Se o valor da nota diferir do aprovado, os itens são ajustados
   proporcionalmente.
4. Atualizar o painel: na planilha de respostas, *Arquivo > Fazer download > CSV*, salve como
   `data/entrada/respostas_formulario.csv` e rode `python src/pipeline.py --sem-exemplo`.
5. Se as placas ou os grupos mudarem, rode o pipeline e recrie o formulário (ou edite as listas no Google Forms).

**B. Template Excel.** Para carga em lote (ex.: histórico) ou para quem prefere planilha:
`data/entrada/fato_manutencao.xlsx`, aba `OS`. Tem listas suspensas de placa, tipo, grupo, subgrupo (muda conforme o
grupo) e peça (muda conforme o subgrupo), campos de pneu e instruções na primeira aba. O pipeline nunca sobrescreve
esse arquivo; para recriá-lo vazio: `python src/gerar_templates.py --forcar`.

As duas fontes podem ser usadas juntas. Cada item recebe um `status_validacao`:

| Status | Significado |
|---|---|
| OK | entra em todos os indicadores |
| A CLASSIFICAR | sem grupo/subgrupo válido; aparece na fila da página Cadastro e Conformidade (nunca vira "Outros") |
| INCONSISTENTE | ex.: peça de implemento de outro tipo de veículo, Arla/SCR em veículo sem o sistema, pneu sem nº de fogo |
| ERRO | placa fora do cadastro, sem data, conclusão antes da abertura, item duplicado |

Detalhe em `docs/validacao_manutencao.xlsx`.

## 4. Parâmetros e metas

`config/parametros.yaml` controla, sem mexer no código:
- semáforos (verde/amarelo/vermelho) de disponibilidade, % corretiva, % preventiva, MTTR, backlog, reincidência, rastreador e seguro;
- dias para considerar reincidência (padrão 30), horas de operação por dia (padrão 24), vida mínima do pneu;
- ano de início de Arla/SCR (2012, Proconve P7) e de DPF (2023, Proconve P8);
- `pto_como_grupo_proprio`: `true` tira a tomada de força de TRA e cria o grupo PTO.

## 5. O que tem em cada pasta

| Caminho | Conteúdo |
|---|---|
| `data/raw/` | cópias das planilhas de origem (nunca alteradas) |
| `data/entrada/` | template Excel e CSV de respostas do formulário |
| `data/exemplo/` | dados fictícios |
| `data/processado/` | modelo estrela em CSV (separador `;`): `dim_veiculo`, `dim_sistema`, `dim_implemento_pecas`, `dim_criticidade_tipo`, `dim_calendario`, `dim_obra`, `fato_manutencao` |
| `docs/` | relatório de qualidade, validação dos lançamentos, dicionário de KPIs, script do formulário |
| `src/` | tratamento, validação, KPIs e insights |
| `dashboard/` | painel Streamlit (Visão Executiva, Manutenção, Cadastro e Conformidade) |
| `tests/` | testes do parsing (`python -m pytest tests`) |

**Power BI:** os CSVs de `data/processado/` formam um modelo estrela pronto. Ligue todas as tabelas a
`dim_veiculo` pela coluna `placa`, `fato_manutencao.cod_subgrupo` a `dim_sistema.cod_subgrupo` e
`fato_manutencao.data_abertura` a `dim_calendario.data`. As fórmulas estão em `docs/dicionario_kpis.xlsx`.

## 6. Regras de cálculo importantes

- **Disponibilidade física** = 1 − horas paradas ÷ (horas de operação × dias × veículos). OS aberta conta como parada até hoje.
- **MTBF** = (horas de operação da frota − horas paradas em corretiva) ÷ nº de OS corretivas. **MTTR** = média de horas paradas das OS corretivas concluídas.
- **Custo por km** usa a diferença entre a maior e a menor leitura de km nas OS de cada veículo no período (precisa de ≥ 2 leituras).
- Numa OS com vários grupos, as horas paradas são divididas igualmente entre os grupos.
- **Reincidência**: mesma peça, mesma placa, em menos de X dias (preventivas fora).
- Os 20 Volvo VM 360 sem placa usam a placa provisória `SEM-PLACA-<6 últimos do chassi>`; a chave técnica é o chassi.

## 7. Dados que ainda faltam

1. Lançamentos reais de manutenção (formulário ou template), com datas de abertura e conclusão.
2. Placa e tipo de implemento dos 20 Volvo VM 360.
3. Capacidade do tanque de 248 pipas.
4. UF de 63 obras e data de mobilização de 13 veículos mobilizados.
5. Situação de seguro de 25 veículos e rastreador de 34.
