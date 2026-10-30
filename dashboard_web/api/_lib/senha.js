// Senhas: só o hash scrypt é guardado (aba USUARIOS). Formato: scrypt$N$r$p$sal$hash (base64url).
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const N = 16384, R = 8, P = 1, TAM = 32;

export function gerarHash(senha) {
  validarSenha(senha);
  const sal = randomBytes(16);
  const h = scryptSync(String(senha), sal, TAM, { N, r: R, p: P });
  return ['scrypt', N, R, P, sal.toString('base64url'), h.toString('base64url')].join('$');
}

export function conferirSenha(senha, guardado) {
  const partes = String(guardado || '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, 'base64url');
  const h = scryptSync(String(senha || ''), Buffer.from(sal, 'base64url'), esperado.length,
    { N: Number(n), r: Number(r), p: Number(p) });
  return h.length === esperado.length && timingSafeEqual(h, esperado);
}

export function validarSenha(senha) {
  if (String(senha || '').length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
}
