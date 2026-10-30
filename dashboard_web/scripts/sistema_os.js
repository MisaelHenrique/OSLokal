// Tarefas do banco do sistema de OS (Supabase), rodadas no seu computador.
// Lê SUPABASE_URL e SUPABASE_SERVICE_KEY do .env.local (a chave nunca vai para o navegador nem para o Git).
//   npm run frota                      envia/atualiza os veículos de exemplo/veiculos.json
//   npm run exemplo-os                 cria os usuários de exemplo (12 mecânicos) e as OS de demonstração
//   npm run limpar-exemplo             apaga tudo que é de exemplo (usuários, OS, fotos); mantém veículos e usuários reais
//   npm run admin -- "Nome Sobrenome"  cria um administrador (matriz) com senha mudar123 e troca no 1º acesso
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(RAIZ);
const env = join(RAIZ, '.env.local');
if (existsSync(env)) {
  readFileSync(env, 'utf8').split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.log('Falta SUPABASE_URL e SUPABASE_SERVICE_KEY no .env.local (veja .env.example e docs/publicar_sistema_os.md).');
  process.exit(1);
}

const { banco } = await import('../api/_lib/banco.js');
const { veiculosDaPlanilha, usuariosExemplo, osExemplo, SENHA_EXEMPLO } = await import('../api/_lib/exemplo_os.js');
const { gerarHash } = await import('../api/_lib/senha.js');
const { gerarLogin, SENHA_PADRAO } = await import('../public/js/os/regras.js');

const em_lotes = async (lista, n, f) => { for (let i = 0; i < lista.length; i += n) await f(lista.slice(i, i + n)); };

async function frota() {
  const veiculos = veiculosDaPlanilha();
  await em_lotes(veiculos, 200, (l) => banco.inserir('veiculos', l, { mesclar: true }));
  console.log(`${veiculos.length} veículos enviados (os que já existiam foram atualizados).`);
}

async function exemplo() {
  const veiculos = await banco.listar('veiculos');
  if (!veiculos.length) { console.log('Nenhum veículo no banco. Rode antes: npm run frota'); process.exit(1); }
  const ja = await banco.listar('usuarios', { eq: { exemplo: true } });
  if (ja.length) { console.log('Os exemplos já estão no banco. Para recriar: npm run limpar-exemplo e depois npm run exemplo-os'); return; }
  const existentes = (await banco.listar('usuarios')).map((u) => u.login);
  const usuarios = usuariosExemplo(existentes);
  await banco.inserir('usuarios', usuarios);
  const { os, os_eventos } = osExemplo(veiculos, usuarios);
  // o banco numera as OS; os eventos são religados ao número novo
  const novos = {};
  for (const o of os) {
    const { id, ...resto } = o;
    const [salva] = await banco.inserir('os', resto);
    novos[id] = salva.id;
  }
  await em_lotes(os_eventos.map(({ id, ...e }) => ({ ...e, os_id: novos[e.os_id] })), 300, (l) => banco.inserir('os_eventos', l));
  console.log(`${usuarios.length} usuários de exemplo (senha ${SENHA_EXEMPLO}) e ${os.length} OS de demonstração criados.`);
  console.log('Logins: ' + usuarios.map((u) => u.login).join(', '));
}

async function limpar() {
  const arquivos = await banco.listar('arquivos', { eq: { exemplo: true } });
  await banco.apagarArquivos(arquivos.map((a) => a.caminho));
  await banco.apagar('arquivos', { eq: { exemplo: true } });
  await banco.atualizar('os', { eq: { exemplo: true } }, { os_origem: null, os_servico: null });
  const os = await banco.apagar('os', { eq: { exemplo: true } });
  const usuarios = await banco.apagar('usuarios', { eq: { exemplo: true } });
  console.log(`Apagados: ${os.length} OS, ${usuarios.length} usuários e ${arquivos.length} arquivos de exemplo. Veículos e usuários reais ficaram.`);
  const reais = await banco.listar('usuarios', { eq: { perfil: 'ADMIN', ativo: true } });
  if (!reais.length) console.log('Atenção: não sobrou nenhum administrador. Crie um com: npm run admin -- "Nome Sobrenome"');
}

async function admin(nome) {
  if (!nome || !nome.trim()) { console.log('Uso: npm run admin -- "Nome Sobrenome"'); process.exit(1); }
  const existentes = (await banco.listar('usuarios')).map((u) => u.login);
  const agora = new Date().toISOString();
  const login = gerarLogin(nome, existentes);
  await banco.inserir('usuarios', { login, nome: nome.trim(), perfil: 'ADMIN', filial: '', equipe: '',
    senha_hash: gerarHash(SENHA_PADRAO), trocar_senha: true, ativo: true, exemplo: false, criado_em: agora, alterado_em: agora });
  console.log(`Administrador criado. Usuário: ${login}  Senha: ${SENHA_PADRAO} (vai pedir para trocar no primeiro acesso).`);
}

const [cmd, ...args] = process.argv.slice(2);
const tarefas = { frota, exemplo, limpar, admin: () => admin(args.join(' ')) };
if (!tarefas[cmd]) { console.log('Use: npm run frota | exemplo-os | limpar-exemplo | admin -- "Nome"'); process.exit(1); }
try {
  await tarefas[cmd]();
} catch (e) {
  console.error('Erro:', e.message);
  process.exit(1);
}
