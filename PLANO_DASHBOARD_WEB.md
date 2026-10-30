# Dashboard web LOKAL (HTML, CSS e JavaScript na Vercel) — plano para aprovação

Versão de 22/10/2026. **Aprovado em 22/10 (login e-mail+senha, filiais com login, pneus na fase 1, Vercel Hobby) e construído** em `dashboard_web/` + `apps_script/DashboardServidor.gs`. Publicação: `docs/publicar_dashboard_web.md`. Substitui, quando aprovado, a publicação da dashboard Streamlit prevista no
PLANO_LANCAMENTOS.md (etapa 5). A Streamlit (`dashboard/`) continua no projeto como referência até a nova ficar pronta.

## 1. O que muda

| | Hoje (Streamlit) | Nova dashboard |
|---|---|---|
| Tecnologia | Python + Streamlit + Plotly | HTML, CSS e JavaScript puros, sem framework e sem etapa de build |
| Dados | CSV de exemplo local, não lê o Google | Lê a planilha **LOKAL – CONSOLIDAÇÃO** automaticamente |
| Hospedagem | Só no seu computador | Vercel (plano gratuito), endereço tipo `lokal-frota.vercel.app` |
| Login | Nenhum | E-mail e senha, com perfil (diretoria vê tudo, filial vê só a sua) |
| Escopo | Manutenção completa (km, MTTR, disponibilidade) | **Só peças e valores** dos 12 grupos da lista Grupos_de_Pecas_Frota_LOKAL.pdf. Sem km, horímetro, datas de parada |

## 2. Arquitetura

```
 Navegador (diretoria ou filial)
    │  https://lokal-frota.vercel.app        ← HTML/CSS/JS estáticos
    │  fetch('/api/dados')  com cookie de sessão
    ▼
 Vercel — funções serverless em JavaScript (pasta api/)
    │  1. confere o login (cookie assinado, httpOnly)
    │  2. busca os dados no Apps Script com um token secreto (só a Vercel conhece)
    │  3. se o usuário é de filial, CORTA tudo que não é dele antes de responder
    │  4. guarda em cache por 5 min
    ▼
 Apps Script "LOKAL - Instalador" — doGet ?acao=dados&token=…   (já existe, ganha 1 ação)
    ▼
 LOKAL – CONSOLIDAÇÃO (NOTAS, ITENS, VEICULOS, FILIAIS, USUARIOS)
    ▲
 Planilhas das filiais / páginas de lançamento ── junção a cada 15 min ──┘
```

Por que assim:

- **Sem problema de várias contas Google.** Quem conversa com o Google é o servidor da Vercel, que não tem conta
  logada nem cookie. O erro do `/u/1/` que derrubou a página de lançamento não acontece aqui.
- **O navegador nunca recebe dado de outra filial.** O filtro é feito no servidor (passo 3), não no JavaScript da
  página, que qualquer um pode abrir e alterar.
- **Token separado.** O `TOKEN` atual está gravado na aba CONFIG de cada filial, ou seja, uma filial consegue lê-lo.
  A dashboard usa um token novo (`DASH_TOKEN`), guardado só nas propriedades do script e nas variáveis da Vercel.
- **Mesmo lugar para a página de lançamento.** Se a thread do lançamento decidir tirar a página do domínio Google,
  ela entra neste mesmo projeto Vercel (`/lancar/…` + `api/lancar/…` chamando um `doPost` do Instalador), com o
  mesmo esquema de token. Não faz parte desta etapa, mas a estrutura já deixa o espaço.

Alternativa que **não** recomendo agora: a Vercel ler a planilha direto pela API do Google Sheets com conta de
serviço. É mais rápida, mas exige criar projeto no Google Cloud, chave JSON e compartilhar a CONSOLIDAÇÃO com essa
conta. O caminho pelo Apps Script reaproveita o que já está publicado e funcionando. Se a velocidade incomodar,
troca-se só o arquivo `api/_lib/planilha.js`.

## 3. Stack

| Parte | Tecnologia | Por quê |
|---|---|---|
| Páginas | HTML5 + CSS (variáveis, grid, tema claro/escuro) + JavaScript ES modules | Pedido seu; abre em qualquer navegador e no celular |
| Gráficos | **Chart.js 4** (arquivo local em `vendor/`, sem depender de CDN) | Leve, documentação em português na comunidade, cobre barras, linhas, rosca |
| Servidor | Funções serverless da Vercel em **Node.js 20**, só com módulos nativos (`crypto`, `fetch`) | Zero dependências para manter; o token fica escondido |
| Login | E-mail + senha, senha guardada com **scrypt** (hash, nunca a senha), sessão em cookie assinado HMAC, validade 12 h | Não depende de conta Google nem de serviço de e-mail |
| Usuários | Aba nova **USUARIOS** na CONSOLIDAÇÃO (e-mail, nome, perfil, filial, hash, ativo) | A central administra numa planilha que já conhece |
| Dados | Apps Script `doGet ?acao=dados` (JSON) | Já publicado; muda pouco |
| Deploy | Vercel CLI (`vercel deploy`) a partir do VS Code; GitHub opcional depois | O projeto não tem repositório GitHub |
| Testes | `node --test` (cálculo dos KPIs, filtro por filial, login) + simulador do Apps Script que já existe | Sem instalar nada além do Node |

## 4. Indicadores (fase 1: peças e valores)

Todos calculados a partir de NOTAS + ITENS + VEICULOS. Nenhum usa km, horímetro ou datas de parada.

| Bloco | Indicadores |
|---|---|
| Cartões do topo | Gasto total no período · nº de notas · ticket médio por nota · veículos atendidos · custo médio por veículo · % peças × % mão de obra |
| Grupos de peças | Gasto por grupo (os 12: MOT, TRA, FRE, SUS, ELE, ARC, HID, EMI, IMP, ROD, CAB, CON), com clique para abrir subgrupo e peça · quantidade de itens por grupo |
| Evolução | Gasto mensal (barras empilhadas por grupo) · comparação com o mês anterior |
| Frota | Gasto por tipo de veículo (Pipa, Caçamba, Comboio, Munck…) · grupos críticos por tipo (como na seção 2 do PDF) · ranking dos 10 veículos que mais gastaram · gasto por modelo |
| Filiais (só diretoria) | Gasto por filial · custo médio por veículo de cada filial |
| Fornecedores | Ranking por valor · nº de notas por fornecedor |
| Tabela | Notas do período com itens, filtro e botão "baixar CSV" |
| Qualidade | Avisos vindos da aba ERROS (itens "A CLASSIFICAR", soma diferente da NF) |

Filtros no topo: período (mês/intervalo), filial (só diretoria), tipo de veículo, grupo, placa.

**Pneus (PNE):** a lista do PDF tem 12 grupos e não inclui pneus; o escopo de 16/10 incluía. Deixo um bloco de pneus
pronto para ligar se a fase 1 incluir, senão fica escondido. Mesma pendência do "lançamento enxuto".

**Sem lançamentos reais ainda** (só a NF 78 de teste): a dashboard mostra os indicadores com o que existir e um
selo "poucos dados". Há também um **modo demonstração** (botão, só para apresentar ao cliente) que usa os dados de
exemplo do projeto com uma faixa fixa "DADOS DE EXEMPLO" em todas as telas, conforme a regra de nunca misturar
exemplo com real.

## 5. Telas

1. **Login** (`index.html`): e-mail, senha, "esqueci a senha" (avisa para falar com a central).
2. **Painel** (`painel.html`): filtros, cartões, gráficos e tabela numa página só com abas: Visão geral · Grupos de
   peças · Veículos · Fornecedores · Notas. Layout de uma coluna no celular.
3. **Usuários** (`usuarios.html`, só perfil ADMIN): criar usuário, trocar senha, desativar. Grava na aba USUARIOS
   pelo Apps Script.

Visual: mesma identidade das telas de lançamento (cores e fonte do Formulario.html), tema claro e escuro.

## 6. Mudanças no Apps Script (Codigo.gs / Instalador)

| O quê | Detalhe |
|---|---|
| `doGet ?acao=dados` | Exige `DASH_TOKEN`. Devolve JSON com NOTAS, ITENS, VEICULOS (só colunas usadas), FILIAIS (nome e sigla, **sem** chave_pagina e sem ids), ERROS e a data da última junção |
| `doPost acao=usuario` | Cria, altera ou desativa linha de USUARIOS (a página de usuários manda o hash já calculado pela Vercel) |
| `doGet ?acao=usuarios` | Lista USUARIOS para o login (só pela Vercel, com o token) |
| Aba USUARIOS na CONSOLIDAÇÃO | `email, nome, perfil (ADMIN/DIRETORIA/FILIAL), filial, senha_hash, ativo, criado_em` |
| Administração > "Gerar token da dashboard" | Cria o DASH_TOKEN e mostra uma vez para colar na Vercel |
| Testes no `simulador.js` | token errado nega; `acao=dados` não devolve chave_pagina; doGet antigo (`existe`, `consolidar`, página) continua igual |

## 7. Estrutura de pastas (novo em negrito)

```
lokal-bi/
├── PLANO_DASHBOARD_WEB.md          ← este arquivo
├── apps_script/
│   ├── Codigo.gs                   ← ganha acao=dados, usuários e token da dashboard (item 6)
│   └── (demais sem mudança)
├── **dashboard_web/**              ← projeto que vai para a Vercel
│   ├── **vercel.json**             rotas, cabeçalhos de segurança, cache
│   ├── **package.json**            só nome, versão do Node e scripts (sem dependências)
│   ├── **.env.example**            APPS_SCRIPT_URL, DASH_TOKEN, SESSION_SECRET (os reais ficam na Vercel)
│   ├── **public/**
│   │   ├── index.html              login
│   │   ├── painel.html             dashboard
│   │   ├── usuarios.html           administração de usuários
│   │   ├── css/estilo.css
│   │   ├── js/
│   │   │   ├── api.js              fetch para /api, trata sessão expirada
│   │   │   ├── filtros.js          estado dos filtros (e na URL, para compartilhar link)
│   │   │   ├── kpis.js             todos os cálculos (puro, testável)
│   │   │   ├── graficos.js         configuração do Chart.js
│   │   │   ├── tabela.js           tabela de notas e exportar CSV
│   │   │   ├── painel.js           monta a tela
│   │   │   └── usuarios.js
│   │   ├── img/                    logo, ícone
│   │   └── vendor/chart.umd.min.js
│   ├── **api/**
│   │   ├── login.js  logout.js  sessao.js
│   │   ├── dados.js                busca, filtra por perfil, cacheia
│   │   ├── usuarios.js             só ADMIN
│   │   └── _lib/
│   │       ├── planilha.js         conversa com o Apps Script (único ponto que muda se trocar a fonte)
│   │       ├── sessao.js           cookie assinado
│   │       └── senha.js            scrypt
│   ├── **exemplo/dados_exemplo.json**   gerado de data/exemplo, marcado origem_dado = EXEMPLO
│   ├── **scripts/gerar_exemplo.py**     gera o JSON acima a partir do CSV de exemplo
│   └── **tests/**                  kpis.test.js, filtro_filial.test.js, sessao.test.js
├── dashboard/                      Streamlit atual, fica até a nova substituir
└── docs/
    └── **publicar_dashboard_web.md**    passo a passo: conta Vercel, variáveis, deploy, criar 1º usuário
```

## 8. Etapas

1. Apps Script: `acao=dados`, DASH_TOKEN, aba USUARIOS, testes no simulador.
2. `api/` + login + filtro por filial, com testes.
3. Painel: filtros, cartões, grupos, evolução, veículos, fornecedores, tabela. Modo demonstração.
4. Tela de usuários.
5. Publicar na Vercel (você cria a conta; eu deixo o passo a passo e os comandos), criar seu usuário ADMIN, testar
   com 2+ contas Google no navegador e no celular.
6. Teste de isolamento: entrar como usuário de uma filial e confirmar que nada de outra filial chega (nem pela aba
   Rede do navegador).

## 9. Riscos

- **Velocidade:** o Apps Script leva 1 a 4 s para responder. O cache de 5 min na Vercel deixa as aberturas seguintes
  instantâneas; o painel mostra "dados de hh:mm".
- **Plano gratuito da Vercel (Hobby)** é para uso não comercial. Para uso da empresa, o correto é o plano Pro
  (US$ 20/mês por membro). Alternativa gratuita equivalente: Cloudflare Pages + Workers ou Netlify, com o mesmo
  código quase sem mudança.
- **Conta dona:** tudo continua rodando na conta Google do dono do Instalador. Transferir para conta da empresa antes
  de produção (já previsto).
- **Senhas:** a central cria e entrega. Sem "esqueci a senha" automático nesta fase (precisaria de serviço de e-mail).

## 10. Para aprovar, responda

1. Aprovo o plano, a stack e a estrutura de pastas (ou o que mudar).
2. Login: e-mail + senha administrados pela central na aba USUARIOS (recomendado)? Filiais também terão login para
   ver só os próprios números, ou a dashboard é só da diretoria?
3. Pneus entram na fase 1 da dashboard?
4. Vercel Hobby (gratuito, uso pessoal/teste) para começar, ou já Pro?
