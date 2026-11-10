# Plano aprovado: sistema de OS simplificado (09/11/2026)

Aprovado pelo Misael em 09/11/2026 às 18h21, depois do retorno do cliente (Alessandro, Lokal RJ).
Discussão completa: https://claude.ai/artifact/Pg46HTZGMdhWZadK5MK8uB

Tudo acontece dentro de `dashboard_web/`. Antes de mudar, rode `npm test` para ver a base passando.

## Ideia central

A OS deixa de ser um pedido que passa por aprovação e vira um **registro de serviço já feito**.
O aplicativo tem só duas coisas: **Nova OS** e **consultar o histórico do caminhão pela placa**.

## Etapas

| Etapa | Quando |
| --- | --- |
| SOLICITADA | Filial pede a equipe itinerante para um veículo (botão discreto). |
| FEITA | Alguém lança o serviço já realizado. Valores e NF são campos opcionais dentro da OS, sem etapa e sem aviso de pendência. |
| CANCELADA | Só a matriz, para registro errado. |

Saem: AGUARDANDO_APROVACAO, DEVOLVIDA, APROVADA, DIRECIONADA, EM_EXECUCAO, EXECUTADA, FECHADA,
tipo DIAGNOSTICO, resultado do diagnóstico, gerar OS de serviço ligada, aviso de veículo parado,
direcionar para mecânico e a fila "Minhas OS" do mecânico.

## Perfis

| Ação | Mecânico | Filial | Matriz (inclui o "gerente de manutenção") | Diretoria |
| --- | --- | --- | --- | --- |
| Lançar OS feita | Qualquer veículo; sempre INTERNA; no nome do logado (fixo) + até 3 auxiliares; funciona offline | Veículos da filial; INTERNA ou EXTERNA | Qualquer veículo; INTERNA ou EXTERNA | Não |
| Solicitar equipe itinerante | Não | Sim, veículos da filial | Vê as solicitações abertas (link no menu, fora da tela principal) | Não |
| Valores e NF (opcionais) | Não vê | OS da filial | Todas | Vê |
| Corrigir ou cancelar OS | Não | Não | Sim | Não |
| Histórico por placa | Não; vê só as próprias OS dos últimos 7 dias, com estado do envio | Só veículos da filial | Todos | Todos |

## Tela "Nova OS" (lançar serviço feito)

1. Veículo (busca por placa, modelo ou final do chassi, como hoje).
2. Data do serviço (padrão hoje; pode ser anterior; nunca futura).
3. Grupo de peças (lista atual `GRUPOS`).
4. Serviço feito (texto, obrigatório).
5. Cidade (texto livre, obrigatório).
6. Tipo de local: `OBRA` ou `GALPAO` (obrigatório; sem campo de nome da obra).
7. Quem fez:
   - Mecânico logado: fixo "Interna", responsável = ele, até 3 auxiliares (lista de mecânicos).
   - Filial e matriz: escolhem `INTERNA` (mecânico da lista + até 3 auxiliares) ou `EXTERNA`
     (nome da concessionária ou oficina, texto livre com sugestões dos nomes já usados).
8. Km e/ou horímetro (números; pelo menos um, como hoje).
9. Fotos, no máximo 5: `frente` (frente do caminhão com a placa, obrigatória), `painel` (km/horímetro,
   obrigatória), `defeito1..3` (pelo menos 1).
   O toque abre a câmera traseira (`capture="environment"`); link pequeno "escolher da galeria" usa um
   input sem `capture`.
10. Se o veículo tem SOLICITADA aberta: perguntar "Esta OS atende a solicitação de DD/MM?". Se sim, a
    solicitação fica ligada à OS (`os_atendida`) e sai das abertas.

Mecânico: a tela inicial é só o botão grande "Lançar OS realizada" e, abaixo, as OS que ele enviou nos
últimos 7 dias. O envio continua pela fila offline (IndexedDB + service worker).

## Solicitar equipe itinerante (filial)

Botão discreto na tela da filial. Campos: veículo, o que está acontecendo, cidade, obra ou galpão,
fotos opcionais. Entra como SOLICITADA, sem aprovação. Nada de contador ou lista de pendentes na tela
principal.

## Tela inicial de matriz e filial

Botão Nova OS em cima; busca por placa embaixo. Placa → histórico do caminhão no modelo do Excel do
cliente ("MANUTENÇÃO LOKAL FILIAL"):

- Cabeçalho: Placa · Tipo · Modelo · Ano (do cadastro da frota).
- Linhas (mais nova em cima): Data · Grupo · Serviço feito · Km/hor · Responsável (mecânico ou oficina
  externa) · NF · Valor ("–" quando vazio).
- No celular, cada linha vira um cartão; tocar abre o detalhe da OS (fotos, valores, NF).

## Arquivos que mudam

| Arquivo | Mudança |
| --- | --- |
| public/js/os/regras.js | STATUS, permissões (`podeVer`, `acoesPossiveis`, `podeAbrir`), `erroAbertura`/`erroFechamento` viram uma conferência de lançamento; fotos novas; auxiliares ≤ 3 |
| api/os.js, api/fotos.js | Lançar, solicitar, valores pela filial, cancelar só matriz, até 5 fotos |
| public/js/os/app.js | Telas de matriz e filial (Nova OS, busca por placa, histórico, detalhe, solicitar) |
| public/js/os/mecanico.js, fila.js | Mecânico só lança; lista dos últimos 7 dias; offline |
| public/js/os/comum.js, public/css/os.css | Botão de foto com câmera direta e link de galeria |
| banco/esquema.sql + script de atualização | Colunas: `execucao` (INTERNA/EXTERNA), `oficina_externa`, `auxiliares`, `data_servico`, `cidade`, `tipo_local`, `foto_frente`, `foto_painel`, `fotos_defeito`, `os_atendida`; status novos |
| api/_lib/exemplo_os.js, scripts/sistema_os.js | Exemplo no fluxo novo |
| tests/os.test.js, tests/regras.test.js | Testes do fluxo novo |
| docs/publicar_sistema_os.md | Guia atualizado |

Colunas novas só no fim. O sistema ainda não foi publicado: não há OS reais para migrar.

## Fica para depois

- Área de cadastro de veículos, empresas e contratos para matriz e filial.
- Importar o histórico do Excel do cliente (desde 2022).
- Atualizar a proposta comercial e a apresentação de slides.
