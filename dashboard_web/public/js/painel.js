// Tela principal: filtros, abas e desenho de cada aba. Os números vêm de kpis.js; os gráficos, de graficos.js.
import { api } from './api.js';
import { el, fmt, botaoTema, baixar, guardar, lembrar } from './ui.js';
import * as K from './kpis.js';
import * as G from './graficos.js';
import { GRUPOS, ORDEM_GRUPOS, SUBGRUPOS } from './sistema.js';

const ABAS = [
  ['geral', 'Visão geral'], ['grupos', 'Grupos de peças'], ['veiculos', 'Veículos'], ['pneus', 'Pneus'],
  ['fornecedores', 'Fornecedores'], ['notas', 'Notas fiscais']
];
const PRESETS = [['12m', 'Últimos 12 meses'], ['3m', 'Últimos 3 meses'], ['ano', 'Este ano'], ['anoPassado', 'Ano passado'],
  ['tudo', 'Todo o período'], ['custom', 'Escolher meses']];
const POUCAS_NOTAS = 20;
const POR_PAGINA = 50;

const E = {
  usuario: null, base: null, exemplo: false, aba: 'geral', preset: '12m',
  f: { de: '', ate: '', filial: '', tipo: '', grupo: '', placa: '' },
  grupoAberto: '', busca: '', pagina: 0, notaAberta: ''
};
const $ = (id) => document.getElementById(id);
const nomeGrupo = (c) => (GRUPOS[c] ? c + ' · ' + GRUPOS[c] : c === 'SEM' ? 'Sem grupo' : c);
// em tela estreita o rótulo longo do grupo é cortado pelo gráfico: fica só o código
const rotuloGrupo = (c) => (window.innerWidth < 640 ? c : nomeGrupo(c));
const nomeSub = (c) => SUBGRUPOS[c] || c || '(sem subgrupo)';
const mesAtual = () => new Date().toISOString().slice(0, 7);
const variasFiliais = () => E.base && E.base.filiais.length > 1;

// ───────────────────────── início ─────────────────────────

iniciar();

async function iniciar() {
  try {
    const s = await api.sessao();
    E.usuario = s.usuario;
    if (s.usuario.trocar_senha) return location.replace('/trocar-senha');
    if (s.usuario.perfil === 'MECANICO') return location.replace('/os/mecanico');
  } catch {
    return;   // api.js já mandou para o login
  }
  lerEndereco();
  E.exemplo = lembrar('lokal_exemplo') === '1';
  montarTopo();
  await carregar();
  window.addEventListener('hashchange', () => { lerEndereco(); montarFiltros(); desenhar(); });
}

async function carregar({ atualizar = false } = {}) {
  $('conteudo').replaceChildren(el('div', { class: 'carregando' }, [el('div', { class: 'giro' }),
    E.exemplo ? 'Carregando os dados de exemplo…' : 'Carregando os dados da CONSOLIDAÇÃO…']));
  try {
    const d = await api.dados({ exemplo: E.exemplo, atualizar });
    E.base = K.prepararBase(d);
  } catch (e) {
    $('conteudo').replaceChildren(el('div', { class: 'aviso vermelho' }, [el('b', { text: 'Não consegui ler os dados. ' }), e.message]));
    return;
  }
  if (E.f.filial && !E.base.filiais.includes(E.f.filial)) E.f.filial = '';
  aplicarPreset(E.preset, false);
  $('faixa-exemplo').hidden = !(E.exemplo || E.base.origem === 'EXEMPLO');
  atualizarEstado();
  montarAbas();
  montarFiltros();
  desenhar();
}

// ───────────────────────── endereço (#aba?filtros) ─────────────────────────

function lerEndereco() {
  const [aba, q] = location.hash.replace(/^#/, '').split('?');
  if (ABAS.some(([k]) => k === aba)) E.aba = aba;
  const p = new URLSearchParams(q || '');
  Object.keys(E.f).forEach((k) => { E.f[k] = p.get(k) || ''; });
  E.preset = p.get('periodo') || (E.f.de || E.f.ate ? 'custom' : '12m');
  E.grupoAberto = p.get('abrir') || '';
}

function gravarEndereco() {
  const p = new URLSearchParams();
  if (E.preset !== '12m') p.set('periodo', E.preset);
  Object.entries(E.f).forEach(([k, v]) => { if (v && (E.preset === 'custom' || (k !== 'de' && k !== 'ate'))) p.set(k, v); });
  if (E.grupoAberto && E.aba === 'grupos') p.set('abrir', E.grupoAberto);
  const novo = '#' + E.aba + (p.toString() ? '?' + p : '');
  if (location.hash !== novo) history.replaceState(null, '', novo);
}

// ───────────────────────── topo ─────────────────────────

function montarTopo() {
  const u = E.usuario;
  const demo = el('button', { class: 'botao', type: 'button', 'aria-pressed': String(E.exemplo),
    title: 'Mostra dados de exemplo para apresentar. Não mistura com os reais.' }, ['Demonstração']);
  demo.addEventListener('click', () => {
    E.exemplo = !E.exemplo;
    demo.setAttribute('aria-pressed', String(E.exemplo));
    guardar('lokal_exemplo', E.exemplo ? '1' : '0');
    carregar();
  });
  const atualizar = el('button', { class: 'botao fantasma', type: 'button', title: 'Buscar de novo na CONSOLIDAÇÃO', 'aria-label': 'Atualizar dados' }, ['⟳']);
  atualizar.addEventListener('click', () => carregar({ atualizar: true }));

  const menu = el('div', { class: 'usuario-menu', hidden: true, role: 'menu' }, [
    el('div', { class: 'quem' }, [el('b', { text: u.nome || u.login }), el('small', { text: u.login }),
      el('small', { text: u.perfil === 'FILIAL' ? 'Filial: ' + u.filiais.join(', ') : u.perfil === 'ADMIN' ? 'Administrador' : 'Diretoria' })]),
    u.perfil === 'ADMIN' ? el('a', { href: '/usuarios', role: 'menuitem', text: 'Usuários' }) : null,
    el('a', { href: '/trocar-senha', role: 'menuitem', text: 'Trocar minha senha' }),
    el('button', { type: 'button', role: 'menuitem', text: 'Imprimir / salvar PDF', onclick: () => { menu.hidden = true; window.print(); } }),
    el('button', { type: 'button', role: 'menuitem', text: 'Sair', onclick: async () => { await api.sair().catch(() => {}); location.replace('/'); } })
  ]);
  const quem = el('button', { class: 'botao', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false' },
    [el('span', { class: 'texto-longo', text: (u.nome || u.login).split(' ')[0] }), ' ▾']);
  quem.addEventListener('click', (ev) => {
    ev.stopPropagation();
    menu.hidden = !menu.hidden;
    quem.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', (ev) => { if (!menu.contains(ev.target)) { menu.hidden = true; quem.setAttribute('aria-expanded', 'false'); } });
  const sistemaOS = el('a', { class: 'botao', href: '/os', title: 'Abrir o sistema de lançamento e gestão de OS' }, [el('span', { text: '🛠' }),
    el('span', { class: 'texto-longo', text: 'Sistema de OS' })]);
  $('acoes').replaceChildren(sistemaOS, demo, atualizar, botaoTema(() => desenhar()), el('div', { class: 'usuario' }, [quem, menu]));
}

function atualizarEstado() {
  const b = E.base;
  const txt = [];
  if (E.exemplo || b.origem === 'EXEMPLO') txt.push('Dados de exemplo');
  else {
    txt.push('Junção: ' + (b.ultima_juncao ? fmt.dataHora(b.ultima_juncao) : '—'));
    if (b.buscado_em) txt.push('lido às ' + new Date(b.buscado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  }
  $('estado').textContent = txt.join(' · ');
}

// ───────────────────────── abas e filtros ─────────────────────────

function montarAbas() {
  const nav = $('abas');
  nav.hidden = false;
  nav.replaceChildren(...ABAS.map(([k, t]) => {
    const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(E.aba === k), text: t });
    b.addEventListener('click', () => { E.aba = k; E.pagina = 0; montarAbas(); desenhar(); });
    return b;
  }));
}

function aplicarPreset(p, redesenhar = true) {
  E.preset = p;
  const ref = mesAtual();
  const ano = ref.slice(0, 4);
  const meses = E.base ? E.base.meses : [];
  if (p === '12m') { E.f.de = K.somarMeses(ref, -11); E.f.ate = ref; }
  else if (p === '3m') { E.f.de = K.somarMeses(ref, -2); E.f.ate = ref; }
  else if (p === 'ano') { E.f.de = ano + '-01'; E.f.ate = ref; }
  else if (p === 'anoPassado') { E.f.de = (ano - 1) + '-01'; E.f.ate = (ano - 1) + '-12'; }
  else if (p === 'tudo') { E.f.de = meses[0] || ref; E.f.ate = meses[meses.length - 1] > ref ? meses[meses.length - 1] : ref; }
  else if (!E.f.de || !E.f.ate) { E.f.de = K.somarMeses(ref, -11); E.f.ate = ref; }
  if (redesenhar) { montarFiltros(); desenhar(); }
}

function montarFiltros() {
  const b = E.base;
  const sec = $('filtros');
  sec.hidden = false;
  const opcoes = (lista, atual, todos) => [el('option', { value: '', text: todos })]
    .concat(lista.map(([v, t]) => el('option', { value: v, text: t, selected: v === atual })));

  const preset = el('select', { 'aria-label': 'Período' }, PRESETS.map(([v, t]) => el('option', { value: v, text: t, selected: v === E.preset })));
  preset.addEventListener('change', () => aplicarPreset(preset.value));
  const de = el('input', { type: 'month', value: E.f.de, 'aria-label': 'De' });
  const ate = el('input', { type: 'month', value: E.f.ate, 'aria-label': 'Até' });
  [de, ate].forEach((i) => i.addEventListener('change', () => {
    E.preset = 'custom'; E.f.de = de.value; E.f.ate = ate.value;
    if (E.f.de && E.f.ate && E.f.de > E.f.ate) [E.f.de, E.f.ate] = [E.f.ate, E.f.de];
    montarFiltros(); desenhar();
  }));

  const sel = (chave, lista, todos) => {
    const s = el('select', { 'aria-label': todos }, opcoes(lista, E.f[chave], todos));
    s.addEventListener('change', () => { E.f[chave] = s.value; if (chave === 'grupo') E.grupoAberto = ''; E.pagina = 0; desenhar(); });
    return s;
  };
  const tipos = [...new Set(b.veiculos.filter((v) => !E.f.filial || v.filial === E.f.filial).map((v) => v.tipo_implemento).filter(Boolean))].sort();
  const placas = [...new Set(b.veiculos.filter((v) => (!E.f.filial || v.filial === E.f.filial) && (!E.f.tipo || v.tipo_implemento === E.f.tipo))
    .map((v) => v.placa).filter(Boolean))].sort();

  const placa = el('input', { type: 'search', list: 'lista-placas', placeholder: 'Todas', value: E.f.placa, 'aria-label': 'Placa', autocomplete: 'off' });
  const listaPlacas = el('datalist', { id: 'lista-placas' }, placas.map((p) => el('option', { value: p })));
  placa.addEventListener('change', () => {
    const v = placa.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]{3})(\w{4})$/, '$1-$2');
    E.f.placa = v; placa.value = v; E.pagina = 0; desenhar();
  });

  const limpar = el('button', { class: 'botao fantasma limpar', type: 'button', text: 'Limpar' });
  limpar.addEventListener('click', () => {
    E.f = { de: '', ate: '', filial: '', tipo: '', grupo: '', placa: '' }; E.grupoAberto = ''; E.pagina = 0;
    aplicarPreset('12m');
  });

  const campo = (rotulo, controle, classe) => el('label', { class: 'campo' + (classe ? ' ' + classe : '') }, [el('span', { text: rotulo }), controle]);
  const filial = variasFiliais()
    ? campo('Filial', sel('filial', b.filiais.map((f) => [f, f]), 'Todas as filiais'))
    : campo('Filial', el('input', { value: b.filiais[0] || '—', readonly: true, 'aria-label': 'Filial' }));
  sec.replaceChildren(
    campo('Período', preset, 'periodo'), campo('De', de), campo('Até', ate), filial,
    campo('Tipo de veículo', sel('tipo', tipos.map((t) => [t, t]), 'Todos os tipos')),
    campo('Grupo', sel('grupo', ORDEM_GRUPOS.map((g) => [g, nomeGrupo(g)]), 'Todos os grupos')),
    campo('Placa', placa), limpar, listaPlacas);
}

// ───────────────────────── peças de tela ─────────────────────────

function cartao({ titulo, sub, classe = 'c6', corpo, acoes }) {
  return el('section', { class: 'cartao ' + classe }, [
    el('div', { class: 'cartao-topo' }, [el('div', {}, [el('h2', { text: titulo }), sub ? el('p', { text: sub }) : null]),
      acoes ? el('div', { class: 'alternar' }, acoes) : null]),
    corpo
  ]);
}

/** Cartão com gráfico e, no botão "Tabela", os mesmos números em tabela. */
function cartaoGrafico({ titulo, sub, classe = 'c6', alto = false, altura, legenda, desenhar: fazer, tabela }) {
  const area = el('div', { class: 'grafico' + (alto ? ' alto' : '') });
  if (altura) area.style.height = altura + 'px';
  const canvas = el('canvas', { role: 'img', 'aria-label': titulo });
  area.appendChild(canvas);
  const caixa = el('div', {}, [legenda || null, area]);
  let vendoTabela = false;
  const bG = el('button', { class: 'botao mini', type: 'button', 'aria-pressed': 'true', text: 'Gráfico' });
  const bT = el('button', { class: 'botao mini', type: 'button', 'aria-pressed': 'false', text: 'Tabela' });
  const trocar = (t) => {
    vendoTabela = t;
    bG.setAttribute('aria-pressed', String(!t)); bT.setAttribute('aria-pressed', String(t));
    caixa.replaceChildren(...(t ? [tabela()] : [legenda || null, area].filter(Boolean)));
  };
  bG.addEventListener('click', () => trocar(false));
  bT.addEventListener('click', () => trocar(true));
  queueMicrotask(() => { if (!vendoTabela) fazer(canvas); });
  return cartao({ titulo, sub, classe, corpo: caixa, acoes: tabela ? [bG, bT] : null });
}

function legendaSeries(series) {
  return el('ul', { class: 'legenda' }, series.map((s, i) => {
    const cor = el('i');
    cor.style.background = s.chave === 'Outros' ? G.corOutros() : G.corSerie(i);
    return el('li', {}, [cor, s.rotulo]);
  }));
}

function tabela(colunas, linhas, { aoClicar, max } = {}) {
  const corpo = el('tbody', {}, (max ? linhas.slice(0, max) : linhas).map((l) => {
    const tr = el('tr', { class: aoClicar ? 'clicavel' : null }, colunas.map((c) => {
      const v = c.valor(l);
      return el('td', { class: c.num ? 'n' : null }, v instanceof Node ? v : [String(v ?? '')]);
    }));
    if (aoClicar) tr.addEventListener('click', () => aoClicar(l));
    return tr;
  }));
  return el('div', { class: 'tabela-rolagem' }, el('table', {}, [
    el('thead', {}, el('tr', {}, colunas.map((c) => el('th', { class: c.num ? 'n' : null, text: c.titulo })))), corpo]));
}

function barrinha(p) {
  const i = el('i');
  i.style.width = Math.max(0, Math.min(100, p * 100)) + '%';
  return el('div', { class: 'barrinha' }, i);
}

function numero(rotulo, valor, extra) {
  return el('div', { class: 'numero' }, [el('div', { class: 'rotulo', text: rotulo }), el('div', { class: 'valor', text: valor }),
    extra ? el('div', { class: 'extra' }, extra) : null]);
}

function textoVariacao(v, base) {
  if (v === null) return base ? ['sem base no período anterior'] : null;
  const seta = v > 0 ? '▲' : v < 0 ? '▼' : '=';
  return [el('span', { class: 'seta', text: seta + ' ' + fmt.pct(Math.abs(v)) }), ' vs período anterior'];
}

function vazio(msg) {
  return el('div', { class: 'cartao c12' }, el('div', { class: 'vazio' }, msg));
}

// ───────────────────────── desenho ─────────────────────────

function itensFiltrados(extra = {}) {
  return K.filtrar(E.base.itens, { ...E.f, ...extra });
}

function desenhar() {
  if (!E.base) return;
  G.destruirTodos();
  gravarEndereco();
  const itens = itensFiltrados();
  const conteudo = [];

  if (!E.base.itens.length) {
    conteudo.push(el('div', { class: 'aviso amarelo' }, [el('b', { text: 'Ainda não há notas lançadas na CONSOLIDAÇÃO. ' }),
      'Os indicadores aparecem assim que as filiais lançarem notas e a junção rodar (a cada 15 min). ',
      'Para apresentar, use o botão Demonstração.']));
  } else if (itens.length && new Set(itens.map((i) => i.chave_nota)).size < POUCAS_NOTAS) {
    conteudo.push(el('div', { class: 'aviso amarelo' }, [el('b', { text: 'Poucos dados: ' }),
      `só ${new Set(itens.map((i) => i.chave_nota)).size} nota(s) neste filtro. Os números ainda não representam a frota.`]));
  }

  const telas = { geral: abaGeral, grupos: abaGrupos, veiculos: abaVeiculos, pneus: abaPneus, fornecedores: abaFornecedores, notas: abaNotas };
  conteudo.push(...telas[E.aba](itens));
  $('conteudo').replaceChildren(...conteudo);
}

// ── Visão geral ──
function abaGeral(itens) {
  const r = K.resumo(itens);
  const ant = K.periodoAnterior(E.f.de, E.f.ate);
  const rAnt = ant ? K.resumo(itensFiltrados(ant)) : null;
  const frota = K.frotaNoFiltro(E.base.veiculos, E.f).length;
  const out = [];

  const erros = E.base.erros.filter((e) => (!E.f.filial || e.filial === E.f.filial));
  if (erros.length && !E.exemplo) {
    out.push(el('div', { class: 'aviso amarelo' }, [el('b', { text: erros.length + ' aviso(s) de qualidade ' }),
      'na última junção (itens a classificar, soma diferente da nota, placa fora do cadastro). Ex.: ' + erros[0].motivo]));
  }

  // Prioridades do cliente (2026-10-23): reincidência de serviço, veículos (total e por filial), custo por
  // veículo. Reorganizado do zero pra não repetir "veículos"/"custo por veículo" em dois cards.
  const reinc30 = K.reincidencias(itens, 30);
  out.push(el('div', { class: 'numeros' }, [
    numero('Gasto no período', fmt.reais(r.total), textoVariacao(rAnt ? K.variacao(r.total, rAnt.total) : null, rAnt)),
    numero('Reincidência de serviço', fmt.int(reinc30.total),
      [reinc30.total ? fmt.int(reinc30.veiculos) + ' veículo(s) em até 30 dias' : 'nenhuma em até 30 dias']),
    numero('Veículos na frota', fmt.int(frota),
      [r.veiculos ? fmt.int(r.veiculos) + ' atendido(s) no período (' + fmt.pct(frota ? r.veiculos / frota : null) + ')' : 'nenhum atendido no período']),
    numero('Custo por veículo', fmt.reais(r.porVeiculo), frota ? ['por veículo da frota: ' + fmt.reais(r.total / frota)] : null),
    numero('Notas fiscais', fmt.int(r.notas), [fmt.int(r.itens) + ' itens']),
    numero('Peças × mão de obra', r.pctPecas === null ? '—' : fmt.pct(r.pctPecas) + ' · ' + fmt.pct(r.pctMo),
      [fmt.reaisCurto(r.pecas) + ' em peças, ' + fmt.reaisCurto(r.mo) + ' em mão de obra'])
  ]));

  if (!itens.length) {
    out.push(vazio('Nenhuma nota no filtro escolhido. Amplie o período ou limpe os filtros.'));
    return out;
  }

  const meses = K.listaMeses(E.f.de, E.f.ate);
  const sm = K.serieMensal(itens, meses, (i) => i.grupo, 5);
  sm.series.forEach((s) => { s.rotulo = s.chave === 'Outros' ? 'Outros grupos' : nomeGrupo(s.chave); });
  const grupos = K.agrupar(itens, (i) => i.grupo);
  const grade = el('div', { class: 'grade' }, [
    cartaoGrafico({
      titulo: 'Gasto por mês', sub: 'Os 5 grupos de maior gasto no período; o restante em "Outros grupos"', classe: 'c8',
      legenda: legendaSeries(sm.series),
      desenhar: (c) => G.empilhadas(c, meses.map(fmt.mes), sm.series),
      tabela: () => tabela([{ titulo: 'Mês', valor: (l) => fmt.mes(l.mes) }, ...sm.series.map((s, k) => ({ titulo: s.rotulo, num: true, valor: (l) => fmt.reais(s.valores[l.k]) })),
        { titulo: 'Total', num: true, valor: (l) => fmt.reais(sm.series.reduce((a, s) => a + s.valores[l.k], 0)) }], meses.map((m, k) => ({ mes: m, k })))
    }),
    cartaoGrafico({
      titulo: 'Peças × mão de obra', sub: 'Divisão do gasto do período', classe: 'c4',
      legenda: legendaSeries([{ chave: 'p', rotulo: 'Peças ' + fmt.pct(r.pctPecas) }, { chave: 'm', rotulo: 'Mão de obra ' + fmt.pct(r.pctMo) }]),
      desenhar: (c) => G.rosca(c, ['Peças', 'Mão de obra'], [r.pecas, r.mo]),
      tabela: () => tabela([{ titulo: 'Parte', valor: (l) => l[0] }, { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l[1]) }, { titulo: '%', num: true, valor: (l) => fmt.pct(l[2]) }],
        [['Peças', r.pecas, r.pctPecas], ['Mão de obra', r.mo, r.pctMo]])
    }),
    cartaoGrafico({
      titulo: 'Gasto por grupo de peças', sub: 'Clique numa barra para abrir subgrupos e peças', classe: 'c6', altura: 40 + grupos.length * 26,
      desenhar: (c) => G.barras(c, grupos.map((g) => rotuloGrupo(g.chave)), grupos.map((g) => g.total),
        { horizontal: true, aoClicar: (k) => { E.aba = 'grupos'; E.grupoAberto = grupos[k].chave; montarAbas(); desenhar(); } }),
      tabela: () => tabelaGrupos(grupos)
    }),
    cartao({
      titulo: 'Reincidência por janela', sub: 'Mesmo veículo e subgrupo de peça voltando a gastar dentro do prazo', classe: 'c4',
      corpo: tabela(
        [{ titulo: 'Janela', valor: (l) => l.rotulo }, { titulo: 'Ocorrências', num: true, valor: (l) => fmt.int(l.total) },
          { titulo: 'Veículos', num: true, valor: (l) => fmt.int(l.veiculos) }],
        [{ rotulo: '30 dias', ...reinc30 }, { rotulo: '60 dias', ...K.reincidencias(itens, 60) }, { rotulo: '90 dias', ...K.reincidencias(itens, 90) }])
    })
  ]);
  if (variasFiliais() && !E.f.filial) {
    const fil = K.agrupar(itens, (i) => i.filial);
    const frotaFil = new Map();
    K.frotaNoFiltro(E.base.veiculos, E.f).forEach((v) => frotaFil.set(v.filial, (frotaFil.get(v.filial) || 0) + 1));
    grade.appendChild(cartaoGrafico({
      titulo: 'Gasto por filial', sub: 'Clique para filtrar a filial', classe: 'c6', altura: 40 + fil.length * 30,
      desenhar: (c) => G.barras(c, fil.map((g) => g.chave), fil.map((g) => g.total),
        { horizontal: true, aoClicar: (k) => { E.f.filial = fil[k].chave; montarFiltros(); desenhar(); } }),
      tabela: () => tabela([{ titulo: 'Filial', valor: (l) => l.chave }, { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) },
        { titulo: '%', num: true, valor: (l) => fmt.pct(l.pct) }, { titulo: 'Notas', num: true, valor: (l) => fmt.int(l.notas) },
        { titulo: 'Veículos na frota', num: true, valor: (l) => fmt.int(frotaFil.get(l.chave) || 0) },
        { titulo: 'Veículos atendidos', num: true, valor: (l) => fmt.int(l.veiculos) },
        { titulo: 'Custo por veículo da frota', num: true, valor: (l) => (frotaFil.get(l.chave) ? fmt.reais(l.total / frotaFil.get(l.chave)) : '—') }], fil)
    }));
  } else {
    const tipos = K.agrupar(itens, (i) => i.tipo);
    grade.appendChild(cartaoGrafico({
      titulo: 'Gasto por tipo de veículo', sub: 'Clique para filtrar o tipo', classe: 'c6', altura: 40 + tipos.length * 28,
      desenhar: (c) => G.barras(c, tipos.map((g) => g.chave), tipos.map((g) => g.total),
        { horizontal: true, aoClicar: (k) => { E.f.tipo = tipos[k].chave; montarFiltros(); desenhar(); } }),
      tabela: () => tabelaTipos(tipos)
    }));
  }
  out.push(grade);
  return out;
}

function tabelaGrupos(grupos, aoClicar) {
  return tabela([
    { titulo: 'Grupo', valor: (l) => nomeGrupo(l.chave) },
    { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) },
    { titulo: '% do gasto', num: true, valor: (l) => el('div', {}, [fmt.pct(l.pct), barrinha(l.pct)]) },
    { titulo: 'Itens', num: true, valor: (l) => fmt.int(l.itens) },
    { titulo: 'Notas', num: true, valor: (l) => fmt.int(l.notas) },
    { titulo: 'Veículos', num: true, valor: (l) => fmt.int(l.veiculos) }
  ], grupos, { aoClicar });
}

function tabelaTipos(tipos) {
  return tabela([{ titulo: 'Tipo', valor: (l) => l.chave }, { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) },
    { titulo: '%', num: true, valor: (l) => fmt.pct(l.pct) }, { titulo: 'Veículos atendidos', num: true, valor: (l) => fmt.int(l.veiculos) },
    { titulo: 'Custo por veículo atendido', num: true, valor: (l) => fmt.reais(l.veiculos ? l.total / l.veiculos : null) }], tipos);
}

// ── Grupos de peças ──
function abaGrupos(itens) {
  if (!itens.length) return [vazio('Nenhum item no filtro escolhido.')];
  const aberto = E.grupoAberto || E.f.grupo;
  const out = [];
  if (aberto) {
    const doGrupo = itens.filter((i) => i.grupo === aberto);
    const subs = K.agrupar(doGrupo, (i) => i.subgrupo);
    const pecas = K.agrupar(doGrupo, (i) => i.peca || i.descricao || '(sem descrição)');
    const meses = K.listaMeses(E.f.de, E.f.ate);
    const porMes = meses.map((m) => doGrupo.filter((i) => i.mes === m).reduce((s, i) => s + i.total, 0));
    const r = K.resumo(doGrupo), rTudo = K.resumo(itens);
    const voltar = el('button', { class: 'botao mini', type: 'button', text: '← Todos os grupos' });
    voltar.addEventListener('click', () => { E.grupoAberto = ''; E.f.grupo = ''; montarFiltros(); desenhar(); });
    out.push(el('div', { class: 'trilha' }, [voltar, el('b', { text: nomeGrupo(aberto) })]));
    out.push(el('div', { class: 'numeros' }, [
      numero('Gasto no grupo', fmt.reais(r.total), [fmt.pct(rTudo.total ? r.total / rTudo.total : null) + ' do gasto do filtro']),
      numero('Notas', fmt.int(r.notas)), numero('Itens', fmt.int(r.itens)), numero('Veículos', fmt.int(r.veiculos)),
      numero('Custo por veículo', fmt.reais(r.porVeiculo)), numero('Peças × mão de obra', r.pctPecas === null ? '—' : fmt.pct(r.pctPecas) + ' · ' + fmt.pct(r.pctMo))
    ]));
    out.push(el('div', { class: 'grade' }, [
      cartaoGrafico({
        titulo: 'Gasto por subgrupo', classe: 'c6', altura: 40 + Math.max(subs.length, 3) * 28,
        desenhar: (c) => G.barras(c, subs.map((s) => nomeSub(s.chave)), subs.map((s) => s.total), { horizontal: true }),
        tabela: () => tabela([{ titulo: 'Subgrupo', valor: (l) => nomeSub(l.chave) }, { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) },
          { titulo: '%', num: true, valor: (l) => fmt.pct(l.pct) }, { titulo: 'Itens', num: true, valor: (l) => fmt.int(l.itens) }], subs)
      }),
      cartao({ titulo: 'Peças', sub: 'Do maior para o menor gasto', classe: 'c6', corpo: tabela([
        { titulo: 'Peça', valor: (l) => l.chave }, { titulo: 'Qtd', num: true, valor: (l) => fmt.dec(l.qtd) },
        { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) }, { titulo: 'Notas', num: true, valor: (l) => fmt.int(l.notas) },
        { titulo: 'Veículos', num: true, valor: (l) => fmt.int(l.veiculos) }], pecas) }),
      cartaoGrafico({
        titulo: 'Gasto do grupo por mês', classe: 'c12',
        desenhar: (c) => G.barras(c, meses.map(fmt.mes), porMes, { rotuloSerie: nomeGrupo(aberto) }),
        tabela: () => tabela([{ titulo: 'Mês', valor: (l) => fmt.mes(l[0]) }, { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l[1]) }], meses.map((m, k) => [m, porMes[k]]))
      })
    ]));
    return out;
  }
  const grupos = K.agrupar(itens, (i) => i.grupo);
  const abrir = (g) => { E.grupoAberto = g.chave; desenhar(); window.scrollTo({ top: 0 }); };
  out.push(el('div', { class: 'grade' }, [
    cartaoGrafico({
      titulo: 'Gasto por grupo', sub: 'Clique numa barra ou linha para abrir', classe: 'c5', altura: 40 + grupos.length * 28,
      desenhar: (c) => G.barras(c, grupos.map((g) => g.chave), grupos.map((g) => g.total), { horizontal: true, aoClicar: (k) => abrir(grupos[k]) })
    }),
    cartao({ titulo: 'Grupos de peças', sub: 'Os 12 grupos da lista + pneus', classe: 'c7', corpo: tabelaGrupos(grupos, abrir) }),
    mapaTipoGrupo(itens)
  ]));
  return out;
}

function mapaTipoGrupo(itens) {
  const grupos = ORDEM_GRUPOS.filter((g) => itens.some((i) => i.grupo === g));
  const linhas = K.matrizTipoGrupo(itens, grupos);
  const max = Math.max(0.0001, ...linhas.flatMap((l) => l.celulas.map((c) => c.pct)));
  const corpo = el('tbody', {}, linhas.map((l) => el('tr', {}, [
    el('td', {}, [el('b', { text: l.tipo }), el('div', { class: 'etiqueta', text: fmt.reaisCurto(l.total) })]),
    ...l.celulas.map((c) => {
      const td = el('td', { class: 'celula', title: `${l.tipo} · ${nomeGrupo(c.grupo)}: ${fmt.reais(c.total)} (${fmt.pct(c.pct)} do gasto do tipo)` }, [c.pct ? fmt.pct(c.pct) : '·']);
      const forca = c.pct / max;
      if (c.pct) td.style.background = `color-mix(in srgb, var(--seq) ${Math.round(8 + forca * 80)}%, var(--cartao))`;
      if (forca > 0.55) td.classList.add('forte');
      return td;
    })
  ])));
  const tab = el('div', { class: 'tabela-rolagem mapa' }, el('table', {}, [
    el('thead', {}, el('tr', {}, [el('th', { text: 'Tipo de veículo' }), ...grupos.map((g) => el('th', { class: 'n', title: GRUPOS[g] || g, text: g }))])), corpo]));
  return cartao({ titulo: 'Onde cada tipo de veículo gasta', sub: '% do gasto de cada tipo em cada grupo. Mais escuro = maior peso. Compare com os grupos críticos da lista (seção 2).', classe: 'c12', corpo: tab });
}

// ── Veículos ──
function abaVeiculos(itens) {
  if (!itens.length) return [vazio('Nenhum item no filtro escolhido.')];
  const tipos = K.agrupar(itens, (i) => i.tipo);
  const modelos = K.agrupar(itens, (i) => i.modelo).slice(0, 12);
  const veic = K.agrupar(itens, (i) => i.filial + '|' + i.placa);
  const infoVeic = new Map(E.base.veiculos.map((v) => [v.filial + '|' + v.placa, v]));
  const maiorGrupo = new Map();
  K.agrupar(itens, (i) => i.filial + '|' + i.placa + '|' + i.grupo).forEach((g) => {
    const k = g.chave.split('|').slice(0, 2).join('|');
    if (!maiorGrupo.has(k)) maiorGrupo.set(k, g.chave.split('|')[2]);
  });
  const custoTipo = tipos.map((t) => ({ ...t, medio: t.veiculos ? t.total / t.veiculos : 0 })).sort((a, b) => b.medio - a.medio);
  return [el('div', { class: 'grade' }, [
    cartaoGrafico({
      titulo: 'Gasto por tipo de veículo', classe: 'c6', altura: 40 + tipos.length * 28,
      desenhar: (c) => G.barras(c, tipos.map((t) => t.chave), tipos.map((t) => t.total), { horizontal: true }),
      tabela: () => tabelaTipos(tipos)
    }),
    cartaoGrafico({
      titulo: 'Custo médio por veículo atendido, por tipo', sub: 'Gasto do tipo ÷ veículos daquele tipo com nota no período', classe: 'c6', altura: 40 + tipos.length * 28,
      desenhar: (c) => G.barras(c, custoTipo.map((t) => t.chave), custoTipo.map((t) => t.medio), { horizontal: true }),
      tabela: () => tabelaTipos(tipos)
    }),
    cartao({
      titulo: 'Veículos que mais gastaram', sub: 'Clique numa linha para filtrar a placa', classe: 'c8',
      corpo: tabela([
        { titulo: 'Placa', valor: (l) => l.chave.split('|')[1] },
        { titulo: 'Modelo', valor: (l) => infoVeic.get(l.chave)?.marca_modelo || '—' },
        { titulo: 'Tipo', valor: (l) => infoVeic.get(l.chave)?.tipo_implemento || '—' },
        variasFiliais() ? { titulo: 'Filial', valor: (l) => l.chave.split('|')[0] } : null,
        { titulo: 'Maior grupo', valor: (l) => maiorGrupo.get(l.chave) || '—' },
        { titulo: 'Notas', num: true, valor: (l) => fmt.int(l.notas) },
        { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) }
      ].filter(Boolean), veic, { max: 100, aoClicar: (l) => { E.f.placa = l.chave.split('|')[1]; montarFiltros(); desenhar(); } })
    }),
    cartaoGrafico({
      titulo: 'Gasto por modelo', sub: 'Os 12 modelos de maior gasto', classe: 'c4', altura: 40 + modelos.length * 28,
      desenhar: (c) => G.barras(c, modelos.map((m) => m.chave), modelos.map((m) => m.total), { horizontal: true }),
      tabela: () => tabela([{ titulo: 'Modelo', valor: (l) => l.chave }, { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) },
        { titulo: 'Veículos', num: true, valor: (l) => fmt.int(l.veiculos) }], modelos)
    })
  ])];
}

// ── Pneus ──
function abaPneus(itensFiltro) {
  // o filtro de grupo não se aplica aqui: a aba é o grupo PNE
  const itens = itensFiltrados({ grupo: '' });
  const p = K.pneus(itens);
  const total = K.resumo(itens).total;
  if (!p.resumo.itens) return [vazio('Nenhum item de pneus (grupo PNE) no filtro escolhido.')];
  const bloco = (titulo, lista, nome = (x) => x) => cartaoGrafico({
    titulo, classe: 'c6', altura: 40 + Math.max(lista.length, 3) * 28,
    desenhar: (c) => G.barras(c, lista.map((l) => nome(l.chave)), lista.map((l) => l.total), { horizontal: true }),
    tabela: () => tabela([{ titulo: titulo.replace('Gasto por ', ''), valor: (l) => nome(l.chave) }, { titulo: 'Qtd', num: true, valor: (l) => fmt.dec(l.qtd) },
      { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) }, { titulo: 'Notas', num: true, valor: (l) => fmt.int(l.notas) }], lista)
  });
  const blocos = [bloco('Gasto por tipo de serviço', p.porSubgrupo, nomeSub)];
  if (p.porMarca.length) blocos.push(bloco('Gasto por marca', p.porMarca.slice(0, 12)));
  if (p.porMedida.length) blocos.push(bloco('Gasto por medida', p.porMedida.slice(0, 12)));
  if (p.porMotivo.length) blocos.push(bloco('Gasto por motivo de retirada', p.porMotivo));
  blocos.push(cartao({ titulo: 'Veículos que mais gastaram com pneus', classe: 'c12', corpo: tabela([
    { titulo: 'Placa', valor: (l) => l.chave }, { titulo: 'Itens', num: true, valor: (l) => fmt.int(l.itens) },
    { titulo: 'Qtd', num: true, valor: (l) => fmt.dec(l.qtd) }, { titulo: 'Notas', num: true, valor: (l) => fmt.int(l.notas) },
    { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) }], p.porVeiculo, { max: 50 }) }));
  return [
    el('div', { class: 'numeros' }, [
      numero('Gasto com pneus', fmt.reais(p.resumo.total), [fmt.pct(total ? p.resumo.total / total : null) + ' do gasto total']),
      numero('Notas com pneus', fmt.int(p.resumo.notas)), numero('Itens', fmt.int(p.resumo.itens)),
      numero('Pneus identificados (nº de fogo)', fmt.int(p.fogos), p.fogos ? null : ['nº de fogo não informado nas notas']),
      numero('Veículos', fmt.int(p.resumo.veiculos)), numero('Custo por veículo', fmt.reais(p.resumo.porVeiculo))
    ]),
    el('div', { class: 'grade' }, blocos)
  ];
}

// ── Fornecedores ──
function abaFornecedores(itens) {
  if (!itens.length) return [vazio('Nenhum item no filtro escolhido.')];
  const forn = K.agrupar(itens, (i) => i.fornecedor);
  const top = forn.slice(0, 10);
  const origem = K.agrupar(itens, (i) => (i.interna === 'INTERNA' ? 'Oficina interna' : i.interna === 'TERCEIRO' ? 'Terceiros' : null));
  const gruposForn = new Map();
  K.agrupar(itens, (i) => i.fornecedor + '|' + i.grupo).forEach((g) => {
    const [f, gr] = g.chave.split('|');
    if (!gruposForn.has(f)) gruposForn.set(f, []);
    if (gruposForn.get(f).length < 3) gruposForn.get(f).push(gr);
  });
  const blocos = [
    cartaoGrafico({
      titulo: 'Fornecedores com maior gasto', sub: 'Os 10 maiores', classe: origem.length ? 'c8' : 'c12', altura: 40 + top.length * 30,
      desenhar: (c) => G.barras(c, top.map((f) => f.chave), top.map((f) => f.total), { horizontal: true })
    })
  ];
  if (origem.length) {
    blocos.push(cartaoGrafico({
      titulo: 'Interna × terceiros', sub: 'Pelo campo "interna ou terceiro" da nota', classe: 'c4',
      legenda: legendaSeries(origem.map((o) => ({ chave: o.chave, rotulo: o.chave + ' ' + fmt.pct(o.pct) }))),
      desenhar: (c) => G.rosca(c, origem.map((o) => o.chave), origem.map((o) => o.total))
    }));
  }
  blocos.push(cartao({ titulo: 'Todos os fornecedores', classe: 'c12', corpo: tabela([
    { titulo: 'Fornecedor', valor: (l) => l.chave }, { titulo: 'Notas', num: true, valor: (l) => fmt.int(l.notas) },
    { titulo: 'Ticket médio', num: true, valor: (l) => fmt.reais(l.notas ? l.total / l.notas : null) },
    { titulo: 'Principais grupos', valor: (l) => (gruposForn.get(l.chave) || []).join(', ') },
    { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) },
    { titulo: '%', num: true, valor: (l) => el('div', {}, [fmt.pct(l.pct), barrinha(l.pct)]) }], forn) }));
  return [el('div', { class: 'grade' }, blocos)];
}

// ── Notas fiscais ──
function abaNotas(itens) {
  const todas = K.notasDoFiltro(itens);
  const busca = E.busca.trim().toLowerCase();
  const notas = busca ? todas.filter((n) => [n.nf, n.placa, n.fornecedor, n.filial, ...n.itens.map((i) => i.peca + ' ' + i.descricao)]
    .join(' ').toLowerCase().includes(busca)) : todas;
  const paginas = Math.max(1, Math.ceil(notas.length / POR_PAGINA));
  E.pagina = Math.min(E.pagina, paginas - 1);
  const pagina = notas.slice(E.pagina * POR_PAGINA, (E.pagina + 1) * POR_PAGINA);

  const campo = el('input', { type: 'search', placeholder: 'Buscar NF, placa, fornecedor, peça…', value: E.busca, 'aria-label': 'Buscar notas' });
  campo.addEventListener('input', () => { E.busca = campo.value; E.pagina = 0; clearTimeout(campo._t); campo._t = setTimeout(() => { desenhar(); const c = document.querySelector('.ferramentas input'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } }, 250); });
  const csv = el('button', { class: 'botao', type: 'button', text: 'Baixar itens (CSV)' });
  csv.addEventListener('click', () => {
    const lista = busca ? notas.flatMap((n) => n.itens) : itens;
    baixar(`lokal_itens_${E.f.de || 'inicio'}_${E.f.ate || 'fim'}${E.exemplo ? '_EXEMPLO' : ''}.csv`, K.csvItens(lista, GRUPOS));
  });

  const multi = variasFiliais();
  const cab = ['Emissão', 'NF', multi ? 'Filial' : null, 'Placa', 'Tipo', 'Fornecedor', 'Itens', 'Valor'].filter(Boolean);
  const corpo = el('tbody');
  pagina.forEach((n) => {
    const aberta = E.notaAberta === n.chave;
    const tr = el('tr', { class: 'clicavel' + (aberta ? ' aberta' : ''), 'aria-expanded': String(aberta) }, [
      el('td', { text: fmt.data(n.emissao) }), el('td', { text: n.nf }), multi ? el('td', { text: n.filial }) : null,
      el('td', { text: n.placa }), el('td', { text: n.tipo }), el('td', { text: n.fornecedor }),
      el('td', { class: 'n', text: fmt.int(n.itens.length) }), el('td', { class: 'n', text: fmt.reais(n.total) })]);
    tr.addEventListener('click', () => { E.notaAberta = aberta ? '' : n.chave; desenhar(); });
    corpo.appendChild(tr);
    if (aberta) {
      corpo.appendChild(el('tr', { class: 'detalhe' }, el('td', { colspan: String(cab.length) }, el('table', {}, [
        el('thead', {}, el('tr', {}, ['Grupo', 'Subgrupo', 'Peça / serviço', 'Qtd', 'Peças', 'Mão de obra', 'Total'].map((t, k) => el('th', { class: k > 2 ? 'n' : null, text: t })))),
        el('tbody', {}, n.itens.map((i) => el('tr', {}, [el('td', { text: nomeGrupo(i.grupo) }), el('td', { text: nomeSub(i.subgrupo) }),
          el('td', { text: [i.peca, i.descricao].filter(Boolean).join(' · ') }), el('td', { class: 'n', text: fmt.dec(i.qtd) }),
          el('td', { class: 'n', text: fmt.reais(i.pecas) }), el('td', { class: 'n', text: fmt.reais(i.mo) }), el('td', { class: 'n', text: fmt.reais(i.total) })])))
      ]))));
    }
  });
  const ant = el('button', { class: 'botao mini', type: 'button', text: '← Anterior', disabled: E.pagina === 0 });
  const prox = el('button', { class: 'botao mini', type: 'button', text: 'Próxima →', disabled: E.pagina >= paginas - 1 });
  ant.addEventListener('click', () => { E.pagina--; desenhar(); });
  prox.addEventListener('click', () => { E.pagina++; desenhar(); });

  return [cartao({
    titulo: 'Notas fiscais', sub: `${fmt.int(notas.length)} nota(s) · ${fmt.reais(notas.reduce((s, n) => s + n.total, 0))}. Clique numa nota para ver os itens.`, classe: 'c12',
    corpo: el('div', {}, [
      el('div', { class: 'ferramentas' }, [campo, csv]),
      notas.length ? el('div', { class: 'tabela-rolagem' }, el('table', {}, [el('thead', {}, el('tr', {}, cab.map((t, k) => el('th', { class: k >= cab.length - 2 ? 'n' : null, text: t })))), corpo]))
        : el('div', { class: 'vazio', text: 'Nenhuma nota encontrada.' }),
      paginas > 1 ? el('div', { class: 'paginacao' }, [ant, `Página ${E.pagina + 1} de ${paginas}`, prox]) : null
    ])
  })];
}
