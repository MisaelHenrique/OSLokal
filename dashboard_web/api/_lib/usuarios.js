// Usuários (dashboard e sistema de OS): tabela usuarios do banco. Login = usuário automático (andre@lokal).
import { banco, modoLocal } from './banco.js';
import './exemplo_os.js';   // registra o conteúdo de exemplo do banco local (não roda em produção)

const CACHE_MS = 60 * 1000;
let cache = null, cacheEm = 0;

export async function listarUsuarios({ forcar = false } = {}) {
  if (!forcar && cache && Date.now() - cacheEm < CACHE_MS) return cache;
  cache = await banco.listar('usuarios', { ordem: 'login.asc' });
  cacheEm = Date.now();
  return cache;
}

export async function buscarUsuario(login, { forcar = false } = {}) {
  const l = String(login || '').trim().toLowerCase();
  if (!l) return null;
  return (await listarUsuarios({ forcar })).find((u) => u.login === l) || null;
}

export async function inserirUsuario(u) {
  const [novo] = await banco.inserir('usuarios', u);
  cache = null;
  return novo;
}

export async function alterarUsuario(login, mudancas) {
  const [u] = await banco.atualizar('usuarios', { eq: { login } }, { ...mudancas, alterado_em: new Date().toISOString() });
  cache = null;
  return u || null;
}

export { modoLocal };
