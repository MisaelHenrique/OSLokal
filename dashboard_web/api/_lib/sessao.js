// Sessão em cookie assinado (HMAC-SHA256). O cookie leva só o login e a validade; perfil e filial são relidos
// da tabela usuarios a cada pedido, então desativar ou mudar um usuário vale em até 1 minuto (cache).
// Mecânico fica 30 dias logado, para o celular conseguir enviar fechamentos feitos sem internet; os demais, 12 h.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { lerCookies, ehLocal } from './http.js';

export const COOKIE = 'lokal_sessao';
const VALIDADE_S = 12 * 60 * 60;
export const VALIDADE_MECANICO_S = 30 * 24 * 60 * 60;

function segredo() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.VERCEL_ENV === 'production') throw new Error('SESSION_SECRET não configurado na Vercel.');
  return 'segredo-local-apenas-para-testes-no-computador';
}

const assinar = (txt) => createHmac('sha256', segredo()).update(txt).digest('base64url');

export function criarToken(login, agora = Date.now(), validade = VALIDADE_S) {
  const corpo = Buffer.from(JSON.stringify({ e: login, x: Math.floor(agora / 1000) + validade })).toString('base64url');
  return corpo + '.' + assinar(corpo);
}

export function lerToken(token, agora = Date.now()) {
  const [corpo, ass] = String(token || '').split('.');
  if (!corpo || !ass) return null;
  const a = Buffer.from(ass), b = Buffer.from(assinar(corpo));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    if (!d.e || !d.x || d.x * 1000 < agora) return null;
    return d.e;
  } catch {
    return null;
  }
}

export function gravarCookie(req, res, login, validade = VALIDADE_S) {
  const seguro = ehLocal(req) ? '' : '; Secure';
  res.setHeader('Set-Cookie', `${COOKIE}=${criarToken(login, Date.now(), validade)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${validade}${seguro}`);
}

export function apagarCookie(req, res) {
  const seguro = ehLocal(req) ? '' : '; Secure';
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${seguro}`);
}

export function loginDaSessao(req) {
  return lerToken(lerCookies(req)[COOKIE]);
}
