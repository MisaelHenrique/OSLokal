import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarToken, lerToken } from '../api/_lib/sessao.js';
import { gerarHash, conferirSenha } from '../api/_lib/senha.js';

test('token de sessão: válido, adulterado e vencido', () => {
  const t = criarToken('a@b.com');
  assert.equal(lerToken(t), 'a@b.com');
  const [corpo, ass] = t.split('.');
  const outro = Buffer.from(JSON.stringify({ e: 'chefe@b.com', x: 9999999999 })).toString('base64url');
  assert.equal(lerToken(outro + '.' + ass), null, 'trocar o e-mail invalida a assinatura');
  assert.equal(lerToken(corpo + '.xx'), null);
  assert.equal(lerToken(criarToken('a@b.com', Date.now() - 13 * 3600 * 1000)), null, 'vence em 12 h');
  assert.equal(lerToken(criarToken('m@lokal', Date.now() - 29 * 86400 * 1000, 30 * 86400)), 'm@lokal', 'mecânico: 30 dias');
  assert.equal(lerToken(''), null);
});

test('senha: hash confere, senha errada não, formato estranho não', () => {
  const h = gerarHash('senha-forte-1');
  assert.ok(h.startsWith('scrypt$'));
  assert.ok(!h.includes('senha-forte-1'));
  assert.ok(conferirSenha('senha-forte-1', h));
  assert.ok(!conferirSenha('senha-forte-2', h));
  assert.ok(!conferirSenha('x', 'texto-puro'));
  assert.throws(() => gerarHash('curta'), /8 caracteres/);
});
