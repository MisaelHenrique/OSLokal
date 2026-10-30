# Contexto do projeto LOKAL BI (leia antes de propor qualquer coisa)

Atualizado em 2026-10-30. **Uma coisa só agora: `dashboard_web/`.** Em 30/10 o Misael decidiu que o sistema de OS
(Supabase) substitui o sistema de lançamento por planilhas Google — tudo relacionado a ele (Apps Script, as duas
frentes de lançamento por planilha/link, o dashboard Streamlit, o pipeline Python que alimentava os dois) foi
apagado do projeto. Não existe mais fora de `dashboard_web/`.

## Regras do Misael (valem sempre)

- Responder em português.
- Antes de codar, apresentar plano e estrutura de pastas e esperar aprovação.
- Nunca inventar valores reais. Sem lançamentos, usar exemplos sinalizados e marcar os KPIs dependentes como
  "aguardando dados".
- Dado insuficiente ou inconsistente: destacar e dizer exatamente qual dado falta.
- Pasta sem git — qualquer exclusão é definitiva. Confirmar com o Misael antes de apagar algo grande.

## Escopo

Manutenção da frota (com pneus) pelo **sistema de OS**: abertura → aprovação → execução → fechamento com valores.
Pedágio e mobilização/desmobilização continuam fora, sem fonte definida.

## Estado real (não confundir apresentação com produção), tudo em `dashboard_web/`

| Parte | Estado |
|---|---|
| **Sistema de OS** (rotas `/os` e `/os/mecanico`, banco Supabase — `banco/esquema.sql`) | Codado, revisado e testado em 30/10 (43/43 testes). Fluxo completo: filial abre → matriz aprova/direciona → mecânico executa (funciona **sem internet**, PWA) → matriz lança valores e fecha. Login próprio (usuário gerado tipo `andre@lokal`, senha padrão `mudar123`). **Ainda não publicado** — falta criar o projeto Supabase e seguir `docs/publicar_sistema_os.md`. Revisão de código em 30/10 não achou bug nenhum |
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
| `dashboard_web/tests/` (`npm test`, dentro de `dashboard_web/`) | 43 testes: `kpis`, `acesso`, `api`, `sessao` (`/painel`) + `regras`, `os` (sistema de OS) |

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

## Decisões em aberto (não decidir sozinho)

- **Como exatamente o `/painel` vai ler do Supabase** (direto da tabela `os`, ou de uma view/agregação própria) —
  o Misael vai decidir e implementar isso pessoalmente; não propor uma solução sem ele pedir.
- **Leitura automática de NF** (XML/foto com IA): planejada e em stand-by, versão futura.
- Diretoria (logins do dashboard) e e-mails/logins reais das filiais e mecânicos: depois da aprovação do cliente.
