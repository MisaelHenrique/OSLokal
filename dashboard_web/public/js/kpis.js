// Todos os cálculos da dashboard. Funções puras (sem tela), testadas em tests/kpis.test.js.
// Gasto = soma de custo_total dos ITENS (peças + mão de obra). Fase 1: sem km, horímetro nem datas de parada.

const n = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').trim();
  if (!s) return 0;
  // aceita 1765.44 e 1.765,44
  const x = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(x) ? x : 0;
};

export const mesDe = (data) => String(data || '').slice(0, 7);

/** Junta nota e veículo em cada item, para filtrar e agrupar sem procurar de novo. */
export function prepararBase(dados) {
  const veic = new Map();
  (dados.veiculos || []).forEach((v) => veic.set(v.filial + '|' + v.placa, v));
  const notas = new Map();
  (dados.notas || []).forEach((nt) => notas.set(nt.filial + '|' + nt.id_nota, nt));
  const itens = (dados.itens || []).map((it) => {
    const nt = notas.get(it.filial + '|' + it.id_nota) || {};
    const placa = it.placa || nt.placa || '';
    const v = veic.get(it.filial + '|' + placa) || {};
    const pecas = n(it.custo_pecas), mo = n(it.custo_mao_de_obra);
    const total = it.custo_total === '' || it.custo_total == null ? pecas + mo : n(it.custo_total);
    return {
      filial: it.filial, id_nota: it.id_nota, chave_nota: it.filial + '|' + it.id_nota, placa,
      grupo: String(it.cod_grupo || '').toUpperCase() || 'SEM', subgrupo: it.cod_subgrupo || '', peca: it.peca || '',
      descricao: it.descricao_servico || '', qtd: n(it.qtd), pecas, mo, total,
      emissao: String(nt.emissao || '').slice(0, 10), mes: mesDe(nt.emissao), nf: nt.nf || '',
      fornecedor: String(nt.fornecedor || '').trim() || '(sem fornecedor)', interna: nt.interna_ou_terceiro || '',
      tipo: v.tipo_implemento || '(sem cadastro)', modelo: v.marca_modelo || '(sem cadastro)',
      evento_pneu: it.evento_pneu || '', posicao_pneu: it.posicao_pneu || '', num_fogo: it.num_fogo || '',
      marca_pneu: it.marca_pneu || '', medida_pneu: it.medida_pneu || '', motivo_retirada: it.motivo_retirada || ''
    };
  });
  const meses = [...new Set(itens.map((i) => i.mes).filter(Boolean))].sort();
  return {
    itens,
    notas: dados.notas || [],
    veiculos: dados.veiculos || [],
    filiais: (dados.filiais || []).map((f) => f.filial),
    erros: dados.erros || [],
    meses,
    origem: dados.origem || '',
    ultima_juncao: dados.ultima_juncao || '',
    buscado_em: dados.buscado_em || ''
  };
}

/** Filtros: { de: 'aaaa-mm', ate: 'aaaa-mm', filial, tipo, grupo, placa }. Campo vazio = todos. */
export function filtrar(itens, f = {}) {
  return itens.filter((i) =>
    (!f.de || i.mes >= f.de) &&
    (!f.ate || i.mes <= f.ate) &&
    (!f.filial || i.filial === f.filial) &&
    (!f.tipo || i.tipo === f.tipo) &&
    (!f.grupo || i.grupo === f.grupo) &&
    (!f.placa || i.placa === f.placa));
}

/** Frota no filtro (para custo médio por veículo da frota). Ignora situação BAIXADO. */
export function frotaNoFiltro(veiculos, f = {}) {
  return veiculos.filter((v) => v.situacao !== 'BAIXADO' &&
    (!f.filial || v.filial === f.filial) && (!f.tipo || v.tipo_implemento === f.tipo) && (!f.placa || v.placa === f.placa));
}

export function resumo(itens) {
  let total = 0, pecas = 0, mo = 0;
  const notas = new Set(), veic = new Set();
  itens.forEach((i) => {
    total += i.total; pecas += i.pecas; mo += i.mo;
    notas.add(i.chave_nota);
    if (i.placa) veic.add(i.filial + '|' + i.placa);
  });
  return {
    total, pecas, mo,
    notas: notas.size,
    itens: itens.length,
    veiculos: veic.size,
    ticket: notas.size ? total / notas.size : null,
    porVeiculo: veic.size ? total / veic.size : null,
    pctPecas: pecas + mo ? pecas / (pecas + mo) : null,
    pctMo: pecas + mo ? mo / (pecas + mo) : null
  };
}

/** Agrupa por uma chave e devolve [{ chave, total, pecas, mo, itens, qtd, notas, veiculos, pct }] do maior para o menor. */
export function agrupar(itens, chaveFn) {
  const m = new Map();
  let geral = 0;
  itens.forEach((i) => {
    const k = chaveFn(i);
    if (k === null || k === undefined || k === '') return;
    let g = m.get(k);
    if (!g) { g = { chave: k, total: 0, pecas: 0, mo: 0, itens: 0, qtd: 0, _n: new Set(), _v: new Set() }; m.set(k, g); }
    g.total += i.total; g.pecas += i.pecas; g.mo += i.mo; g.itens++; g.qtd += i.qtd;
    g._n.add(i.chave_nota); if (i.placa) g._v.add(i.filial + '|' + i.placa);
    geral += i.total;
  });
  return [...m.values()].map((g) => ({
    chave: g.chave, total: g.total, pecas: g.pecas, mo: g.mo, itens: g.itens, qtd: g.qtd,
    notas: g._n.size, veiculos: g._v.size, pct: geral ? g.total / geral : 0
  })).sort((a, b) => b.total - a.total || String(a.chave).localeCompare(String(b.chave)));
}

const diasEntre = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

/**
 * Reincidência: o mesmo veículo recebendo o mesmo subgrupo de peça de novo dentro de `janelaDias` do
 * lançamento anterior (subgrupo, não peça exata — texto livre varia de grafia). Conta ocorrências (um
 * subgrupo que volta 3x em 30 dias cada conta 2), não pares veículo+subgrupo. Itens sem subgrupo ou sem
 * data de emissão ficam de fora; só compara dentro do conjunto de itens recebido (normalmente já filtrado).
 */
export function reincidencias(itens, janelaDias = 30) {
  const porChave = new Map();
  itens.forEach((i) => {
    if (!i.subgrupo || !i.emissao || !i.placa) return;
    const k = i.filial + '|' + i.placa + '|' + i.subgrupo;
    let lista = porChave.get(k);
    if (!lista) { lista = []; porChave.set(k, lista); }
    lista.push(i);
  });
  let total = 0;
  const veiculos = new Set();
  const detalhes = [];
  porChave.forEach((lista) => {
    lista.sort((a, b) => a.emissao.localeCompare(b.emissao));
    for (let i = 1; i < lista.length; i++) {
      const dias = diasEntre(lista[i - 1].emissao, lista[i].emissao);
      if (dias >= 0 && dias <= janelaDias) {
        total++;
        veiculos.add(lista[i].filial + '|' + lista[i].placa);
        detalhes.push({ filial: lista[i].filial, placa: lista[i].placa, subgrupo: lista[i].subgrupo, dias,
          emissaoAnterior: lista[i - 1].emissao, emissao: lista[i].emissao });
      }
    }
  });
  detalhes.sort((a, b) => b.emissao.localeCompare(a.emissao));
  return { total, veiculos: veiculos.size, janelaDias, detalhes };
}

/** Meses de 'de' até 'ate', inclusive (aaaa-mm). */
export function listaMeses(de, ate) {
  if (!de || !ate || de > ate) return [];
  const out = [];
  let [a, m] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  while (a < a2 || (a === a2 && m <= m2)) {
    out.push(a + '-' + String(m).padStart(2, '0'));
    m++; if (m > 12) { m = 1; a++; }
  }
  return out;
}

export function somarMeses(mes, k) {
  let [a, m] = mes.split('-').map(Number);
  m += k;
  while (m > 12) { m -= 12; a++; }
  while (m < 1) { m += 12; a--; }
  return a + '-' + String(m).padStart(2, '0');
}

/** Período anterior de mesmo tamanho (ex.: jan–jun → jul–dez do ano anterior). null sem período fechado. */
export function periodoAnterior(de, ate) {
  if (!de || !ate) return null;
  const tam = listaMeses(de, ate).length;
  return { de: somarMeses(de, -tam), ate: somarMeses(de, -1) };
}

/** Variação relativa; null quando não há base de comparação. */
export const variacao = (atual, antes) => (antes ? (atual - antes) / antes : null);

/**
 * Série mensal empilhada pelos `topo` grupos de maior gasto no período; o resto vira "Outros".
 * Volta { meses, series: [{ chave, valores[] }] } com séries em ordem fixa (maior gasto primeiro, Outros por último).
 */
export function serieMensal(itens, meses, chaveFn, topo = 5) {
  const ranking = agrupar(itens, chaveFn).map((g) => g.chave);
  const principais = ranking.slice(0, topo);
  const temOutros = ranking.length > topo;
  const idx = new Map(meses.map((m, i) => [m, i]));
  const series = principais.map((c) => ({ chave: c, valores: meses.map(() => 0) }));
  const outros = { chave: 'Outros', valores: meses.map(() => 0) };
  itens.forEach((i) => {
    const p = idx.get(i.mes);
    if (p === undefined) return;
    const s = series.find((x) => x.chave === chaveFn(i));
    (s || outros).valores[p] += i.total;
  });
  if (temOutros) series.push(outros);
  return { meses, series };
}

/** Matriz tipo de veículo × grupo: % do gasto de cada tipo em cada grupo. */
export function matrizTipoGrupo(itens, grupos) {
  const porTipo = agrupar(itens, (i) => i.tipo);
  return porTipo.map((t) => {
    const doTipo = itens.filter((i) => i.tipo === t.chave);
    const g = new Map(agrupar(doTipo, (i) => i.grupo).map((x) => [x.chave, x]));
    return { tipo: t.chave, total: t.total, veiculos: t.veiculos, celulas: grupos.map((c) => ({ grupo: c, pct: g.get(c)?.pct || 0, total: g.get(c)?.total || 0 })) };
  });
}

/** Indicadores de pneus (grupo PNE): por evento, marca, medida e motivo de retirada. */
export function pneus(itens) {
  const p = itens.filter((i) => i.grupo === 'PNE');
  return {
    resumo: resumo(p),
    porSubgrupo: agrupar(p, (i) => i.subgrupo),
    porMarca: agrupar(p, (i) => i.marca_pneu || null),
    porMedida: agrupar(p, (i) => i.medida_pneu || null),
    porMotivo: agrupar(p, (i) => i.motivo_retirada || null),
    porVeiculo: agrupar(p, (i) => i.placa || null),
    fogos: new Set(p.map((i) => i.num_fogo).filter(Boolean)).size
  };
}

/** Notas do filtro com os itens dentro, da mais recente para a mais antiga. */
export function notasDoFiltro(itens) {
  const m = new Map();
  itens.forEach((i) => {
    let nt = m.get(i.chave_nota);
    if (!nt) {
      nt = { chave: i.chave_nota, filial: i.filial, id_nota: i.id_nota, nf: i.nf, emissao: i.emissao, fornecedor: i.fornecedor,
        placa: i.placa, tipo: i.tipo, modelo: i.modelo, total: 0, itens: [] };
      m.set(i.chave_nota, nt);
    }
    nt.total += i.total;
    nt.itens.push(i);
  });
  return [...m.values()].sort((a, b) => (b.emissao || '').localeCompare(a.emissao || '') || String(b.nf).localeCompare(String(a.nf)));
}

/** CSV com ; e vírgula decimal (abre direto no Excel em português). */
export function csvItens(itens, nomesGrupo = {}) {
  const cab = ['filial', 'nf', 'emissao', 'fornecedor', 'placa', 'tipo', 'modelo', 'grupo', 'nome_grupo', 'subgrupo', 'peca',
    'descricao', 'qtd', 'custo_pecas', 'custo_mao_de_obra', 'custo_total'];
  const esc = (v) => {
    const s = typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v ?? '');
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const linhas = itens.map((i) => [i.filial, i.nf, i.emissao, i.fornecedor, i.placa, i.tipo, i.modelo, i.grupo,
    nomesGrupo[i.grupo] || '', i.subgrupo, i.peca, i.descricao, i.qtd, i.pecas, i.mo, i.total].map(esc).join(';'));
  return '﻿' + [cab.join(';')].concat(linhas).join('\r\n');
}
