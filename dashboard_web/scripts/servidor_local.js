// Servidor para testar no seu computador, sem conta na Vercel: npm run dev  →  http://localhost:3000
// Imita o que a Vercel faz: arquivos de public/ (com URLs sem .html) e cada api/<nome>.js como função.
// Sem .env.local, usa os dados e usuários de exemplo/ (modo local).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(RAIZ);
const env = join(RAIZ, '.env.local');
if (existsSync(env)) {
  readFileSync(env, 'utf8').split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
}
const vercel = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'));
const CABECALHOS = vercel.headers.find((h) => h.source === '/(.*)').headers;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };
const PORTA = Number(process.env.PORT || 3000);

createServer(async (req, res) => {
  CABECALHOS.forEach((h) => res.setHeader(h.key, h.value));
  const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const api = caminho.match(/^\/api\/([a-z_]+)$/);
    if (api) {
      const arq = join(RAIZ, 'api', api[1] + '.js');
      if (!existsSync(arq)) { res.statusCode = 404; return res.end('{"erro":"não existe"}'); }
      const mod = await import(pathToFileURL(arq).href);
      return await mod.default(req, res);
    }
    let rel = normalize(caminho).replace(/^(\.\.[/\\])+/, '');
    if (rel.endsWith('/')) rel += 'index';
    let arq = join(RAIZ, 'public', rel);
    if (!extname(arq)) arq = existsSync(arq + '.html') ? arq + '.html' : join(arq, 'index.html');
    if (!arq.startsWith(join(RAIZ, 'public')) || !(await stat(arq).catch(() => null))) {
      res.statusCode = 404; return res.end('Não encontrado');
    }
    res.setHeader('Content-Type', TIPOS[extname(arq)] || 'application/octet-stream');
    res.end(await readFile(arq));
  } catch (e) {
    console.error(e);
    res.statusCode = 500; res.end(String(e.message));
  }
}).listen(PORTA, () => {
  console.log(`LOKAL (dashboard + OS) em http://localhost:${PORTA}`);
  console.log(process.env.SUPABASE_URL ? 'OS e usuários: Supabase (SUPABASE_URL do .env.local).'
    : 'OS e usuários: banco de teste em .dados_locais/ (senha lokal1234: matriz@lokal, luis@lokal, joao@lokal, diretoria@lokal).'
      + '\nPara recomeçar do zero, apague a pasta .dados_locais.');
  console.log(process.env.APPS_SCRIPT_URL ? 'Dashboard: CONSOLIDAÇÃO pelo Apps Script.' : 'Dashboard: dados de exemplo/.');
});
