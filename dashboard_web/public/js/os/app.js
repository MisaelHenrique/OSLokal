// Sistema de OS: telas da matriz (administrador), das filiais e da diretoria.
// Rotas pela âncora da URL: #lista/<aba>, #nova, #os/<id>, #veiculo/<chassi>.
import { api } from '../api.js';
import { el, fmt } from '../ui.js';
import { GRUPOS, ORDEM_GRUPOS } from '../sistema.js';
import { STATUS, TIPOS, RESULTADOS, ABERTAS, numeroOS, nomeVeiculo, podeAbrir, lerNumero } from './regras.js';
import { $, montarTopo, etiquetaStatus, etiquetaParado, campoFoto, fotoGuardada, idEnvio, registrarServiceWorker, mensagem } from './comum.js';

const E = { u: null, lista: [], nomes: {}, mecanicos: [], veiculos: null, busca: '', carregadoEm: 0 };
const ETAPAS_NOME = {
  ABERTA: 'Aberta', DEVOLVIDA: 'Devolvida à filial', REENVIADA: 'Reenviada à matriz', APROVADA: 'Aprovada',
  DIRECIONADA: 'Direcionada', INICIADA: 'Serviço iniciado', EXECUTADA: 'Executada pelo mecânico', FECHADA: 'Fechada (valores lançados)',
  CANCELADA: 'Cancelada', SERVICO_GERADO: 'OS de serviço gerada'
};

const ABAS = {
  ADMIN: [
    ['aprovar', 'Para aprovar', (o) => o.status === 'AGUARDANDO_APROVACAO'],
    ['programacao', 'Programação', (o) => o.status === 'APROVADA'],
    ['campo', 'Em campo', (o) => ['DIRECIONADA', 'EM_EXECUCAO'].includes(o.status)],
    ['financeiro', 'Lançar valores', (o) => o.status === 'EXECUTADA'],
    ['devolvidas', 'Devolvidas', (o) => o.status === 'DEVOLVIDA'],
    ['fechadas', 'Fechadas', (o) => o.status === 'FECHADA'],
    ['canceladas', 'Canceladas', (o) => o.status === 'CANCELADA'],
    ['todas', 'Todas', () => true]
  ],
  FILIAL: [
    ['andamento', 'Em andamento', (o) => ABERTAS.includes(o.status) && o.status !== 'DEVOLVIDA'],
    ['devolvidas', 'Devolvidas para corrigir', (o) => o.status === 'DEVOLVIDA'],
    ['fechadas', 'Fechadas', (o) => o.status === 'FECHADA'],
    ['canceladas', 'Canceladas', (o) => o.status === 'CANCELADA'],
    ['todas', 'Todas', () => true]
  ],
  DIRETORIA: [
    ['andamento', 'Em andamento', (o) => ABERTAS.includes(o.status)],
    ['fechadas', 'Fechadas', (o) => o.status === 'FECHADA'],
    ['todas', 'Todas', () => true]
  ]
};

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

iniciar();

async function iniciar() {
  let s;
  try { s = await api.sessao(); } catch (e) { return erroGeral(e); }
  E.u = s.usuario;
  if (E.u.perfil === 'MECANICO') return location.replace('/os/mecanico');
  const extras = [
    podeAbrir(E.u) ? el('a', { class: 'botao prim', href: '#nova' }, [el('span', { text: '+' }), el('span', { text: 'Nova OS' })]) : null,
    el('button', { class: 'botao fantasma', type: 'button', title: 'Atualizar', 'aria-label': 'Atualizar', text: '⟳',
      onclick: async () => { await carregar(); rota(); } })
  ];
  montarTopo(E.u, { titulo: E.u.perfil === 'FILIAL' ? 'Ordens de serviço · ' + E.u.filiais.join(', ') : 'Ordens de serviço', extras });
  $('faixa-exemplo').hidden = !(s.modo_local || E.u.exemplo);
  registrarServiceWorker();
  window.addEventListener('hashchange', rota);
  try { await carregar(); } catch (e) { return erroGeral(e); }
  rota();
}

async function carregar() {
  const d = await api.listaOS();
  E.lista = d.os; E.nomes = d.nomes || {}; E.mecanicos = d.mecanicos || []; E.carregadoEm = Date.now();
  $('estado').textContent = E.lista.filter((o) => ABERTAS.includes(o.status)).length + ' OS abertas';
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
  let m = h.match(/^os\/(\d+)$/);
  if (m) return telaOS(Number(m[1]));
  m = h.match(/^veiculo\/(.+)$/);
  if (m) return telaVeiculo(m[1]);
  return telaLista(h.startsWith('lista/') ? h.slice(6) : null);
}

// ───────────────────────── lista ─────────────────────────

function telaLista(abaPedida) {
  const abas = ABAS[E.u.perfil] || ABAS.DIRETORIA;
  const aba = abas.find((a) => a[0] === abaPedida) || abas[0];
  const conta = (f) => E.lista.filter(f).length;
  const abertas = E.lista.filter((o) => ABERTAS.includes(o.status));
  const numeros = el('div', { class: 'numeros os-numeros' }, [
    numero('Aguardando aprovação', conta((o) => o.status === 'AGUARDANDO_APROVACAO')),
    numero('Aprovadas sem mecânico', conta((o) => o.status === 'APROVADA')),
    numero('Com a equipe', conta((o) => ['DIRECIONADA', 'EM_EXECUCAO'].includes(o.status))),
    numero('Aguardando valores', conta((o) => o.status === 'EXECUTADA')),
    numero('Veículos parados', abertas.filter((o) => o.parado && o.status !== 'EXECUTADA').length, 'alerta'),
    numero('Fechadas no mês', conta((o) => o.status === 'FECHADA' && (o.fechada_em || '').slice(0, 7) === new Date().toISOString().slice(0, 7)))
  ]);
  const nav = el('nav', { class: 'abas', role: 'tablist' }, abas.map(([id, rot, f]) => el('button', {
    type: 'button', role: 'tab', 'aria-selected': String(id === aba[0]), onclick: () => { location.hash = 'lista/' + id; }
  }, [rot, ' ', el('span', { class: 'contagem', text: String(conta(f)) })])));
  const busca = el('input', { type: 'search', placeholder: 'Buscar placa, nº da OS, local, mecânico…', value: E.busca, 'aria-label': 'Buscar' });
  const caixa = el('div');
  const desenhar = () => {
    E.busca = busca.value;
    const t = busca.value.trim().toLowerCase();
    const lista = E.lista.filter(aba[2]).filter((o) => !t || [numeroOS(o.id), o.placa, o.veiculo, o.local_servico, o.filial,
      nome(o.direcionada_para), o.sintoma, o.servico].join(' ').toLowerCase().includes(t));
    if (!lista.length) return caixa.replaceChildren(el('div', { class: 'vazio', text: t ? 'Nada encontrado.' : 'Nenhuma OS aqui.' }));
    if (aba[0] === 'programacao') {
      const porLocal = {};
      lista.forEach((o) => { (porLocal[o.local_servico || '—'] = porLocal[o.local_servico || '—'] || []).push(o); });
      return caixa.replaceChildren(...Object.entries(porLocal).sort((a, b) => b[1].length - a[1].length).map(([local, os]) =>
        el('section', { class: 'grupo-local' }, [el('h3', {}, [local, ' ', el('span', { class: 'contagem', text: String(os.length) })]),
          el('div', { class: 'lista-os' }, os.map(linhaOS))])));
    }
    caixa.replaceChildren(el('div', { class: 'lista-os' }, lista.map(linhaOS)));
  };
  busca.addEventListener('input', desenhar);
  desenhar();
  const dica = aba[0] === 'programacao' ? el('p', { class: 'dica', text: 'OS aprovadas esperando mecânico, agrupadas pelo local do serviço, para decidir para onde mandar a equipe.' }) : null;
  conteudo(numeros, nav, el('div', { class: 'ferramentas' }, [busca]), dica, caixa);
}

function numero(rotulo, valor, classe = '') {
  return el('div', { class: 'numero ' + classe }, [el('div', { class: 'rotulo', text: rotulo }), el('div', { class: 'valor', text: fmt.int(valor) })]);
}

function linhaOS(o) {
  const oQue = o.tipo === 'DIAGNOSTICO' ? o.sintoma : (GRUPOS[o.grupo] ? GRUPOS[o.grupo] + ': ' : '') + o.servico;
  const quem = o.direcionada_para ? 'Mecânico: ' + nome(o.direcionada_para) : 'Aberta por ' + nome(o.aberta_por);
  return el('a', { class: 'linha-os' + (o.parado && ABERTAS.includes(o.status) ? ' parado' : ''), href: '#os/' + o.id }, [
    el('div', { class: 'l1' }, [el('b', { text: o.numero }), etiquetaStatus(o.status), el('span', { class: 'tipo', text: TIPOS[o.tipo] }),
      ABERTAS.includes(o.status) ? etiquetaParado(o) : null]),
    el('div', { class: 'l2' }, [el('b', { class: 'placa', text: o.placa || 'sem placa' }), el('span', { text: o.veiculo })]),
    el('div', { class: 'l3', text: oQue }),
    el('div', { class: 'l4' }, [el('span', { text: o.filial + ' · ' + (o.local_servico || '—') }),
      el('span', { text: quem + ' · ' + ha(o.alterado_em || o.aberta_em) })])
  ]);
}

// ───────────────────────── nova OS ─────────────────────────

async function telaNova() {
  if (!podeAbrir(E.u)) { location.hash = ''; return; }
  conteudo(el('div', { class: 'carregando' }, [el('div', { class: 'giro' }), 'Carregando o cadastro de veículos…']));
  let lista;
  try { lista = await veiculos(); } catch (e) { return erroGeral(e); }
  const rotuloV = (v) => [v.placa || 'SEM PLACA', v.tipo, v.modelo, 'chassi …' + v.chassi.slice(-6), v.filial].filter(Boolean).join(' · ');
  const porRotulo = new Map(lista.map((v) => [rotuloV(v), v]));
  const dl = el('datalist', { id: 'lista-veiculos' }, lista.map((v) => el('option', { value: rotuloV(v) })));
  const campoV = el('input', { list: 'lista-veiculos', placeholder: 'Digite a placa, o modelo ou o final do chassi', autocomplete: 'off' });
  const cartaoV = el('div', { class: 'cartao-veiculo', hidden: true });
  let veiculo = null;
  const local = el('input', { placeholder: 'Obra, cidade ou endereço' });
  campoV.addEventListener('change', escolherV);
  campoV.addEventListener('input', () => { if (porRotulo.has(campoV.value)) escolherV(); });
  function escolherV() {
    veiculo = porRotulo.get(campoV.value) || lista.find((v) => v.placa && v.placa.replace('-', '') === campoV.value.toUpperCase().replace(/[\s-]/g, '')) || null;
    if (!veiculo) { cartaoV.hidden = true; return; }
    campoV.value = rotuloV(veiculo);
    const abertas = E.lista.filter((o) => o.chassi === veiculo.chassi && ABERTAS.includes(o.status));
    cartaoV.replaceChildren(
      el('div', {}, [el('b', { text: veiculo.placa || 'Sem placa' }), ' · ', nomeVeiculo(veiculo).split(' · ').slice(1).join(' · ')]),
      el('small', { text: `Filial ${veiculo.filial} · ${veiculo.empresa} · ano ${veiculo.ano || '—'} · chassi ${veiculo.chassi}` }),
      veiculo.obra ? el('small', { text: 'Obra no cadastro: ' + veiculo.obra }) : null,
      abertas.length ? el('div', { class: 'aviso amarelo' }, ['Este veículo já tem ', el('b', { text: abertas.map((o) => o.numero).join(', ') }),
        ' aberta(s). Confira se não é a mesma.']) : null);
    cartaoV.hidden = false;
    if (!local.value) local.value = veiculo.obra || '';
  }
  const tipo = { valor: '' };
  const bTipo = (t, titulo, sub) => el('button', { type: 'button', class: 'opcao-grande', 'aria-pressed': 'false', 'data-t': t,
    onclick: (ev) => { tipo.valor = t; document.querySelectorAll('.opcao-grande').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget))); mostrarTipo(); } },
  [el('b', { text: titulo }), el('small', { text: sub })]);
  const sintoma = el('textarea', { rows: 3, placeholder: 'Ex.: perdendo força na subida, luz de injeção acesa' });
  const grupo = el('select', {}, [el('option', { value: '', text: 'Escolha o grupo de peças' }), ...ORDEM_GRUPOS.map((g) => el('option', { value: g, text: GRUPOS[g] }))]);
  const servico = el('textarea', { rows: 3, placeholder: 'Ex.: trocar lonas do eixo traseiro' });
  const caixaDiag = el('label', { class: 'campo largo', hidden: true }, [el('span', { text: 'Sintoma: o que está acontecendo?' }), sintoma]);
  const caixaServ = el('div', { class: 'largo duas', hidden: true }, [
    el('label', { class: 'campo' }, [el('span', { text: 'Grupo de peças' }), grupo]),
    el('label', { class: 'campo' }, [el('span', { text: 'Serviço a fazer' }), servico])]);
  function mostrarTipo() { caixaDiag.hidden = tipo.valor !== 'DIAGNOSTICO'; caixaServ.hidden = tipo.valor !== 'SERVICO'; }
  const parado = el('input', { type: 'checkbox' });
  const fotos = [campoFoto('Foto 1 do problema', { camera: false }), campoFoto('Foto 2', { camera: false }), campoFoto('Foto 3', { camera: false })];
  const equipe = E.u.perfil === 'ADMIN' ? escolhaEquipe(null, { opcional: true }) : null;
  const msg = el('div', { class: 'mensagem erro largo', role: 'alert', hidden: true });
  const enviar = el('button', { class: 'botao prim grande', type: 'submit', text: E.u.perfil === 'ADMIN' ? 'Abrir OS' : 'Abrir e enviar para a matriz' });

  const form = el('form', { class: 'form-os', novalidate: true }, [
    el('label', { class: 'campo largo' }, [el('span', { text: 'Veículo' }), campoV, dl]), el('div', { class: 'largo' }, cartaoV),
    el('div', { class: 'campo largo' }, [el('span', { text: 'Tipo da OS' }), el('div', { class: 'opcoes-grandes' }, [
      bTipo('DIAGNOSTICO', 'Diagnóstico', 'Não sei o defeito: o mecânico vai avaliar'),
      bTipo('SERVICO', 'Serviço', 'O defeito já é conhecido')])]),
    caixaDiag, caixaServ,
    el('label', { class: 'campo largo' }, [el('span', { text: 'Local do serviço' }), local]),
    el('label', { class: 'check-grande largo' }, [parado, el('span', {}, [el('b', { text: 'Veículo parado' }), el('small', { text: 'Marque se o veículo não pode trabalhar até o conserto. Ele sobe na fila.' })])]),
    el('div', { class: 'campo largo' }, [el('span', { text: 'Fotos do problema (opcional, até 3)' }), el('div', { class: 'fotos' }, fotos.map((f) => f.caixa))]),
    equipe ? el('div', { class: 'campo largo' }, [el('span', { text: 'Mecânico (opcional: pode escolher depois, na Programação)' }), equipe.caixa]) : null,
    msg, el('div', { class: 'largo' }, enviar)
  ]);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erro = !veiculo ? 'Escolha o veículo na lista.' : !tipo.valor ? 'Escolha o tipo: diagnóstico ou serviço.'
      : tipo.valor === 'DIAGNOSTICO' && sintoma.value.trim().length < 5 ? 'Descreva o sintoma.'
        : tipo.valor === 'SERVICO' && !grupo.value ? 'Escolha o grupo de peças.'
          : tipo.valor === 'SERVICO' && servico.value.trim().length < 5 ? 'Descreva o serviço a fazer.'
            : local.value.trim().length < 3 ? 'Informe o local do serviço.' : '';
    if (erro) return mensagem(msg, erro);
    mensagem(msg, '');
    enviar.disabled = true; enviar.textContent = 'Enviando…';
    try {
      const envio = idEnvio(), caminhos = [];
      let n = 0;
      for (const f of fotos) {
        const b = f.valor();
        if (b) caminhos.push((await api.enviarArquivo({ tipo: 'problema', envio, n: ++n }, b)).caminho);
      }
      const { os } = await api.acaoOS('abrir', {
        chassi: veiculo.chassi, tipo: tipo.valor, sintoma: sintoma.value, grupo: grupo.value, servico: servico.value,
        local_servico: local.value, parado: parado.checked, fotos_problema: caminhos, ...(equipe ? equipe.valor() : {})
      });
      await carregar();
      location.hash = 'os/' + os.id;
      setTimeout(() => aviso(os.numero + ' aberta. ' + (os.status === 'AGUARDANDO_APROVACAO' ? 'Agora aguarda a aprovação da matriz.' : '')), 50);
    } catch (e) {
      mensagem(msg, e.message);
      enviar.disabled = false; enviar.textContent = 'Tentar de novo';
    }
  });
  conteudo(el('div', { class: 'trilha' }, [el('a', { href: '#', text: '← Ordens de serviço' })]),
    el('section', { class: 'cartao' }, [el('div', { class: 'cartao-topo' }, [el('div', {}, [el('h2', { text: 'Nova OS' }),
      el('p', { text: E.u.perfil === 'ADMIN' ? 'Aberta pela matriz, a OS já nasce aprovada.' : 'A OS vai para a matriz aprovar e direcionar à equipe de manutenção.' })])]), form]));
  campoV.focus();
}

/** Escolha de mecânico responsável + ajudantes (só a matriz). */
function escolhaEquipe(os, { opcional = false } = {}) {
  const sel = el('select', {}, [el('option', { value: '', text: opcional ? 'Escolher depois' : 'Escolha o mecânico' }),
    ...E.mecanicos.map((m) => el('option', { value: m.login, text: m.nome + (m.equipe ? ' · ' + m.equipe : ''), selected: os && os.direcionada_para === m.login }))]);
  const ajud = el('details', { class: 'ajudantes' }, [el('summary', { text: 'Ajudantes (opcional)' }),
    el('div', { class: 'checks' }, E.mecanicos.map((m) => el('label', {}, [
      el('input', { type: 'checkbox', value: m.login, checked: !!os && (os.ajudantes || []).includes(m.login) }), m.nome])))]);
  if (os && (os.ajudantes || []).length) ajud.open = true;
  return {
    caixa: el('div', { class: 'equipe' }, [sel, ajud]),
    valor: () => ({ mecanico: sel.value, ajudantes: [...ajud.querySelectorAll('input:checked')].map((c) => c.value).filter((l) => l !== sel.value) })
  };
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
    ['Placa', o.placa || 'sem placa'], ['Veículo', o.veiculo], ['Filial (na abertura)', o.filial], ['Local do serviço', o.local_servico],
    ['Chassi', el('a', { href: '#veiculo/' + encodeURIComponent(o.chassi), text: o.chassi + ' · histórico do veículo' })]])]));
  secoes.push(cartao(o.tipo === 'DIAGNOSTICO' ? 'Pedido: diagnóstico' : 'Pedido: serviço', [dl([
    ['Sintoma', o.sintoma], ['Grupo de peças', GRUPOS[o.grupo]], ['Serviço a fazer', o.servico],
    ['Aberta por', nome(o.aberta_por) + ' · ' + fmt.dataHora(local(o.aberta_em))],
    ['Aprovada por', o.aprovada_por ? nome(o.aprovada_por) + ' · ' + fmt.dataHora(local(o.aprovada_em)) : ''],
    ['Devolvida', o.status === 'DEVOLVIDA' ? o.devolucao_motivo : ''],
    ['Cancelada', o.status === 'CANCELADA' ? nome(o.cancelada_por) + ': ' + o.cancelamento_motivo : '']]),
  (o.fotos_problema || []).length ? el('div', { class: 'fotos' }, o.fotos_problema.map((c, i) => fotoGuardada(c, 'Problema ' + (i + 1)))) : null]));
  if (o.direcionada_para) {
    secoes.push(cartao('Execução', [dl([
      ['Mecânico responsável', nome(o.direcionada_para)], ['Ajudantes', (o.ajudantes || []).map(nome).join(', ')],
      ['Direcionada', o.direcionada_em ? nome(o.direcionada_por) + ' · ' + fmt.dataHora(local(o.direcionada_em)) : ''],
      ['Início', fmt.dataHora(local(o.iniciada_em))], ['Fechamento do mecânico', o.executada_em ? fmt.dataHora(local(o.executada_em)) : ''],
      ['Chegou ao sistema', o.recebida_em && Math.abs(Date.parse(o.recebida_em) - Date.parse(o.executada_em)) > 15 * 60000 ? fmt.dataHora(local(o.recebida_em)) + ' (fechada sem internet)' : ''],
      ['Km', o.km !== null && o.km !== undefined ? fmt.int(o.km) : ''], ['Horímetro', o.horimetro !== null && o.horimetro !== undefined ? fmt.dec(o.horimetro) : ''],
      ['Resultado', RESULTADOS[o.resultado]], ['Defeito encontrado', o.defeito_encontrado]]),
    el('div', { class: 'fotos' }, [fotoGuardada(o.foto_placa, 'Placa'), fotoGuardada(o.foto_servico, 'Serviço'),
      fotoGuardada(o.foto_km, 'Painel (km)'), fotoGuardada(o.foto_horimetro, 'Horímetro')])]));
  }
  if ('valor_total' in o && o.status === 'FECHADA') {
    secoes.push(cartao('Valores e nota fiscal', [dl([
      ['Peças', fmt.reais(o.valor_pecas)], ['Mão de obra', fmt.reais(o.valor_mao_obra)],
      ['Deslocamento / diária', o.valor_deslocamento ? fmt.reais(o.valor_deslocamento) : ''],
      ['Total', el('b', { text: fmt.reais(o.valor_total) })], ['Nota fiscal', o.nf_numero], ['Fornecedor', o.fornecedor],
      ['Lançado por', nome(o.fechada_por) + ' · ' + fmt.dataHora(local(o.fechada_em))]]),
    o.nf_arquivo ? el('div', { class: 'fotos' }, fotoGuardada(o.nf_arquivo, 'Arquivo da nota')) : null]));
  }
  const ligadas = (d.ligadas || []).map((l) => el('a', { class: 'botao', href: '#os/' + l.id }, [
    l.id === o.os_origem ? 'Veio do diagnóstico ' : 'OS de serviço gerada: ', el('b', { text: l.numero }), ' · ', STATUS[l.status]]));
  const tempo = el('ol', { class: 'linha-tempo' }, d.eventos.map((e) => el('li', {}, [
    el('b', { text: ETAPAS_NOME[e.etapa] || e.etapa }), el('span', { text: ' · ' + nome(e.por) + ' · ' + fmt.dataHora(local(e.em)) }),
    e.obs ? el('div', { class: 'obs', text: e.etapa === 'DIRECIONADA' ? 'para ' + nome(e.obs) : e.obs }) : null])));
  const acoes = formularioAcoes(o);
  conteudo(
    el('div', { class: 'trilha' }, [el('a', { href: '#', text: '← Ordens de serviço' })]),
    el('div', { class: 'cabeca-os' }, [el('h1', { text: o.numero }), etiquetaStatus(o.status), el('span', { class: 'tipo', text: TIPOS[o.tipo] }),
      ABERTAS.includes(o.status) ? etiquetaParado(o) : null]),
    ligadas.length ? el('div', { class: 'ligadas' }, ligadas) : null,
    acoes,
    el('div', { class: 'grade-os' }, secoes),
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
      if (acao === 'gerar_servico') { location.hash = 'os/' + r.os.id; return; }
      await telaOS(r.os.id);
      aviso(r.os.numero + ': ' + STATUS[r.os.status].toLowerCase() + '.');
    } catch (e) {
      mensagem(msg, e.message);
      botao.disabled = false;
    }
  };
  const blocos = [];
  const motivo = (ph) => el('textarea', { rows: 2, placeholder: ph });

  if (a.includes('aprovar')) {
    const eq = escolhaEquipe(o, { opcional: true });
    const b = el('button', { class: 'botao prim grande', type: 'button', text: 'Aprovar' });
    b.addEventListener('click', () => fazer(b, 'aprovar', eq.valor()));
    blocos.push(bloco('Aprovar', 'Aprove e, se já souber, escolha o mecânico. Sem mecânico, a OS vai para a Programação.', [eq.caixa, b]));
  }
  if (a.includes('direcionar')) {
    const eq = escolhaEquipe(o);
    const b = el('button', { class: 'botao prim grande', type: 'button', text: o.direcionada_para ? 'Trocar mecânico' : 'Direcionar' });
    b.addEventListener('click', () => { const v = eq.valor(); if (!v.mecanico) return mensagem(msg, 'Escolha o mecânico.'); fazer(b, 'direcionar', v); });
    blocos.push(bloco(o.direcionada_para ? 'Mecânico' : 'Direcionar para a equipe', o.status === 'EM_EXECUCAO'
      ? 'O serviço já começou. Trocar o mecânico tira a OS da lista dele.' : 'A OS aparece na lista do mecânico escolhido, também sem internet.', [eq.caixa, b]));
  }
  if (a.includes('financeiro')) blocos.push(blocoFinanceiro(o, fazer, msg));
  if (a.includes('gerar_servico')) {
    const g = el('select', {}, [el('option', { value: '', text: 'Grupo de peças' }), ...ORDEM_GRUPOS.map((x) => el('option', { value: x, text: GRUPOS[x] }))]);
    const s = el('textarea', { rows: 2 });
    s.value = o.defeito_encontrado || '';
    const eq = escolhaEquipe(null, { opcional: true });
    const b = el('button', { class: 'botao prim grande', type: 'button', text: 'Gerar OS de serviço' });
    b.addEventListener('click', () => fazer(b, 'gerar_servico', { grupo: g.value, servico: s.value, ...eq.valor() }));
    blocos.push(bloco('O diagnóstico pediu serviço', 'Gera uma OS de serviço ligada a esta, já aprovada, com o mesmo veículo e local.', [
      el('label', { class: 'campo' }, [el('span', { text: 'Grupo de peças' }), g]), el('label', { class: 'campo' }, [el('span', { text: 'Serviço a fazer' }), s]),
      el('div', { class: 'campo' }, [el('span', { text: 'Mecânico (opcional)' }), eq.caixa]), b]));
  }
  if (a.includes('reenviar')) blocos.push(blocoReenviar(o, fazer));
  if (a.includes('devolver')) {
    const m = motivo('O que a filial precisa corrigir?');
    const b = el('button', { class: 'botao', type: 'button', text: 'Devolver à filial' });
    b.addEventListener('click', () => fazer(b, 'devolver', { motivo: m.value }));
    blocos.push(bloco('Devolver', '', [m, b], 'secundario'));
  }
  if (a.includes('cancelar')) {
    const m = motivo('Motivo do cancelamento');
    const b = el('button', { class: 'botao perigo', type: 'button', text: 'Cancelar OS' });
    b.addEventListener('click', () => fazer(b, 'cancelar', { motivo: m.value }));
    blocos.push(bloco('Cancelar', '', [m, b], 'secundario'));
  }
  return el('section', { class: 'cartao acoes-os' }, [el('div', { class: 'cartao-topo' }, el('h2', { text: 'O que fazer agora' })), msg, el('div', { class: 'blocos' }, blocos)]);
}

function bloco(titulo, texto, filhos, classe = '') {
  return el('div', { class: 'bloco ' + classe }, [el('h3', { text: titulo }), texto ? el('p', { class: 'dica', text: texto }) : null, ...filhos]);
}

function blocoFinanceiro(o, fazer, msg) {
  const campo = (rot, ph = '0,00') => { const i = el('input', { inputmode: 'decimal', placeholder: ph }); return [i, el('label', { class: 'campo' }, [el('span', { text: rot }), i])]; };
  const [pecas, cP] = campo('Peças (R$)'), [mao, cM] = campo('Mão de obra (R$)'), [desl, cD] = campo('Deslocamento / diária (R$, opcional)');
  const [nf, cN] = campo('Número da nota fiscal', 'ex.: 1234'), [forn, cF] = campo('Fornecedor', 'ex.: Auto Peças Caetité');
  const total = el('div', { class: 'total', text: 'Total: —' });
  const somar = () => {
    const v = [pecas, mao, desl].map((i) => lerNumero(i.value)).map((n) => (Number.isFinite(n) ? n : 0));
    total.textContent = 'Total: ' + fmt.reais(v[0] + v[1] + v[2]);
  };
  [pecas, mao, desl].forEach((i) => i.addEventListener('input', somar));
  const arq = el('input', { type: 'file', accept: 'application/pdf,image/*' });
  const b = el('button', { class: 'botao prim grande', type: 'button', text: 'Lançar valores e fechar a OS' });
  b.addEventListener('click', async () => {
    let caminho = '';
    const f = arq.files[0];
    if (f) {
      if (f.size > 4 * 1024 * 1024) return mensagem(msg, 'O arquivo da nota passa de 4 MB. Envie uma foto ou um PDF menor.');
      try {
        b.disabled = true; b.textContent = 'Enviando a nota…';
        caminho = (await api.enviarArquivo({ tipo: 'nf', os: o.id, envio: idEnvio() }, f)).caminho;
      } catch (e) { b.disabled = false; b.textContent = 'Lançar valores e fechar a OS'; return mensagem(msg, e.message); }
      b.textContent = 'Lançar valores e fechar a OS';
    }
    fazer(b, 'financeiro', { valor_pecas: pecas.value, valor_mao_obra: mao.value, valor_deslocamento: desl.value, nf_numero: nf.value,
      fornecedor: forn.value, nf_arquivo: caminho });
  });
  return bloco('Valores e nota fiscal', 'O mecânico já fechou. Lance os valores para fechar a OS. Aceita 1.765,44.', [
    el('div', { class: 'tres' }, [cP, cM, cD]), el('div', { class: 'tres' }, [cN, cF,
      el('label', { class: 'campo' }, [el('span', { text: 'Arquivo da nota (PDF ou foto, opcional)' }), arq])]), total, b]);
}

function blocoReenviar(o, fazer) {
  const local = el('input', { value: o.local_servico });
  const texto = el('textarea', { rows: 3 });
  texto.value = o.tipo === 'DIAGNOSTICO' ? o.sintoma : o.servico;
  const parado = el('input', { type: 'checkbox', checked: !!o.parado });
  const b = el('button', { class: 'botao prim grande', type: 'button', text: 'Corrigir e reenviar à matriz' });
  b.addEventListener('click', () => fazer(b, 'reenviar', {
    local_servico: local.value, parado: parado.checked, ...(o.tipo === 'DIAGNOSTICO' ? { sintoma: texto.value } : { servico: texto.value })
  }));
  return bloco('Corrigir e reenviar', 'A matriz pediu: ' + (o.devolucao_motivo || '—'), [
    el('label', { class: 'campo' }, [el('span', { text: o.tipo === 'DIAGNOSTICO' ? 'Sintoma' : 'Serviço a fazer' }), texto]),
    el('label', { class: 'campo' }, [el('span', { text: 'Local do serviço' }), local]),
    el('label', { class: 'checks' }, [parado, 'Veículo parado']), b]);
}

// ───────────────────────── histórico do veículo ─────────────────────────

async function telaVeiculo(chassi) {
  conteudo(el('div', { class: 'carregando' }, [el('div', { class: 'giro' }), 'Carregando o histórico…']));
  let d, v;
  try {
    d = await api.listaOS({ chassi });
    v = (await veiculos()).find((x) => x.chassi === chassi);
  } catch (e) { return erroGeral(e); }
  const fechadas = d.os.filter((o) => o.status === 'FECHADA');
  const gasto = fechadas.reduce((s, o) => s + (Number(o.valor_total) || 0), 0);
  const leituras = d.os.filter((o) => o.executada_em).sort((a, b) => (a.executada_em < b.executada_em ? 1 : -1));
  const ultimoKm = leituras.find((o) => o.km !== null && o.km !== undefined);
  const veVal = fechadas.some((o) => 'valor_total' in o);
  conteudo(
    el('div', { class: 'trilha' }, [el('a', { href: '#', text: '← Ordens de serviço' })]),
    el('div', { class: 'cabeca-os' }, [el('h1', { text: v ? v.placa || 'Sem placa' : chassi }), el('span', { class: 'tipo', text: v ? nomeVeiculo(v).split(' · ').slice(1).join(' · ') : '' })]),
    v ? el('p', { class: 'dica', text: `Filial ${v.filial} · ${v.empresa} · ano ${v.ano || '—'} · chassi ${v.chassi}${v.obra ? ' · obra: ' + v.obra : ''}` }) : null,
    el('div', { class: 'numeros os-numeros' }, [numero('OS no total', d.os.length), numero('Abertas', d.os.filter((o) => ABERTAS.includes(o.status)).length),
      numero('Fechadas', fechadas.length), veVal ? el('div', { class: 'numero' }, [el('div', { class: 'rotulo', text: 'Gasto (OS fechadas)' }), el('div', { class: 'valor', text: fmt.reais(gasto) })]) : null,
      ultimoKm ? numero('Último km registrado', Number(ultimoKm.km)) : null]),
    podeAbrir(E.u) && v ? el('p', {}, el('a', { class: 'botao prim', href: '#nova', text: '+ Nova OS para este veículo',
      onclick: () => setTimeout(() => { const i = document.querySelector('input[list="lista-veiculos"]'); if (i) { i.value = [...document.querySelectorAll('#lista-veiculos option')].map((op) => op.value).find((x) => x.includes(chassi.slice(-6))) || ''; i.dispatchEvent(new Event('change')); } }, 400) })) : null,
    d.os.length ? el('div', { class: 'lista-os' }, d.os.map(linhaOS)) : el('div', { class: 'vazio', text: 'Nenhuma OS para este veículo.' }));
}
