# Atualização 30/10/2026: sistema de OS dentro da dashboard_web

Leia este arquivo antes de mexer em `dashboard_web`. Ele resume o que entrou, como rodar e o que falta.

## O que é

A pasta `dashboard_web` agora tem **dois sistemas no mesmo endereço e com o mesmo login**:

| Sistema | Endereço | Quem usa |
|---|---|---|
| Dashboard de manutenção | `/painel` | Matriz, diretoria, filiais |
| Sistema de OS | `/os` | Matriz (administrador) e filiais |
| Tela do mecânico | `/os/mecanico` | Só mecânicos (funciona sem internet) |

Há um botão **Sistema de OS** na dashboard e um botão **Dashboard** no sistema de OS. O mecânico só vê o sistema de OS.

## Como funciona

1. A **filial** abre a OS, que vai para a matriz aprovar. Quando a **matriz** abre, a OS já nasce aprovada.
2. Há dois tipos de OS:
   - **Diagnóstico**, quando não se sabe o defeito. O mecânico fecha como "resolvido" ou "precisa de serviço"; no segundo caso, a matriz gera a OS de serviço ligada.
   - **Serviço**, quando o defeito já é conhecido.
3. A matriz aprova e direciona a OS para **1 mecânico responsável**, com ajudantes opcionais.
4. O mecânico vê a lista dele, toca em **Iniciar** e depois em **Fechar OS**. No fechamento:
   - km e/ou horímetro: obrigatório pelo menos um;
   - foto da placa e foto do serviço: obrigatórias;
   - foto do painel e foto do horímetro: opcionais.

   Funciona **sem internet**: fica guardado no celular e é enviado sozinho quando o sinal volta.
5. A matriz lança peças, mão de obra, deslocamento/diária (opcional) e a NF. Com isso a OS fica **Fechada**.
6. Cada filial vê só as próprias OS, e vê os valores e a NF depois que a OS é fechada.
7. Os 39 veículos do pátio entram na filial **MATRIZ**, na lista da matriz.

Etapas da OS: Aguardando aprovação → Aprovada → Direcionada → Em execução → Executada → Fechada. Uma OS também pode ser Devolvida ou Cancelada.

## Logins

- O administrador cria os usuários pela tela **Usuários**.
- O usuário é gerado automaticamente: primeiro nome + `@lokal`, por exemplo `andre@lokal`. Se o nome já existir, vira `andre1@lokal`, `andre2@lokal` e assim por diante.
- A senha padrão é `mudar123`, e a troca é obrigatória no primeiro acesso. O botão "Resetar senha" volta a senha para `mudar123`.
- **Mudança importante:** os logins de todo o sistema, inclusive os da dashboard, agora ficam no **Supabase**. A aba USUARIOS da planilha não é mais usada.
- Perfis:
  - **ADMIN**, que é a matriz;
  - **DIRETORIA**;
  - **FILIAL**: uma ou mais filiais, separadas por `;`;
  - **MECANICO**.

## Rodar no VS Code (teste no seu Mac)

```bash
cd dashboard_web
npm run dev          # abre em http://localhost:3000
npm test             # 40 testes
```

Senha de teste: `lokal1234`. Logins de exemplo:

| Login | Perfil |
|---|---|
| `matriz@lokal` | administrador |
| `diretoria@lokal` | diretoria |
| `luis@lokal`, `jose@lokal`, `thiago@lokal`, `alvaro@lokal`, `patio@lokal` | filiais |
| `joao@lokal`, `pedro@lokal`, `marcos@lokal` … (12 mecânicos) | mecânicos |

- Enquanto não houver `SUPABASE_URL` no `.env.local`, o sistema usa um banco de teste na pasta `dashboard_web/.dados_locais`. Se apagar essa pasta, tudo volta ao exemplo original.
- **Para ver como celular:** no Chrome, aperte F12 e clique no ícone de celular. Para simular falta de internet, na aba Network troque para **Offline**.
- Para parar o sistema, aperte Ctrl+C no terminal.

## Publicar

O passo a passo completo está em `docs/publicar_sistema_os.md`. Em resumo:

1. Crie o projeto no Supabase e rode `dashboard_web/banco/esquema.sql` no SQL Editor.
2. Coloque `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` no `.env.local` e na Vercel. A chave é secreta: nunca vai para o Git, e-mail ou WhatsApp.
3. Rode os comandos abaixo.
4. Só depois rode `vercel --prod`.

```bash
npm run frota                       # 407 veículos
npm run exemplo-os                  # demonstração (19 usuários, 33 OS)
npm run admin -- "Misael Henrique"  # seu login de administrador (mudar123)
```

Antes de entregar ao cliente, rode `npm run limpar-exemplo`. Ele apaga os usuários, as OS e as fotos de exemplo, e mantém os veículos e os usuários reais.

## Arquivos novos ou alterados (dashboard_web)

| Arquivo | O quê |
|---|---|
| `banco/esquema.sql` | Tabelas do Supabase: usuarios, veiculos, os, os_eventos, arquivos, mais o bucket de fotos |
| `api/os.js`, `api/fotos.js`, `api/veiculos.js`, `api/senha.js` | Novas funções da Vercel. São 9 no total, e o limite do plano Hobby é 12 |
| `api/_lib/banco.js` | Único ponto que fala com o Supabase (ou com o banco de teste local) |
| `api/_lib/exemplo_os.js` | Usuários e OS de exemplo |
| `public/js/os/regras.js` | **Regras do sistema** (quem vê o quê, etapas, validações, login automático). Usado pela API e pelas telas |
| `public/os/index.html` + `js/os/app.js` | Telas da matriz e das filiais |
| `public/os/mecanico.html` + `js/os/mecanico.js` + `js/os/fila.js` | Tela do mecânico e fila offline |
| `public/sw.js`, `manifest.json`, `instalar.html`, `img/icone-*.png` | Atalho no celular (PWA) |
| `public/trocar-senha.html`, `usuarios.html` | Troca de senha e cadastro de usuários |
| `scripts/sistema_os.js` | Comandos frota, exemplo-os, limpar-exemplo e admin |
| `scripts/gerar_veiculos.py` | Gera `exemplo/veiculos.json` a partir da planilha "Frota Total atualizada" |

## Cuidados ao mexer

- Para mudar uma regra (quem pode o quê, campo obrigatório), mude em `public/js/os/regras.js` e rode `npm test`.
- Se criar um arquivo novo de tela, inclua-o na lista do `public/sw.js` e troque a `VERSAO`. Sem isso, o celular continua com a versão antiga.
- Não use script nem style dentro do HTML, porque o `vercel.json` bloqueia.
- Nunca coloque no Git o `.env.local` nem a pasta `.vercel`.

## Em aberto

- O cadastro não diz se o veículo usa km ou horímetro, por isso o sistema pede os dois e exige um.
- Expiração de senha, se o cliente quiser.
- "Esqueci a senha" automático (precisa de um serviço de e-mail). Hoje, o administrador reseta a senha.
