// Todos os cálculos da dashboard. Funções puras (sem tela), testadas em tests/kpis.test.js.
// Fonte: o sistema de OS (Supabase) — cada OS é um serviço, com valores opcionais (sem itemização por nota).
// Só a OS com status FEITA entra nos números de peças/valores (solicitada/cancelada ficam de fora).

const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export const mesDe = (data) => String(data || '').slice(0, 7);

function feitas(osList) {
  return osList.filter((o) => o.status === 'FEITA');
}

/** Filtros: { de: 'aaaa-mm', ate: 'aaaa-mm', filial, tipo, grupo, placa }. Campo vazio = todos. */
export function filtrar(osList, veiculos, f = {}) {
  const tipoPorChassi = new Map(veiculos.map((v) => [v.chassi, v.tipo]));
  return osList.filter((o) =>
    (!f.de || mesDe(o.data_servico) >= f.de) &&
    (!f.ate || mesDe(o.data_servico) <= f.ate) &&
    (!f.filial || o.filial === f.filial) &&
    (!f.tipo || tipoPorChassi.get(o.chassi) === f.tipo) &&
    (!f.grupo || o.grupo === f.grupo) &&
    (!f.placa || o.placa === f.placa));
}

/** Frota no filtro (para custo médio por veículo da frota). O cadastro já só traz veículos ativos. */
export function frotaNoFiltro(veiculos, f = {}) {
  return veiculos.filter((v) => (!f.filial || v.filial === f.filial) && (!f.tipo || v.tipo === f.tipo) && (!f.placa || v.placa === f.placa));
}

/**
 * Resumo do período. `comValor` conta quantas OS já têm valor lançado (opcional no sistema de OS) — "ticket" e
 * "porVeiculo" dividem só pelo que tem valor (OS ou veículo), pra não diluir a média com OS ainda sem valor.
 */
export function resumo(osList) {
  const os = feitas(osList);
  let total = 0, pecas = 0, mo = 0, comValor = 0;
  const veic = new Set(), veicComValor = new Set();
  os.forEach((o) => {
    if (o.valor_total) { total += n(o.valor_total); pecas += n(o.valor_pecas); mo += n(o.valor_mao_obra); comValor++; if (o.chassi) veicComValor.add(o.chassi); }
    if (o.chassi) veic.add(o.chassi);
  });
  return {
    total, pecas, mo, os: os.length, comValor, veiculos: veic.size, veiculosComValor: veicComValor.size,
    ticket: comValor ? total / comValor : null,
    porVeiculo: veicComValor.size ? total / veicComValor.size : null,
    pctPecas: pecas + mo ? pecas / (pecas + mo) : null,
    pctMo: pecas + mo ? mo / (pecas + mo) : null
  };
}

/**
 * Agrupa as OS feitas por uma chave. `os` (contagem) é a métrica principal — sempre presente; `total` (gasto)
 * só soma quem já tem valor lançado, então pode ficar bem menor que a realidade enquanto o lançamento de
 * valores não for hábito. Ordena por contagem, depois gasto, do maior para o menor.
 */
export function agrupar(osList, chaveFn) {
  const os = feitas(osList);
  const m = new Map();
  let geral = 0;
  os.forEach((o) => {
    const k = chaveFn(o);
    if (k === null || k === undefined || k === '') return;
    let g = m.get(k);
    if (!g) { g = { chave: k, total: 0, os: 0, comValor: 0, _v: new Set() }; m.set(k, g); }
    if (o.valor_total) { g.total += n(o.valor_total); g.comValor++; geral += n(o.valor_total); }
    g.os++;
    if (o.chassi) g._v.add(o.chassi);
  });
  return [...m.values()].map((g) => ({ chave: g.chave, total: g.total, os: g.os, comValor: g.comValor, veiculos: g._v.size, pct: geral ? g.total / geral : 0 }))
    .sort((a, b) => b.os - a.os || b.total - a.total || String(a.chave).localeCompare(String(b.chave)));
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
 * Série mensal empilhada pelos `topo` grupos de maior GASTO no período (não contagem de OS — é um gráfico de
 * gasto); o resto vira "Outros". Só soma OS com valor lançado. Volta { meses, series: [{ chave, valores[] }] },
 * maior gasto primeiro, Outros por último.
 */
export function serieMensal(osList, meses, chaveFn, topo = 5) {
  const os = feitas(osList).filter((o) => o.valor_total);
  const porChave = new Map();
  os.forEach((o) => {
    const k = chaveFn(o);
    if (k === null || k === undefined || k === '') return;
    porChave.set(k, (porChave.get(k) || 0) + n(o.valor_total));
  });
  const ranking = [...porChave.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const principais = ranking.slice(0, topo);
  const temOutros = ranking.length > topo;
  const idx = new Map(meses.map((m, i) => [m, i]));
  const series = principais.map((c) => ({ chave: c, valores: meses.map(() => 0) }));
  const outros = { chave: 'Outros', valores: meses.map(() => 0) };
  os.forEach((o) => {
    const p = idx.get(mesDe(o.data_servico));
    if (p === undefined) return;
    const s = series.find((x) => x.chave === chaveFn(o));
    (s || outros).valores[p] += n(o.valor_total);
  });
  if (temOutros) series.push(outros);
  return { meses, series };
}

/** Matriz tipo de veículo × grupo: % das OS de cada tipo em cada grupo (contagem, não gasto — sempre disponível). */
export function matrizTipoGrupo(osList, veiculos, grupos) {
  const os = feitas(osList);
  const tipoPorChassi = new Map(veiculos.map((v) => [v.chassi, v.tipo]));
  const comTipo = os.map((o) => ({ ...o, tipo: tipoPorChassi.get(o.chassi) || '(sem cadastro)' }));
  const porTipo = agrupar(comTipo, (o) => o.tipo);
  return porTipo.map((t) => {
    const doTipo = comTipo.filter((o) => o.tipo === t.chave);
    const g = new Map(agrupar(doTipo, (o) => o.grupo).map((x) => [x.chave, x]));
    return {
      tipo: t.chave, os: t.os, veiculos: t.veiculos,
      celulas: grupos.map((c) => ({ grupo: c, pct: t.os ? (g.get(c)?.os || 0) / t.os : 0, os: g.get(c)?.os || 0 }))
    };
  });
}

/** Oficinas externas que mais fizeram serviço (execução EXTERNA). */
export function porOficinaExterna(osList) {
  const os = feitas(osList).filter((o) => o.execucao === 'EXTERNA' && o.oficina_externa);
  const m = new Map();
  os.forEach((o) => {
    let g = m.get(o.oficina_externa);
    if (!g) { g = { chave: o.oficina_externa, os: 0, total: 0 }; m.set(o.oficina_externa, g); }
    g.os++; if (o.valor_total) g.total += n(o.valor_total);
  });
  return [...m.values()].sort((a, b) => b.os - a.os || b.total - a.total);
}

/** Fornecedores que mais aparecem nas notas fiscais lançadas nas OS. */
export function porFornecedorNota(osList) {
  const m = new Map();
  feitas(osList).forEach((o) => (o.notas || []).forEach((nt) => {
    const chave = (nt.fornecedor || '').trim() || '(sem fornecedor)';
    let g = m.get(chave);
    if (!g) { g = { chave, notas: 0, total: 0 }; m.set(chave, g); }
    g.notas++; if (nt.valor) g.total += n(nt.valor);
  }));
  return [...m.values()].sort((a, b) => b.notas - a.notas || b.total - a.total);
}

/** Notas fiscais lançadas nas OS, da mais recente para a mais antiga (uma linha por nota, sem itens). */
export function listaNotas(osList) {
  const linhas = [];
  feitas(osList).forEach((o) => (o.notas || []).forEach((nt) => {
    linhas.push({ osId: o.id, placa: o.placa, veiculo: o.veiculo, filial: o.filial, data_servico: o.data_servico,
      numero: nt.numero || '', fornecedor: nt.fornecedor || '', valor: nt.valor, arquivo: nt.arquivo || null });
  }));
  return linhas.sort((a, b) => (b.data_servico || '').localeCompare(a.data_servico || ''));
}

/** CSV com ; e vírgula decimal (abre direto no Excel em português). */
export function csvNotas(notas) {
  const cab = ['placa', 'veiculo', 'filial', 'data_servico', 'numero_nota', 'fornecedor', 'valor'];
  const esc = (v) => {
    const s = typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v ?? '');
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const linhas = notas.map((nt) => [nt.placa, nt.veiculo, nt.filial, nt.data_servico, nt.numero, nt.fornecedor, nt.valor].map(esc).join(';'));
  return '﻿' + [cab.join(';')].concat(linhas).join('\r\n');
}
