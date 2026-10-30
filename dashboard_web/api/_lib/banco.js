// Único ponto que conversa com o banco do sistema de OS.
// Produção: Supabase (Postgres pela API REST + Storage para fotos), com a chave service_role, que fica só na Vercel.
// No seu computador, sem SUPABASE_URL: banco de teste num arquivo .dados_locais/ (nunca em produção).
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const BUCKET = 'os-arquivos';
const CHAVES = { usuarios: 'login', veiculos: 'chassi', os: 'id', os_eventos: 'id', arquivos: 'caminho' };

export function modoLocal() {
  return !process.env.SUPABASE_URL && process.env.VERCEL_ENV !== 'production';
}

function supabase() {
  const url = process.env.SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !chave) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY não configurados na Vercel.');
  return { url: url.replace(/\/+$/, ''), chave };
}

// ───────────────────────── Supabase ─────────────────────────

function filtroQS(qs, { eq = {}, em = {} } = {}) {
  Object.entries(eq).forEach(([k, v]) => qs.append(k, (v === null ? 'is.' : 'eq.') + (v === null ? 'null' : String(v))));
  Object.entries(em).forEach(([k, lista]) => qs.append(k, 'in.(' + lista.map((x) => '"' + String(x).replace(/"/g, '') + '"').join(',') + ')'));
}

async function rest(caminho, { method = 'GET', qs, corpo, prefer } = {}) {
  const { url, chave } = supabase();
  const headers = { apikey: chave, Authorization: 'Bearer ' + chave };
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(url + '/rest/v1/' + caminho + (qs && String(qs) ? '?' + qs : ''),
    { method, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const t = await r.text();
  if (!r.ok) {
    let msg = t;
    try { msg = JSON.parse(t).message || t; } catch { /* texto */ }
    throw new Error('Banco: ' + msg);
  }
  return t ? JSON.parse(t) : null;
}

const sb = {
  async listar(t, { eq, em, ordem, limite } = {}) {
    const qs = new URLSearchParams({ select: '*' });
    filtroQS(qs, { eq, em });
    if (ordem) qs.set('order', ordem);
    if (limite) qs.set('limit', String(limite));
    return rest(t, { qs });
  },
  async inserir(t, linhas, { mesclar = false } = {}) {
    const qs = new URLSearchParams();
    if (mesclar) qs.set('on_conflict', CHAVES[t]);
    return rest(t, { method: 'POST', qs, corpo: Array.isArray(linhas) ? linhas : [linhas],
      prefer: 'return=representation' + (mesclar ? ',resolution=merge-duplicates' : '') });
  },
  async atualizar(t, filtro, mudancas) {
    const qs = new URLSearchParams();
    filtroQS(qs, filtro);
    return rest(t, { method: 'PATCH', qs, corpo: mudancas, prefer: 'return=representation' });
  },
  async apagar(t, filtro) {
    const qs = new URLSearchParams();
    filtroQS(qs, filtro);
    if (!String(qs)) throw new Error('Apagar sem filtro não é permitido.');
    return rest(t, { method: 'DELETE', qs, prefer: 'return=representation' });
  },
  async guardarArquivo(caminho, buffer, tipo) {
    const { url, chave } = supabase();
    const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${caminho}`, {
      method: 'POST', body: buffer,
      headers: { apikey: chave, Authorization: 'Bearer ' + chave, 'Content-Type': tipo, 'x-upsert': 'true' }
    });
    if (!r.ok) throw new Error('Armazenamento: ' + (await r.text()));
  },
  async lerArquivo(caminho) {
    const { url, chave } = supabase();
    const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${caminho}`, { headers: { apikey: chave, Authorization: 'Bearer ' + chave } });
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok) throw new Error('Armazenamento: ' + (await r.text()));
    return { buffer: Buffer.from(await r.arrayBuffer()), tipo: r.headers.get('content-type') || 'application/octet-stream' };
  },
  async apagarArquivos(caminhos) {
    if (!caminhos.length) return;
    const { url, chave } = supabase();
    for (let i = 0; i < caminhos.length; i += 500) {
      const r = await fetch(`${url}/storage/v1/object/${BUCKET}`, {
        method: 'DELETE', body: JSON.stringify({ prefixes: caminhos.slice(i, i + 500) }),
        headers: { apikey: chave, Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' }
      });
      if (!r.ok) throw new Error('Armazenamento: ' + (await r.text()));
    }
  }
};

// ───────────────────────── Local (arquivo) ─────────────────────────

function pastaLocal() {
  return process.env.LOKAL_DADOS_DIR || join(process.cwd(), '.dados_locais');
}
let mem = null;

function carregar() {
  if (mem) return mem;
  const arq = join(pastaLocal(), 'banco.json');
  if (existsSync(arq)) {
    mem = JSON.parse(readFileSync(arq, 'utf8'));
  } else {
    mem = { usuarios: [], veiculos: [], os: [], os_eventos: [], arquivos: [], seq: { os: 0, os_eventos: 0 } };
    semearLocal(mem);
    gravar();
  }
  return mem;
}

function gravar() {
  mkdirSync(pastaLocal(), { recursive: true });
  writeFileSync(join(pastaLocal(), 'banco.json'), JSON.stringify(mem));
}

/** Só para testes: volta o banco local ao estado inicial. */
export function zerarLocal() {
  if (!modoLocal()) throw new Error('Só no modo local.');
  rmSync(pastaLocal(), { recursive: true, force: true });
  mem = null;
}

let semeador = null;
/** O conteúdo de exemplo é registrado por exemplo_os.js (evita import circular). */
export function registrarSemeador(f) { semeador = f; }
function semearLocal(m) {
  if (!semeador) return;
  const s = semeador();
  m.veiculos = s.veiculos;
  m.usuarios = s.usuarios;
  s.os.forEach((o) => { m.seq.os = Math.max(m.seq.os, o.id); m.os.push(o); });
  s.os_eventos.forEach((e) => { e.id = ++m.seq.os_eventos; m.os_eventos.push(e); });
}

const casa = ({ eq = {}, em = {} } = {}) => (l) =>
  Object.entries(eq).every(([k, v]) => (v === null ? l[k] === null || l[k] === undefined : String(l[k]) === String(v))) &&
  Object.entries(em).every(([k, lista]) => lista.map(String).includes(String(l[k])));

const copia = (x) => JSON.parse(JSON.stringify(x));

const local = {
  async listar(t, { eq, em, ordem, limite } = {}) {
    let r = carregar()[t].filter(casa({ eq, em }));
    if (ordem) {
      const [campo, dir] = ordem.split('.');
      r = [...r].sort((a, b) => (a[campo] > b[campo] ? 1 : a[campo] < b[campo] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    if (limite) r = r.slice(0, limite);
    return copia(r);
  },
  async inserir(t, linhas, { mesclar = false } = {}) {
    const m = carregar(), ch = CHAVES[t];
    const out = (Array.isArray(linhas) ? linhas : [linhas]).map((l0) => {
      const l = copia(l0);
      if ((t === 'os' || t === 'os_eventos') && l.id === undefined) l.id = ++m.seq[t];
      const i = m[t].findIndex((x) => x[ch] === l[ch]);
      if (i >= 0) {
        if (!mesclar) throw new Error('Banco: registro repetido (' + ch + ').');
        m[t][i] = { ...m[t][i], ...l };
        return m[t][i];
      }
      if (t === 'os') l.criado_em = l.criado_em || new Date().toISOString();
      m[t].push(l);
      return l;
    });
    gravar();
    return copia(out);
  },
  async atualizar(t, filtro, mudancas) {
    const m = carregar();
    const alvo = m[t].filter(casa(filtro));
    alvo.forEach((l) => Object.assign(l, copia(mudancas)));
    gravar();
    return copia(alvo);
  },
  async apagar(t, filtro) {
    const m = carregar(), f = casa(filtro);
    const fora = m[t].filter(f);
    m[t] = m[t].filter((l) => !f(l));
    gravar();
    return fora;
  },
  async guardarArquivo(caminho, buffer, tipo) {
    const arq = join(pastaLocal(), 'arquivos', caminho);
    mkdirSync(dirname(arq), { recursive: true });
    writeFileSync(arq, buffer);
    writeFileSync(arq + '.tipo', tipo);
  },
  async lerArquivo(caminho) {
    const arq = join(pastaLocal(), 'arquivos', caminho);
    if (!existsSync(arq)) return null;
    return { buffer: readFileSync(arq), tipo: readFileSync(arq + '.tipo', 'utf8') };
  },
  async apagarArquivos(caminhos) {
    caminhos.forEach((c) => {
      rmSync(join(pastaLocal(), 'arquivos', c), { force: true });
      rmSync(join(pastaLocal(), 'arquivos', c + '.tipo'), { force: true });
    });
  }
};

/** O banco em uso: Supabase quando configurado, arquivo local no computador. */
export const banco = new Proxy({}, { get: (_, nome) => (modoLocal() ? local : sb)[nome] });
