import { json, metodo } from './_lib/http.js';
import { exigir, publico } from './_lib/acesso.js';
import { modoLocal } from './_lib/banco.js';

export default async function handler(req, res) {
  if (!metodo(req, res, ['GET'])) return;
  try {
    const u = await exigir(req, res, { troca: true });
    if (!u) return;
    return json(res, 200, { usuario: publico(u), modo_local: modoLocal() });
  } catch (e) {
    return json(res, 500, { erro: e.message });
  }
}
