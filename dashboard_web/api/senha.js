// POST /api/senha { atual, nova } → troca a própria senha (obrigatória no primeiro acesso).
import { json, lerCorpo, metodo, pedidoJsonDaPagina } from './_lib/http.js';
import { exigir, publico } from './_lib/acesso.js';
import { conferirSenha, gerarHash } from './_lib/senha.js';
import { alterarUsuario } from './_lib/usuarios.js';
import { erroNovaSenha } from '../public/js/os/regras.js';

export default async function handler(req, res) {
  if (!metodo(req, res, ['POST'])) return;
  if (!pedidoJsonDaPagina(req)) return json(res, 415, { erro: 'Formato inválido.' });
  try {
    const u = await exigir(req, res, { troca: true });
    if (!u) return;
    const { atual, nova } = await lerCorpo(req);
    if (!conferirSenha(atual, u.senha_hash)) return json(res, 400, { erro: 'A senha atual não confere.' });
    const erro = erroNovaSenha(nova, atual);
    if (erro) return json(res, 400, { erro });
    const novo = await alterarUsuario(u.login, { senha_hash: gerarHash(nova), trocar_senha: false });
    return json(res, 200, { usuario: publico(novo) });
  } catch (e) {
    return json(res, 500, { erro: e.message });
  }
}
