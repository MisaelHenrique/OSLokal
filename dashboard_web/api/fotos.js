// Fotos e nota fiscal das OS, guardadas no Storage do Supabase (bucket privado). O navegador nunca fala com o
// Supabase: envia e lê por aqui, e cada pedido confere se a pessoa pode ver aquela OS.
// A OS nasce já com o lançamento inteiro: fotos de frente/painel/defeito são enviadas ANTES da OS existir
// (como a nota fiscal é anexada depois, essa é a única que exige uma OS já lançada).
// POST /api/fotos?tipo=frente|painel&envio=<id>
// POST /api/fotos?tipo=defeito&envio=<id>&n=1
// POST /api/fotos?tipo=nf&os=12&envio=<id>
// GET  /api/fotos?caminho=novas/<login>/<envio>-frente.jpg
import { json, metodo, lerBinario } from './_lib/http.js';
import { exigir } from './_lib/acesso.js';
import { banco } from './_lib/banco.js';
import { podeVer, podeLancar, podeSolicitar, TIPOS_FOTO } from '../public/js/os/regras.js';

const MAX = 4 * 1024 * 1024;   // a Vercel aceita até 4,5 MB por pedido; o celular reduz a foto antes (~300 KB)
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

async function osDe(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const [os] = await banco.listar('os', { eq: { id: n } });
  return os || null;
}

async function enviar(u, req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  const tipo = q.get('tipo'), envio = q.get('envio') || '';
  const conteudo = String(req.headers['content-type'] || '').split(';')[0].trim();
  if (!TIPOS_FOTO[tipo]) return json(res, 400, { erro: 'Tipo de arquivo inválido.' });
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(envio)) return json(res, 400, { erro: 'Envio inválido.' });
  if (!EXT[conteudo] || (conteudo === 'application/pdf' && tipo !== 'nf')) return json(res, 415, { erro: 'Envie uma foto (JPG, PNG) ou PDF.' });

  let caminho, os_id = null;
  if (tipo === 'nf') {
    const os = await osDe(q.get('os'));
    if (!os || !podeVer(u, os)) return json(res, 404, { erro: 'OS não encontrada.' });
    if (!['ADMIN', 'FILIAL'].includes(u.perfil) || os.status !== 'FEITA') return json(res, 403, { erro: 'Só a matriz ou a filial anexam a nota.' });
    os_id = os.id;
    caminho = `os/${os.id}/nf-${envio}.${EXT[conteudo]}`;
  } else {
    // frente, painel, defeito: a OS ainda não existe, nasce já com o lançamento inteiro (como antes era a foto do problema)
    if (!podeLancar(u) && !podeSolicitar(u)) return json(res, 403, { erro: 'Seu perfil não lança OS.' });
    const n = tipo === 'defeito' ? Math.min(3, Math.max(1, Number(q.get('n')) || 1)) : '';
    caminho = `novas/${u.login.replace(/[^a-z0-9]/g, '_')}/${envio}-${tipo}${n}.${EXT[conteudo]}`;
  }
  const corpo = await lerBinario(req, MAX);
  if (!corpo.length) return json(res, 400, { erro: 'Arquivo vazio.' });
  await banco.guardarArquivo(caminho, corpo, conteudo);
  await banco.inserir('arquivos', { caminho, os_id, tipo, enviado_por: u.login, enviado_em: new Date().toISOString(), exemplo: false },
    { mesclar: true });
  return json(res, 200, { caminho });
}

async function ler(u, req, res) {
  const caminho = new URL(req.url, 'http://x').searchParams.get('caminho') || '';
  const [a] = await banco.listar('arquivos', { eq: { caminho } });
  if (!a) return json(res, 404, { erro: 'Arquivo não encontrado.' });
  let pode = a.enviado_por === u.login;
  if (!pode && a.os_id) {
    const os = await osDe(a.os_id);
    pode = !!os && podeVer(u, os) && (a.tipo !== 'nf' || u.perfil !== 'MECANICO');
  }
  if (!pode) return json(res, 404, { erro: 'Arquivo não encontrado.' });
  const arq = await banco.lerArquivo(caminho);
  if (!arq) return json(res, 404, { erro: 'Arquivo não encontrado.' });
  res.statusCode = 200;
  res.setHeader('Content-Type', arq.tipo);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('Content-Disposition', 'inline');
  res.end(arq.buffer);
}

export default async function handler(req, res) {
  if (!metodo(req, res, ['GET', 'POST'])) return;
  try {
    const u = await exigir(req, res);
    if (!u) return;
    return req.method === 'POST' ? await enviar(u, req, res) : await ler(u, req, res);
  } catch (e) {
    return json(res, e.status || 500, { erro: e.message });
  }
}
