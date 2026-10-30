# Dashboard web e sistema de OS LOKAL

Dois sistemas no mesmo endereço e com o mesmo login, em HTML, CSS e JavaScript puros, com funções da Vercel:

- **Dashboard** (`/painel`): manutenção da frota (peças e valores), lendo a planilha **LOKAL – CONSOLIDAÇÃO** pelo Apps Script.
- **Sistema de OS** (`/os`, `/os/mecanico`): abertura, aprovação, direcionamento, fechamento pelo mecânico (funciona
  sem internet) e valores/NF pela matriz. Dados e fotos no **Supabase**. Instala como atalho no celular (PWA).

Planos: `../PLANO_DASHBOARD_WEB.md` e o plano do sistema de OS. Publicação: `../docs/publicar_dashboard_web.md` e
`../docs/publicar_sistema_os.md`.

```bash
npm test                 # testes (Node 22, sem instalar nada)
npm run dev              # http://localhost:3000 com banco de teste local (.dados_locais/) e senha lokal1234:
                         #   matriz@lokal, luis@lokal, joao@lokal, diretoria@lokal ...
npm run frota            # envia exemplo/veiculos.json ao Supabase (precisa do .env.local)
npm run exemplo-os       # usuários (12 mecânicos) e OS de demonstração no Supabase
npm run limpar-exemplo   # apaga tudo que é exemplo antes de entregar ao cliente
npm run admin -- "Nome"  # cria um administrador (senha mudar123, troca no 1º acesso)
npm run veiculos -- "Frota Total atualizada - LOKAL Locações (2026-10-30).xlsx"   # regenera exemplo/veiculos.json
vercel --prod            # publica
```

| Pasta | O quê |
|---|---|
| `public/` | Login (`index.html`), `trocar-senha.html`, `painel.html`, `usuarios.html`, `instalar.html`, `os/index.html` (matriz e filiais), `os/mecanico.html`, `sw.js` + `manifest.json` (PWA) |
| `public/js/os/regras.js` | Regras do sistema de OS (quem vê o quê, etapas, validações, login automático). Usado pela API **e** pelas telas |
| `api/` | Funções da Vercel: `login logout sessao senha dados usuarios os fotos veiculos` (limite do plano Hobby: 12) |
| `api/_lib/banco.js` | Único ponto que fala com o Supabase (ou com o banco de teste local) |
| `api/_lib/planilha.js` | Único ponto que fala com o Apps Script (dados da dashboard) |
| `banco/esquema.sql` | Tabelas do Supabase: rodar uma vez no SQL Editor |
| `exemplo/` | `veiculos.json` (407 veículos do cadastro) e dados de demonstração da dashboard |
| `scripts/` | `servidor_local.js`, `sistema_os.js` (frota, exemplo, limpar, admin), `gerar_veiculos.py`, `gerar_exemplo.py` |
| `tests/` | `node --test` |

Regras: o navegador nunca fala com o Google nem com o Supabase direto (as chaves ficam só na Vercel); filial vê só a
própria filial (corte no servidor); mecânico vê só as OS dele e só o sistema de OS; exemplos sempre marcados.
