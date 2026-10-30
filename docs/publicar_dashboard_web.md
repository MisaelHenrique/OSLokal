# Publicar a dashboard web na Vercel

Passo a passo para colocar `dashboard_web/` no ar, lendo a CONSOLIDAÇÃO. Faça na ordem. Leva uns 30 minutos.
Plano completo em `PLANO_DASHBOARD_WEB.md`.

## 0. Testar no computador (opcional, sem Google e sem Vercel)

Precisa do Node 20 ou mais novo (`node --version`).

```bash
cd lokal-bi/dashboard_web
npm test          # 22 testes: cálculos, login, corte por filial
npm run dev       # abre http://localhost:3000
```

Sem `.env.local`, ele usa os dados de exemplo e estes usuários de teste (senha `lokal1234`):
`admin@exemplo.lokal`, `diretoria@exemplo.lokal`, `matriz@exemplo.lokal` (MATRIZ e OUTROS), `luis@exemplo.lokal`.
Esses usuários **não existem** na Vercel.

## 1. Apps Script (projeto "LOKAL - Instalador")

1. Em script.google.com, abra **LOKAL - Instalador**.
2. Substitua o **Codigo.gs** pelo `apps_script/Codigo.gs` desta pasta (mudou só o `doGet`: duas ações novas).
   Se usa clasp: `clasp push`, com o `Formulario.html` no `.claspignore` do Instalador (ver PLANO_PAGINAS.md item 6).
3. Crie o arquivo **DashboardServidor.gs** (Arquivos > + > Script) e cole o `apps_script/DashboardServidor.gs`.
   Ele fica **só no Instalador**, como o arquivo da página de lançamento (`Pagina.gs`); não vai para o MODELO nem para as filiais.
4. No editor, escolha a função `gerarTokenDashboard` e clique **Executar**. Abra **Registro de execução** e copie o
   valor depois de `DASH_TOKEN`. Ela também cria a aba **USUARIOS** na CONSOLIDAÇÃO.
   Guarde esse token: ele vai para a Vercel no passo 3. Rodar de novo troca o token (o antigo para de funcionar).
5. **Implantar > Gerenciar implantações > lápis na implantação atual > Versão: Nova versão > Implantar.**
   Use a implantação que já existe (mesma URL das páginas de lançamento). Não crie implantação nova, senão a URL muda.
6. Teste no navegador: `URL_DO_EXEC?acao=dados&token=errado` deve responder `{"erro":"acesso negado"}`.

## 2. Conta e projeto na Vercel

```bash
npm install -g vercel
cd lokal-bi/dashboard_web
vercel login                 # entre com e-mail ou GitHub
vercel link                  # "Set up and deploy?" Y · escolha sua conta · nome: lokal-frota · diretório: ./
```

Plano Hobby (gratuito). Lembrete: pelos termos da Vercel, o Hobby é para uso pessoal/não comercial; para uso oficial
da empresa, o plano certo é o Pro.

## 3. Variáveis (segredos) na Vercel

```bash
vercel env add APPS_SCRIPT_URL production    # cole a URL /exec do Instalador
vercel env add DASH_TOKEN production         # cole o token do passo 1.4
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # gera o próximo
vercel env add SESSION_SECRET production     # cole o valor gerado acima
```

Ou pelo site: Project > Settings > Environment Variables. Os três ficam **só** na Vercel (e no seu `.env.local`, que
não vai para lugar nenhum).

## 4. Publicar

```bash
vercel --prod
```

O endereço aparece no fim (ex.: `https://lokal-frota.vercel.app`). Para mudar o nome: Project > Settings > Domains.

## 5. Primeiro administrador

Ainda não há ninguém na aba USUARIOS. Crie o seu pelo terminal:

```bash
cp .env.example .env.local      # preencha APPS_SCRIPT_URL e DASH_TOKEN (os mesmos da Vercel)
npm run usuario -- seu@email.com "Misael" ADMIN
```

Ele pede a senha e grava na aba USUARIOS só o código (hash). Depois disso, entre na dashboard e crie os outros pela
tela **Usuários** (menu com o seu nome > Usuários da dashboard).

## 6. Conferir

- [ ] Entrar com o seu usuário e ver o painel. Sem notas reais, aparece "Ainda não há notas lançadas"; o botão
      **Demonstração** mostra os exemplos com a faixa amarela.
- [ ] Abrir num navegador com **2 ou mais contas Google** logadas e no **celular**: tem de funcionar igual.
- [ ] Criar um usuário de filial (ex.: MATRIZ) e entrar com ele: só MATRIZ aparece. Para ter certeza, no Chrome
      F12 > Rede > `dados` > Resposta: não pode haver nenhuma outra filial.
- [ ] Desativar esse usuário: em até 1 minuto ele cai para o login.

## Atualizar depois de mudar o código

```bash
cd lokal-bi/dashboard_web
npm test && vercel --prod
```

Se mudar o Apps Script: colar/`clasp push` e **Nova versão** na mesma implantação (passo 1.5).

## Problemas comuns

| Mensagem | Causa | O que fazer |
|---|---|---|
| "APPS_SCRIPT_URL e DASH_TOKEN não configurados" | Faltou o passo 3, ou publicou antes dele | Cadastrar e rodar `vercel --prod` de novo |
| "Apps Script: acesso negado" | Token da Vercel diferente do do script | Rodar `gerarTokenDashboard` de novo e atualizar `DASH_TOKEN` na Vercel |
| "O Apps Script não respondeu JSON" | Implantação sem "Qualquer pessoa", ou código novo sem **Nova versão** | Passo 1.5 |
| Números não mudam depois de lançar | Junção a cada 15 min + cache de 5 min na Vercel | Botão ⟳ no topo força a leitura (a junção continua a cada 15 min) |
