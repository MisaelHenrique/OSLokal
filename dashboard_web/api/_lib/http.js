// Utilitários de resposta e leitura de pedido, no formato Node puro (funciona na Vercel e no servidor local).

export function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export async function lerCorpo(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  let texto = '';
  for await (const parte of req) {
    texto += parte;
    if (texto.length > 100_000) throw new Error('Pedido grande demais.');
  }
  try { return JSON.parse(texto || '{}'); } catch { return {}; }
}

export function lerCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export function ehLocal(req) {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(req.headers.host || ''));
}

/** Só aceita escrita vinda da própria página (JSON), o que barra formulários de outros sites. */
export function pedidoJsonDaPagina(req) {
  return /application\/json/.test(String(req.headers['content-type'] || ''));
}

export function metodo(req, res, permitidos) {
  if (permitidos.includes(req.method)) return true;
  res.setHeader('Allow', permitidos.join(', '));
  json(res, 405, { erro: 'Método não permitido.' });
  return false;
}

/** Arquivo enviado pela própria página (fotos, nota fiscal): corpo binário, com o cabeçalho X-Lokal. */
export async function lerBinario(req, max) {
  if (req.headers['x-lokal'] !== '1') throw Object.assign(new Error('Pedido inválido.'), { status: 415 });
  const partes = [];
  let total = 0;
  for await (const p of req) {
    total += p.length;
    if (total > max) throw Object.assign(new Error('Arquivo grande demais.'), { status: 413 });
    partes.push(Buffer.from(p));
  }
  return Buffer.concat(partes);
}
