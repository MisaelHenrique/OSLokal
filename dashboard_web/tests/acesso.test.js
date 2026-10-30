import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recortarPorPerfil, filiaisDoUsuario } from '../api/_lib/acesso.js';

const dados = {
  origem: 'CONSOLIDACAO', ultima_juncao: '2026-10-22T09:00', segredo: 'não pode sair',
  filiais: [{ filial: 'MATRIZ' }, { filial: 'OUTROS' }, { filial: 'LUÍS ANDRÉ' }],
  notas: [{ filial: 'MATRIZ', nf: 1 }, { filial: 'OUTROS', nf: 2 }, { filial: 'LUÍS ANDRÉ', nf: 3 }],
  itens: [{ filial: 'MATRIZ' }, { filial: 'LUÍS ANDRÉ' }],
  veiculos: [{ filial: 'MATRIZ' }, { filial: 'LUÍS ANDRÉ' }],
  erros: [{ filial: 'LUÍS ANDRÉ' }]
};

test('filial vê só as suas filiais, em todas as tabelas', () => {
  const r = recortarPorPerfil(dados, { perfil: 'FILIAL', filial: 'MATRIZ;OUTROS' });
  assert.deepEqual(r.notas.map((n) => n.nf), [1, 2]);
  assert.deepEqual(r.filiais.map((f) => f.filial), ['MATRIZ', 'OUTROS']);
  assert.equal(r.itens.length, 1);
  assert.equal(r.erros.length, 0);
  assert.ok(!JSON.stringify(r).includes('LUÍS ANDRÉ'), 'nada de outra filial');
});

test('diretoria e admin veem tudo', () => {
  assert.equal(recortarPorPerfil(dados, { perfil: 'DIRETORIA' }).notas.length, 3);
  assert.equal(recortarPorPerfil(dados, { perfil: 'ADMIN' }).filiais.length, 3);
});

test('campos fora da lista não passam; perfil desconhecido ou filial vazia não vê nada', () => {
  assert.equal(recortarPorPerfil(dados, { perfil: 'DIRETORIA' }).segredo, undefined);
  const x = recortarPorPerfil(dados, { perfil: 'OUTRO' });
  assert.equal(x.notas.length + x.itens.length + x.veiculos.length + x.filiais.length, 0);
  assert.equal(recortarPorPerfil(dados, { perfil: 'FILIAL', filial: '' }).notas.length, 0);
});

test('filiaisDoUsuario aceita ; com espaços', () => {
  assert.deepEqual(filiaisDoUsuario({ filial: ' MATRIZ ; OUTROS;' }), ['MATRIZ', 'OUTROS']);
});
