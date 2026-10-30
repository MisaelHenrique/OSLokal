// Fotos e nota fiscal das OS, guardadas no Storage do Supabase (bucket privado). O navegador nunca fala com o
// Supabase: envia e lê por aqui, e cada pedido confere se a pessoa pode ver aquela OS.
// POST /api/fotos?tipo=placa&os=12&envio=<id>   corpo = a imagem (image/jpeg, png, webp; nf também PDF)
// POST /api/fotos?tipo=problema&envio=<id>&n=1  foto do problema, antes de abrir a OS
// GET  /api/fotos?caminho=os/12/placa-<id>.jpg
import { json, metodo, lerBinario } from './_lib/http.js';
import { exigir } from './_lib/acesso.js';
import { banco } from './_lib/banco.js';
import { podeVer, ehResponsavel, podeAbrir, TIPOS_FOTO, FOTOS_FECHAMENTO } from '../public/js/os/regras.js';

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
  if (tipo === 'problema') {
    if (!podeAbrir(u)) return json(res, 403, { erro: 'Seu perfil não abre OS.' });
    const n = Math.min(9, Math.max(1, Number(q.get('n')) || 1));
    caminho = `novas/${u.login.replace(/[^a-z0-9]/g, '_')}/${envio}-${n}.${EXT[conteudo]}`;
  } else {
    const os = await osDe(q.get('os'));
    if (!os || !podeVer(u, os)) return json(res, 404, { erro: 'OS não encontrada.' });
    if (FOTOS_FECHAMENTO.includes(tipo)) {
      const repetido = os.status === 'EXECUTADA' && os.envio_id === envio;
      if (!ehResponsavel(u, os) || !(['DIRECIONADA', 'EM_EXECUCAO'].includes(os.status) || repetido)) {
        return json(res, 409, { erro: 'Esta OS não está mais com você. Fale com a matriz.' });
      }
    } else if (tipo === 'nf') {
      if (u.perfil !== 'ADMIN' || !['EXECUTADA', 'FECHADA'].includes(os.status)) return json(res, 403, { erro: 'Só a matriz anexa a nota.' });
    }
    os_id = os.id;
    caminho = `os/${os.id}/${tipo}-${envio}.${EXT[conteudo]}`;
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
    pode = !!os && podeVer(u, os) &&
      (a.tipo !== 'nf' || u.perfil === 'ADMIN' || u.perfil === 'DIRETORIA' || (u.perfil === 'FILIAL' && os.status === 'FECHADA'));
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
