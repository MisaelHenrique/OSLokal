// GET /api/dados            → dados reais da CONSOLIDAÇÃO, recortados pelo perfil
// GET /api/dados?modo=exemplo → dados de exemplo (modo demonstração), recortados do mesmo jeito
// GET /api/dados?atualizar=1  → ignora o cache de 5 min
import { json, metodo } from './_lib/http.js';
import { exigir, recortarPorPerfil } from './_lib/acesso.js';
import { buscarDados, dadosExemplo } from './_lib/planilha.js';

export default async function handler(req, res) {
  if (!metodo(req, res, ['GET'])) return;
  try {
    const u = await exigir(req, res, { perfis: ['ADMIN', 'DIRETORIA', 'FILIAL'] });
    if (!u) return;
    const q = new URL(req.url, 'http://x').searchParams;
    const dados = q.get('modo') === 'exemplo' ? dadosExemplo() : await buscarDados({ forcar: q.get('atualizar') === '1' });
    return json(res, 200, recortarPorPerfil(dados, u));
  } catch (e) {
    return json(res, 502, { erro: e.message });
  }
}
