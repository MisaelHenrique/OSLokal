// Sistema de OS (simplificado): telas da matriz (administrador), das filiais e da diretoria.
// Rotas pela âncora da URL: #lista/<aba>, #nova[/<chassi>], #solicitar, #solicitacoes, #os/<id>, #veiculo/<chassi>.
import { api } from '../api.js';
import { el, fmt } from '../ui.js';
import { GRUPOS, ORDEM_GRUPOS } from '../sistema.js';
import { STATUS, TIPO_LOCAL, numeroOS, nomeVeiculo, podeLancar, podeSolicitar, lerNumero } from './regras.js';
import { $, montarTopo, etiquetaStatus, campoFoto, fotoGuardada, idEnvio, registrarServiceWorker, mensagem,
  buscaVeiculo, formularioLancamento, dataLocalISO, textoServico } from './comum.js';

const E = { u: null, lista: [], nomes: {}, mecanicos: [], oficinas: [], veiculos: null, carregadoEm: 0 };
const ETAPAS_NOME = { SOLICITADA: 'Solicitada', LANCADA: 'Lançada', CANCELADA: 'Cancelada', VALORES: 'Valores lançados',
  CORRIGIDA: 'Corrigida' };

const nome = (login) => (login ? E.nomes[login] || login : '—');
const conteudo = (...filhos) => $('conteudo').replaceChildren(...filhos.flat().filter(Boolean));

function ha(iso) {
  if (!iso) return '';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 60) return 'há ' + Math.max(1, min) + ' min';
  const h = Math.round(min / 60);
  if (h < 48) return 'há ' + h + ' h';
  return 'há ' + Math.round(h / 24) + ' dias';
}

/** Solicitações sem nenhuma OS feita que aponte os_atendida para elas. */
function solicitacoesAbertas(lista) {
  const respondidas = new Set(lista.map((o) => o.os_atendida).filter(Boolean));
  return lista.filter((o) => o.status === 'SOLICITADA' && !respondidas.has(o.id));
}

iniciar();

async function iniciar() {
  let s;
  try { s = await api.sessao(); } catch (e) { return erroGeral(e); }
  E.u = s.usuario;
  if (E.u.perfil === 'MECANICO') return location.replace('/os/mecanico');
  const extras = [
    podeSolicitar(E.u) ? el('a', { class: 'botao', href: '#solicitar', text: 'Solicitar equipe itinerante' }) : null,
    el('button', { class: 'botao fantasma', type: 'button', title: 'Atualizar', 'aria-label': 'Atualizar', text: '⟳',
      onclick: async () => { await carregar(); rota(); } })
  ];
  // "link no menu, fora da tela principal" (pedido do plano): fora da tela inicial, dentro do menu do usuário
  const menuExtras = [
    el('a', { href: '#todas', role: 'menuitem', text: 'Todas as OS' }),
    E.u.perfil === 'ADMIN' ? el('a', { href: '#solicitacoes', role: 'menuitem', text: 'Solicitações abertas' }) : null
  ];
  montarTopo(E.u, { titulo: E.u.perfil === 'FILIAL' ? 'Ordens de serviço · ' + E.u.filiais.join(', ') : 'Ordens de serviço', extras, menuExtras });
  $('faixa-exemplo').hidden = !(s.modo_local || E.u.exemplo);
  registrarServiceWorker();
  window.addEventListener('hashchange', rota);
  try { await carregar(); } catch (e) { return erroGeral(e); }
  rota();
}

async function carregar() {
  const d = await api.listaOS();
  E.lista = d.os; E.nomes = d.nomes || {}; E.mecanicos = d.mecanicos || []; E.oficinas = d.oficinas || []; E.carregadoEm = Date.now();
  $('estado').textContent = E.lista.filter((o) => o.status === 'FEITA').length + ' OS feitas';
}

async function veiculos() {
  if (!E.veiculos) E.veiculos = (await api.veiculos()).veiculos;
  return E.veiculos;
}

function erroGeral(e) {
  conteudo(el('div', { class: 'aviso vermelho' }, [el('b', { text: 'Não foi possível carregar. ' }),
    navigator.onLine ? e.message : 'Sem internet. As telas da matriz e das filiais precisam de conexão.']));
}

function rota() {
  const h = decodeURIComponent(location.hash.slice(1));
  window.scrollTo(0, 0);
  if (h === 'nova') return telaNova();
  let m = h.match(/^nova\/(.+)$/);
  if (m) return telaNova(m[1]);
  if (h === 'solicitar') return telaSolicitar();
  if (h === 'solicitacoes') return telaSolicitacoes();
  if (h === 'todas') return telaTodas();
  m = h.match(/^os\/(\d+)$/);
  if (m) return telaOS(Number(m[1]));
  m = h.match(/^veiculo\/(.+)$/);
  if (m) return telaVeiculo(m[1]);
  return telaInicio();
}

// ───────────────────────── início: Nova OS + busca por placa ─────────────────────────

async function telaInicio() {
  conteudo(el('div', { class: 'carregando' }, [el('div', { class: 'giro' }), 'Carregando o cadastro de veículos…']));
  let lista;
  try { lista = await veiculos(); } catch (e) { return erroGeral(e); }
  const busca = buscaVeiculo(lista);
  busca.ao((v) => { location.hash = 'veiculo/' + encodeURIComponent(v.chassi); });
  const recentes = [...E.lista].sort((a, b) => (a.aberta_em < b.aberta_em ? 1 : -1)).slice(0, 8);
  conteudo(el('div', { class: 'inicio' }, [
    el('div', { class: 'inicio-acoes' }, [
      podeLancar(E.u) ? el('a', { class: 'botao prim grande', href: '#nova' }, [el('span', { text: '+' }), el('span', { text: 'Nova OS' })]) : null,
      el('a', { class: 'botao grande', href: '#todas', text: 'Todas as OS' })
    ]),
    el('section', { class: 'cartao' }, [el('div', { class: 'cartao-topo' }, el('h2', { text: 'Buscar histórico por placa' })), busca.caixa]),
    recentes.length ? el('section', { class: 'cartao' }, [el('div', { class: 'cartao-topo' }, el('h2', { text: 'Lançamentos recentes' })),
      el('div', { class: 'lista-os' }, recentes.map(linhaOS))]) : null
  ]));
  busca.focar();
}

function quemFez(o) {
  if (o.status === 'SOLICITADA') return 'Aberta por ' + nome(o.aberta_por);
  if (o.execucao === 'EXTERNA') return o.oficina_externa || 'Oficina externa';
  return o.direcionada_para ? nome(o.direcionada_para) : '—';
}

function linhaOS(o) {
  const oQue = o.status === 'SOLICITADA' ? o.sintoma : textoServico(o);
  return el('a', { class: 'linha-os', href: '#os/' + o.id }, [
    el('div', { class: 'l1' }, [el('b', { text: o.numero }), etiquetaStatus(o.status)]),
    el('div', { class: 'l2' }, [el('b', { class: 'placa', text: o.placa || 'sem placa' }), el('span', { text: o.veiculo })]),
    el('div', { class: 'l3', text: oQue }),
    el('div', { class: 'l4' }, [el('span', { text: o.filial + ' · ' + (o.cidade || '—') }),
      el('span', { text: quemFez(o) + ' · ' + ha(o.data_servico ? o.data_servico + 'T12:00:00' : o.aberta_em) })])
  ]);
}

// ───────────────────────── nova OS (lançar) ─────────────────────────

async function telaNova(chassiInicial) {
  if (!podeLancar(E.u)) { location.hash = ''; return; }
  conteudo(el('div', { class: 'carregando' }, [el('div', { class: 'giro' }), 'Carregando o cadastro de veículos…']));
  let lista;
  try { lista = await veiculos(); } catch (e) { return erroGeral(e); }
  const veiculoFixo = chassiInicial ? (lista.find((v) => v.chassi === chassiInicial) || null) : null;
  const { form, focar } = formularioLancamento({
    u: E.u, veiculos: lista, mecanicos: E.mecanicos, oficinas: E.oficinas, solicitacoesAbertas: solicitacoesAbertas(E.lista),
    veiculoFixo,
    enviar: async (d) => {
      const envio = idEnvio();
      const fotos = {
        frente: (await api.enviarArquivo({ tipo: 'frente', envio }, d.fotoFrente)).caminho,
        painel: (await api.enviarArquivo({ tipo: 'painel', envio }, d.fotoPainel)).caminho
      };
      const fotos_defeito = [];
      let n = 0;
      for (const blob of d.fotosDefeito) fotos_defeito.push((await api.enviarArquivo({ tipo: 'defeito', envio, n: ++n }, blob)).caminho);
      const { os } = await api.acaoOS('lancar', {
        chassi: d.chassi, data_servico: d.data_servico, cidade: d.cidade, pecas: d.pecas, servico: d.servico,
        tipo_local: d.tipo_local, execucao: d.execucao, mecanico: d.mecanico, oficina_externa: d.oficina_externa,
        auxiliares: d.auxiliares, km: d.km, horimetro: d.horimetro, os_atendida: d.os_atendida, envio_id: envio, fotos, fotos_defeito
      });
      await carregar();
      location.hash = 'os/' + os.id;
      setTimeout(() => aviso(os.numero + ' lançada.'), 50);
    }
  });
  conteudo(el('div', { class: 'trilha' }, [el('a', { href: '#', text: '← Ordens de serviço' })]),
    el('section', { class: 'cartao' }, [el('div', { class: 'cartao-topo' }, [el('div', {}, [el('h2', { text: 'Nova OS' }),
      el('p', { text: 'Registre um serviço que já foi feito. Não existe mais aprovação: a OS nasce pronta.' })])]), form]));
  focar();
}

// ───────────────────────── solicitar equipe itinerante ─────────────────────────

async function telaSolicitar() {
  if (!podeSolicitar(E.u)) { location.hash = ''; return; }
  conteudo(el('div', { class: 'carregando' }, [el('div', { class: 'giro' }), 'Carregando o cadastro de veículos…']));
  let lista;
  try { lista = await veiculos(); } catch (e) { return erroGeral(e); }
  const busca = buscaVeiculo(lista);
  const sintoma = el('textarea', { rows: 3, placeholder: 'O que está acontecendo?' });
  const cidade = el('input', { placeholder: 'Cidade' });
  let tipoLocal = '';
  const bLocal = (t) => el('button', { type: 'button', class: 'opcao-grande', 'aria-pressed': 'false', onclick: (ev) => {
    tipoLocal = t;
    ev.currentTarget.parentElement.querySelectorAll('.opcao-grande').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget)));
  } }, [el('b', { text: TIPO_LOCAL[t] })]);
  const fotos = [campoFoto('Foto 1 (opcional)'), campoFoto('Foto 2'), campoFoto('Foto 3')];
  const msg = el('div', { class: 'mensagem erro largo', role: 'alert', hidden: true });
  const enviar = el('button', { class: 'botao prim grande', type: 'submit', text: 'Solicitar equipe itinerante' });
  const form = el('form', { class: 'form-os', novalidate: true }, [
    busca.caixa,
    el('label', { class: 'campo largo' }, [el('span', { text: 'O que está acontecendo?' }), sintoma]),
    el('label', { class: 'campo' }, [el('span', { text: 'Cidade' }), cidade]),
    el('div', { class: 'campo' }, [el('span', { text: 'Tipo de local' }), el('div', { class: 'opcoes-grandes' }, [bLocal('OBRA'), bLocal('GALPAO')])]),
    el('div', { class: 'campo largo' }, [el('span', { text: 'Fotos (opcional)' }), el('div', { class: 'fotos' }, fotos.map((f) => f.caixa))]),
    msg, el('div', { class: 'largo' }, enviar)
  ]);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = busca.selecionado();
    const erro = !v ? 'Escolha o veículo.' : sintoma.value.trim().length < 5 ? 'Descreva o que está acontecendo.'
      : cidade.value.trim().length < 2 ? 'Informe a cidade.' : !tipoLocal ? 'Escolha o tipo de local.' : '';
    if (erro) return mensagem(msg, erro);
    mensagem(msg, '');
    enviar.disabled = true; enviar.textContent = 'Enviando…';
    try {
      const envio = idEnvio(), fotos_defeito = [];
      let n = 0;
      for (const f of fotos) { const b = f.valor(); if (b) fotos_defeito.push((await api.enviarArquivo({ tipo: 'defeito', envio, n: ++n }, b)).caminho); }
      const { os } = await api.acaoOS('solicitar', { chassi: v.chassi, sintoma: sintoma.value, cidade: cidade.value, tipo_local: tipoLocal, fotos_defeito });
      await carregar();
      location.hash = 'os/' + os.id;
      setTimeout(() => aviso(os.numero + ' solicitada. A matriz foi avisada.'), 50);
    } catch (e) {
      mensagem(msg, e.message);
      enviar.disabled = false; enviar.textContent = 'Solicitar equipe itinerante';
    }
  });
  conteudo(el('div', { class: 'trilha' }, [el('a', { href: '#', text: '← Ordens de serviço' })]),
    el('section', { class: 'cartao' }, [el('div', { class: 'cartao-topo' }, el('h2', { text: 'Solicitar equipe itinerante' })), form]));
}

/**
 * Todas as OS visíveis (matriz/diretoria: de todas as filiais; filial: só as dela). Filtros que se cruzam
 * (todos precisam bater): filial, placa e mecânico (digitáveis, com sugestão real do cadastro — vazio = todas/
 * todos) e uma busca livre pra cidade/serviço/nº da OS.
 */
function telaTodas() {
  const filiais = [...new Set(E.lista.map((o) => o.filial))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const filtroFilial = el('select', {}, [el('option', { value: '', text: 'Todas as filiais' }),
    ...filiais.map((f) => el('option', { value: f, text: f }))]);

  const placas = [...new Set(E.lista.map((o) => o.placa).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const idDlPlaca = 'dl-' + idEnvio();
  const dlPlaca = el('datalist', { id: idDlPlaca }, placas.map((p) => el('option', { value: p })));
  const filtroPlaca = el('input', { list: idDlPlaca, placeholder: 'Todas as placas', 'aria-label': 'Filtrar por placa' });

  const mecanicos = [...new Set(E.lista.map((o) => nome(o.direcionada_para)).filter((n) => n && n !== '—'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const idDlMec = 'dl-' + idEnvio();
  const dlMec = el('datalist', { id: idDlMec }, mecanicos.map((n) => el('option', { value: n })));
  const filtroMecanico = el('input', { list: idDlMec, placeholder: 'Todos os mecânicos', 'aria-label': 'Filtrar por mecânico' });

  const busca = el('input', { type: 'search', placeholder: 'Buscar nº da OS, cidade, serviço…', 'aria-label': 'Buscar' });
  const caixa = el('div');
  const desenhar = () => {
    const f = filtroFilial ? filtroFilial.value : '';
    const p = filtroPlaca.value.trim().toLowerCase();
    const m = filtroMecanico.value.trim().toLowerCase();
    const t = busca.value.trim().toLowerCase();
    const lista = E.lista.filter((o) => (!f || o.filial === f)
      && (!p || (o.placa || '').toLowerCase().includes(p))
      && (!m || nome(o.direcionada_para).toLowerCase().includes(m) || (o.oficina_externa || '').toLowerCase().includes(m))
      && (!t || [numeroOS(o.id), o.cidade, o.sintoma, o.servico].join(' ').toLowerCase().includes(t)))
      .sort((a, b) => (a.aberta_em < b.aberta_em ? 1 : -1));
    caixa.replaceChildren(lista.length ? el('div', { class: 'lista-os' }, lista.map(linhaOS)) : el('div', { class: 'vazio', text: 'Nada encontrado.' }));
  };
  [filtroFilial, filtroPlaca, filtroMecanico].forEach((c) => c && c.addEventListener(c.tagName === 'SELECT' ? 'change' : 'input', desenhar));
  busca.addEventListener('input', desenhar);
  desenhar();
  conteudo(
    el('div', { class: 'trilha' }, [el('a', { href: '#', text: '← Ordens de serviço' })]),
    el('h1', {}, 'Todas as OS'),
    el('div', { class: 'ferramentas' }, [filtroFilial, filtroPlaca, dlPlaca, filtroMecanico, dlMec, busca].filter(Boolean)),
    caixa);
}

async function telaSolicitacoes() {
  if (E.u.perfil !== 'ADMIN') { location.hash = ''; return; }
  const abertas = solicitacoesAbertas(E.lista).sort((a, b) => (a.aberta_em < b.aberta_em ? 1 : -1));
  conteudo(
    el('div', { class: 'trilha' }, [el('a', { href: '#', text: '← Ordens de serviço' })]),
    el('h1', {}, 'Solicitações de equipe itinerante em aberto'),
    abertas.length ? el('div', { class: 'lista-os' }, abertas.map(linhaOS)) : el('div', { class: 'vazio', text: 'Nenhuma solicitação em aberto.' }));
}

function aviso(texto) {
  const a = el('div', { class: 'toast', role: 'status', text: texto });
  document.body.appendChild(a);
  setTimeout(() => a.remove(), 5000);
}

// ───────────────────────── detalhe ─────────────────────────

async function telaOS(id) {
  conteudo(el('div', { class: 'carregando' }, [el('div', { class: 'giro' }), 'Abrindo ' + numeroOS(id) + '…']));
  let d;
  try { d = await api.os(id); } catch (e) { return conteudo(el('div', { class: 'trilha' }, el('a', { href: '#', text: '← Ordens de serviço' })), el('div', { class: 'aviso vermelho', text: e.message })); }
  const o = d.os;
  const dl = (pares) => el('dl', { class: 'dados' }, pares.filter((p) => p && p[1] !== undefined && p[1] !== null && p[1] !== '').flatMap(([k, v]) => [el('dt', { text: k }), el('dd', {}, v)]));
  const secoes = [];
  secoes.push(cartao('Veículo', [dl([
    ['Placa', o.placa || 'sem placa'], ['Veículo', o.veiculo], ['Filial', o.filial], ['Cidade', o.cidade], ['Tipo de local', TIPO_LOCAL[o.tipo_local]],
    ['Chassi', el('a', { href: '#veiculo/' + encodeURIComponent(o.chassi), text: o.chassi + ' · histórico do veículo' })]]),
    blocoUltimasManutencoes(d.historicoRecente)]));
  if (o.status === 'SOLICITADA') {
    secoes.push(cartao('Solicitação de equipe itinerante', [dl([
      ['O que está acontecendo', o.sintoma], ['Solicitada por', nome(o.aberta_por) + ' · ' + fmt.dataHora(local(o.aberta_em))]]),
    (o.fotos_defeito || []).length ? el('div', { class: 'fotos' }, o.fotos_defeito.map((c, i) => fotoGuardada(c, 'Foto ' + (i + 1)))) : null]));
  } else {
    secoes.push(cartao('Serviço feito', [dl([
      ['Grupo de peças', GRUPOS[o.grupo]], ['Serviço feito', o.servico], ['Data do serviço', fmt.data(o.data_servico)],
      ['Lançada por', nome(o.aberta_por) + ' · ' + fmt.dataHora(local(o.aberta_em))],
      ['Quem fez', o.execucao === 'EXTERNA' ? o.oficina_externa : nome(o.direcionada_para)],
      ['Auxiliares', (o.auxiliares || []).map(nome).join(', ')],
      ['Km', o.km !== null && o.km !== undefined ? fmt.int(o.km) : ''], ['Horímetro', o.horimetro !== null && o.horimetro !== undefined ? fmt.dec(o.horimetro) : ''],
      ['Cancelada', o.status === 'CANCELADA' ? nome(o.cancelada_por) + ': ' + o.cancelamento_motivo : '']]),
    el('div', { class: 'fotos' }, [fotoGuardada(o.foto_frente, 'Frente'), fotoGuardada(o.foto_painel, 'Painel'),
      ...(o.fotos_defeito || []).map((c, i) => fotoGuardada(c, 'Defeito ' + (i + 1)))])]));
  }
  if ('valor_total' in o) {
    secoes.push(cartao('Valores e nota fiscal', [dl([
      ['Peças', o.valor_pecas ? fmt.reais(o.valor_pecas) : ''], ['Mão de obra', o.valor_mao_obra ? fmt.reais(o.valor_mao_obra) : ''],
      ['Deslocamento / diária', o.valor_deslocamento ? fmt.reais(o.valor_deslocamento) : ''],
      ['Total', o.valor_total ? el('b', { text: fmt.reais(o.valor_total) }) : 'Ainda não lançado'],
      ['Nota fiscal', o.nf_numero], ['Fornecedor', o.fornecedor]]),
    o.nf_arquivo ? el('div', { class: 'fotos' }, fotoGuardada(o.nf_arquivo, 'Arquivo da nota')) : null]));
  }
  const ligadas = (d.ligadas || []).map((l) => el('a', { class: 'botao', href: '#os/' + l.id }, [
    l.papel === 'solicitacao' ? 'Atende a solicitação ' : 'Respondida por ', el('b', { text: l.numero }), ' · ', STATUS[l.status]]));
  const tempo = el('ol', { class: 'linha-tempo' }, d.eventos.map((e) => el('li', {}, [
    el('b', { text: ETAPAS_NOME[e.etapa] || e.etapa }), el('span', { text: ' · ' + nome(e.por) + ' · ' + fmt.dataHora(local(e.em)) }),
    e.obs ? el('div', { class: 'obs', text: e.obs }) : null])));
  const acoes = formularioAcoes(o);
  conteudo(
    el('div', { class: 'trilha' }, [el('a', { href: '#', text: '← Ordens de serviço' })]),
    el('div', { class: 'cabeca-os' }, [el('h1', { text: o.numero }), etiquetaStatus(o.status)]),
    ligadas.length ? el('div', { class: 'ligadas' }, ligadas) : null,
    el('div', { class: 'grade-os' }, secoes),
    acoes,
    cartao('Linha do tempo', [tempo]));
}

/** Datas do servidor vêm em UTC; mostra no horário deste aparelho. */
function local(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function cartao(titulo, filhos) {
  return el('section', { class: 'cartao' }, [el('div', { class: 'cartao-topo' }, el('h2', { text: titulo })), ...filhos.filter(Boolean)]);
}

/** Mini-lista das últimas manutenções do veículo, com o selo do semáforo quando a peça já tinha sido trocada antes. */
function blocoUltimasManutencoes(lista) {
  if (!lista || !lista.length) return null;
  return el('div', { class: 'manutencoes-recentes' }, [
    el('h3', { text: 'Últimas manutenções' }),
    ...lista.map((m) => el('div', { class: 'manutencao-recente' }, [
      m.id
        ? el('a', { href: '#os/' + m.id, class: 'manutencao-recente-texto' }, [el('b', { text: textoServico(m) }), el('span', { text: fmt.data(m.data_servico) })])
        : el('div', { class: 'manutencao-recente-texto' }, [el('b', { text: textoServico(m) }), el('span', { text: fmt.data(m.data_servico) })]),
      m.semaforo ? el('span', { class: 'selo-semaforo selo-' + m.semaforo.cor,
        text: `há ${m.semaforo.dias} dia${m.semaforo.dias === 1 ? '' : 's'}` }) : null
    ]))
  ]);
}

// ───────────────────────── ações ─────────────────────────

function formularioAcoes(o) {
  const a = o.acoes || [];
  if (!a.length) return null;
  const msg = el('div', { class: 'mensagem erro', role: 'alert', hidden: true });
  const fazer = async (botao, acao, dados) => {
    mensagem(msg, '');
    botao.disabled = true;
    try {
      const r = await api.acaoOS(acao, { id: o.id, ...dados });
      await carregar();
      await telaOS(r.os.id);
      const msgAcao = acao === 'valores' ? 'valores lançados.' : acao === 'corrigir' ? 'corrigida.' : STATUS[r.os.status].toLowerCase() + '.';
      aviso(r.os.numero + ': ' + msgAcao);
    } catch (e) {
      mensagem(msg, e.message);
      botao.disabled = false;
    }
  };
  const blocos = [];
  if (a.includes('valores')) blocos.push(blocoValores(o, fazer, msg));
  if (a.includes('corrigir')) blocos.push(blocoCorrigir(o, fazer));
  if (a.includes('cancelar')) {
    const m = el('textarea', { rows: 2, placeholder: 'Motivo do cancelamento' });
    const b = el('button', { class: 'botao perigo', type: 'button', text: 'Cancelar OS' });
    b.addEventListener('click', () => fazer(b, 'cancelar', { motivo: m.value }));
    blocos.push(bloco('Cancelar', 'Para registro errado.', [m, b], 'secundario'));
  }
  return el('section', { class: 'cartao acoes-os' }, [el('div', { class: 'cartao-topo' }, el('h2', { text: 'O que fazer agora' })), msg, el('div', { class: 'blocos' }, blocos)]);
}

function bloco(titulo, texto, filhos, classe = '') {
  return el('div', { class: 'bloco ' + classe }, [el('h3', { text: titulo }), texto ? el('p', { class: 'dica', text: texto }) : null, ...filhos]);
}

function blocoValores(o, fazer, msg) {
  const campo = (rot, valorInicial, ph = '0,00') => {
    const i = el('input', { inputmode: 'decimal', placeholder: ph, value: valorInicial ?? '' });
    return [i, el('label', { class: 'campo' }, [el('span', { text: rot }), i])];
  };
  const [pecas, cP] = campo('Peças (R$)', o.valor_pecas), [mao, cM] = campo('Mão de obra (R$)', o.valor_mao_obra),
    [desl, cD] = campo('Deslocamento / diária (R$, opcional)', o.valor_deslocamento);
  const [nf, cN] = campo('Número da nota fiscal', o.nf_numero, 'ex.: 1234'), [forn, cF] = campo('Fornecedor', o.fornecedor, 'ex.: Auto Peças Caetité');
  const total = el('div', { class: 'total', text: 'Total: ' + (o.valor_total ? fmt.reais(o.valor_total) : '—') });
  const somar = () => {
    const v = [pecas, mao, desl].map((i) => lerNumero(i.value)).map((n) => (Number.isFinite(n) ? n : 0));
    total.textContent = 'Total: ' + fmt.reais(v[0] + v[1] + v[2]);
  };
  [pecas, mao, desl].forEach((i) => i.addEventListener('input', somar));
  const arq = el('input', { type: 'file', accept: 'application/pdf,image/*' });
  const b = el('button', { class: 'botao prim grande', type: 'button', text: 'Salvar valores' });
  b.addEventListener('click', async () => {
    let caminho = '';
    const f = arq.files[0];
    if (f) {
      if (f.size > 4 * 1024 * 1024) return mensagem(msg, 'O arquivo da nota passa de 4 MB. Envie uma foto ou um PDF menor.');
      try {
        b.disabled = true; b.textContent = 'Enviando a nota…';
        caminho = (await api.enviarArquivo({ tipo: 'nf', os: o.id, envio: idEnvio() }, f)).caminho;
      } catch (e) { b.disabled = false; b.textContent = 'Salvar valores'; return mensagem(msg, e.message); }
      b.textContent = 'Salvar valores';
    }
    fazer(b, 'valores', { valor_pecas: pecas.value, valor_mao_obra: mao.value, valor_deslocamento: desl.value, nf_numero: nf.value,
      fornecedor: forn.value, nf_arquivo: caminho });
  });
  return bloco('Valores e nota fiscal (opcional)', 'Pode preencher aos poucos; não bloqueia nem muda a etapa da OS.', [
    el('div', { class: 'tres' }, [cP, cM, cD]), el('div', { class: 'tres' }, [cN, cF,
      el('label', { class: 'campo' }, [el('span', { text: 'Arquivo da nota (PDF ou foto, opcional)' }), arq])]), total, b]);
}

/** Corrige um lançamento errado (só a matriz). Não mexe em fotos nem em quem fez o serviço — pra isso, cancele e lance de novo. */
function blocoCorrigir(o, fazer) {
  const grupo = el('select', {}, [el('option', { value: '', text: 'Grupo de peças' }),
    ...ORDEM_GRUPOS.map((g) => el('option', { value: g, text: GRUPOS[g], selected: g === o.grupo }))]);
  const servico = el('textarea', { rows: 2 }); servico.value = o.servico || '';
  const cidade = el('input'); cidade.value = o.cidade || '';
  let tipoLocal = o.tipo_local || '';
  const bLocal = (t) => el('button', { type: 'button', class: 'opcao-grande', 'aria-pressed': String(t === tipoLocal), onclick: (ev) => {
    tipoLocal = t;
    ev.currentTarget.parentElement.querySelectorAll('.opcao-grande').forEach((x) => x.setAttribute('aria-pressed', String(x === ev.currentTarget)));
  } }, [el('b', { text: TIPO_LOCAL[t] })]);
  const data = el('input', { type: 'date', value: o.data_servico || '', max: dataLocalISO() });
  const km = el('input', { inputmode: 'numeric', value: o.km ?? '' });
  const hor = el('input', { inputmode: 'decimal', value: o.horimetro ?? '' });
  const b = el('button', { class: 'botao prim', type: 'button', text: 'Salvar correção' });
  b.addEventListener('click', () => fazer(b, 'corrigir', {
    grupo: grupo.value, servico: servico.value, cidade: cidade.value, tipo_local: tipoLocal, data_servico: data.value,
    km: km.value, horimetro: hor.value
  }));
  return bloco('Corrigir', 'Ajusta os dados do lançamento. Pra trocar quem fez o serviço ou as fotos, cancele e lance de novo.', [
    el('label', { class: 'campo' }, [el('span', { text: 'Grupo de peças' }), grupo]),
    el('label', { class: 'campo' }, [el('span', { text: 'Serviço feito' }), servico]),
    el('label', { class: 'campo' }, [el('span', { text: 'Cidade' }), cidade]),
    el('div', { class: 'campo' }, [el('span', { text: 'Tipo de local' }), el('div', { class: 'opcoes-grandes' }, [bLocal('OBRA'), bLocal('GALPAO')])]),
    el('label', { class: 'campo' }, [el('span', { text: 'Data do serviço' }), data]),
    el('label', { class: 'campo' }, [el('span', { text: 'Km' }), km]),
    el('label', { class: 'campo' }, [el('span', { text: 'Horímetro' }), hor]),
    b], 'secundario');
}

// ───────────────────────── histórico do veículo ─────────────────────────

/** Histórico do veículo no modelo da planilha do cliente ("MANUTENÇÃO LOKAL FILIAL"). */
async function telaVeiculo(chassi) {
  conteudo(el('div', { class: 'carregando' }, [el('div', { class: 'giro' }), 'Carregando o histórico…']));
  let d, v;
  try {
    d = await api.listaOS({ chassi });
    v = (await veiculos()).find((x) => x.chassi === chassi);
  } catch (e) { return erroGeral(e); }
  // Só o que já foi feito (ou cancelado) entra no histórico; uma solicitação em aberto não é "serviço feito".
  const historico = d.os.filter((o) => o.status !== 'SOLICITADA')
    .sort((a, b) => ((b.data_servico || b.aberta_em) < (a.data_servico || a.aberta_em) ? -1 : 1));
  const traco = (v) => (v === undefined || v === null || v === '' ? '—' : v);
  const kmHor = (o) => traco([o.km !== null && o.km !== undefined ? fmt.int(o.km) + ' km' : '',
    o.horimetro !== null && o.horimetro !== undefined ? fmt.dec(o.horimetro) + ' h' : ''].filter(Boolean).join(' / '));
  const linha = (o) => el('tr', { class: o.status === 'CANCELADA' ? 'cancelada' : '', onclick: () => { location.hash = 'os/' + o.id; } }, [
    el('td', { 'data-rotulo': 'Data' }, fmt.data(o.data_servico)),
    el('td', { 'data-rotulo': 'Grupo' }, traco(GRUPOS[o.grupo])),
    el('td', { 'data-rotulo': 'Serviço feito' }, traco(o.servico)),
    el('td', { 'data-rotulo': 'Km/hor' }, kmHor(o)),
    el('td', { 'data-rotulo': 'Responsável' }, traco(quemFez(o))),
    el('td', { 'data-rotulo': 'NF' }, traco(o.nf_numero)),
    el('td', { 'data-rotulo': 'Valor' }, o.valor_total ? fmt.reais(o.valor_total) : '—')
  ]);
  const tabela = el('table', { class: 'tabela-hist' }, [
    el('thead', {}, el('tr', {}, ['Data', 'Grupo', 'Serviço feito', 'Km/hor', 'Responsável', 'NF', 'Valor'].map((t) => el('th', { text: t })))),
    el('tbody', {}, historico.map(linha))
  ]);
  conteudo(
    el('div', { class: 'trilha' }, [el('a', { href: '#', text: '← Buscar outra placa' })]),
    el('div', { class: 'cabeca-os' }, [el('h1', { text: v ? v.placa || 'Sem placa' : chassi }),
      el('span', { class: 'tipo', text: v ? [v.tipo, v.modelo, v.ano].filter(Boolean).join(' · ') : '' })]),
    v ? el('p', { class: 'dica', text: `Filial ${v.filial} · ${v.empresa} · chassi ${v.chassi}${v.obra ? ' · obra: ' + v.obra : ''}` }) : null,
    podeLancar(E.u) && v ? el('p', {}, el('a', { class: 'botao prim', href: '#nova/' + encodeURIComponent(chassi), text: '+ Nova OS para este veículo' })) : null,
    historico.length ? tabela : el('div', { class: 'vazio', text: 'Nenhuma OS para este veículo.' }));
}
