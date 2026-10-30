# Contexto da dashboard web (para quem continuar o código)

Leia antes: `../CLAUDE.md` (regras do Misael e estado do projeto) e `../PLANO_DASHBOARD_WEB.md` (plano aprovado).
Atualizado em 2026-10-22.

## Regras que valem aqui

- Responder em português. Antes de codar algo novo: plano + estrutura de pastas e esperar aprovação do Misael.
- HTML, CSS e JavaScript **puros**: sem React, sem framework, sem etapa de build, sem dependências npm.
  Única biblioteca: Chart.js 4.4.4, arquivo local em `public/vendor/` (não usar CDN; a CSP bloqueia).
- Escopo fase 1: **só peças e valores** dos grupos de `sistema.js` (12 grupos do PDF + PNE). Sem km, horímetro, datas
  de parada, MTTR, disponibilidade. Esses campos existem nas planilhas, mas a dashboard não lê.
- Nunca inventar valor. Dado de exemplo sempre com a faixa "DADOS DE EXEMPLO" (botão Demonstração ou modo local).
- **Filial nunca vê dado de outra filial.** O corte é no servidor (`api/_lib/acesso.js`, lista fechada de campos).
  Nada de filtrar por filial só no navegador.
- O navegador nunca fala com o Google. Só as funções `api/` falam, com o `DASH_TOKEN`.

## Decisões tomadas (22/10)

| Tema | Decisão |
|---|---|
| Hospedagem | Vercel, plano Hobby, deploy pela CLI (`vercel --prod`), sem GitHub por enquanto |
| Fonte | Apps Script "LOKAL - Instalador": `doGet ?acao=dados` e `?acao=usuarios`, `doPost acao=usuario` (`apps_script/DashboardServidor.gs`) |
| Token | `DASH_TOKEN` próprio (o `TOKEN` antigo fica na aba CONFIG das filiais, então não serve). Gerado por `gerarTokenDashboard()` |
| Login | **Mudou em 30/10:** usuário automático `primeironome@lokal` (repetido: `andre1@lokal`, `andre2@lokal`...), senha padrão `mudar123` com troca obrigatória no 1º acesso. Usuários na tabela `usuarios` do **Supabase** (não mais na aba USUARIOS). Senha só como hash scrypt |
| Perfis | ADMIN = matriz (tudo + usuários + aprova/direciona OS + valores e NF), DIRETORIA (dashboard + consulta de OS), FILIAL (só as filiais do campo `filial`, separadas por `;`, ex.: `MATRIZ;OUTROS`), MECANICO (só `/os/mecanico`, só as OS dele) |
| Sessão | Cookie `lokal_sessao` HttpOnly assinado HMAC (`SESSION_SECRET`), 12 h (mecânico 30 dias, para fechar sem internet). O cookie leva só o login; perfil e ativo são relidos do banco (cache 1 min) |
| Cache | Dados: 5 min na função (botão ⟳ força). A junção das filiais continua a cada 15 min no Google |
| Pneus | Dentro da fase 1 (aba Pneus) |
| Gasto | Soma de `custo_total` dos ITENS (peças + mão de obra). Não usa `valor_nf` |

## Sistema de OS (30/10)

Etapas: Aguardando aprovação → Aprovada → Direcionada → Em execução → Executada → Fechada (+ Devolvida, Cancelada).
Filial abre e vai para a matriz; matriz abre já aprovada. Tipos: DIAGNÓSTICO (defeito desconhecido; fecha como
"resolvido" ou "precisa de serviço", e a matriz gera a OS de serviço ligada) e SERVIÇO. Um mecânico responsável +
ajudantes opcionais. Fechamento: km e/ou horímetro (obrigatório um dos dois), foto da placa e do serviço
(obrigatórias), fotos do painel e do horímetro (opcionais). Offline: fila em IndexedDB (`js/os/fila.js`), envio no
evento online, pelo service worker (Background Sync) e ao abrir a tela; `envio_id` evita fechamento em dobro.
Matriz lança peças, mão de obra, deslocamento/diária (opcional) e NF; filial vê valores e NF depois de Fechada.
Fotos reduzidas no celular (1600 px, JPEG) e enviadas por `/api/fotos` (máx. 4 MB) para o bucket privado `os-arquivos`.
Conflito (duas pessoas mexendo na mesma OS) devolve 409 e a tela recarrega.

## Como o código está organizado

```
dashboard_web/
├── public/                 o que o navegador baixa (estático)
│   ├── index.html          login            → js/login.js
│   ├── painel.html         dashboard        → js/painel.js (abas, filtros, desenho)
│   ├── usuarios.html       só ADMIN         → js/usuarios.js
│   ├── js/kpis.js          TODOS os cálculos, funções puras, testadas em tests/kpis.test.js
│   ├── js/graficos.js      Chart.js com cores dos tokens CSS (tema claro/escuro)
│   ├── js/sistema.js       nomes de grupos/subgrupos (gerado de data/processado/dim_sistema.csv)
│   ├── js/api.js, ui.js, tema.js
│   └── css/estilo.css      tokens em :root, escuro em prefers-color-scheme e [data-theme]
├── api/                    funções da Vercel (Node 22, ESM, só módulos nativos)
│   ├── login.js logout.js sessao.js dados.js usuarios.js
│   └── _lib/  http.js sessao.js senha.js acesso.js planilha.js (único ponto que fala com o Apps Script)
├── exemplo/                dados_exemplo.json (modo demonstração) e usuarios_exemplo.json (só modo local)
├── scripts/                servidor_local.js (npm run dev), criar_usuario.js (npm run usuario), gerar_exemplo.py
└── tests/                  node --test
```

Abas do painel: Visão geral, Grupos de peças (clique abre subgrupos/peças), Veículos, Pneus, Fornecedores, Notas
fiscais (busca, itens, CSV). Filtros: período, filial (só quem vê mais de uma), tipo, grupo, placa. Os filtros ficam
na URL (`#aba?de=...`).

## Comandos

```bash
cd dashboard_web
npm test                     # 40 testes
npm run dev                  # http://localhost:3000, banco local .dados_locais/ (matriz@lokal, luis@lokal, joao@lokal / lokal1234)
npm run frota | exemplo-os | limpar-exemplo | admin -- "Nome"   # Supabase (ver docs/publicar_sistema_os.md)
node ../tests/apps_script/simulador.js   # Apps Script simulado (28 ok), rodar da pasta lokal-bi
vercel --prod                # publicar
```

Com `.env.local` (APPS_SCRIPT_URL, DASH_TOKEN, SESSION_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY), `npm run dev`
usa a CONSOLIDAÇÃO e o Supabase de verdade. O banco local só existe sem `SUPABASE_URL` e nunca em produção.

## Estado e próximos passos

1. **Feito:** código, testes, visual conferido (computador, celular, tema escuro).
2. **Falta (Misael):** publicar seguindo `../docs/publicar_dashboard_web.md`: colar `DashboardServidor.gs` e o novo
   `doGet` do `Codigo.gs` no Instalador, Nova versão na MESMA implantação, `gerarTokenDashboard`, `vercel login`,
   variáveis, `vercel --prod`. **Antes**, configurar o Supabase (`../docs/publicar_sistema_os.md`), porque os logins
   agora moram lá: `npm run frota`, `npm run exemplo-os` (demonstração), `npm run admin -- "Nome"`.
3. **Testar depois de publicar:** navegador com 2+ contas Google e celular; usuário de filial vendo só a sua
   (F12 > Rede > dados); desativar usuário derruba o acesso em até 1 min.
4. **Em aberto / futuro:** e-mails da diretoria e das filiais; levar a página de lançamento para o mesmo projeto
   Vercel (`/lancar/` + `api/lancar/` chamando `doPost` do Instalador) se o problema de várias contas Google
   continuar; "esqueci a senha" automático (precisa de serviço de e-mail); plano Pro se virar uso oficial da empresa.

5. **Sistema de OS em aberto:** situação dos 39 veículos do pátio (MATRIZ); veículo sem marca de km/horímetro (o
   sistema pede os dois e exige um); validade de senha se quiserem; limpar exemplos antes de entregar.

## Cuidados ao mexer

- Regra nova do sistema de OS? Mude em `public/js/os/regras.js` (vale para a API e para as telas) e teste em
  `tests/regras.test.js` / `tests/os.test.js`. Arquivo novo do PWA entra na lista do `sw.js` e muda a `VERSAO`.

- Mudou cálculo? Mude em `kpis.js` e acrescente teste em `tests/kpis.test.js`.
- Campo novo vindo da planilha? Acrescente em `COLS_DASH` (DashboardServidor.gs) **e** confira que `acesso.js` corta
  por filial; teste no simulador e em `tests/acesso.test.js`.
- CSP em `vercel.json` proíbe script e style inline: nada de `<script>` dentro do HTML nem `style="..."` em HTML
  (use classe CSS ou `elemento.style` pelo JS).
- Cores de gráfico só pelos tokens `--s1..--s6`, `--serie-unica`, `--outros`. Um eixo só por gráfico. Grupo além dos
  5 maiores vira "Outros".
