// Peças de tela do sistema de OS usadas pela matriz, filiais e mecânicos.
import { el, fmt, botaoTema, guardar } from '../ui.js';
import { GRUPOS, ORDEM_GRUPOS } from '../sistema.js';
import { STATUS, TIPO_LOCAL, MAX_AUXILIARES, pecasDoGrupo, codificarPeca, decodificarPeca, melhorSemaforo,
  pecaTemPosicao, EIXOS, LADOS } from './regras.js';

export const $ = (id) => document.getElementById(id);

export function etiquetaStatus(status) {
  return el('span', { class: 'status s-' + String(status || '').toLowerCase(), text: STATUS[status] || status });
}

/**
 * "Grupo: serviço", pra listas. O formulário de lançamento já prefixa o grupo no texto do serviço (ver
 * atualizarServico em formularioLancamento); sem essa checagem o prefixo duplicaria ("Freios: Freios: Lonas").
 * OS antigas ou corrigidas podem não ter o prefixo no serviço, então ainda adicionamos nesses casos.
 */
export function textoServico(o) {
  const grupo = GRUPOS[o.grupo];
  if (!grupo) return o.servico;
  return o.servico.startsWith(grupo + ':') ? o.servico : grupo + ': ' + o.servico;
}

/** Topo das páginas de OS: marca, botões entre os sistemas, tema e menu do usuário. */
export function montarTopo(u, { titulo = 'Ordens de serviço', extras = [], menuExtras = [] } = {}) {
  guardar('lokal_perfil', u.perfil);
  const menu = el('div', { class: 'usuario-menu', role: 'menu', hidden: true }, [
    el('div', { class: 'quem' }, [el('b', { text: u.nome }), el('small', { text: u.login })]),
    u.perfil !== 'MECANICO' ? el('a', { href: '/painel', role: 'menuitem', text: 'Dashboard' }) : null,
    u.perfil === 'ADMIN' ? el('a', { href: '/usuarios', role: 'menuitem', text: 'Usuários' }) : null,
    ...menuExtras,
    el('a', { href: '/trocar-senha', role: 'menuitem', text: 'Trocar minha senha' }),
    el('a', { href: '/instalar', role: 'menuitem', text: 'Instalar no celular' }),
    el('button', { type: 'button', role: 'menuitem', text: 'Sair', onclick: sair })
  ]);
  const quem = el('button', { class: 'botao fantasma', type: 'button', 'aria-haspopup': 'menu', text: u.nome.split(' ')[0] + ' ▾',
    onclick: (ev) => { ev.stopPropagation(); menu.hidden = !menu.hidden; } });
  document.addEventListener('click', () => { menu.hidden = true; });
  const topo = el('header', { class: 'topo' }, [
    el('a', { class: 'marca', href: u.perfil === 'MECANICO' ? '/os/mecanico' : '/os' }, [
      el('img', { src: '/img/logo.svg', alt: '' }),
      el('div', {}, [el('b', { text: 'LOKAL' }), el('small', { text: titulo })])]),
    el('div', { class: 'estado', id: 'estado' }),
    el('div', { class: 'acoes' }, [
      ...extras,
      u.perfil !== 'MECANICO' ? el('a', { class: 'botao', href: '/painel', title: 'Abrir a dashboard' }, [el('span', { text: '▦' }),
        el('span', { class: 'texto-longo', text: 'Dashboard' })]) : null,
      botaoTema(), el('div', { class: 'usuario' }, [quem, menu])])
  ]);
  document.body.prepend(topo);
}

export async function sair() {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }); } catch { /* sem internet */ }
  guardar('lokal_perfil', '');
  location.replace('/');
}

/** Data de hoje no fuso do aparelho, "YYYY-MM-DD" (nunca em UTC: depois das 21h no Brasil já seria amanhã em UTC). */
export function dataLocalISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function idEnvio() {
  if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

/** Reduz a foto no próprio celular (lado maior 1600 px, JPEG) antes de guardar ou enviar: ~300 KB. */
export async function reduzirFoto(arquivo, lado = 1600, qualidade = 0.72) {
  if (!arquivo || !/^image\//.test(arquivo.type)) throw new Error('Escolha uma foto.');
  let img;
  try {
    img = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    img = await new Promise((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i); i.onerror = () => falha(new Error('Não consegui abrir a foto.'));
      i.src = URL.createObjectURL(arquivo);
    });
  }
  const w = img.width, h = img.height, f = Math.min(1, lado / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * f); c.height = Math.round(h * f);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', qualidade));
  if (!blob) throw new Error('Não consegui preparar a foto.');
  return blob;
}

/** Campo de foto com miniatura: toque abre a câmera traseira; link pequeno abre a galeria. Devolve { caixa, valor() }. */
export function campoFoto(rotulo, { obrigatoria = false } = {}) {
  let blob = null;
  const entradaCam = el('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'escondido' });
  const entradaGaleria = el('input', { type: 'file', accept: 'image/*', class: 'escondido' });
  const mini = el('div', { class: 'mini-foto vazia', text: '📷' });
  const estado = el('small', { text: obrigatoria ? 'obrigatória' : 'opcional' });
  async function processar(f) {
    if (!f) return;
    estado.textContent = 'preparando…';
    try {
      blob = await reduzirFoto(f);
      mini.textContent = '';
      mini.classList.remove('vazia');
      mini.style.backgroundImage = `url(${URL.createObjectURL(blob)})`;
      estado.textContent = 'ok · ' + Math.round(blob.size / 1024) + ' KB · toque para trocar';
    } catch (e) {
      blob = null; estado.textContent = e.message;
    }
  }
  entradaCam.addEventListener('change', () => processar(entradaCam.files[0]));
  entradaGaleria.addEventListener('change', () => processar(entradaGaleria.files[0]));
  const botao = el('button', { type: 'button', class: 'botao foto-botao', onclick: () => entradaCam.click() }, [mini,
    el('span', {}, [el('b', { text: rotulo }), estado])]);
  const galeria = el('button', { type: 'button', class: 'link-galeria', onclick: () => entradaGaleria.click(), text: 'ou escolher da galeria' });
  return { caixa: el('div', { class: 'campo-foto' }, [botao, galeria, entradaCam, entradaGaleria]), valor: () => blob, obrigatoria, rotulo };
}

// Visor de foto em tela cheia, dentro do próprio app (nada de nova aba): o botão de voltar do celular fecha o
// visor em vez de fechar o app, porque abrir empurra um estado extra no histórico e fechar só volta nele.
let fotoAberta = null;

function fecharFotoAberta() {
  if (!fotoAberta) return;
  fotoAberta.overlay.remove();
  window.removeEventListener('popstate', fotoAberta.aoVoltar);
  fotoAberta = null;
}

function abrirFoto(url, rotulo) {
  fecharFotoAberta();
  const overlay = el('div', { class: 'foto-overlay', role: 'dialog', 'aria-label': rotulo }, [
    el('button', { type: 'button', class: 'foto-overlay-fechar', onclick: () => history.back() }, '← Voltar'),
    el('img', { src: url, alt: rotulo })
  ]);
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) history.back(); });
  document.body.appendChild(overlay);
  history.pushState({ lokalFoto: true }, '', location.href);
  const aoVoltar = () => fecharFotoAberta();
  window.addEventListener('popstate', aoVoltar);
  fotoAberta = { overlay, aoVoltar };
}

/** Miniatura de uma foto já guardada. Imagem abre num visor dentro do app; PDF (nota fiscal) abre numa aba nova. */
export function fotoGuardada(caminho, rotulo) {
  if (!caminho) return null;
  const url = '/api/fotos?caminho=' + encodeURIComponent(caminho);
  const pdf = /\.pdf$/i.test(caminho);
  return el('a', { class: 'foto-guardada', href: url, target: pdf ? '_blank' : null, rel: pdf ? 'noopener' : null,
    onclick: pdf ? null : (ev) => { ev.preventDefault(); abrirFoto(url, rotulo); } }, [
    pdf ? el('div', { class: 'mini-foto pdf', text: 'PDF' }) : el('img', { src: url, alt: rotulo, loading: 'lazy' }),
    el('small', { text: rotulo })]);
}

export function registrarServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

export function mensagem(alvo, texto, tipo = 'erro') {
  alvo.className = 'mensagem ' + tipo;
  alvo.textContent = texto;
  alvo.hidden = !texto;
}

/** Busca de veículo por placa, modelo ou final do chassi (datalist). Devolve { caixa, selecionado(), ao(fn) }. */
/**
 * Busca de veículo: dois campos lado a lado, Placa (só os que têm) e Chassi (todos), cada um com sugestão real
 * do cadastro. Devolve { caixa, selecionado(), ao(fn), focar() }.
 */
export function buscaVeiculo(lista, { inicial = null } = {}) {
  const comPlaca = lista.filter((v) => v.placa);
  const idDlPlaca = 'dl-' + idEnvio();
  const dlPlaca = el('datalist', { id: idDlPlaca }, comPlaca.map((v) => el('option', { value: v.placa })));
  const campoPlaca = el('input', { list: idDlPlaca, placeholder: 'Digite a placa', autocomplete: 'off' });

  const idDlChassi = 'dl-' + idEnvio();
  const dlChassi = el('datalist', { id: idDlChassi }, lista.map((v) => el('option', { value: v.chassi })));
  const campoChassi = el('input', { list: idDlChassi, placeholder: 'Digite o chassi', autocomplete: 'off' });

  const cartao = el('div', { class: 'cartao-veiculo', hidden: true });
  let veiculo = null;
  const ouvintes = [];

  function escolherPorPlaca() {
    const v = comPlaca.find((x) => x.placa === campoPlaca.value) ||
      comPlaca.find((x) => x.placa.replace('-', '') === campoPlaca.value.toUpperCase().replace(/[\s-]/g, ''));
    if (v) escolher(v);
  }
  campoPlaca.addEventListener('change', escolherPorPlaca);
  campoPlaca.addEventListener('input', () => { if (comPlaca.some((v) => v.placa === campoPlaca.value)) escolherPorPlaca(); });

  function escolherPorChassi() {
    const v = lista.find((x) => x.chassi === campoChassi.value);
    if (v) escolher(v);
  }
  campoChassi.addEventListener('change', escolherPorChassi);
  campoChassi.addEventListener('input', () => { if (lista.some((v) => v.chassi === campoChassi.value)) escolherPorChassi(); });

  function escolher(v) {
    veiculo = v;
    campoPlaca.value = v.placa || '';
    campoChassi.value = v.chassi || '';
    cartao.replaceChildren(el('div', {}, [el('b', { text: veiculo.placa || 'Sem placa' }), ' · ', veiculo.tipo, ' ', veiculo.modelo]),
      el('small', { text: `Filial ${veiculo.filial} · ${veiculo.empresa || ''} · ano ${veiculo.ano || '—'} · chassi ${veiculo.chassi}` }));
    cartao.hidden = false;
    ouvintes.forEach((fn) => fn(veiculo));
  }
  if (inicial) escolher(inicial);

  return {
    caixa: el('div', { class: 'largo busca-veiculo' }, [
      el('div', { class: 'duas' }, [
        el('label', { class: 'campo' }, [el('span', { text: 'Placa' }), campoPlaca, dlPlaca]),
        el('label', { class: 'campo' }, [el('span', { text: 'Chassi' }), campoChassi, dlChassi])
      ]),
      cartao
    ]),
    selecionado: () => veiculo, ao: (fn) => ouvintes.push(fn), focar: () => campoPlaca.focus()
  };
}

/** Histórico de peças já trocadas no veículo, pro semáforo de garantia. Sem internet ou erro: lista vazia, sem card. */
async function buscarHistoricoPecas(chassi) {
  try {
    const r = await fetch('/api/os?pecas_chassi=' + encodeURIComponent(chassi), { credentials: 'same-origin' });
    if (!r.ok) return [];
    return (await r.json()).pecas || [];
  } catch { return []; }
}

/** Eixo + lado, só pras peças onde isso faz diferença (ver pecaTemPosicao em regras.js). */
function seletorPosicao(aoMudar) {
  const selEixo = el('select', { class: 'peca-eixo' }, [el('option', { value: '', text: 'Eixo' }),
    ...EIXOS.map((e) => el('option', { value: e, text: e }))]);
  const selLado = el('select', { class: 'peca-lado' }, [el('option', { value: '', text: 'Lado' }),
    ...LADOS.map((l) => el('option', { value: l, text: l }))]);
  selEixo.addEventListener('change', aoMudar);
  selLado.addEventListener('change', aoMudar);
  return {
    caixa: el('div', { class: 'peca-posicao', hidden: true }, [selEixo, selLado]),
    selEixo, selLado,
    valor: () => (selEixo.value && selLado.value ? selEixo.value + ' · ' + selLado.value : '')
  };
}

/** Um grupo de peças + as peças marcadas dentro dele (uma "dupla" lançamento pode ter vários desses). */
function blocoGrupoPecas({ obterVeiculo, aoMudar, aoRemover }) {
  const selGrupo = el('select', {}, [el('option', { value: '', text: 'Escolha o grupo de peças' }),
    ...ORDEM_GRUPOS.map((g) => el('option', { value: g, text: GRUPOS[g] }))]);
  const caixaPecas = el('div', { class: 'pecas-grid' });
  let itensPeca = [];
  function redesenhar() {
    const g = selGrupo.value;
    itensPeca = [];
    if (!g) { caixaPecas.replaceChildren(); return; }
    if (g === 'IMP' && !obterVeiculo()) { caixaPecas.replaceChildren(el('p', { class: 'dica', text: 'Escolha o veículo primeiro.' })); return; }
    const veiculo = obterVeiculo();
    const pecas = pecasDoGrupo(g, veiculo && veiculo.tipo);
    if (!pecas.length) { caixaPecas.replaceChildren(el('p', { class: 'dica', text: 'Esse grupo não tem lista — descreva no serviço feito.' })); return; }
    caixaPecas.replaceChildren(...pecas.map((p) => {
      const comPosicao = pecaTemPosicao(g, p);
      const posicao = comPosicao ? seletorPosicao(aoMudar) : null;
      const cb = el('input', { type: 'checkbox', value: p, onchange: () => { if (posicao) posicao.caixa.hidden = !cb.checked; aoMudar(); } });
      itensPeca.push({ peca: p, cb, posicao });
      return el('div', { class: 'peca-linha' }, [el('label', {}, [cb, p]), posicao ? posicao.caixa : null]);
    }));
  }
  selGrupo.addEventListener('change', () => { redesenhar(); aoMudar(); });
  const botaoRemover = el('button', { type: 'button', class: 'botao mini perigo', onclick: aoRemover, text: '✕' });
  // não deixa escolher um grupo já usado em outro bloco da mesma OS — desabilita a opção em vez de escondê-la,
  // pra continuar mostrando todos os 13 grupos como referência.
  function marcarIndisponiveis(usadosEmOutros) {
    [...selGrupo.options].forEach((o) => { o.disabled = !!o.value && o.value !== selGrupo.value && usadosEmOutros.includes(o.value); });
  }
  return {
    linha: el('div', { class: 'bloco-grupo' }, [
      el('div', { class: 'bloco-grupo-topo' }, [el('label', { class: 'campo' }, [el('span', { text: 'Grupo de peças' }), selGrupo]), botaoRemover]),
      caixaPecas]),
    botaoRemover, redesenhar, marcarIndisponiveis,
    // semCatalogo: grupo sem lista de peças (ex.: PNE — pneu é controlado à parte). Nesse caso não tem checkbox
    // pra marcar; o bloco já conta como completo só com o grupo escolhido.
    valor: () => {
      const g = selGrupo.value;
      const veiculo = obterVeiculo();
      const semCatalogo = !!g && !pecasDoGrupo(g, veiculo && veiculo.tipo).length;
      const pecas = itensPeca.filter((it) => it.cb.checked)
        .map((it) => ({ peca: it.peca, posicao: it.posicao ? it.posicao.valor() : '' }));
      return { grupo: g, pecas, semCatalogo };
    }
  };
}

/** Escolha de até `max` auxiliares entre uma lista de mecânicos (checkboxes). */
function escolhaAuxiliares(mecanicos, excluir, max = MAX_AUXILIARES) {
  const caixa = el('div', { class: 'checks auxiliares-grid' }, mecanicos.filter((m) => m.login !== excluir).map((m) =>
    el('label', {}, [el('input', { type: 'checkbox', value: m.login }), m.nome + (m.equipe ? ' · ' + m.equipe : '')])));
  return { caixa, valor: () => [...caixa.querySelectorAll('input:checked')].map((c) => c.value).slice(0, max) };
}

/**
 * Formulário de "lançar OS feita", compartilhado pela matriz/filial (app.js) e pelo mecânico (mecanico.js).
 * perfil MECANICO: execução sempre interna, no nome do próprio (não escolhe). Os demais escolhem interna/externa.
 * `enviar(dados)` recebe os campos já validados no navegador (a validação de verdade é sempre no servidor) e fotos
 * como Blob (quem chama decide se envia na hora ou guarda numa fila offline).
 */
export function formularioLancamento({ u, veiculos, mecanicos = [], oficinas = [], solicitacoesAbertas = [], enviar, veiculoFixo = null }) {
  const busca = veiculoFixo ? null : buscaVeiculo(veiculos);
  let veiculo = veiculoFixo;
  const hoje = dataLocalISO();
  const data = el('input', { type: 'date', value: hoje, max: hoje });
  const servico = el('textarea', { rows: 3, placeholder: 'Ex.: trocar lonas do eixo traseiro' });
  const cidade = el('input', { placeholder: 'Cidade' });

  // grupo(s) de peças: pode lançar mais de um grupo na mesma OS; cada peça marcada entra no texto do serviço.
  const blocosContainer = el('div', { class: 'blocos-grupo' });
  let blocos = [], textoAutoServico = '';
  function atualizarServico() {
    const partes = blocos.map((b) => {
      const v = b.valor();
      if (!v.grupo) return null;
      if (v.semCatalogo) return GRUPOS[v.grupo];
      return v.pecas.length ? GRUPOS[v.grupo] + ': ' + v.pecas.map((p) => p.peca + (p.posicao ? ' (' + p.posicao + ')' : '')).join(', ') : null;
    }).filter(Boolean);
    const novo = partes.join(' | ');
    if (!servico.value.trim() || servico.value === textoAutoServico) servico.value = novo;
    else if (textoAutoServico && servico.value.startsWith(textoAutoServico)) servico.value = novo + servico.value.slice(textoAutoServico.length);
    textoAutoServico = novo;
  }
  function redesenharBlocos() {
    blocos.forEach((b) => { b.botaoRemover.hidden = blocos.length <= 1; });
    blocosContainer.replaceChildren(...blocos.map((b) => b.linha));
  }
  function atualizarGruposDisponiveis() {
    blocos.forEach((b) => b.marcarIndisponiveis(blocos.filter((x) => x !== b).map((x) => x.valor().grupo).filter(Boolean)));
  }
  function criarBloco() {
    const b = blocoGrupoPecas({
      obterVeiculo: () => veiculo,
      aoMudar: () => { atualizarServico(); atualizarSemaforo(); atualizarGruposDisponiveis(); },
      aoRemover: () => { blocos = blocos.filter((x) => x !== b); redesenharBlocos(); atualizarServico(); atualizarSemaforo(); atualizarGruposDisponiveis(); }
    });
    blocos.push(b);
    atualizarGruposDisponiveis();
  }
  criarBloco();
  redesenharBlocos();
  const botaoAddGrupo = el('button', { type: 'button', class: 'botao mini', text: '+ Adicionar outro grupo',
    onclick: () => { criarBloco(); redesenharBlocos(); } });

  // semáforo de garantia: cruza as peças marcadas com o histórico do veículo. Só um card, o mais urgente.
  let historicoPecas = [];
  const caixaSemaforo = el('div', { class: 'semaforo', hidden: true });
  function atualizarSemaforo() {
    const selecionadas = blocos.flatMap((b) => { const v = b.valor(); return v.grupo ? v.pecas.map((p) => ({ grupo: v.grupo, peca: p.peca, posicao: p.posicao })) : []; });
    const melhor = melhorSemaforo(selecionadas, data.value, historicoPecas);
    caixaSemaforo.hidden = !melhor;
    if (!melhor) return;
    caixaSemaforo.className = 'semaforo semaforo-' + melhor.cor;
    caixaSemaforo.replaceChildren(
      el('b', { text: GRUPOS[melhor.grupo] + ' · ' + melhor.peca + (melhor.posicao ? ' · ' + melhor.posicao : '') }),
      el('p', { text: `Manutenção realizada há ${melhor.dias} dia${melhor.dias === 1 ? '' : 's'}. Verificar garantia da peça.` }),
      el('small', { text: 'Em ' + fmt.data(melhor.dataAnterior) }));
  }
  data.addEventListener('change', atualizarSemaforo);
  async function carregarHistoricoPecas(v) {
    historicoPecas = []; atualizarSemaforo(); // some o card velho na hora: evita mostrar o semáforo do veículo anterior
    const pecas = await buscarHistoricoPecas(v.chassi);
    if (veiculo && veiculo.chassi === v.chassi) { historicoPecas = pecas; atualizarSemaforo(); } // troca rápida: ignora resposta fora de ordem
  }
  // o grupo IMP depende do tipo do veículo: se já tinha sido escolhido antes do veículo, refaz a lista de peças
  function aoEscolherVeiculo(v) { veiculo = v; blocos.forEach((b) => b.redesenhar()); }
  let tipoLocal = '';
  const bLocal = (t) => el('button', { type: 'button', class: 'opcao-grande', 'aria-pressed': 'false', onclick: (ev) => {
    tipoLocal = t;
    ev.currentTarget.parentElement.querySelectorAll('.opcao-grande').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget)));
  } }, [el('b', { text: TIPO_LOCAL[t] })]);
  const caixaLocal = el('div', { class: 'opcoes-grandes' }, [bLocal('OBRA'), bLocal('GALPAO')]);

  // quem fez
  let execucao = u.perfil === 'MECANICO' ? 'INTERNA' : '';
  const mecanicoSel = u.perfil !== 'MECANICO'
    ? el('select', {}, [el('option', { value: '', text: 'Escolha o mecânico' }), ...mecanicos.map((m) => el('option', { value: m.login, text: m.nome + (m.equipe ? ' · ' + m.equipe : '') }))])
    : null;
  const aux = escolhaAuxiliares(mecanicos, u.perfil === 'MECANICO' ? u.login : '');
  const oficinaDl = el('datalist', { id: 'dl-oficinas' }, oficinas.map((o) => el('option', { value: o })));
  const oficinaTxt = el('input', { placeholder: 'Nome da concessionária ou oficina', list: 'dl-oficinas' });
  const caixaInterna = el('div', { class: 'equipe' }, [mecanicoSel, el('details', { class: 'ajudantes', open: true }, [
    el('summary', { text: 'Auxiliares (opcional, até ' + MAX_AUXILIARES + ')' }), aux.caixa])]);
  const caixaExterna = el('div', { class: 'largo' }, [el('label', { class: 'campo' }, [el('span', { text: 'Oficina' }), oficinaTxt, oficinaDl])]);
  let caixaQuem;
  if (u.perfil === 'MECANICO') {
    caixaQuem = el('div', { class: 'campo largo' }, [el('span', { text: 'Auxiliares (opcional, até ' + MAX_AUXILIARES + ')' }), aux.caixa]);
  } else {
    const bExec = (t, titulo) => el('button', { type: 'button', class: 'opcao-grande', 'aria-pressed': 'false', onclick: (ev) => {
      execucao = t;
      ev.currentTarget.parentElement.querySelectorAll('.opcao-grande').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget)));
      caixaInterna.hidden = t !== 'INTERNA'; caixaExterna.hidden = t !== 'EXTERNA';
    } }, [el('b', { text: titulo })]);
    caixaInterna.hidden = true; caixaExterna.hidden = true;
    caixaQuem = el('div', { class: 'campo largo' }, [el('span', { text: 'Quem fez o serviço' }),
      el('div', { class: 'opcoes-grandes' }, [bExec('INTERNA', 'Equipe interna'), bExec('EXTERNA', 'Oficina externa')]),
      caixaInterna, caixaExterna]);
  }

  const km = el('input', { inputmode: 'numeric', placeholder: 'ex.: 120500' });
  const hor = el('input', { inputmode: 'decimal', placeholder: 'ex.: 4520' });
  const fFrente = campoFoto('Foto da frente (com a placa)', { obrigatoria: true });
  const fPainel = campoFoto('Foto do painel (km/horímetro)', { obrigatoria: true });
  // Pelo menos 1 das 3 é obrigatória (ver erroLancamento); a 1ª leva o rótulo porque é a que as pessoas preenchem primeiro.
  const fDefeito = [campoFoto('Foto do defeito/serviço 1', { obrigatoria: true }), campoFoto('Foto 2'), campoFoto('Foto 3')];
  const caixaSolicitacao = el('div', { class: 'largo', hidden: true });
  let solicitacaoEscolhida = null;

  const atualizarSolicitacao = (v) => {
    const abertas = solicitacoesAbertas.filter((o) => o.chassi === v.chassi);
    if (!abertas.length) { caixaSolicitacao.hidden = true; solicitacaoEscolhida = null; return; }
    const mais_recente = abertas.sort((a, b) => (a.aberta_em < b.aberta_em ? 1 : -1))[0];
    const dataPt = new Date(mais_recente.aberta_em).toLocaleDateString('pt-BR');
    const check = el('input', { type: 'checkbox', checked: true });
    check.addEventListener('change', () => { solicitacaoEscolhida = check.checked ? mais_recente.id : null; });
    solicitacaoEscolhida = mais_recente.id;
    caixaSolicitacao.replaceChildren(el('label', { class: 'check-grande aviso amarelo' }, [check,
      el('span', { text: 'Este veículo tem uma solicitação de equipe itinerante de ' + dataPt + '. Esta OS atende a ela?' })]));
    caixaSolicitacao.hidden = false;
  };
  if (busca) { busca.ao(atualizarSolicitacao); busca.ao(carregarHistoricoPecas); busca.ao(aoEscolherVeiculo); } else if (veiculoFixo) { atualizarSolicitacao(veiculoFixo); carregarHistoricoPecas(veiculoFixo); }

  const msg = el('div', { class: 'mensagem erro largo', role: 'alert', hidden: true });
  const botaoEnviar = el('button', { class: 'botao prim grande', type: 'submit', text: 'Lançar OS realizada' });

  const form = el('form', { class: 'form-os', novalidate: true }, [
    busca ? busca.caixa : null,
    el('label', { class: 'campo' }, [el('span', { text: 'Data do serviço' }), data]),
    el('label', { class: 'campo' }, [el('span', { text: 'Cidade' }), cidade]),
    el('div', { class: 'largo pecas-semaforo' }, [
      el('div', {}, [blocosContainer, el('p', { class: 'centro' }, botaoAddGrupo),
        el('label', { class: 'campo' }, [el('span', { text: 'Serviço feito' }), servico])]),
      caixaSemaforo
    ]),
    el('div', { class: 'campo largo' }, [el('span', { text: 'Tipo de local' }), caixaLocal]),
    caixaQuem,
    el('label', { class: 'campo' }, [el('span', { text: 'Km' }), km]),
    el('label', { class: 'campo' }, [el('span', { text: 'Horímetro' }), hor]),
    el('p', { class: 'dica largo', text: 'Preencha o km, o horímetro ou os dois.' }),
    caixaSolicitacao,
    el('div', { class: 'campo largo' }, [el('span', { text: 'Fotos (até 5)' }), el('div', { class: 'fotos' }, [fFrente.caixa, fPainel.caixa, ...fDefeito.map((f) => f.caixa)])]),
    msg, el('div', { class: 'largo' }, botaoEnviar)
  ]);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    veiculo = veiculoFixo || (busca && busca.selecionado());
    const defeito = fDefeito.map((f) => f.valor()).filter(Boolean);
    const valoresBlocos = blocos.map((b) => b.valor());
    const faltaPosicao = valoresBlocos.some((v) => v.pecas.some((p) => pecaTemPosicao(v.grupo, p.peca) && !p.posicao));
    const blocosIncompletos = valoresBlocos.some((v) => !v.grupo || (!v.semCatalogo && !v.pecas.length));
    const pecas = valoresBlocos.flatMap((v) => {
      if (!v.grupo) return [];
      if (v.semCatalogo) return [codificarPeca(v.grupo, '')];
      return v.pecas.map((p) => codificarPeca(v.grupo, p.peca, p.posicao));
    });
    const erro = !veiculo ? 'Escolha o veículo.' : !data.value ? 'Informe a data do serviço.' : cidade.value.trim().length < 2 ? 'Informe a cidade.'
      : blocosIncompletos ? 'Escolha o grupo e a(s) peça(s) em cada bloco.' : faltaPosicao ? 'Escolha o eixo e o lado de cada peça marcada.'
        : servico.value.trim().length < 5 ? 'Descreva o serviço feito.'
          : !tipoLocal ? 'Escolha o tipo de local.' : (u.perfil !== 'MECANICO' && !execucao) ? 'Escolha quem fez o serviço.'
          : (execucao === 'INTERNA' && u.perfil !== 'MECANICO' && !mecanicoSel.value) ? 'Escolha o mecânico.'
            : (execucao === 'EXTERNA' && oficinaTxt.value.trim().length < 2) ? 'Informe o nome da oficina.'
              : !fFrente.valor() ? 'Falta a foto da frente.' : !fPainel.valor() ? 'Falta a foto do painel.'
                : !defeito.length ? 'Falta pelo menos 1 foto do defeito ou serviço.' : '';
    if (erro) return mensagem(msg, erro);
    mensagem(msg, '');
    botaoEnviar.disabled = true; botaoEnviar.textContent = 'Enviando…';
    try {
      await enviar({
        chassi: veiculo.chassi, data_servico: data.value, cidade: cidade.value.trim(), pecas, servico: servico.value.trim(),
        tipo_local: tipoLocal, execucao: u.perfil === 'MECANICO' ? 'INTERNA' : execucao,
        mecanico: u.perfil !== 'MECANICO' && execucao === 'INTERNA' ? mecanicoSel.value : undefined,
        oficina_externa: execucao === 'EXTERNA' ? oficinaTxt.value.trim() : undefined,
        auxiliares: aux.valor(), km: km.value, horimetro: hor.value, os_atendida: solicitacaoEscolhida,
        fotoFrente: fFrente.valor(), fotoPainel: fPainel.valor(), fotosDefeito: defeito
      });
    } catch (e) {
      mensagem(msg, e.message);
      botaoEnviar.disabled = false; botaoEnviar.textContent = 'Lançar OS realizada';
    }
  });
  return { form, focar: () => busca && busca.focar() };
}
