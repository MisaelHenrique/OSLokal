# Contexto do projeto LOKAL BI (leia antes de propor qualquer coisa)

Atualizado em 2026-11-09. **Uma coisa só agora: `dashboard_web/`.** Em 30/10 o Misael decidiu que o sistema de OS
(Supabase) substitui o sistema de lançamento por planilhas Google — tudo relacionado a ele (Apps Script, as duas
frentes de lançamento por planilha/link, o dashboard Streamlit, o pipeline Python que alimentava os dois) foi
apagado do projeto. Não existe mais fora de `dashboard_web/`.

Em 09/11 o fluxo do sistema de OS em si mudou bastante: saiu aprovação/direcionamento/execução, entrou lançar um
serviço já feito. Ver `PLANO_OS_SIMPLIFICADA.md` (plano aprovado) e a seção "Decisões tomadas em 2026-11-09".

## Regras do Misael (valem sempre)

- Responder em português.
- Antes de codar, apresentar plano e estrutura de pastas e esperar aprovação.
- Nunca inventar valores reais. Sem lançamentos, usar exemplos sinalizados e marcar os KPIs dependentes como
  "aguardando dados".
- Dado insuficiente ou inconsistente: destacar e dizer exatamente qual dado falta.
- Commits a partir de 2026-10-30 seguem **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `test:`,
  `refactor:`...). O commit inicial (antes desse pedido) não segue.
- Repositório git em `OSLokal` (GitHub). Só commitar quando o Misael pedir explicitamente ("commita"/"pode
  commitar"), só dar `git push` quando ele pedir explicitamente.

## Escopo

Manutenção da frota (com pneus) pelo **sistema de OS**: a OS é um registro de serviço já feito (lançamento), não
mais um pedido com aprovação. Pedágio e mobilização/desmobilização continuam fora, sem fonte definida.

## Estado real (não confundir apresentação com produção), tudo em `dashboard_web/`

| Parte | Estado |
|---|---|
| **Sistema de OS** (rotas `/os` e `/os/mecanico`, banco Supabase — `banco/esquema.sql`) | Reescrito em 09/11 pro fluxo simplificado (48/48 testes): mecânico, filial ou matriz **lança** uma OS já feita (equipe interna ou oficina externa); filial também pode **solicitar** equipe itinerante sem aprovação; só a matriz cancela; valores/NF são opcionais, sem etapa própria. Login próprio (usuário gerado tipo `andre@lokal`, senha padrão `mudar123`). **Demo online publicada** (link na seção "Decisões tomadas em 2026-11-09" abaixo) mas ainda no esquema **antigo** (aprovação/direcionamento) — falta rodar `banco/atualizar_simplificado.sql` nela, reseedar e fazer novo deploy antes de mostrar ao cliente de novo |
| **`/painel`** (indicadores) | Existe, mas **sem fonte de dado real agora**: lia a planilha Google via `apps_script/DashboardServidor.gs`, que foi apagado junto com o resto do Apps Script em 30/10. `api/_lib/planilha.js` (dentro de `dashboard_web/`) não foi tocado de propósito — o Misael vai religar isso no Supabase/sistema de OS pessoalmente. **Lembrete pendente: perguntar por essa reconexão quando o Misael pedir a versão final do sistema para entrega** — sem ela o `/painel` só mostra o modo de exemplo |
| Lançamentos reais de manutenção | Nenhum ainda. Só dado de exemplo (`npm run exemplo-os`) |

## Onde ler cada coisa

| Arquivo | O quê |
|---|---|
| `README.md` | Visão geral do projeto |
| `PLANO_DASHBOARD_WEB.md` | Plano original do `/painel` (arquitetura, indicadores) — a parte de fonte de dado (planilha Google) está desatualizada |
| `docs/ATUALIZACAO_SISTEMA_OS.md` | **Ler antes de mexer no sistema de OS**: o que é, como funciona, como rodar e publicar, arquivos |
| `docs/publicar_sistema_os.md` | Passo a passo de publicar o sistema de OS (Supabase + Vercel) |
| `docs/publicar_dashboard_web.md` | Como publicar o `/painel` — parte da fonte de dado (Apps Script) está desatualizada, ver "Estado real" |
| `dashboard_web/CONTEXTO.md` | Regras, decisões, organização do código, próximos passos |
| `dashboard_web/banco/esquema.sql` | Tabelas do Supabase (usuarios, veiculos, os, os_eventos, arquivos) |
| `dashboard_web/public/js/os/regras.js` | Regras do sistema de OS (quem vê/faz o quê, validações) — ler antes de mudar qualquer comportamento |
| `dashboard_web/tests/` (`npm test`, dentro de `dashboard_web/`) | 48 testes: `kpis`, `acesso`, `api`, `sessao` (`/painel`) + `regras`, `os` (sistema de OS) |
| `PLANO_OS_SIMPLIFICADA.md` | Plano aprovado do fluxo novo do sistema de OS (09/11) — leia antes de mexer no fluxo |

## Decisões tomadas em 2026-10-30 (Misael)

- **O sistema de OS (Supabase) substitui o sistema de lançamento por planilhas Google.** Não é mais "as duas
  coisas em paralelo" — era a dúvida registrada aqui até 30/10, agora resolvida. Motivo dado: a base de dados
  passa a ser os dados do sistema de OS vindos do Supabase.
- **Apagado nessa decisão:** `apps_script/` inteira (Codigo.gs, Dados.gs, DashboardServidor.gs, Formulario.html,
  Pagina.gs, Pagina.html), o dashboard Streamlit (`dashboard/`), o pipeline Python (`src/`), `config/`, `data/`,
  `PLANO.md`, `PLANO_LANCAMENTOS.md`, `PLANO_PAGINAS.md`, `docs/instalacao_google.md`,
  `docs/formulario_google/`, `tests/apps_script/` e os testes Python da raiz. Se precisar de algo desse histórico
  (por que uma decisão de modelagem foi tomada, por exemplo), não existe mais neste projeto — só na memória da
  conversa que levou a isso.
- **Não mexer em `dashboard_web/` por enquanto** (pedido do Misael, 30/10): ele vai fazer pessoalmente as mudanças
  pra religar o `/painel` no Supabase. Não alterar `api/_lib/planilha.js`, `api/dados.js` nem nada da pasta sem
  ele pedir.

## Decisões tomadas em 2026-11-09 (Misael)

- **Sistema de OS simplificado**, depois do retorno do cliente (Alessandro, Lokal RJ): saiu o fluxo de aprovação →
  direcionamento → execução → fechamento; entrou lançar diretamente um serviço já feito. Plano completo, aprovado
  às 18h21, em `PLANO_OS_SIMPLIFICADA.md` (discussão: `https://claude.ai/artifact/Pg46HTZGMdhWZadK5MK8uB`).
- Reescritos nessa decisão: `public/js/os/regras.js`, `api/os.js`, `api/fotos.js`, `api/veiculos.js` (mecânico
  agora lista o cadastro inteiro), `api/_lib/exemplo_os.js`, `public/js/os/{app,comum,mecanico,fila}.js`,
  `public/css/os.css`, `banco/esquema.sql` (+ `banco/atualizar_simplificado.sql` pra banco já existente),
  `tests/{regras,os}.test.js`, `public/sw.js` (VERSAO `lokal-os-v2`). Os testes passam (48/48) e a interface foi
  conferida no navegador (matriz, filial, mecânico; desktop e celular; fluxo offline→sincronização).
  Não mexido: tudo de `/painel` (`planilha.js`, `dados.js`, `painel.js`, `kpis.js`) — fora do escopo do plano.
- **Migrado e publicado em 09/11**, a pedido do Misael ("pode migrar e publicar o fluxo novo para demonstração"):
  rodei `banco/atualizar_simplificado.sql` (colado por ele no SQL Editor do Supabase, eu não tenho login lá),
  `npm run limpar-exemplo`, `npm run frota` e `npm run exemplo-os` (19 usuários, 35 OS: 25 feitas, 8 solicitações,
  2 canceladas) — todos no `.env.local` religado durante a janela da migração, depois comentado de novo.
  **Link novo e estável para mandar ao cliente:** `https://lokal-frota.vercel.app` (alias de produção da Vercel,
  atualiza sozinho a cada `vercel deploy --prod`).
  **Engano meu que vale registrar:** eu tinha dito que ia manter o link antigo de preview
  (`lokal-frota-kw7lpnat9-...vercel.app`) via `vercel alias`, mas a Vercel não deixa realiasar uma URL de
  deployment (só aliases "limpos"). Esse link antigo agora está quebrado pro cliente — mesmo código velho
  (aprovação/direcionamento), mas falando com o banco já migrado, então mostra campos em branco e abas sempre
  vazias. **Não existe mais motivo pra usar esse link antigo; só o `lokal-frota.vercel.app` daqui pra frente.**
- **Tela inicial do sistema de OS ganhou "Lançamentos recentes"** (os últimos 8, abaixo da busca por placa):
  o Misael apontou que a tela só com "Nova OS" + busca vazia parecia sem dado nenhum pra mostrar ao cliente.
  Isso não contraria o plano — "nada de contador ou lista de pendentes" no plano é sobre a tela de **solicitar**
  equipe itinerante, não sobre a tela inicial. Publicado junto, mesmo link.
- **`/painel` não quebrou nessa sessão** — ela nunca teve fonte de dado real desde 30/10 (ver linha acima na
  tabela "Estado real"); precisa clicar em "Demonstração" no topo pra mostrar os dados de exemplo. Não é
  automático, e isso já era assim antes de eu mexer em qualquer coisa. Nenhum arquivo de `/painel` foi tocado.

## Decisões em aberto (não decidir sozinho)

- **Como exatamente o `/painel` vai ler do Supabase** (direto da tabela `os`, ou de uma view/agregação própria) —
  o Misael vai decidir e implementar isso pessoalmente; não propor uma solução sem ele pedir.
- **Leitura automática de NF** (XML/foto com IA): planejada e em stand-by, versão futura.
- Diretoria (logins do dashboard) e e-mails/logins reais das filiais e mecânicos: depois da aprovação do cliente.
