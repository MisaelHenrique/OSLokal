// Usuários (só a matriz/administrador, perfil ADMIN).
// GET  → lista sem os hashes de senha
// POST { nome, perfil, filiais, equipe }            → cria; o usuário é gerado (andre@lokal) e a senha é mudar123
// POST { login, nome, perfil, filiais, equipe, ativo } → altera
// POST { login, acao: 'resetar_senha' }             → volta a senha para mudar123 (troca obrigatória no próximo acesso)
import { json, lerCorpo, metodo, pedidoJsonDaPagina } from './_lib/http.js';
import { exigir, publico } from './_lib/acesso.js';
import { listarUsuarios, inserirUsuario, alterarUsuario } from './_lib/usuarios.js';
import { gerarHash } from './_lib/senha.js';
import { PERFIS, SENHA_PADRAO, gerarLogin } from '../public/js/os/regras.js';

export default async function handler(req, res) {
  if (!metodo(req, res, ['GET', 'POST'])) return;
  try {
    const eu = await exigir(req, res, { perfis: ['ADMIN'] });
    if (!eu) return;
    const todos = await listarUsuarios({ forcar: true });
    if (req.method === 'GET') return json(res, 200, { usuarios: todos.map(publico) });

    if (!pedidoJsonDaPagina(req)) return json(res, 415, { erro: 'Formato inválido.' });
    const b = await lerCorpo(req);
    const login = String(b.login || '').trim().toLowerCase();
    const atual = login ? todos.find((u) => u.login === login) : null;
    if (login && !atual) return json(res, 404, { erro: 'Usuário não encontrado.' });

    if (b.acao === 'resetar_senha') {
      const u = await alterarUsuario(login, { senha_hash: gerarHash(SENHA_PADRAO), trocar_senha: true });
      return json(res, 200, { usuario: publico(u), senha: SENHA_PADRAO });
    }

    const nome = String(b.nome || '').trim();
    const perfil = String(b.perfil || '').toUpperCase();
    if (nome.length < 2) return json(res, 400, { erro: 'Informe o nome completo.' });
    if (!PERFIS[perfil]) return json(res, 400, { erro: 'Perfil inválido.' });
    const filiais = (Array.isArray(b.filiais) ? b.filiais : String(b.filial || '').split(';')).map((s) => String(s).trim()).filter(Boolean);
    const dados = {
      nome, perfil,
      filial: perfil === 'FILIAL' ? filiais.join(';') : '',
      equipe: perfil === 'MECANICO' ? String(b.equipe || '').trim().slice(0, 60) : '',
      ativo: b.ativo !== false
    };
    if (perfil === 'FILIAL' && !dados.filial) return json(res, 400, { erro: 'Escolha a filial do usuário.' });

    if (atual) {
      if (atual.login === eu.login && (perfil !== 'ADMIN' || !dados.ativo)) {
        return json(res, 400, { erro: 'Você não pode tirar o seu próprio acesso de administrador.' });
      }
      return json(res, 200, { usuario: publico(await alterarUsuario(login, dados)) });
    }
    const agora = new Date().toISOString();
    const novo = await inserirUsuario({
      ...dados, login: gerarLogin(nome, todos.map((u) => u.login)), senha_hash: gerarHash(SENHA_PADRAO),
      trocar_senha: true, exemplo: false, criado_em: agora, alterado_em: agora
    });
    return json(res, 200, { usuario: publico(novo), senha: SENHA_PADRAO });
  } catch (e) {
    return json(res, 500, { erro: e.message });
  }
}
