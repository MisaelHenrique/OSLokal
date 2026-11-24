import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../public/js/kpis.js';

const veiculos = [
  { chassi: 'C1', placa: 'AAA-1111', filial: 'MATRIZ', tipo: 'PIPA' },
  { chassi: 'C2', placa: 'BBB-2222', filial: 'MATRIZ', tipo: 'MUNCK' },
  { chassi: 'C3', placa: 'CCC-3333', filial: 'LUÍS ANDRÉ', tipo: 'PIPA' }
];
const osList = [
  { id: 1, status: 'FEITA', chassi: 'C1', placa: 'AAA-1111', veiculo: 'PIPA X', filial: 'MATRIZ', grupo: 'FRE',
    data_servico: '2026-09-05', valor_pecas: 800, valor_mao_obra: 200, valor_total: 1000, execucao: 'INTERNA', notas: [] },
  { id: 2, status: 'FEITA', chassi: 'C1', placa: 'AAA-1111', veiculo: 'PIPA X', filial: 'MATRIZ', grupo: 'PNE',
    data_servico: '2026-09-10', valor_pecas: 1765.44, valor_mao_obra: 0, valor_total: 1765.44, execucao: 'INTERNA', notas: [] },
  { id: 3, status: 'FEITA', chassi: 'C2', placa: 'BBB-2222', veiculo: 'MUNCK Y', filial: 'MATRIZ', grupo: 'HID',
    data_servico: '2026-10-01', valor_pecas: 3000, valor_mao_obra: 500, valor_total: 3500, execucao: 'EXTERNA', oficina_externa: 'OFICINA Y',
    notas: [{ numero: '11', fornecedor: 'OFICINA Y', valor: 3500 }] },
  { id: 4, status: 'FEITA', chassi: 'C3', placa: 'CCC-3333', veiculo: 'PIPA Z', filial: 'LUÍS ANDRÉ', grupo: 'FRE',
    data_servico: '2026-10-10', valor_pecas: 400, valor_mao_obra: 100, valor_total: 500, execucao: 'INTERNA', notas: [] },
  { id: 5, status: 'FEITA', chassi: 'C1', placa: 'AAA-1111', veiculo: 'PIPA X', filial: 'MATRIZ', grupo: 'MOT',
    data_servico: '2026-10-15', valor_pecas: null, valor_mao_obra: null, valor_total: null, execucao: 'INTERNA', notas: [] }, // sem valor lançado ainda
  { id: 6, status: 'SOLICITADA', chassi: 'C2', placa: 'BBB-2222', veiculo: 'MUNCK Y', filial: 'MATRIZ', grupo: '',
    data_servico: null, notas: [] }
];

test('filtros por período, filial, tipo, grupo e placa (ignora o que não é FEITA via resumo/agrupar)', () => {
  assert.equal(K.filtrar(osList, veiculos, { de: '2026-10', ate: '2026-10' }).length, 3);
  assert.equal(K.filtrar(osList, veiculos, { filial: 'MATRIZ' }).length, 5);
  assert.equal(K.filtrar(osList, veiculos, { tipo: 'PIPA' }).length, 4);
  assert.equal(K.filtrar(osList, veiculos, { grupo: 'FRE' }).length, 2);
  assert.equal(K.filtrar(osList, veiculos, { placa: 'BBB-2222' }).length, 2);
});

test('resumo: só OS FEITA entra, ticket e custo por veículo dividem só por quem já tem valor lançado', () => {
  const r = K.resumo(osList);
  assert.equal(r.os, 5, 'as 5 FEITA, a SOLICITADA fica de fora');
  assert.equal(r.comValor, 4, 'a OS 5 não tem valor lançado ainda');
  assert.equal(Math.round(r.total * 100) / 100, 6765.44);
  assert.equal(Math.round(r.ticket * 100) / 100, Math.round((6765.44 / 4) * 100) / 100);
  assert.equal(r.veiculos, 3);
  assert.ok(Math.abs(r.pctPecas + r.pctMo - 1) < 1e-9);
  assert.equal(K.resumo([]).ticket, null, 'sem OS não divide por zero');

  // veículo que só tem OS sem valor lançado não entra no denominador de "custo por veículo"
  const comVeiculoSemValor = [...osList, { id: 7, status: 'FEITA', chassi: 'C4', placa: 'DDD-4444', veiculo: 'PIPA W',
    filial: 'MATRIZ', grupo: 'MOT', data_servico: '2026-10-20', valor_pecas: null, valor_mao_obra: null, valor_total: null }];
  const r2 = K.resumo(comVeiculoSemValor);
  assert.equal(r2.veiculos, 4, 'C4 conta como veículo atendido');
  assert.equal(r2.veiculosComValor, 3, 'mas C4 não tem valor lançado, então não entra no custo por veículo');
  assert.equal(r2.porVeiculo, r.porVeiculo, 'custo por veículo não muda ao entrar um veículo sem valor lançado');
});

test('agrupar ordena por contagem de OS primeiro (gasto é opcional), depois por gasto', () => {
  const g = K.agrupar(osList, (o) => o.grupo);
  assert.equal(g.find((x) => x.chave === 'FRE').os, 2, 'FRE tem 2 OS (vence por contagem mesmo com menos gasto)');
  assert.equal(g[0].chave, 'FRE');
  assert.ok(Math.abs(g.reduce((s, x) => s + x.pct, 0) - 1) < 1e-9);
});

test('meses, período anterior e variação', () => {
  assert.deepEqual(K.listaMeses('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(K.periodoAnterior('2026-01', '2026-06'), { de: '2025-07', ate: '2025-12' });
  assert.equal(K.somarMeses('2026-01', -1), '2025-12');
  assert.equal(K.variacao(150, 100), 0.5);
  assert.equal(K.variacao(10, 0), null);
});

test('série mensal: top N por GASTO (não por contagem de OS) + Outros, só soma quem tem valor', () => {
  const s = K.serieMensal(osList, ['2026-09', '2026-10'], (o) => o.grupo, 2);
  // é um gráfico de gasto: HID (3500, 1 OS) vem antes de FRE (1500, 2 OS) — contagem não manda aqui
  assert.deepEqual(s.series.map((x) => x.chave), ['HID', 'PNE', 'Outros']);
  assert.deepEqual(s.series[0].valores, [0, 3500]);
  assert.deepEqual(s.series[1].valores, [1765.44, 0]);
  assert.deepEqual(s.series[2].valores, [1000, 500], 'FRE (1500) foi pro "Outros" por ter o menor gasto dos 3');
});

test('frota no filtro', () => {
  assert.equal(K.frotaNoFiltro(veiculos, {}).length, 3);
  assert.equal(K.frotaNoFiltro(veiculos, { tipo: 'PIPA' }).length, 2);
});

test('matriz tipo × grupo: % por contagem de OS, não gasto', () => {
  const m = K.matrizTipoGrupo(osList, veiculos, ['FRE', 'PNE', 'HID', 'MOT']);
  const pipa = m.find((t) => t.tipo === 'PIPA');
  assert.equal(pipa.os, 4); // C1 (3 OS) + C3 (1 OS)
  assert.equal(pipa.celulas.find((c) => c.grupo === 'FRE').os, 2);
});

test('oficinas externas e fornecedores de nota', () => {
  const of = K.porOficinaExterna(osList);
  assert.equal(of.length, 1);
  assert.equal(of[0].chave, 'OFICINA Y'); assert.equal(of[0].total, 3500);
  const forn = K.porFornecedorNota(osList);
  assert.equal(forn.length, 1);
  assert.equal(forn[0].chave, 'OFICINA Y'); assert.equal(forn[0].notas, 1);
});

test('lista de notas e CSV', () => {
  const notas = K.listaNotas(osList);
  assert.equal(notas.length, 1);
  assert.equal(notas[0].fornecedor, 'OFICINA Y');
  const csv = K.csvNotas([{ ...notas[0], fornecedor: 'Oficina; Y' }]);
  const linhas = csv.replace('﻿', '').split('\r\n');
  assert.equal(linhas[0].split(';')[0], 'placa');
  assert.ok(linhas[1].includes('"Oficina; Y"'));
});
