# Contexto da dashboard web (para quem continuar o código)

Leia antes: `../CLAUDE.md` (regras do Misael e estado do projeto). Atualizado em 2026-11-23.

## Decisão tomada (23/11): planilha descontinuada, dashboard 100% sistema de OS

O Misael decidiu: "todos o sistema de dashboards deve trazer informações do sistema novo, deve se esquecer o
sistema de planilhas que já não está mais em uso." `../PLANO_DASHBOARD_WEB.md` e o histórico do git (antes de
23/11) descrevem a arquitetura **antiga** (Apps Script + planilha Google) — ficam só como registro do porquê de
algumas escolhas de então; não representam mais o código.

Removido nessa decisão: `api/dados.js`, `api/_lib/planilha.js`, `exemplo/dados_exemplo.json`,
`exemplo/usuarios_exemplo.json`, `scripts/gerar_exemplo.py`, o botão "Demonstração" (modo de exemplo à parte) e
`recortarPorPerfil`/`TABELAS` de `api/_lib/acesso.js`. `public/js/kpis.js` foi reescrito do zero para calcular em
cima das OS (não mais ITENS/NOTAS de nota fiscal com subgrupo e itemização).

Consequência de modelo de dado (sem itemização por nota): a aba "Grupos de peças" perdeu o nível de subgrupo
(virou grupo + peça, achatado); "Pneus" perdeu nº de fogo/marca/medida (virou lista simples de OS do grupo PNE);
"Notas fiscais" perdeu a lista de itens por nota (cada nota agora é só `{numero, fornecedor, valor, arquivo}`,
sem itens). Rankings (grupo, veículo, tipo) ordenam primeiro por **contagem de OS**, não por gasto: o valor da OS
é opcional no sistema de OS, então nem toda OS tem gasto lançado — contagem é o que sempre existe. Cartões de
gasto mostram "X de Y OS com valor lançado" quando é parcial (`caveatValor` em `painel.js`).

**Cuidado:** `/api/os` sem filtro devolve no máximo `LIMITE_LISTA` (3000, em `api/os.js`) OS mais recentes. O
`/painel` e a aba "Reincidências e garantias" leem tudo de uma vez sem paginar — cobre bem enquanto a frota for
pequena; quando passar de 3000 OS, "Todo o período" e o histórico de reincidências deixam de cobrir as mais
antigas, sem avisar. Avisar o Misael antes de a frota chegar perto disso.

## Regras que valem aqui

- Responder em português. Antes de codar algo novo: plano + estrutura de pastas e esperar aprovação do Misael.
- HTML, CSS e JavaScript **puros**: sem React, sem framework, sem etapa de build, sem dependências npm.
  Única biblioteca: Chart.js 4.4.4, arquivo local em `public/vendor/` (não usar CDN; a CSP bloqueia).
- Nunca inventar valor. OS de exemplo (campo `exemplo: true`, vindo do Supabase) sempre com a faixa "AMBIENTE DE
  DEMONSTRAÇÃO" — não existe mais um modo de exemplo separado; é o mesmo dado do sistema de OS.
- **Filial nunca vê dado de outra filial.** O corte é no servidor (`/api/os` e `/api/veiculos`, via `podeVer`/
  `filiaisDe` de `public/js/os/regras.js`). Nada de filtrar por filial só no navegador.
- O navegador nunca fala direto com o Supabase. Só as funções `api/` falam, com a chave `service_role`.

## Sistema de OS (simplificado em 09/11/2026 — ver `../PLANO_OS_SIMPLIFICADA.md`)

A OS não é mais um pedido com aprovação: é um **registro de serviço já feito**. Três status: SOLICITADA (pedido de
equipe itinerante, só a filial, sem aprovação), FEITA (o lançamento), CANCELADA (só a matriz). Quem lança: mecânico
(qualquer veículo, sempre equipe interna no próprio nome, funciona **sem internet**), filial (só os veículos dela)
ou matriz (qualquer veículo) — filial/matriz escolhem equipe interna (mecânico) ou externa (oficina, texto livre).
Não existe mais mecânico auxiliar no lançamento (removido depois de 09/11; OS antigas que já tinham auxiliares
continuam mostrando, só não dá mais pra adicionar). Campos do lançamento: veículo, data do serviço (pode ser anterior, nunca futura),
grupo de peças, serviço feito, cidade, tipo de local (obra/galpão), km e/ou horímetro (um dos dois obrigatório),
fotos (frente e painel obrigatórias; 1 a 3 fotos do defeito/serviço). Uma OS feita pode responder a uma solicitação
em aberto (`os_atendida`). Valores e NF são opcionais, sem etapa própria: filial (OS dela) e matriz (todas) lançam a
qualquer momento, sem mudar o status; diretoria só vê; mecânico nunca vê. Offline: fila em IndexedDB (`js/os/fila.js`),
envio no evento online, pelo service worker (Background Sync) e ao abrir a tela; `envio_id` evita duplicar o
lançamento. Fotos reduzidas no celular (1600 px, JPEG) e enviadas por `/api/fotos` (máx. 4 MB) para o bucket privado
`os-arquivos`. O mecânico só vê as próprias OS dos últimos 7 dias (sem fila de trabalho atribuído).

## Como o código está organizado

```
dashboard_web/
├── public/                 o que o navegador baixa (estático)
│   ├── index.html          login            → js/login.js
│   ├── painel.html         dashboard        → js/painel.js (abas, filtros, desenho) — lê /api/os e /api/veiculos
│   ├── usuarios.html       só ADMIN         → js/usuarios.js
│   ├── os/index.html, os/mecanico.html       sistema de OS → js/os/*.js
│   ├── js/kpis.js          cálculos da dashboard em cima das OS, funções puras, testadas em tests/kpis.test.js
│   ├── js/graficos.js      Chart.js com cores dos tokens CSS (tema claro/escuro)
│   ├── js/sistema.js       nomes de grupos de peças
│   ├── js/os/regras.js     regras do sistema de OS (inclui relatorioReincidencias, usado pelo painel também)
│   ├── js/api.js, ui.js, tema.js
│   └── css/estilo.css, os.css   tokens em :root, escuro em prefers-color-scheme e [data-theme]
├── api/                    funções da Vercel (Node 22, ESM, só módulos nativos)
│   ├── login.js logout.js sessao.js senha.js usuarios.js os.js fotos.js veiculos.js
│   └── _lib/  http.js sessao.js senha.js acesso.js banco.js (único ponto que fala com o Supabase)
├── exemplo/                veiculos.json (cadastro da frota, gerado por gerar_veiculos.py)
├── scripts/                servidor_local.js (npm run dev), sistema_os.js (frota/exemplo/limpar/admin), gerar_veiculos.py
└── tests/                  node --test
```

Abas do painel: Visão geral, Grupos de peças (clique abre as peças do grupo), Veículos, Pneus (lista simples, sem
nº de fogo), Fornecedores (oficinas externas + fornecedores de nota), Notas fiscais (busca, CSV, sem itens),
Reincidências e garantias. Filtros: período, filial (só quem vê mais de uma), tipo, grupo, placa — a aba
Reincidências e garantias não usa filtro (cruza a frota toda). Os filtros ficam na URL (`#aba?de=...`).

## Comandos

```bash
cd dashboard_web
npm test                     # testes (node --test)
npm run dev                  # http://localhost:3000, banco local .dados_locais/ (matriz@lokal, luis@lokal, joao@lokal, diretoria@lokal / lokal1234)
npm run frota | exemplo-os | limpar-exemplo | admin -- "Nome"   # Supabase (ver docs/publicar_sistema_os.md)
vercel --prod                # publicar
```

Com `.env.local` (SESSION_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY), `npm run dev` usa o Supabase de verdade.
O banco local só existe sem `SUPABASE_URL` e nunca em produção.

## Cuidados ao mexer

- Regra nova do sistema de OS, ou novo cálculo de reincidência/garantia? Mude em `public/js/os/regras.js` (vale
  para a API, pra `/os` **e** pra `/painel`) e teste em `tests/regras.test.js` / `tests/os.test.js`. Arquivo novo
  do PWA entra na lista do `sw.js` e muda a `VERSAO` (o painel não é cacheado pelo service worker, só o PWA do
  mecânico — mas mudar `regras.js`/`comum.js`/`mecanico.js`/`os.css` ainda exige o bump).
- Mudou cálculo da dashboard? Mude em `kpis.js` e acrescente teste em `tests/kpis.test.js`.
- CSP em `vercel.json` proíbe script e style inline: nada de `<script>` dentro do HTML nem `style="..."` em HTML
  (use classe CSS ou `elemento.style` pelo JS).
- Cores de gráfico só pelos tokens `--s1..--s6`, `--serie-unica`, `--outros`. Um eixo só por gráfico. Grupo além dos
  5 maiores vira "Outros".

## Em aberto / futuro

- Situação dos ~39 veículos do pátio (MATRIZ) ainda não refletida no sistema de OS.
- Veículo sem marca de km/horímetro no cadastro (o lançamento pede os dois e exige pelo menos um preenchido).
- Limpar os exemplos (`npm run limpar-exemplo`) antes de entregar o sistema de verdade ao cliente.
- "Esqueci a senha" automático (precisa de serviço de e-mail).
- Plano Pro da Vercel se virar uso oficial da empresa (hoje é Hobby).
- Leitura automática de NF (XML/foto com IA): planejada e em stand-by, versão futura.
