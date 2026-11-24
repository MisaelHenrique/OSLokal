// Tela principal: filtros, abas e desenho de cada aba. Os números vêm de kpis.js; os gráficos, de graficos.js.
// Fonte: o sistema de OS (Supabase) — api.listaOS()/api.veiculos(). Não há mais planilha nem modo de exemplo à
// parte: o próprio sistema de OS marca `exemplo: true` nas OS de demonstração (mesma faixa usada em /os).
import { api } from './api.js';
import { el, fmt, botaoTema, baixar } from './ui.js';
import * as K from './kpis.js';
import * as G from './graficos.js';
import { GRUPOS, ORDEM_GRUPOS } from './sistema.js';
import { relatorioReincidencias, decodificarPeca } from './os/regras.js';
import { dataLocalISO } from './os/comum.js';

const ABAS = [
  ['geral', 'Visão geral'], ['garantias', 'Reincidências e garantias'], ['grupos', 'Grupos de peças'],
  ['veiculos', 'Veículos'], ['pneus', 'Pneus'], ['fornecedores', 'Fornecedores'], ['notas', 'Notas fiscais']
];
const PRESETS = [['12m', 'Últimos 12 meses'], ['3m', 'Últimos 3 meses'], ['ano', 'Este ano'], ['anoPassado', 'Ano passado'],
  ['tudo', 'Todo o período'], ['custom', 'Escolher meses']];
const POUCAS_OS = 10;
const POR_PAGINA = 50;
const EMOJI_SEMAFORO = { vermelho: '🔴', amarelo: '🟡', verde: '🟢' };
const ORDEM_COR_SEMAFORO = { vermelho: 0, amarelo: 1, verde: 2 };

const E = {
  usuario: null, base: null, aba: 'geral', preset: '12m',
  f: { de: '', ate: '', filial: '', tipo: '', grupo: '', placa: '' },
  grupoAberto: '', busca: '', pagina: 0, notaAberta: '', janelaGarantia: null
};
const $ = (id) => document.getElementById(id);
const nomeGrupo = (c) => (GRUPOS[c] ? c + ' · ' + GRUPOS[c] : c === 'SEM' || !c ? 'Sem grupo' : c);
// em tela estreita o rótulo longo do grupo é cortado pelo gráfico: fica só o código
const rotuloGrupo = (c) => (window.innerWidth < 640 ? c : nomeGrupo(c));
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
    if (s.usuario.perfil === 'DIRETORIA' && !location.hash) E.aba = 'garantias';
  } catch {
    return;   // api.js já mandou para o login
  }
  lerEndereco();
  montarTopo();
  await carregar();
  window.addEventListener('hashchange', () => { lerEndereco(); montarFiltros(); desenhar(); });
}

async function carregar() {
  $('conteudo').replaceChildren(el('div', { class: 'carregando' }, [el('div', { class: 'giro' }), 'Carregando as OS do sistema…']));
  let d, v;
  try {
    [d, v] = await Promise.all([api.listaOS({}), api.veiculos()]);
  } catch (e) {
    $('conteudo').replaceChildren(el('div', { class: 'aviso vermelho' }, [el('b', { text: 'Não consegui ler as OS. ' }), e.message]));
    return;
  }
  const os = d.os || [];
  E.base = {
    os, veiculos: v.veiculos || [], nomes: d.nomes || {},
    filiais: [...new Set(os.map((o) => o.filial).concat((v.veiculos || []).map((x) => x.filial)))].filter(Boolean).sort(),
    meses: [...new Set(os.map((o) => K.mesDe(o.data_servico)).filter(Boolean))].sort(),
    temExemplo: os.some((o) => o.exemplo), carregadoEm: new Date().toISOString()
  };
  if (E.f.filial && !E.base.filiais.includes(E.f.filial)) E.f.filial = '';
  aplicarPreset(E.preset, false);
  $('faixa-exemplo').hidden = !E.base.temExemplo;
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
  const atualizar = el('button', { class: 'botao fantasma', type: 'button', title: 'Buscar de novo no sistema de OS', 'aria-label': 'Atualizar dados' }, ['⟳']);
  atualizar.addEventListener('click', () => carregar());

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
  $('acoes').replaceChildren(sistemaOS, atualizar, botaoTema(() => desenhar()), el('div', { class: 'usuario' }, [quem, menu]));
}

function atualizarEstado() {
  const txt = [];
  if (E.base.temExemplo) txt.push('Inclui OS de exemplo');
  if (E.base.carregadoEm) txt.push('lido às ' + new Date(E.base.carregadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  $('estado').textContent = txt.join(' · ');
}

// ───────────────────────── abas e filtros ─────────────────────────

function montarAbas() {
  const nav = $('abas');
  nav.hidden = false;
  nav.replaceChildren(...ABAS.map(([k, t]) => {
    const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(E.aba === k), text: t });
    b.addEventListener('click', () => { E.aba = k; E.pagina = 0; montarAbas(); montarFiltros(); desenhar(); });
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
  const sec = $('filtros');
  if (E.aba === 'garantias') { sec.hidden = true; return; }
  const b = E.base;
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
  const tipos = [...new Set(b.veiculos.filter((v) => !E.f.filial || v.filial === E.f.filial).map((v) => v.tipo).filter(Boolean))].sort();
  const placas = [...new Set(b.veiculos.filter((v) => (!E.f.filial || v.filial === E.f.filial) && (!E.f.tipo || v.tipo === E.f.tipo))
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

/** Texto "X de Y OS com valor lançado", só quando o gasto é parcial (nem toda OS do filtro tem valor lançado). */
function caveatValor(r) {
  return r.os && r.comValor < r.os ? fmt.int(r.comValor) + ' de ' + fmt.int(r.os) + ' OS com valor lançado' : null;
}

/** Junta a variação de período com a ressalva de valor parcial; null (não []) quando não há nada a mostrar. */
function extraGasto(r, rAnt) {
  const partes = [...(textoVariacao(rAnt ? K.variacao(r.total, rAnt.total) : null, rAnt) || []), caveatValor(r)].filter(Boolean);
  return partes.length ? partes : null;
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

/** Indicador grande e clicável (cartão de número com mais destaque, pra telas tipo "Reincidências e garantias"). */
function indicador({ rotulo, valor, extra, cor, ativo, onClick }) {
  return el('button', { type: 'button', class: 'indicador' + (cor ? ' cor-' + cor : ''), 'aria-pressed': ativo ? 'true' : 'false',
    onclick: onClick }, [
    el('div', { class: 'rotulo', text: rotulo }), el('div', { class: 'valor', text: valor }),
    extra ? el('div', { class: 'extra', text: extra }) : null
  ]);
}

function irPara(id) {
  const alvo = document.getElementById(id);
  if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function textoVariacao(v, base) {
  if (v === null) return base ? ['sem base no período anterior'] : null;
  const seta = v > 0 ? '▲' : v < 0 ? '▼' : '=';
  return [el('span', { class: 'seta', text: seta + ' ' + fmt.pct(Math.abs(v)) }), ' vs período anterior'];
}

function vazio(msg) {
  return el('div', { class: 'cartao c12' }, el('div', { class: 'vazio' }, msg));
}

function quemFez(o, nomes) {
  if (o.execucao === 'EXTERNA') return o.oficina_externa || 'Oficina externa';
  return o.direcionada_para ? (nomes[o.direcionada_para] || o.direcionada_para) : '—';
}

// ───────────────────────── desenho ─────────────────────────

function itensFiltrados(extra = {}) {
  return K.filtrar(E.base.os, E.base.veiculos, { ...E.f, ...extra });
}

function desenhar() {
  if (!E.base) return;
  G.destruirTodos();
  gravarEndereco();
  if (E.aba === 'garantias') { desenharGarantias(); return; }
  const itens = itensFiltrados();
  const conteudo = [];
  const feitasNoFiltro = itens.filter((o) => o.status === 'FEITA');

  if (!E.base.os.length) {
    conteudo.push(el('div', { class: 'aviso amarelo' }, [el('b', { text: 'Ainda não há OS lançadas. ' }),
      'Os indicadores aparecem assim que a matriz, as filiais ou os mecânicos lançarem OS no sistema.']));
  } else if (feitasNoFiltro.length && feitasNoFiltro.length < POUCAS_OS) {
    conteudo.push(el('div', { class: 'aviso amarelo' }, [el('b', { text: 'Poucos dados: ' }),
      `só ${feitasNoFiltro.length} OS neste filtro. Os números ainda não representam a frota.`]));
  }

  const telas = { geral: abaGeral, grupos: abaGrupos, veiculos: abaVeiculos, pneus: abaPneus, fornecedores: abaFornecedores, notas: abaNotas };
  conteudo.push(...telas[E.aba](itens));
  $('conteudo').replaceChildren(...conteudo);
}

function reincidenciasNoFiltro() {
  const { reincidencias } = relatorioReincidencias(E.base.os, dataLocalISO());
  return reincidencias.filter((r) =>
    (!E.f.filial || r.filial === E.f.filial) && (!E.f.grupo || r.grupo === E.f.grupo) && (!E.f.placa || r.placa === E.f.placa) &&
    (!E.f.de || K.mesDe(r.segunda.data_servico) >= E.f.de) && (!E.f.ate || K.mesDe(r.segunda.data_servico) <= E.f.ate));
}

// ── Visão geral ──
function abaGeral(itens) {
  const r = K.resumo(itens);
  const ant = K.periodoAnterior(E.f.de, E.f.ate);
  const rAnt = ant ? K.resumo(itensFiltrados(ant)) : null;
  const frota = K.frotaNoFiltro(E.base.veiculos, E.f).length;
  const out = [];

  const reinc = reincidenciasNoFiltro();
  const janela = (dias) => {
    const sel = reinc.filter((x) => x.dias <= dias);
    return { total: sel.length, veiculos: new Set(sel.map((x) => x.chassi)).size };
  };
  const r30 = janela(30);

  out.push(el('div', { class: 'numeros' }, [
    numero('Gasto no período', fmt.reais(r.total), extraGasto(r, rAnt)),
    numero('OS feitas no período', fmt.int(r.os), [fmt.int(r.comValor) + ' com valor lançado']),
    numero('Reincidência de serviço', fmt.int(r30.total),
      [r30.total ? fmt.int(r30.veiculos) + ' veículo(s) em até 30 dias' : 'nenhuma em até 30 dias']),
    numero('Veículos na frota', fmt.int(frota),
      [r.veiculos ? fmt.int(r.veiculos) + ' atendido(s) no período (' + fmt.pct(frota ? r.veiculos / frota : null) + ')' : 'nenhum atendido no período']),
    numero('Custo por veículo', fmt.reais(r.porVeiculo), frota ? ['por veículo da frota: ' + fmt.reais(r.total / frota)] : null),
    numero('Peças × mão de obra', r.pctPecas === null ? '—' : fmt.pct(r.pctPecas) + ' · ' + fmt.pct(r.pctMo),
      [fmt.reaisCurto(r.pecas) + ' em peças, ' + fmt.reaisCurto(r.mo) + ' em mão de obra'])
  ]));

  if (!itens.length) {
    out.push(vazio('Nenhuma OS no filtro escolhido. Amplie o período ou limpe os filtros.'));
    return out;
  }

  const meses = K.listaMeses(E.f.de, E.f.ate);
  const sm = K.serieMensal(itens, meses, (o) => o.grupo, 5);
  sm.series.forEach((s) => { s.rotulo = s.chave === 'Outros' ? 'Outros grupos' : nomeGrupo(s.chave); });
  const grupos = K.agrupar(itens, (o) => o.grupo);
  const grade = el('div', { class: 'grade' }, [
    cartaoGrafico({
      titulo: 'Gasto por mês', sub: 'Os 5 grupos de maior gasto no período; o restante em "Outros grupos"', classe: 'c8',
      legenda: legendaSeries(sm.series),
      desenhar: (c) => G.empilhadas(c, meses.map(fmt.mes), sm.series),
      tabela: () => tabela([{ titulo: 'Mês', valor: (l) => fmt.mes(l.mes) }, ...sm.series.map((s) => ({ titulo: s.rotulo, num: true, valor: (l) => fmt.reais(s.valores[l.k]) })),
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
      titulo: 'OS por grupo de peças', sub: 'Clique numa barra para abrir as peças', classe: 'c6', altura: 40 + grupos.length * 26,
      desenhar: (c) => G.barras(c, grupos.map((g) => rotuloGrupo(g.chave)), grupos.map((g) => g.os),
        { horizontal: true, aoClicar: (k) => { E.aba = 'grupos'; E.grupoAberto = grupos[k].chave; montarAbas(); desenhar(); } }),
      tabela: () => tabelaGrupos(grupos)
    }),
    cartao({
      titulo: 'Reincidência por janela', sub: 'Mesma peça trocada de novo no mesmo veículo, dentro do prazo', classe: 'c4',
      corpo: tabela(
        [{ titulo: 'Janela', valor: (l) => l.rotulo }, { titulo: 'Ocorrências', num: true, valor: (l) => fmt.int(l.total) },
          { titulo: 'Veículos', num: true, valor: (l) => fmt.int(l.veiculos) }],
        [{ rotulo: '30 dias', ...r30 }, { rotulo: '60 dias', ...janela(60) }, { rotulo: '90 dias', ...janela(90) }])
    })
  ]);
  if (variasFiliais() && !E.f.filial) {
    const fil = K.agrupar(itens, (o) => o.filial);
    const frotaFil = new Map();
    K.frotaNoFiltro(E.base.veiculos, E.f).forEach((v) => frotaFil.set(v.filial, (frotaFil.get(v.filial) || 0) + 1));
    grade.appendChild(cartaoGrafico({
      titulo: 'OS por filial', sub: 'Clique para filtrar a filial', classe: 'c6', altura: 40 + fil.length * 30,
      desenhar: (c) => G.barras(c, fil.map((g) => g.chave), fil.map((g) => g.os),
        { horizontal: true, aoClicar: (k) => { E.f.filial = fil[k].chave; montarFiltros(); desenhar(); } }),
      tabela: () => tabela([{ titulo: 'Filial', valor: (l) => l.chave }, { titulo: 'OS', num: true, valor: (l) => fmt.int(l.os) },
        { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) },
        { titulo: 'Veículos na frota', num: true, valor: (l) => fmt.int(frotaFil.get(l.chave) || 0) },
        { titulo: 'Veículos atendidos', num: true, valor: (l) => fmt.int(l.veiculos) },
        { titulo: 'Custo por veículo da frota', num: true, valor: (l) => (frotaFil.get(l.chave) ? fmt.reais(l.total / frotaFil.get(l.chave)) : '—') }], fil)
    }));
  } else {
    const tipoPorChassi = new Map(E.base.veiculos.map((v) => [v.chassi, v.tipo]));
    const comTipo = itens.map((o) => ({ ...o, tipo: tipoPorChassi.get(o.chassi) || '(sem cadastro)' }));
    const tipos = K.agrupar(comTipo, (o) => o.tipo);
    grade.appendChild(cartaoGrafico({
      titulo: 'OS por tipo de veículo', sub: 'Clique para filtrar o tipo', classe: 'c6', altura: 40 + tipos.length * 28,
      desenhar: (c) => G.barras(c, tipos.map((g) => g.chave), tipos.map((g) => g.os),
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
    { titulo: 'OS', num: true, valor: (l) => fmt.int(l.os) },
    { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) },
    { titulo: '% do gasto', num: true, valor: (l) => el('div', {}, [fmt.pct(l.pct), barrinha(l.pct)]) },
    { titulo: 'Veículos', num: true, valor: (l) => fmt.int(l.veiculos) }
  ], grupos, { aoClicar });
}

function tabelaTipos(tipos) {
  return tabela([{ titulo: 'Tipo', valor: (l) => l.chave }, { titulo: 'OS', num: true, valor: (l) => fmt.int(l.os) },
    { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) }, { titulo: 'Veículos atendidos', num: true, valor: (l) => fmt.int(l.veiculos) },
    { titulo: 'Custo por veículo atendido', num: true, valor: (l) => fmt.reais(l.veiculos ? l.total / l.veiculos : null) }], tipos);
}

// ── Grupos de peças ──
function abaGrupos(itens) {
  if (!itens.length) return [vazio('Nenhuma OS no filtro escolhido.')];
  const aberto = E.grupoAberto || E.f.grupo;
  const out = [];
  if (aberto) {
    const doGrupo = itens.filter((o) => o.grupo === aberto && o.status === 'FEITA');
    const porPeca = new Map();
    doGrupo.forEach((o) => {
      const pecasDoGrupo = new Set((o.pecas || []).map(decodificarPeca).filter((p) => p && p.grupo === aberto).map((p) => p.peca));
      pecasDoGrupo.forEach((peca) => {
        let g = porPeca.get(peca);
        if (!g) { g = { chave: peca, os: 0, total: 0, _v: new Set() }; porPeca.set(peca, g); }
        g.os++; if (o.valor_total) g.total += o.valor_total;
        if (o.chassi) g._v.add(o.chassi);
      });
    });
    const pecas = [...porPeca.values()].map((g) => ({ chave: g.chave, os: g.os, total: g.total, veiculos: g._v.size }))
      .sort((a, b) => b.os - a.os || b.total - a.total);
    const meses = K.listaMeses(E.f.de, E.f.ate);
    const porMes = meses.map((m) => doGrupo.filter((o) => K.mesDe(o.data_servico) === m).reduce((s, o) => s + (o.valor_total || 0), 0));
    const r = K.resumo(doGrupo), rTudo = K.resumo(itens);
    const voltar = el('button', { class: 'botao mini', type: 'button', text: '← Todos os grupos' });
    voltar.addEventListener('click', () => { E.grupoAberto = ''; E.f.grupo = ''; montarFiltros(); desenhar(); });
    out.push(el('div', { class: 'trilha' }, [voltar, el('b', { text: nomeGrupo(aberto) })]));
    out.push(el('div', { class: 'numeros' }, [
      numero('Gasto no grupo', fmt.reais(r.total), [fmt.pct(rTudo.total ? r.total / rTudo.total : null) + ' do gasto do filtro', caveatValor(r)].filter(Boolean)),
      numero('OS', fmt.int(r.os)), numero('Veículos', fmt.int(r.veiculos)),
      numero('Custo por veículo', fmt.reais(r.porVeiculo)), numero('Peças × mão de obra', r.pctPecas === null ? '—' : fmt.pct(r.pctPecas) + ' · ' + fmt.pct(r.pctMo))
    ]));
    out.push(el('div', { class: 'grade' }, [
      cartaoGrafico({
        titulo: 'Peças que mais tiveram serviço', classe: 'c6', altura: 40 + Math.max(pecas.length, 3) * 28,
        desenhar: (c) => G.barras(c, pecas.map((p) => p.chave), pecas.map((p) => p.os), { horizontal: true }),
        tabela: () => tabela([{ titulo: 'Peça', valor: (l) => l.chave }, { titulo: 'OS', num: true, valor: (l) => fmt.int(l.os) },
          { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) }, { titulo: 'Veículos', num: true, valor: (l) => fmt.int(l.veiculos) }], pecas)
      }),
      cartaoGrafico({
        titulo: 'Gasto do grupo por mês', classe: 'c6',
        desenhar: (c) => G.barras(c, meses.map(fmt.mes), porMes, { rotuloSerie: nomeGrupo(aberto) }),
        tabela: () => tabela([{ titulo: 'Mês', valor: (l) => fmt.mes(l[0]) }, { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l[1]) }], meses.map((m, k) => [m, porMes[k]]))
      })
    ]));
    return out;
  }
  const grupos = K.agrupar(itens, (o) => o.grupo);
  const abrir = (g) => { E.grupoAberto = g.chave; desenhar(); window.scrollTo({ top: 0 }); };
  out.push(el('div', { class: 'grade' }, [
    cartaoGrafico({
      titulo: 'OS por grupo', sub: 'Clique numa barra ou linha para abrir', classe: 'c5', altura: 40 + grupos.length * 28,
      desenhar: (c) => G.barras(c, grupos.map((g) => g.chave), grupos.map((g) => g.os), { horizontal: true, aoClicar: (k) => abrir(grupos[k]) })
    }),
    cartao({ titulo: 'Grupos de peças', sub: 'Os 12 grupos da lista + pneus', classe: 'c7', corpo: tabelaGrupos(grupos, abrir) }),
    mapaTipoGrupo(itens)
  ]));
  return out;
}

function mapaTipoGrupo(itens) {
  const grupos = ORDEM_GRUPOS.filter((g) => itens.some((o) => o.grupo === g));
  const linhas = K.matrizTipoGrupo(itens, E.base.veiculos, grupos);
  const max = Math.max(0.0001, ...linhas.flatMap((l) => l.celulas.map((c) => c.pct)));
  const corpo = el('tbody', {}, linhas.map((l) => el('tr', {}, [
    el('td', {}, [el('b', { text: l.tipo }), el('div', { class: 'etiqueta', text: fmt.int(l.os) + ' OS' })]),
    ...l.celulas.map((c) => {
      const td = el('td', { class: 'celula', title: `${l.tipo} · ${nomeGrupo(c.grupo)}: ${fmt.int(c.os)} OS (${fmt.pct(c.pct)} das OS do tipo)` }, [c.pct ? fmt.pct(c.pct) : '·']);
      const forca = c.pct / max;
      if (c.pct) td.style.background = `color-mix(in srgb, var(--seq) ${Math.round(8 + forca * 80)}%, var(--cartao))`;
      if (forca > 0.55) td.classList.add('forte');
      return td;
    })
  ])));
  const tab = el('div', { class: 'tabela-rolagem mapa' }, el('table', {}, [
    el('thead', {}, el('tr', {}, [el('th', { text: 'Tipo de veículo' }), ...grupos.map((g) => el('th', { class: 'n', title: GRUPOS[g] || g, text: g }))])), corpo]));
  return cartao({ titulo: 'Onde cada tipo de veículo tem mais serviço', sub: '% das OS de cada tipo em cada grupo. Mais escuro = maior peso.', classe: 'c12', corpo: tab });
}

// ── Veículos ──
function abaVeiculos(itens) {
  if (!itens.length) return [vazio('Nenhuma OS no filtro escolhido.')];
  const tipoPorChassi = new Map(E.base.veiculos.map((v) => [v.chassi, v.tipo]));
  const comTipo = itens.map((o) => ({ ...o, tipo: tipoPorChassi.get(o.chassi) || '(sem cadastro)' }));
  const tipos = K.agrupar(comTipo, (o) => o.tipo);
  const modelos = K.agrupar(itens, (o) => o.veiculo).slice(0, 12);
  const veic = K.agrupar(itens, (o) => o.chassi);
  const infoVeic = new Map(E.base.veiculos.map((v) => [v.chassi, v]));
  const maiorGrupo = new Map();
  K.agrupar(itens, (o) => o.chassi + '|' + o.grupo).forEach((g) => {
    const i = g.chave.indexOf('|');
    const chassi = g.chave.slice(0, i);
    if (!maiorGrupo.has(chassi)) maiorGrupo.set(chassi, g.chave.slice(i + 1));
  });
  const custoTipo = tipos.map((t) => ({ ...t, medio: t.veiculos ? t.total / t.veiculos : 0 })).sort((a, b) => b.medio - a.medio);
  return [el('div', { class: 'grade' }, [
    cartaoGrafico({
      titulo: 'OS por tipo de veículo', classe: 'c6', altura: 40 + tipos.length * 28,
      desenhar: (c) => G.barras(c, tipos.map((t) => t.chave), tipos.map((t) => t.os), { horizontal: true }),
      tabela: () => tabelaTipos(tipos)
    }),
    cartaoGrafico({
      titulo: 'Custo médio por veículo atendido, por tipo', sub: 'Gasto do tipo ÷ veículos daquele tipo com OS no período', classe: 'c6', altura: 40 + tipos.length * 28,
      desenhar: (c) => G.barras(c, custoTipo.map((t) => t.chave), custoTipo.map((t) => t.medio), { horizontal: true }),
      tabela: () => tabelaTipos(tipos)
    }),
    cartao({
      titulo: 'Veículos que mais tiveram serviço', sub: 'Clique numa linha para filtrar a placa', classe: 'c8',
      corpo: tabela([
        { titulo: 'Placa', valor: (l) => infoVeic.get(l.chave)?.placa || l.chave },
        { titulo: 'Modelo', valor: (l) => infoVeic.get(l.chave)?.modelo || '—' },
        { titulo: 'Tipo', valor: (l) => infoVeic.get(l.chave)?.tipo || '—' },
        variasFiliais() ? { titulo: 'Filial', valor: (l) => infoVeic.get(l.chave)?.filial || '—' } : null,
        { titulo: 'Maior grupo', valor: (l) => nomeGrupo(maiorGrupo.get(l.chave)) },
        { titulo: 'OS', num: true, valor: (l) => fmt.int(l.os) },
        { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) }
      ].filter(Boolean), veic, { max: 100, aoClicar: (l) => { const v = infoVeic.get(l.chave); E.f.placa = v ? v.placa : ''; montarFiltros(); desenhar(); } })
    }),
    cartaoGrafico({
      titulo: 'OS por modelo', sub: 'Os 12 modelos com mais serviço', classe: 'c4', altura: 40 + modelos.length * 28,
      desenhar: (c) => G.barras(c, modelos.map((m) => m.chave), modelos.map((m) => m.os), { horizontal: true }),
      tabela: () => tabela([{ titulo: 'Modelo', valor: (l) => l.chave }, { titulo: 'OS', num: true, valor: (l) => fmt.int(l.os) },
        { titulo: 'Veículos', num: true, valor: (l) => fmt.int(l.veiculos) }], modelos)
    })
  ])];
}

// ── Pneus (o sistema de OS não registra nº de fogo, marca nem medida — só o serviço) ──
function abaPneus() {
  const itens = itensFiltrados({ grupo: '' }).filter((o) => o.grupo === 'PNE');
  if (!itens.length) return [vazio('Nenhuma OS do grupo Pneus no filtro escolhido.')];
  const r = K.resumo(itens);
  const ordenadas = [...itens].filter((o) => o.status === 'FEITA').sort((a, b) => (b.data_servico || '').localeCompare(a.data_servico || ''));
  return [
    el('div', { class: 'aviso amarelo' }, [el('b', { text: 'Sem detalhe de pneu: ' }),
      'o sistema de OS ainda não registra nº de fogo, marca ou medida — só o serviço lançado no grupo Pneus.']),
    el('div', { class: 'numeros' }, [
      numero('OS de pneus no período', fmt.int(r.os)), numero('Gasto', fmt.reais(r.total), [fmt.int(r.comValor) + ' com valor lançado']),
      numero('Veículos', fmt.int(r.veiculos)), numero('Custo por veículo', fmt.reais(r.porVeiculo))
    ]),
    cartao({
      titulo: 'Serviços de pneus', classe: 'c12', corpo: tabela([
        { titulo: 'Data', valor: (l) => fmt.data(l.data_servico) }, { titulo: 'Veículo', valor: (l) => (l.placa || l.chassi) + ' · ' + (l.veiculo || '') },
        { titulo: 'Serviço', valor: (l) => l.servico }, { titulo: 'Valor', num: true, valor: (l) => fmt.reais(l.valor_total) },
        { titulo: 'Responsável', valor: (l) => quemFez(l, E.base.nomes) }
      ], ordenadas, { max: 200, aoClicar: (l) => { location.href = '/os#os/' + l.id; } })
    })
  ];
}

// ── Fornecedores ──
function abaFornecedores(itens) {
  if (!itens.length) return [vazio('Nenhuma OS no filtro escolhido.')];
  const oficinas = K.porOficinaExterna(itens);
  const fornecedores = K.porFornecedorNota(itens);
  if (!oficinas.length && !fornecedores.length) return [vazio('Nenhuma oficina externa nem nota fiscal lançada no filtro escolhido.')];
  const blocos = [];
  if (oficinas.length) {
    blocos.push(cartaoGrafico({
      titulo: 'Oficinas externas', sub: 'Execução externa, pelo nº de OS', classe: oficinas.length && fornecedores.length ? 'c6' : 'c12',
      altura: 40 + Math.max(oficinas.length, 3) * 28,
      desenhar: (c) => G.barras(c, oficinas.map((o) => o.chave), oficinas.map((o) => o.os), { horizontal: true }),
      tabela: () => tabela([{ titulo: 'Oficina', valor: (l) => l.chave }, { titulo: 'OS', num: true, valor: (l) => fmt.int(l.os) },
        { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) }], oficinas)
    }));
  }
  if (fornecedores.length) {
    blocos.push(cartaoGrafico({
      titulo: 'Fornecedores (notas fiscais)', sub: 'Pelo nº de notas lançadas nas OS', classe: oficinas.length && fornecedores.length ? 'c6' : 'c12',
      altura: 40 + Math.max(fornecedores.length, 3) * 28,
      desenhar: (c) => G.barras(c, fornecedores.map((f) => f.chave), fornecedores.map((f) => f.notas), { horizontal: true }),
      tabela: () => tabela([{ titulo: 'Fornecedor', valor: (l) => l.chave }, { titulo: 'Notas', num: true, valor: (l) => fmt.int(l.notas) },
        { titulo: 'Gasto', num: true, valor: (l) => fmt.reais(l.total) }], fornecedores)
    }));
  }
  return [el('div', { class: 'grade' }, blocos)];
}

// ── Notas fiscais ──
function abaNotas(itens) {
  const todas = K.listaNotas(itens);
  const busca = E.busca.trim().toLowerCase();
  const notas = busca ? todas.filter((nt) => [nt.numero, nt.placa, nt.fornecedor, nt.filial].join(' ').toLowerCase().includes(busca)) : todas;
  const paginas = Math.max(1, Math.ceil(notas.length / POR_PAGINA));
  E.pagina = Math.min(E.pagina, paginas - 1);
  const pagina = notas.slice(E.pagina * POR_PAGINA, (E.pagina + 1) * POR_PAGINA);

  const campo = el('input', { type: 'search', placeholder: 'Buscar número, placa, fornecedor…', value: E.busca, 'aria-label': 'Buscar notas' });
  campo.addEventListener('input', () => { E.busca = campo.value; E.pagina = 0; clearTimeout(campo._t); campo._t = setTimeout(() => { desenhar(); const c = document.querySelector('.ferramentas input'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } }, 250); });
  const csv = el('button', { class: 'botao', type: 'button', text: 'Baixar notas (CSV)' });
  csv.addEventListener('click', () => baixar(`lokal_notas_${E.f.de || 'inicio'}_${E.f.ate || 'fim'}.csv`, K.csvNotas(busca ? notas : todas)));

  const multi = variasFiliais();
  const cab = ['Data do serviço', 'Nota', multi ? 'Filial' : null, 'Placa', 'Fornecedor', 'Valor'].filter(Boolean);
  const corpo = el('tbody', {}, pagina.map((nt) => {
    const tr = el('tr', { class: 'clicavel' }, [
      el('td', { text: fmt.data(nt.data_servico) }), el('td', { text: nt.numero || '—' }), multi ? el('td', { text: nt.filial }) : null,
      el('td', { text: nt.placa }), el('td', { text: nt.fornecedor || '—' }), el('td', { class: 'n', text: nt.valor ? fmt.reais(nt.valor) : '—' })
    ].filter(Boolean));
    tr.addEventListener('click', () => { location.href = '/os#os/' + nt.osId; });
    return tr;
  }));
  const ant = el('button', { class: 'botao mini', type: 'button', text: '← Anterior', disabled: E.pagina === 0 });
  const prox = el('button', { class: 'botao mini', type: 'button', text: 'Próxima →', disabled: E.pagina >= paginas - 1 });
  ant.addEventListener('click', () => { E.pagina--; desenhar(); });
  prox.addEventListener('click', () => { E.pagina++; desenhar(); });

  return [cartao({
    titulo: 'Notas fiscais', sub: `${fmt.int(notas.length)} nota(s) lançada(s) nas OS. Clique numa nota pra abrir a OS.`, classe: 'c12',
    corpo: el('div', {}, [
      el('div', { class: 'ferramentas' }, [campo, csv]),
      notas.length ? el('div', { class: 'tabela-rolagem' }, el('table', {}, [el('thead', {}, el('tr', {}, cab.map((t) => el('th', { class: t === 'Valor' ? 'n' : null, text: t })))), corpo]))
        : el('div', { class: 'vazio', text: 'Nenhuma nota encontrada.' }),
      paginas > 1 ? el('div', { class: 'paginacao' }, [ant, `Página ${E.pagina + 1} de ${paginas}`, prox]) : null
    ])
  })];
}

// ── Reincidências e garantias ──
function nomePeca(grupo, peca, posicao) {
  return (GRUPOS[grupo] || grupo) + ' · ' + peca + (posicao ? ' (' + posicao + ')' : '');
}

function desenharGarantias() {
  const nomes = E.base.nomes;
  const { reincidencias: reinc, emGarantia } = relatorioReincidencias(E.base.os, dataLocalISO());
  const conteudo = [];
  const blocos = [];

  if (E.base.temExemplo) {
    conteudo.push(el('div', { class: 'aviso amarelo' }, [el('b', { text: 'AMBIENTE DE DEMONSTRAÇÃO · ' }),
      'estes números vêm de OS de exemplo do sistema de OS, ainda não são lançamentos reais.']));
  }

  const contarAte = (dias) => emGarantia.filter((e) => e.dias <= dias).length;
  const veiculosAfetados = new Set(reinc.map((r) => r.chassi)).size;
  const alternarJanela = (dias) => { E.janelaGarantia = E.janelaGarantia === dias ? null : dias; desenharGarantias(); irPara('sec-garantia'); };

  conteudo.push(el('div', { class: 'indicadores' }, [
    indicador({
      rotulo: 'Reincidências', valor: fmt.int(reinc.length), cor: 'vermelho',
      extra: reinc.length ? fmt.int(veiculosAfetados) + ' veículo(s) afetado(s)' : 'nenhuma por enquanto',
      onClick: () => irPara('sec-reincidencias')
    }),
    indicador({
      rotulo: 'Manutenções · 30 dias', valor: fmt.int(contarAte(30)), cor: 'amarelo', ativo: E.janelaGarantia === 30,
      extra: 'clique pra ver a lista', onClick: () => alternarJanela(30)
    }),
    indicador({
      rotulo: 'Manutenções · 45 dias', valor: fmt.int(contarAte(45)), cor: 'marca', ativo: E.janelaGarantia === 45,
      extra: 'clique pra ver a lista', onClick: () => alternarJanela(45)
    }),
    indicador({
      rotulo: 'Manutenções · 90 dias', valor: fmt.int(contarAte(90)), cor: 'verde', ativo: E.janelaGarantia === 90,
      extra: 'clique pra ver a lista', onClick: () => alternarJanela(90)
    })
  ]));

  const reincOrdenadas = [...reinc].sort((a, b) => ORDEM_COR_SEMAFORO[a.cor] - ORDEM_COR_SEMAFORO[b.cor] || a.dias - b.dias);
  const secReincidencias = cartao({
    titulo: 'Reincidências', sub: 'Mesma peça trocada de novo no mesmo veículo em até 90 dias.', classe: 'c12',
    corpo: reincOrdenadas.length ? tabela([
      { titulo: '', valor: (l) => EMOJI_SEMAFORO[l.cor] },
      { titulo: 'Veículo', valor: (l) => (l.placa || l.chassi) + ' · ' + (l.veiculo || '') },
      { titulo: 'Peça', valor: (l) => nomePeca(l.grupo, l.peca, l.posicao) },
      { titulo: '1ª troca', valor: (l) => fmt.data(l.primeira.data_servico) + ' · ' + quemFez(l.primeira, nomes) },
      { titulo: '2ª troca (reincidência)', valor: (l) => fmt.data(l.segunda.data_servico) + ' · ' + quemFez(l.segunda, nomes) },
      { titulo: 'Dias entre as trocas', num: true, valor: (l) => fmt.int(l.dias) }
    ], reincOrdenadas, { aoClicar: (l) => { location.href = '/os#os/' + l.segunda.osId; } }) : el('div', { class: 'vazio', text: 'Nenhuma reincidência registrada ainda.' })
  });
  secReincidencias.id = 'sec-reincidencias';
  blocos.push(secReincidencias);

  const emGarantiaFiltrado = E.janelaGarantia ? emGarantia.filter((e) => e.dias <= E.janelaGarantia) : emGarantia;
  const emGarantiaOrdenado = [...emGarantiaFiltrado].sort((a, b) => a.restam - b.restam);
  const botaoLimpar = el('button', { class: 'botao mini', type: 'button', text: 'Ver os 90 dias' });
  botaoLimpar.addEventListener('click', () => { E.janelaGarantia = null; desenharGarantias(); });
  const secGarantia = cartao({
    titulo: 'Peças em garantia' + (E.janelaGarantia ? ' · últimos ' + E.janelaGarantia + ' dias' : ' (últimos 90 dias)'),
    sub: 'A troca mais recente de cada peça, por veículo — se essa peça falhar de novo antes do prazo, vira reincidência.',
    classe: 'c12', acoes: E.janelaGarantia ? [botaoLimpar] : null,
    corpo: emGarantiaOrdenado.length ? tabela([
      { titulo: 'Veículo', valor: (l) => (l.placa || l.chassi) + ' · ' + (l.veiculo || '') },
      { titulo: 'Peça', valor: (l) => nomePeca(l.grupo, l.peca, l.posicao) },
      { titulo: 'Data do serviço', valor: (l) => fmt.data(l.data_servico) },
      { titulo: 'Restam', num: true, valor: (l) => fmt.int(l.restam) + ' dia(s)' },
      { titulo: 'Responsável', valor: (l) => quemFez(l, nomes) }
    ], emGarantiaOrdenado, { aoClicar: (l) => { location.href = '/os#os/' + l.osId; } })
      : el('div', { class: 'vazio', text: 'Nenhuma peça em garantia' + (E.janelaGarantia ? ' nessa janela.' : ' agora.') })
  });
  secGarantia.id = 'sec-garantia';
  blocos.push(secGarantia);

  const porPeca = new Map();
  reinc.forEach((r) => {
    const chave = r.grupo + ':' + r.peca;
    const atual = porPeca.get(chave) || { grupo: r.grupo, peca: r.peca, n: 0 };
    atual.n++; porPeca.set(chave, atual);
  });
  const rankingPecas = [...porPeca.values()].sort((a, b) => b.n - a.n);
  blocos.push(cartao({
    titulo: 'Peças que mais reincidem', classe: 'c6',
    corpo: rankingPecas.length ? tabela([
      { titulo: 'Peça', valor: (l) => nomePeca(l.grupo, l.peca) }, { titulo: 'Reincidências', num: true, valor: (l) => fmt.int(l.n) }
    ], rankingPecas) : el('div', { class: 'vazio', text: 'Nenhuma reincidência registrada ainda.' })
  }));

  const porResponsavel = new Map();
  reinc.forEach((r) => {
    const chave = quemFez(r.primeira, nomes);
    const atual = porResponsavel.get(chave) || { quem: chave, n: 0 };
    atual.n++; porResponsavel.set(chave, atual);
  });
  const rankingResp = [...porResponsavel.values()].sort((a, b) => b.n - a.n);
  blocos.push(cartao({
    titulo: 'Reincidências por responsável', sub: 'Quem fez o serviço que falhou de novo (mecânico interno ou oficina externa) — não quem fez o reparo.', classe: 'c6',
    corpo: rankingResp.length ? tabela([
      { titulo: 'Responsável', valor: (l) => l.quem }, { titulo: 'Reincidências', num: true, valor: (l) => fmt.int(l.n) }
    ], rankingResp) : el('div', { class: 'vazio', text: 'Nenhuma reincidência registrada ainda.' })
  }));

  conteudo.push(el('div', { class: 'grade' }, blocos));
  $('conteudo').replaceChildren(...conteudo);
}
