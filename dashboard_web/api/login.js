import { json, lerCorpo, metodo, pedidoJsonDaPagina } from './_lib/http.js';
import { conferirSenha } from './_lib/senha.js';
import { gravarCookie, VALIDADE_MECANICO_S } from './_lib/sessao.js';
import { buscarUsuario } from './_lib/usuarios.js';
import { publico } from './_lib/acesso.js';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  if (!metodo(req, res, ['POST'])) return;
  if (!pedidoJsonDaPagina(req)) return json(res, 415, { erro: 'Formato inválido.' });
  try {
    const b = await lerCorpo(req);
    let login = String(b.usuario || b.login || '').trim().toLowerCase();
    if (login && !login.includes('@')) login += '@lokal';   // aceita "andre" no lugar de "andre@lokal"
    const u = await buscarUsuario(login, { forcar: true });
    if (!u || u.ativo === false || !conferirSenha(b.senha, u.senha_hash)) {
      await espera(700);   // freia tentativas em sequência
      return json(res, 401, { erro: 'Usuário ou senha incorretos.' });
    }
    gravarCookie(req, res, u.login, u.perfil === 'MECANICO' ? VALIDADE_MECANICO_S : undefined);
    return json(res, 200, { usuario: publico(u) });
  } catch (e) {
    return json(res, 500, { erro: e.message });
  }
}
