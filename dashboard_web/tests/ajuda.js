// Ajuda dos testes: chama as funções da api/ como a Vercel chamaria, com o banco local num diretório temporário.
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { join, dirname } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export async function preparar() {
  process.chdir(join(dirname(fileURLToPath(import.meta.url)), '..'));
  delete process.env.APPS_SCRIPT_URL;
  delete process.env.SUPABASE_URL;
  process.env.LOKAL_DADOS_DIR = mkdtempSync(join(tmpdir(), 'lokal-'));
  const m = async (n) => (await import(`../api/${n}.js`)).default;
  return { login: await m('login'), dados: await m('dados'), usuarios: await m('usuarios'), sessao: await m('sessao'),
    senha: await m('senha'), os: await m('os'), fotos: await m('fotos'), veiculos: await m('veiculos') };
}

export function chamar(handler, { method = 'GET', url = '/', body, cookie, binario, tipo, headers = {} } = {}) {
  const req = Readable.from(binario ? [binario] : body ? [JSON.stringify(body)] : []);
  Object.assign(req, { method, url, headers: { host: 'localhost:3000', 'content-type': tipo || (body ? 'application/json' : ''),
    cookie: cookie || '', ...headers } });
  return new Promise((ok) => {
    const res = {
      statusCode: 200, h: {},
      setHeader(k, v) { this.h[k.toLowerCase()] = v; },
      end(t) {
        let d = null;
        if (t !== undefined && t !== null) { try { d = JSON.parse(t); } catch { d = t; } }
        ok({ status: this.statusCode, h: this.h, d });
      }
    };
    handler(req, res);
  });
}

export async function entrar(login, usuario, senha = 'lokal1234') {
  const r = await chamar(login, { method: 'POST', body: { usuario, senha } });
  assert.equal(r.status, 200, JSON.stringify(r.d));
  return r.h['set-cookie'].split(';')[0];
}
