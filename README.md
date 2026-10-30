# LOKAL BI

Sistema de ordens de serviço (OS) de manutenção da frota pesada da LOKAL, com dashboard de indicadores. Tudo em
`dashboard_web/`: HTML/CSS/JS puros no navegador + funções da Vercel + banco Supabase.

> **Leia antes de mexer:** `CLAUDE.md` (regras, decisões, estado real) e `docs/ATUALIZACAO_SISTEMA_OS.md` (o que é
> o sistema de OS e como ele funciona). Para detalhe de código, `dashboard_web/CONTEXTO.md`.

## O que tem

- **Sistema de OS** (`/os`, `/os/mecanico`) — filial abre a OS, matriz aprova e direciona, mecânico executa (**funciona
  sem internet**, PWA) e fecha com fotos e km/horímetro, matriz lança valores e fecha. Dados no Supabase.
- **`/painel`** — indicadores de manutenção. Hoje sem fonte de dado real (a antiga planilha Google foi removida em
  30/10/2026); mostra só o modo de exemplo até ser religado ao Supabase.

## Rodar local

Precisa de Node 20+.

```bash
cd dashboard_web
npm test        # 43 testes, sem precisar de internet nem Supabase
npm run dev     # http://localhost:3000, com dados e usuários de exemplo
```

Login de exemplo: `matriz@lokal` (administrador) / senha `lokal1234`. Mais logins de exemplo (filiais, mecânicos)
em `docs/ATUALIZACAO_SISTEMA_OS.md`.

## Publicar

Passo a passo completo em `docs/publicar_sistema_os.md` (sistema de OS: criar o projeto Supabase, variáveis,
`vercel --prod`) e `docs/publicar_dashboard_web.md` (`/painel` — parte da fonte de dado está desatualizada, ver
`CLAUDE.md`).

## Estrutura

```
dashboard_web/
├── public/          navegador: páginas, JS, CSS (painel.html, os/, usuarios.html...)
├── api/             funções da Vercel (Node, ESM); api/_lib/banco.js fala com o Supabase
├── banco/esquema.sql  tabelas do Supabase
├── exemplo/         dados e usuários de demonstração
├── scripts/         criar_usuario, gerar_veiculos, sistema_os (frota/exemplo-os/limpar-exemplo/admin)
└── tests/           node --test
```

## Histórico

Até 30/10/2026 este projeto também tinha um sistema de lançamento por planilhas Google (Apps Script) e um dashboard
Streamlit. Foram substituídos pelo sistema de OS e removidos do projeto — ver "Decisões tomadas" no `CLAUDE.md`.
