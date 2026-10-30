// Único ponto que conversa com a fonte de dados. Hoje: o Apps Script "LOKAL - Instalador" (DashboardServidor.gs).
// Se um dia a leitura passar a ser pela API do Google Sheets, só este arquivo muda.
//
// Sem APPS_SCRIPT_URL (no seu computador), usa os arquivos de exemplo/ — nunca em produção.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DADOS_MS = 5 * 60 * 1000;
const CACHE_USUARIOS_MS = 60 * 1000;
const cache = { dados: null, dadosEm: 0, usuarios: null, usuariosEm: 0 };

export function modoLocal() {
  return !process.env.APPS_SCRIPT_URL && process.env.VERCEL_ENV !== 'production';
}

function configurado() {
  if (!process.env.APPS_SCRIPT_URL || !process.env.DASH_TOKEN) {
    throw new Error('APPS_SCRIPT_URL e DASH_TOKEN não configurados na Vercel.');
  }
}

function lerExemplo(arquivo) {
  return JSON.parse(readFileSync(join(process.cwd(), 'exemplo', arquivo), 'utf8'));
}

async function chamar(params, corpo) {
  configurado();
  const url = new URL(process.env.APPS_SCRIPT_URL);
  let resp;
  if (corpo) {
    // O Apps Script responde o POST com um redirecionamento 302; o fetch segue com GET, que é o esperado.
    resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, redirect: 'follow',
      body: JSON.stringify({ ...corpo, token: process.env.DASH_TOKEN }) });
  } else {
    Object.entries({ ...params, token: process.env.DASH_TOKEN }).forEach(([k, v]) => url.searchParams.set(k, v));
    resp = await fetch(url, { redirect: 'follow' });
  }
  const texto = await resp.text();
  let d;
  try { d = JSON.parse(texto); } catch {
    throw new Error('O Apps Script não respondeu JSON (confira a implantação e o acesso "Qualquer pessoa").');
  }
  if (d.erro) throw new Error('Apps Script: ' + d.erro);
  return d;
}

/** NOTAS, ITENS, VEICULOS, ERROS e FILIAIS de todas as filiais. Quem chama recorta por perfil (acesso.js). */
export async function buscarDados({ forcar = false } = {}) {
  if (modoLocal()) return lerExemplo('dados_exemplo.json');
  if (!forcar && cache.dados && Date.now() - cache.dadosEm < CACHE_DADOS_MS) return cache.dados;
  const d = await chamar({ acao: 'dados' });
  d.buscado_em = new Date().toISOString();
  cache.dados = d; cache.dadosEm = Date.now();
  return d;
}

export function dadosExemplo() {
  return lerExemplo('dados_exemplo.json');
}

export async function buscarUsuarios({ forcar = false } = {}) {
  if (modoLocal()) {
    if (!cache.usuarios) cache.usuarios = lerExemplo('usuarios_exemplo.json').usuarios;
    return cache.usuarios;
  }
  if (!forcar && cache.usuarios && Date.now() - cache.usuariosEm < CACHE_USUARIOS_MS) return cache.usuarios;
  const d = await chamar({ acao: 'usuarios' });
  cache.usuarios = d.usuarios || []; cache.usuariosEm = Date.now();
  return cache.usuarios;
}

export async function salvarUsuario(u) {
  if (modoLocal()) {
    const lista = await buscarUsuarios();
    const i = lista.findIndex((x) => x.email === u.email);
    const antigo = i >= 0 ? lista[i] : {};
    const novo = { ...antigo, ...u, senha_hash: u.senha_hash || antigo.senha_hash, ativo: u.ativo !== false };
    if (i >= 0) lista[i] = novo; else lista.push(novo);
    return novo;
  }
  const d = await chamar(null, { acao: 'usuario', usuario: u });
  cache.usuarios = null;
  return d.usuario;
}
