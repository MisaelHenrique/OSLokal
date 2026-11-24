// Funções da api/ no modo local (sem SUPABASE_URL): banco local de teste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chamar, entrar, preparar } from './ajuda.js';

const { login, usuarios, sessao, senha, os } = await preparar();

test('login errado é recusado e não cria cookie', async () => {
  const r = await chamar(login, { method: 'POST', body: { usuario: 'matriz@lokal', senha: 'errada123' } });
  assert.equal(r.status, 401);
  assert.equal(r.h['set-cookie'], undefined);
});

test('login aceita o usuário sem o @lokal', async () => {
  const r = await chamar(login, { method: 'POST', body: { usuario: 'Matriz', senha: 'lokal1234' } });
  assert.equal(r.status, 200);
  assert.equal(r.d.usuario.login, 'matriz@lokal');
});

test('sem sessão: sessão e os respondem 401', async () => {
  assert.equal((await chamar(sessao)).status, 401);
  assert.equal((await chamar(os)).status, 401);
});

test('filial não administra usuários', async () => {
  const c = await entrar(login, 'patio@lokal');
  assert.equal((await chamar(usuarios, { cookie: c })).status, 403);
});

test('mecânico fica 30 dias logado, os demais 12 h', async () => {
  const m = await chamar(login, { method: 'POST', body: { usuario: 'joao@lokal', senha: 'lokal1234' } });
  assert.match(m.h['set-cookie'], /Max-Age=2592000/);
  const a = await chamar(login, { method: 'POST', body: { usuario: 'matriz@lokal', senha: 'lokal1234' } });
  assert.match(a.h['set-cookie'], /Max-Age=43200/);
});

test('matriz cria usuário: login automático, mudar123 e troca obrigatória no primeiro acesso', async () => {
  const c = await entrar(login, 'matriz@lokal');
  const l = await chamar(usuarios, { cookie: c });
  assert.equal(l.status, 200);
  assert.ok(!JSON.stringify(l.d).includes('scrypt$'), 'hash não sai');

  const novo = await chamar(usuarios, { method: 'POST', cookie: c, body: { nome: 'André Souza', perfil: 'MECANICO', equipe: 'Equipe 2' } });
  assert.equal(novo.status, 200, JSON.stringify(novo.d));
  assert.equal(novo.d.usuario.login, 'andre@lokal');
  assert.equal(novo.d.senha, 'mudar123');
  const outro = await chamar(usuarios, { method: 'POST', cookie: c, body: { nome: 'andré lima', perfil: 'MECANICO' } });
  assert.equal(outro.d.usuario.login, 'andre1@lokal');
  const terceiro = await chamar(usuarios, { method: 'POST', cookie: c, body: { nome: 'Andre Reis', perfil: 'MECANICO' } });
  assert.equal(terceiro.d.usuario.login, 'andre2@lokal');

  const ca = await entrar(login, 'andre@lokal', 'mudar123');
  const s = await chamar(sessao, { cookie: ca });
  assert.equal(s.d.usuario.trocar_senha, true);
  const os = (await import('../api/os.js')).default;
  const bloqueado = await chamar(os, { cookie: ca });
  assert.equal(bloqueado.status, 403);
  assert.equal(bloqueado.d.trocar_senha, true);

  assert.equal((await chamar(senha, { method: 'POST', cookie: ca, body: { atual: 'mudar123', nova: 'mudar123' } })).status, 400);
  assert.equal((await chamar(senha, { method: 'POST', cookie: ca, body: { atual: 'errada', nova: 'nova-senha-1' } })).status, 400);
  assert.equal((await chamar(senha, { method: 'POST', cookie: ca, body: { atual: 'mudar123', nova: 'curta' } })).status, 400);
  const ok = await chamar(senha, { method: 'POST', cookie: ca, body: { atual: 'mudar123', nova: 'nova-senha-1' } });
  assert.equal(ok.status, 200);
  assert.equal((await chamar(os, { cookie: ca })).status, 200, 'depois de trocar, entra');

  const reset = await chamar(usuarios, { method: 'POST', cookie: c, body: { login: 'andre@lokal', acao: 'resetar_senha' } });
  assert.equal(reset.status, 200);
  const cr = await entrar(login, 'andre@lokal', 'mudar123');
  assert.equal((await chamar(sessao, { cookie: cr })).d.usuario.trocar_senha, true);

  assert.equal((await chamar(usuarios, { method: 'POST', cookie: c, body: { nome: 'X Y', perfil: 'FILIAL' } })).status, 400, 'filial sem filial');
  assert.equal((await chamar(usuarios, { method: 'POST', cookie: c, body: { login: 'matriz@lokal', nome: 'Matriz', perfil: 'DIRETORIA' } })).status, 400,
    'não tira o próprio acesso');
});

test('desativado perde o acesso mesmo com cookie válido', async () => {
  const cAdmin = await entrar(login, 'matriz@lokal');
  const c = await entrar(login, 'luis@lokal');
  await chamar(usuarios, { method: 'POST', cookie: cAdmin, body: { login: 'luis@lokal', nome: 'Luís', perfil: 'FILIAL', filiais: ['LUÍS ANDRÉ'], ativo: false } });
  assert.equal((await chamar(sessao, { cookie: c })).status, 401);
});
