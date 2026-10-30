// Quem pode ver o quê. O corte por filial acontece AQUI, no servidor, antes de qualquer dado sair.
import { loginDaSessao } from './sessao.js';
import { buscarUsuario } from './usuarios.js';
import { json } from './http.js';

export function filiaisDoUsuario(u) {
  return String(u.filial || '').split(';').map((s) => s.trim()).filter(Boolean);
}

export function publico(u) {
  return { login: u.login, nome: u.nome || '', perfil: u.perfil, filiais: filiaisDoUsuario(u), equipe: u.equipe || '',
    ativo: u.ativo !== false, trocar_senha: !!u.trocar_senha, exemplo: !!u.exemplo };
}

/** Usuário da sessão, conferido de novo na lista (desativado = fora). null se não houver sessão válida. */
export async function usuarioAtual(req) {
  const login = loginDaSessao(req);
  if (!login) return null;
  const u = await buscarUsuario(login);
  if (!u || u.ativo === false) return null;
  return u;
}

/**
 * Exige sessão válida, senha já trocada e um dos perfis. Responde o erro e devolve null quando não pode.
 * `troca: true` deixa passar quem ainda precisa trocar a senha (tela de troca e sessão).
 */
export async function exigir(req, res, { perfis = null, troca = false } = {}) {
  const u = await usuarioAtual(req);
  if (!u) { json(res, 401, { erro: 'Entre de novo.' }); return null; }
  if (u.trocar_senha && !troca) { json(res, 403, { erro: 'Troque a sua senha para continuar.', trocar_senha: true }); return null; }
  if (perfis && !perfis.includes(u.perfil)) { json(res, 403, { erro: 'Seu perfil não tem acesso a isto.' }); return null; }
  return u;
}

const TABELAS = ['notas', 'itens', 'veiculos', 'erros', 'filiais'];

/**
 * Dados da dashboard: devolve uma cópia só com o que o usuário pode ver. Lista fechada de campos: o que a fonte
 * mandar a mais não passa. Perfil desconhecido (inclusive mecânico) não vê nada.
 */
export function recortarPorPerfil(dados, u) {
  const out = { origem: dados.origem || '', ultima_juncao: dados.ultima_juncao || '', buscado_em: dados.buscado_em || '',
    perfil: u.perfil };
  const todas = u.perfil === 'ADMIN' || u.perfil === 'DIRETORIA';
  const minhas = new Set(u.perfil === 'FILIAL' ? filiaisDoUsuario(u) : []);
  TABELAS.forEach((t) => {
    out[t] = (dados[t] || []).filter((x) => todas || minhas.has(x.filial));
  });
  return out;
}
