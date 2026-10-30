import { json, metodo } from './_lib/http.js';
import { apagarCookie } from './_lib/sessao.js';

export default function handler(req, res) {
  if (!metodo(req, res, ['POST'])) return;
  apagarCookie(req, res);
  return json(res, 200, { ok: true });
}
