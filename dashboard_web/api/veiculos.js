// GET /api/veiculos → cadastro central, recortado: filial vê só os seus veículos.
import { json, metodo } from './_lib/http.js';
import { exigir } from './_lib/acesso.js';
import { banco } from './_lib/banco.js';
import { filiaisDe } from '../public/js/os/regras.js';

const CAMPOS = ['chassi', 'frota', 'placa', 'tipo', 'modelo', 'ano', 'empresa', 'filial', 'obra'];

export default async function handler(req, res) {
  if (!metodo(req, res, ['GET'])) return;
  try {
    const u = await exigir(req, res, { perfis: ['ADMIN', 'DIRETORIA', 'FILIAL'] });
    if (!u) return;
    const minhas = new Set(filiaisDe(u));
    const todos = await banco.listar('veiculos', { eq: { ativo: true }, ordem: 'placa.asc' });
    const veiculos = todos.filter((v) => u.perfil !== 'FILIAL' || minhas.has(v.filial))
      .map((v) => Object.fromEntries(CAMPOS.map((k) => [k, v[k] ?? ''])));
    return json(res, 200, { veiculos });
  } catch (e) {
    return json(res, 500, { erro: e.message });
  }
}
