import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarLogin, lerNumero, conferirFinanceiro, erroNovaSenha, erroFechamento, podeVer, recortarOS } from '../public/js/os/regras.js';

test('login automático: primeiro nome sem acento + @lokal, repetidos numerados a partir de 1', () => {
  assert.equal(gerarLogin('André Souza', []), 'andre@lokal');
  assert.equal(gerarLogin('André Lima', ['andre@lokal']), 'andre1@lokal');
  assert.equal(gerarLogin('ANDRE x', ['andre@lokal', 'andre1@lokal']), 'andre2@lokal');
  assert.equal(gerarLogin('  João  da Silva', []), 'joao@lokal');
  assert.equal(gerarLogin('Fábio', ['andre@lokal']), 'fabio@lokal');
  assert.throws(() => gerarLogin('   ', []));
});

test('números em formato brasileiro', () => {
  assert.equal(lerNumero('1.765,44'), 1765.44);
  assert.equal(lerNumero('R$ 1.765,44'), 1765.44);
  assert.equal(lerNumero('120.500'), 120500);
  assert.equal(lerNumero('1765.44'), 1765.44);
  assert.equal(lerNumero(''), null);
  assert.ok(Number.isNaN(lerNumero('abc')));
});

test('financeiro soma o total e exige peças ou mão de obra', () => {
  assert.match(conferirFinanceiro({}).erro, /peças ou de mão de obra/);
  assert.equal(conferirFinanceiro({ valor_pecas: '10,10', valor_mao_obra: '0,20', valor_deslocamento: '' }).valores.valor_total, 10.3);
  assert.ok(conferirFinanceiro({ valor_pecas: '-1' }).erro);
});

test('fechamento: limites de km/horímetro e data (sem cobertura antes)', () => {
  const os = { tipo: 'SERVICO', aberta_em: '2026-01-01T10:00:00.000Z' };
  const base = { km: '100', fotos: { placa: 'a', servico: 'b' }, executada_em: '2026-01-02T10:00:00.000Z' };
  assert.equal(erroFechamento(base, os), '', 'caso válido não devia dar erro');
  assert.match(erroFechamento({ ...base, km: '5000001' }, os), /Km fora do esperado/);
  assert.match(erroFechamento({ ...base, km: '', horimetro: '500001' }, os), /Horímetro fora do esperado/);
  assert.match(erroFechamento({ ...base, km: '-1' }, os), /precisam ser números/, 'km negativo');
  assert.match(erroFechamento({ ...base, executada_em: 'não é uma data' }, os), /inválida/);
  assert.match(erroFechamento({ ...base, executada_em: '2025-12-31T00:00:00.000Z' }, os), /anterior à abertura/,
    'fechamento não pode ser antes da OS ter sido aberta');
  assert.match(erroFechamento({}, null), /não encontrada/);
  assert.equal(erroFechamento({ ...base, fotos: { placa: 'a' } }, os).includes('serviço'), true, 'falta foto obrigatória');
});

test('senha nova', () => {
  assert.ok(erroNovaSenha('mudar123'));
  assert.ok(erroNovaSenha('1234567'));
  assert.equal(erroNovaSenha('boa-senha-1', 'mudar123'), '');
});

test('quem vê e o que vê', () => {
  const os = { status: 'FECHADA', filial: 'MATRIZ', direcionada_para: 'a@lokal', ajudantes: ['b@lokal'], valor_total: 10 };
  assert.ok(podeVer({ perfil: 'FILIAL', filial: 'MATRIZ;OUTROS' }, os));
  assert.ok(!podeVer({ perfil: 'FILIAL', filial: 'OUTROS' }, os));
  assert.ok(podeVer({ perfil: 'MECANICO', login: 'b@lokal' }, os));
  assert.ok(!podeVer({ perfil: 'MECANICO', login: 'c@lokal' }, os));
  assert.ok(!podeVer({ perfil: 'MECANICO', login: 'a@lokal' }, { ...os, status: 'APROVADA' }));
  assert.equal(recortarOS({ perfil: 'MECANICO' }, os).valor_total, undefined);
  assert.equal(recortarOS({ perfil: 'FILIAL' }, os).valor_total, 10);
  assert.equal(recortarOS({ perfil: 'FILIAL' }, { ...os, status: 'EXECUTADA' }).valor_total, undefined);
});
