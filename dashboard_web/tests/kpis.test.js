import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../public/js/kpis.js';

const dados = {
  filiais: [{ filial: 'MATRIZ' }, { filial: 'LUÍS ANDRÉ' }],
  veiculos: [
    { filial: 'MATRIZ', placa: 'AAA-1111', tipo_implemento: 'PIPA', marca_modelo: 'VW 26.280', situacao: 'ATIVO' },
    { filial: 'MATRIZ', placa: 'BBB-2222', tipo_implemento: 'MUNCK', marca_modelo: 'VW 27.320', situacao: 'ATIVO' },
    { filial: 'LUÍS ANDRÉ', placa: 'CCC-3333', tipo_implemento: 'PIPA', marca_modelo: 'MB 2729', situacao: 'BAIXADO' }
  ],
  notas: [
    { filial: 'MATRIZ', id_nota: 'N1', nf: '10', emissao: '2026-09-05', fornecedor: 'OFICINA X', interna_ou_terceiro: 'TERCEIRO', placa: 'AAA-1111' },
    { filial: 'MATRIZ', id_nota: 'N2', nf: '11', emissao: '2026-10-01', fornecedor: 'OFICINA Y', interna_ou_terceiro: 'INTERNA', placa: 'BBB-2222' },
    { filial: 'LUÍS ANDRÉ', id_nota: 'N1', nf: '50', emissao: '2026-10-10', fornecedor: 'OFICINA X', interna_ou_terceiro: 'TERCEIRO', placa: 'CCC-3333' }
  ],
  itens: [
    { filial: 'MATRIZ', id_nota: 'N1', placa: 'AAA-1111', cod_grupo: 'FRE', cod_subgrupo: 'FRE-LON', peca: 'lona', qtd: 4, custo_pecas: 800, custo_mao_de_obra: 200, custo_total: 1000 },
    { filial: 'MATRIZ', id_nota: 'N1', placa: 'AAA-1111', cod_grupo: 'PNE', cod_subgrupo: 'PNE-NOV', peca: 'pneu', qtd: 2, custo_pecas: '1.765,44', custo_mao_de_obra: 0, custo_total: '' },
    { filial: 'MATRIZ', id_nota: 'N2', placa: 'BBB-2222', cod_grupo: 'HID', cod_subgrupo: 'HID-BOM', peca: 'bomba', qtd: 1, custo_pecas: 3000, custo_mao_de_obra: 500, custo_total: 3500 },
    { filial: 'LUÍS ANDRÉ', id_nota: 'N1', placa: 'CCC-3333', cod_grupo: 'FRE', cod_subgrupo: 'FRE-LON', peca: 'lona', qtd: 2, custo_pecas: 400, custo_mao_de_obra: 100, custo_total: 500 }
  ]
};
const base = K.prepararBase(dados);

test('prepararBase junta nota e veículo e lê número em pt-BR', () => {
  const pneu = base.itens.find((i) => i.grupo === 'PNE');
  assert.equal(pneu.pecas, 1765.44);
  assert.equal(pneu.total, 1765.44, 'custo_total vazio = peças + mão de obra');
  assert.equal(pneu.tipo, 'PIPA');
  assert.equal(pneu.mes, '2026-09');
  assert.deepEqual(base.meses, ['2026-09', '2026-10']);
});

test('id_nota igual em filiais diferentes não se mistura', () => {
  const r = K.resumo(base.itens);
  assert.equal(r.notas, 3);
  assert.equal(r.veiculos, 3);
  assert.equal(Math.round(r.total * 100) / 100, 6765.44);
});

test('filtros por período, filial, tipo, grupo e placa', () => {
  assert.equal(K.filtrar(base.itens, { de: '2026-10', ate: '2026-10' }).length, 2);
  assert.equal(K.filtrar(base.itens, { filial: 'MATRIZ' }).length, 3);
  assert.equal(K.filtrar(base.itens, { tipo: 'PIPA' }).length, 3);
  assert.equal(K.filtrar(base.itens, { grupo: 'FRE' }).length, 2);
  assert.equal(K.filtrar(base.itens, { placa: 'BBB-2222' }).length, 1);
});

test('resumo: ticket, custo por veículo, peças × mão de obra', () => {
  const r = K.resumo(K.filtrar(base.itens, { filial: 'MATRIZ' }));
  assert.equal(r.notas, 2);
  assert.equal(Math.round(r.ticket * 100) / 100, Math.round((6265.44 / 2) * 100) / 100);
  assert.equal(Math.round(r.porVeiculo * 100) / 100, Math.round((6265.44 / 2) * 100) / 100);
  assert.ok(Math.abs(r.pctPecas + r.pctMo - 1) < 1e-9);
  assert.equal(K.resumo([]).ticket, null, 'sem notas não divide por zero');
});

test('agrupar ordena do maior para o menor e soma 100%', () => {
  const g = K.agrupar(base.itens, (i) => i.grupo);
  assert.deepEqual(g.map((x) => x.chave), ['HID', 'PNE', 'FRE']);
  assert.ok(Math.abs(g.reduce((s, x) => s + x.pct, 0) - 1) < 1e-9);
  assert.equal(g.find((x) => x.chave === 'FRE').notas, 2);
});

test('meses, período anterior e variação', () => {
  assert.deepEqual(K.listaMeses('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(K.periodoAnterior('2026-01', '2026-06'), { de: '2025-07', ate: '2025-12' });
  assert.equal(K.somarMeses('2026-01', -1), '2025-12');
  assert.equal(K.variacao(150, 100), 0.5);
  assert.equal(K.variacao(10, 0), null);
});

test('série mensal: top N + Outros, ordem fixa', () => {
  const s = K.serieMensal(base.itens, ['2026-09', '2026-10'], (i) => i.grupo, 2);
  assert.deepEqual(s.series.map((x) => x.chave), ['HID', 'PNE', 'Outros']);
  assert.deepEqual(s.series[0].valores, [0, 3500]);
  assert.deepEqual(s.series[2].valores, [1000, 500]);
});

test('frota no filtro ignora baixados', () => {
  assert.equal(K.frotaNoFiltro(base.veiculos, {}).length, 2);
  assert.equal(K.frotaNoFiltro(base.veiculos, { tipo: 'PIPA' }).length, 1);
});

test('pneus e notas do filtro', () => {
  const p = K.pneus(base.itens);
  assert.equal(p.resumo.itens, 1);
  const n = K.notasDoFiltro(base.itens);
  assert.equal(n.length, 3);
  assert.equal(n[0].emissao, '2026-10-10');
  assert.equal(n.find((x) => x.chave === 'MATRIZ|N1').itens.length, 2);
});

test('reincidências: mesmo veículo + subgrupo dentro da janela', () => {
  const base2 = K.prepararBase({
    filiais: [{ filial: 'MATRIZ' }],
    veiculos: [{ filial: 'MATRIZ', placa: 'AAA-1111', tipo_implemento: 'PIPA', marca_modelo: 'VW', situacao: 'ATIVO' }],
    notas: [
      { filial: 'MATRIZ', id_nota: 'N1', nf: '1', emissao: '2026-01-01', placa: 'AAA-1111' },
      { filial: 'MATRIZ', id_nota: 'N2', nf: '2', emissao: '2026-01-20', placa: 'AAA-1111' },   // 19 dias depois: reincide em 30
      { filial: 'MATRIZ', id_nota: 'N3', nf: '3', emissao: '2026-03-15', placa: 'AAA-1111' },   // 54 dias depois de N2: não em 30, sim em 60
      { filial: 'MATRIZ', id_nota: 'N4', nf: '4', emissao: '2026-01-05', placa: 'AAA-1111' }    // subgrupo diferente: não conta
    ],
    itens: [
      { filial: 'MATRIZ', id_nota: 'N1', placa: 'AAA-1111', cod_grupo: 'FRE', cod_subgrupo: 'FRE-LON', custo_pecas: 100, custo_mao_de_obra: 0 },
      { filial: 'MATRIZ', id_nota: 'N2', placa: 'AAA-1111', cod_grupo: 'FRE', cod_subgrupo: 'FRE-LON', custo_pecas: 100, custo_mao_de_obra: 0 },
      { filial: 'MATRIZ', id_nota: 'N3', placa: 'AAA-1111', cod_grupo: 'FRE', cod_subgrupo: 'FRE-LON', custo_pecas: 100, custo_mao_de_obra: 0 },
      { filial: 'MATRIZ', id_nota: 'N4', placa: 'AAA-1111', cod_grupo: 'HID', cod_subgrupo: 'HID-BOM', custo_pecas: 100, custo_mao_de_obra: 0 }
    ]
  });
  const r30 = K.reincidencias(base2.itens, 30);
  assert.equal(r30.total, 1, 'só N1->N2 (19 dias) entra em 30 dias');
  assert.equal(r30.veiculos, 1);
  assert.equal(r30.detalhes[0].emissao, '2026-01-20');

  const r60 = K.reincidencias(base2.itens, 60);
  assert.equal(r60.total, 2, 'N1->N2 e N2->N3 (54 dias) entram em 60 dias');

  assert.equal(K.reincidencias([], 30).total, 0, 'lista vazia não quebra');
  const semData = K.reincidencias([{ ...base2.itens[0], emissao: '' }, { ...base2.itens[1], emissao: '' }], 30);
  assert.equal(semData.total, 0, 'item sem data de emissão fica de fora');
});

test('CSV com ; e vírgula decimal, aspas quando precisa', () => {
  const csv = K.csvItens([{ ...base.itens[0], descricao: 'troca; urgente' }], { FRE: 'Freios' });
  const linhas = csv.replace('﻿', '').split('\r\n');
  assert.equal(linhas[0].split(';')[0], 'filial');
  assert.ok(linhas[1].includes('"troca; urgente"'));
  assert.ok(linhas[1].endsWith(';800;200;1000'));
  assert.ok(linhas[1].includes(';Freios;'));
});
