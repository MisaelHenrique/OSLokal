# Publicar o sistema de OS (Supabase + Vercel)

O sistema de OS fica no mesmo projeto da dashboard (`dashboard_web`), no mesmo endereço da Vercel e com o mesmo
login. Os dados e as fotos ficam no **Supabase** (plano gratuito serve para começar).

> **Importante:** a partir desta versão os logins (inclusive os da dashboard) moram no Supabase, não mais na aba
> USUARIOS. Faça os passos 1 a 4 **antes** do `vercel --prod`, senão ninguém consegue entrar.

## 1. Criar o projeto no Supabase

1. Entre em <https://supabase.com> e crie uma conta (pode ser com o Google da empresa).
2. **New project**: nome `lokal-os`, região **South America (São Paulo)**, anote a senha do banco num lugar seguro.
3. Quando terminar de criar, abra **SQL Editor > New query**, cole todo o conteúdo de
   `dashboard_web/banco/esquema.sql` e clique em **Run**. Deve aparecer "Success. No rows returned".
4. Confira em **Storage** que existe o bucket `os-arquivos` (privado).

## 2. Pegar as duas chaves

Em **Project Settings > API** (ou **Data API / API Keys**):

- **Project URL** → vai em `SUPABASE_URL` (ex.: `https://abcd1234.supabase.co`).
- Chave **service_role** (secreta; clique em "Reveal") → vai em `SUPABASE_SERVICE_KEY`.

Essa chave dá acesso total ao banco: só no `.env.local` do seu Mac e na Vercel. Nunca em e-mail, WhatsApp ou Git.

## 3. Colocar as chaves no seu Mac e na Vercel

No VS Code, abra `dashboard_web/.env.local` e acrescente no fim:

```
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_SERVICE_KEY=cole_a_chave_service_role
```

Na Vercel: **Project > Settings > Environment Variables**, crie as mesmas duas variáveis (Production, Preview e
Development). Ou pelo terminal, dentro de `dashboard_web`:

```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_KEY
```

## 4. Carregar a frota, a demonstração e o administrador

No terminal do VS Code, dentro de `dashboard_web`:

```bash
npm run frota                       # 407 veículos do cadastro
npm run exemplo-os                  # demonstração: 19 usuários (12 mecânicos) e 33 OS, senha lokal1234
npm run admin -- "Misael Henrique"  # seu administrador: misael@lokal / mudar123 (troca no 1º acesso)
```

Logins da demonstração (senha `lokal1234`): `matriz@lokal` (administrador), `diretoria@lokal`, `luis@lokal`,
`jose@lokal`, `thiago@lokal`, `alvaro@lokal`, `patio@lokal` (filiais) e os mecânicos `joao@lokal`, `joao1@lokal`,
`pedro@lokal`, `marcos@lokal`, `rafael@lokal`, `bruno@lokal`, `diego@lokal`, `lucas@lokal`, `fabio@lokal`,
`renato@lokal`, `sergio@lokal`, `edson@lokal`.

Para testar no Mac antes de publicar: `npm run dev` e abra <http://localhost:3000> (com as chaves no `.env.local`
ele usa o Supabase de verdade).

## 5. Publicar

```bash
vercel --prod
```

Abra o endereço da Vercel, entre com `matriz@lokal`, e confira: botão **Sistema de OS** na dashboard e
**Dashboard** no sistema de OS.

## 6. Atalho no celular

No celular, abra o endereço, entre e toque no menu do seu nome > **Instalar no celular**. Android (Chrome): botão
"Instalar". iPhone (Safari): Compartilhar > "Adicionar à Tela de Início". O mecânico entra e já cai na lista dele.

Teste do modo sem internet: com a OS aberta no celular do mecânico, ative o modo avião, toque em Iniciar, preencha
km, fotos e Fechar OS. A tela mostra "1 fechamento aguardando envio". Desligue o modo avião: em alguns segundos
some o aviso e a OS aparece como Executada para a matriz.

## 7. Antes de entregar ao cliente

```bash
npm run limpar-exemplo   # apaga usuários, OS e fotos de exemplo; mantém veículos e usuários reais
```

Depois disso a faixa "AMBIENTE DE DEMONSTRAÇÃO" some, e o administrador cria os usuários reais pela tela
**Usuários** (cada um recebe `nome@lokal` e a senha `mudar123`, trocada no primeiro acesso).

## Pontos em aberto

- Situação dos 39 veículos do pátio (filial MATRIZ no cadastro).
- O cadastro não diz se o veículo usa km ou horímetro: o sistema mostra os dois e exige pelo menos um.
- Validade/expiração de senha, se o cliente quiser.
- Esqueci a senha: hoje o administrador usa "Resetar senha" na tela Usuários (volta para `mudar123`).
- Plano gratuito do Supabase pausa o projeto após 7 dias sem uso; em uso diário isso não acontece. Para uso oficial,
  avaliar o plano Pro (backup diário).
