// Tela do mecânico: lista das OS direcionadas a ele, início do serviço e fechamento com km/horímetro e fotos.
// Funciona sem internet: a lista fica guardada no celular e o fechamento entra numa fila (fila.js) que é enviada
// sozinha quando o sinal volta. Rotas: #os/<id>, #fechar/<id>.
import { el, fmt } from '../ui.js';
import { GRUPOS } from '../sistema.js';
import { TIPOS, RESULTADOS, numeroOS, lerNumero } from './regras.js';
import { $, montarTopo, etiquetaParado, campoFoto, idEnvio, registrarServiceWorker, mensagem, fotoGuardada } from './comum.js';

const Fila = self.LokalFila;
const E = { u: null, lista: [], leituras: {}, fila: [], locais: {}, atualizadoEm: null, semSessao: false };
const conteudo = (...f) => $('conteudo').replaceChildren(...f.flat().filter(Boolean));

iniciar();

async function iniciar() {
  registrarServiceWorker();
  const [cacheLista, cacheU, locais] = await Promise.all([Fila.lerCache('lista'), Fila.lerCache('usuario'), Fila.lerCache('locais')]).catch(() => []);
  E.locais = locais || {};
  if (cacheLista) Object.assign(E, { lista: cacheLista.os, leituras: cacheLista.leituras || {}, atualizadoEm: cacheLista.em });
  let u = null;
  try {
    const r = await fetch('/api/sessao', { credentials: 'same-origin' });
    if (r.status === 401) E.semSessao = true;
    else if (r.status === 403) return location.replace('/trocar-senha');
    else if (r.ok) {
      const s = await r.json();
      u = s.usuario;
      $('faixa-exemplo').hidden = !(s.modo_local || u.exemplo);
      await Fila.guardarCache('usuario', u);
    }
  } catch { /* sem internet */ }
  if (E.semSessao) {
    const pend = (await Fila.listar()).length;
    if (!pend) return location.replace('/?voltar=/os/mecanico');
    u = cacheU;
  }
  u = u || cacheU;
  if (!u) {
    return conteudo(el('div', { class: 'aviso vermelho', text: 'Sem internet e ainda sem dados guardados neste celular. Abra o app uma vez com internet.' }));
  }
  if (u.perfil !== 'MECANICO') return location.replace('/os');
  E.u = u;
  montarTopo(u, { titulo: 'Minhas OS' });
  window.addEventListener('hashchange', desenhar);
  window.addEventListener('online', () => { conexao(); enviar(); });
  window.addEventListener('offline', conexao);
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (ev) => { if (ev.data && ev.data.tipo === 'fila') depoisDeEnviar(ev.data); });
  if (!E.semSessao) {
    // voltou a entrar: o que esperava login volta para a fila
    for (const i of await Fila.listar()) if (i.estado === 'login') { i.estado = 'pendente'; await Fila.atualizar(i); }
  }
  await lerFila();
  desenhar();
  await atualizarLista();
  enviar();
}

async function lerFila() { E.fila = await Fila.listar(); conexao(); }

async function atualizarLista() {
  if (E.semSessao || !navigator.onLine) return;
  try {
    const r = await fetch('/api/os', { credentials: 'same-origin' });
    if (r.status === 401) { E.semSessao = true; conexao(); return; }
    if (!r.ok) return;
    const d = await r.json();
    Object.assign(E, { lista: d.os, leituras: d.leituras || {}, atualizadoEm: d.agora });
    await Fila.guardarCache('lista', { os: d.os, leituras: d.leituras, em: d.agora });
    desenhar();
  } catch { /* sem internet: fica a lista guardada */ }
}

async function enviar() {
  await lerFila();
  if (!E.fila.some((i) => i.estado === 'pendente')) return;
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg && reg.sync) await reg.sync.register('enviar-fechamentos');   // Android: envia mesmo com o app fechado
  } catch { /* sem Background Sync (iPhone): envia quando o app estiver aberto */ }
  if (!navigator.onLine || E.semSessao) return;
  depoisDeEnviar(await Fila.processar());
}

async function depoisDeEnviar(r) {
  if (r.precisaLogin) E.semSessao = true;
  await lerFila();
  if (r.enviados) {
    aviso(r.enviados === 1 ? 'Fechamento enviado para a matriz.' : r.enviados + ' fechamentos enviados para a matriz.');
    await atualizarLista();
  }
  desenhar();
}

function conexao() {
  const c = $('conexao');
  const pend = E.fila.filter((i) => i.estado !== 'erro').length;
  const partes = [];
  if (!navigator.onLine) partes.push(el('b', { text: 'Sem internet.' }), ' Pode fechar as OS normalmente: fica guardado no celular. ');
  if (E.semSessao) partes.push(el('b', { text: 'Seu login venceu. ' }), el('a', { href: '/?voltar=/os/mecanico', text: 'Entrar de novo' }), ' para enviar. ');
  if (pend) {
    partes.push(pend + (pend === 1 ? ' fechamento aguardando envio. ' : ' fechamentos aguardando envio. '));
    if (navigator.onLine && !E.semSessao) partes.push(el('button', { class: 'botao mini', type: 'button', text: 'Enviar agora', onclick: enviar }));
  }
  c.replaceChildren(...partes);
  c.hidden = !partes.length;
  c.className = 'conexao' + (!navigator.onLine || E.semSessao ? ' fora' : '');
}

function aviso(texto) {
  const a = el('div', { class: 'toast', role: 'status', text: texto });
  document.body.appendChild(a);
  setTimeout(() => a.remove(), 5000);
}

const naFila = (id) => E.fila.find((i) => i.os_id === id);
const responsavel = (o) => o.direcionada_para === E.u.login;
const oQue = (o) => (o.tipo === 'DIAGNOSTICO' ? 'Avaliar: ' + o.sintoma : (GRUPOS[o.grupo] ? GRUPOS[o.grupo] + ': ' : '') + o.servico);

function desenhar() {
  if (!E.u) return;
  conexao();
  const h = location.hash.slice(1);
  let m = h.match(/^os\/(\d+)$/);
  if (m) return telaOS(Number(m[1]));
  m = h.match(/^fechar\/(\d+)$/);
  if (m) return telaFechar(Number(m[1]));
  telaLista();
}

function telaLista() {
  const fazer = E.lista.filter((o) => ['DIRECIONADA', 'EM_EXECUCAO'].includes(o.status) && !naFila(o.id))
    .sort((a, b) => (b.parado - a.parado) || (a.direcionada_em < b.direcionada_em ? -1 : 1));
  const guardadas = E.fila.map((i) => ({ i, o: E.lista.find((o) => o.id === i.os_id) || { id: i.os_id, ...(i.resumo || {}) } }));
  const feitas = E.lista.filter((o) => ['EXECUTADA', 'FECHADA'].includes(o.status) && !naFila(o.id))
    .sort((a, b) => (a.executada_em < b.executada_em ? 1 : -1)).slice(0, 15);
  conteudo(
    el('h1', { class: 'titulo-mec', text: 'Para fazer' }),
    fazer.length ? el('div', { class: 'lista-mec' }, fazer.map(cartaoOS)) : el('div', { class: 'vazio', text: 'Nenhuma OS com você agora.' }),
    guardadas.length ? el('h2', { class: 'titulo-mec', text: 'Fechadas neste celular' }) : null,
    guardadas.length ? el('div', { class: 'lista-mec' }, guardadas.map(({ i, o }) => cartaoFila(i, o))) : null,
    feitas.length ? el('h2', { class: 'titulo-mec', text: 'Feitas recentemente' }) : null,
    feitas.length ? el('div', { class: 'lista-mec' }, feitas.map(cartaoOS)) : null,
    el('p', { class: 'dica centro', text: E.atualizadoEm ? 'Lista atualizada em ' + quando(E.atualizadoEm) + '.' : '' }),
    el('p', { class: 'centro' }, el('button', { class: 'botao', type: 'button', text: '⟳ Atualizar lista', onclick: async () => { await atualizarLista(); await enviar(); desenhar(); } })));
}

function quando(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function cartaoOS(o) {
  const iniciada = o.status === 'EM_EXECUCAO' || (E.locais[o.id] && E.locais[o.id].iniciada_em);
  const situacao = ['EXECUTADA', 'FECHADA'].includes(o.status) ? 'Enviada ✓' : iniciada ? 'Em execução' : 'Nova';
  return el('a', { class: 'cartao-mec' + (o.parado && !['EXECUTADA', 'FECHADA'].includes(o.status) ? ' parado' : ''), href: '#os/' + o.id }, [
    el('div', { class: 'l1' }, [el('span', { class: 'placa-grande', text: o.placa || 'sem placa' }), el('span', { class: 'situacao', text: situacao })]),
    el('div', { class: 'l2', text: o.veiculo }),
    el('div', { class: 'l3', text: oQue(o) }),
    el('div', { class: 'l4' }, [el('span', { text: '📍 ' + (o.local_servico || '—') }), etiquetaParado(o),
      !responsavel(o) ? el('span', { class: 'status', text: 'Você é ajudante' }) : null, el('span', { class: 'num', text: numeroOS(o.id) })])
  ]);
}

function cartaoFila(i, o) {
  const erro = i.estado === 'erro';
  const desc = erro ? 'Não foi aceito: ' + i.erro : i.estado === 'login' ? 'Aguardando você entrar de novo para enviar.'
    : navigator.onLine ? 'Enviando…' : 'Guardado no celular. Será enviado quando tiver internet.';
  return el('div', { class: 'cartao-mec' + (erro ? ' erro' : ' guardado') }, [
    el('div', { class: 'l1' }, [el('span', { class: 'placa-grande', text: o.placa || numeroOS(o.id) }),
      el('span', { class: 'situacao', text: erro ? 'Com problema' : 'Aguardando envio' })]),
    el('div', { class: 'l3', text: desc }),
    el('div', { class: 'l4' }, [el('span', { text: 'Fechada em ' + quando(i.dados.executada_em) }), el('span', { class: 'num', text: numeroOS(o.id) })]),
    erro ? el('div', { class: 'botoes' }, [
      el('button', { class: 'botao', type: 'button', text: 'Tentar de novo', onclick: async () => { i.estado = 'pendente'; i.erro = ''; await Fila.atualizar(i); await enviar(); desenhar(); } }),
      botaoConfirmar('Descartar', 'Toque de novo para descartar', async () => { await Fila.remover(i.id); await lerFila(); desenhar(); })]) : null
  ]);
}

function botaoConfirmar(texto, confirmar, acao) {
  let armado = false;
  const b = el('button', { class: 'botao perigo', type: 'button', text: texto });
  b.addEventListener('click', () => {
    if (!armado) { armado = true; b.textContent = confirmar; setTimeout(() => { armado = false; b.textContent = texto; }, 4000); return; }
    acao();
  });
  return b;
}

function telaOS(id) {
  const o = E.lista.find((x) => x.id === id);
  if (!o) return conteudo(voltar(), el('div', { class: 'aviso amarelo', text: 'Esta OS não está mais na sua lista.' }));
  const i = naFila(id);
  const iniciada = o.status === 'EM_EXECUCAO' || (E.locais[id] && E.locais[id].iniciada_em);
  const pode = responsavel(o) && ['DIRECIONADA', 'EM_EXECUCAO'].includes(o.status) && !i;
  const linha = (k, v) => (v ? [el('dt', { text: k }), el('dd', { text: v })] : []);
  const msg = el('div', { class: 'mensagem erro', hidden: true });
  const bIniciar = pode && !iniciada ? el('button', { class: 'botao grande', type: 'button', text: '▶ Iniciar serviço', onclick: () => iniciar_(o, bIniciar, msg) }) : null;
  conteudo(voltar(),
    el('div', { class: 'cabeca-os' }, [el('h1', { class: 'placa-grande', text: o.placa || 'sem placa' }), etiquetaParado(o)]),
    el('p', { class: 'dica', text: numeroOS(o.id) + ' · ' + TIPOS[o.tipo] + ' · ' + o.veiculo }),
    el('section', { class: 'cartao' }, [el('dl', { class: 'dados' }, [
      ...linha('O que fazer', oQue(o)), ...linha('Local', o.local_servico), ...linha('Filial', o.filial),
      ...linha('Responsável', responsavel(o) ? 'Você' : o.direcionada_para), ...linha('Ajudantes', (o.ajudantes || []).join(', ')),
      ...linha('Iniciado', iniciada ? quando(o.iniciada_em || E.locais[id].iniciada_em) : ''),
      ...linha('Último km', E.leituras[o.chassi] && E.leituras[o.chassi].km !== undefined ? fmt.int(E.leituras[o.chassi].km) : ''),
      ...linha('Último horímetro', E.leituras[o.chassi] && E.leituras[o.chassi].horimetro !== undefined ? fmt.dec(E.leituras[o.chassi].horimetro) : '')]),
    navigator.onLine && (o.fotos_problema || []).length ? el('div', { class: 'fotos' }, o.fotos_problema.map((c, n) => fotoGuardada(c, 'Problema ' + (n + 1)))) : null]),
    i ? el('div', { class: 'aviso amarelo', text: 'Você já fechou esta OS neste celular. Aguardando envio.' }) : null,
    msg,
    pode ? el('div', { class: 'botoes-grandes' }, [bIniciar, el('a', { class: 'botao prim grande', href: '#fechar/' + id, text: '✓ Fechar OS' })]) : null,
    !responsavel(o) && ['DIRECIONADA', 'EM_EXECUCAO'].includes(o.status) ? el('p', { class: 'dica', text: 'Você é ajudante nesta OS. Quem fecha é o responsável.' }) : null);
}

async function iniciar_(o, b, msg) {
  b.disabled = true;
  const marcarLocal = async () => {
    E.locais[o.id] = { iniciada_em: new Date().toISOString() };
    await Fila.guardarCache('locais', E.locais);
    desenhar();
  };
  if (!navigator.onLine) return marcarLocal();
  try {
    const r = await fetch('/api/os', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'iniciar', id: o.id }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { Object.assign(o, d.os); await Fila.guardarCache('lista', { os: E.lista, leituras: E.leituras, em: E.atualizadoEm }); return desenhar(); }
    if (r.status >= 500) return marcarLocal();
    mensagem(msg, d.erro || 'Não foi possível iniciar.');
    b.disabled = false;
  } catch {
    marcarLocal();
  }
}

function voltar() {
  return el('div', { class: 'trilha' }, el('a', { href: '#', text: '← Minhas OS' }));
}

function telaFechar(id) {
  const o = E.lista.find((x) => x.id === id);
  if (!o || !responsavel(o) || naFila(id) || !['DIRECIONADA', 'EM_EXECUCAO'].includes(o.status)) { location.hash = 'os/' + id; return; }
  const ult = E.leituras[o.chassi] || {};
  const km = el('input', { inputmode: 'numeric', placeholder: ult.km !== undefined ? 'último: ' + fmt.int(ult.km) : 'ex.: 120500', autocomplete: 'off' });
  const hor = el('input', { inputmode: 'decimal', placeholder: ult.horimetro !== undefined ? 'último: ' + fmt.dec(ult.horimetro) : 'ex.: 4520', autocomplete: 'off' });
  const fotos = {
    placa: campoFoto('Foto da placa', { obrigatoria: true }), servico: campoFoto('Foto do serviço feito', { obrigatoria: true }),
    km: campoFoto('Foto do painel (km)'), horimetro: campoFoto('Foto do horímetro')
  };
  let resultado = '';
  const diag = o.tipo === 'DIAGNOSTICO';
  const opc = (valor, titulo, sub) => el('button', { type: 'button', class: 'opcao-grande', 'aria-pressed': 'false', onclick: (ev) => {
    resultado = valor;
    ev.currentTarget.parentElement.querySelectorAll('.opcao-grande').forEach((x) => x.setAttribute('aria-pressed', String(x === ev.currentTarget)));
  } }, [el('b', { text: titulo }), el('small', { text: sub })]);
  const defeito = el('textarea', { rows: 2, placeholder: 'Opcional: o que encontrou (ex.: bico injetor com defeito)' });
  const msg = el('div', { class: 'mensagem erro', role: 'alert', hidden: true });
  const alerta = el('label', { class: 'check-grande aviso amarelo', hidden: true }, [el('input', { type: 'checkbox', id: 'confirma-menor' }),
    el('span', { id: 'texto-menor' })]);
  const botao = el('button', { class: 'botao prim grande', type: 'submit', text: '✓ Fechar OS' });

  const form = el('form', { class: 'form-mec', novalidate: true }, [
    el('div', { class: 'duas' }, [el('label', { class: 'campo' }, [el('span', { text: 'Km' }), km]), el('label', { class: 'campo' }, [el('span', { text: 'Horímetro' }), hor])]),
    el('p', { class: 'dica', text: 'Preencha o km, o horímetro ou os dois. Os números são obrigatórios; as fotos do painel e do horímetro são opcionais.' }),
    alerta,
    el('div', { class: 'fotos-mec' }, Object.values(fotos).map((f) => f.caixa)),
    diag ? el('div', { class: 'campo' }, [el('span', { text: 'Resultado do diagnóstico' }), el('div', { class: 'opcoes-grandes' }, [
      opc('RESOLVIDO', RESULTADOS.RESOLVIDO, 'O problema já foi resolvido'), opc('PRECISA_SERVICO', RESULTADOS.PRECISA_SERVICO, 'A matriz vai abrir uma OS de serviço')])]) : null,
    diag ? defeito : null,
    msg, botao
  ]);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nKm = lerNumero(km.value), nHor = lerNumero(hor.value);
    const erro = nKm === null && nHor === null ? 'Informe o km ou o horímetro.'
      : Number.isNaN(nKm) || Number.isNaN(nHor) ? 'Km e horímetro só com números.'
        : !fotos.placa.valor() ? 'Tire a foto da placa.' : !fotos.servico.valor() ? 'Tire a foto do serviço feito.'
          : diag && !resultado ? 'Diga se resolveu na hora ou se precisa de serviço.' : '';
    if (erro) { mensagem(msg, erro); msg.scrollIntoView({ block: 'center' }); return; }
    const menor = (nKm !== null && ult.km !== undefined && nKm < ult.km) || (nHor !== null && ult.horimetro !== undefined && nHor < ult.horimetro);
    if (menor && !$('confirma-menor').checked) {
      $('texto-menor').textContent = `O número é menor que o último registrado (km ${ult.km !== undefined ? fmt.int(ult.km) : '—'}, horímetro ${ult.horimetro !== undefined ? fmt.dec(ult.horimetro) : '—'}). Confira e marque aqui para confirmar.`;
      alerta.hidden = false;
      alerta.scrollIntoView({ block: 'center' });
      return;
    }
    botao.disabled = true; botao.textContent = 'Guardando…';
    try {
      const agora = new Date().toISOString();
      const item = {
        id: idEnvio(), os_id: o.id, criado_em: agora, estado: 'pendente', erro: '', caminhos: {},
        resumo: { placa: o.placa, veiculo: o.veiculo },
        dados: { km: km.value, horimetro: hor.value, resultado, defeito_encontrado: diag ? defeito.value : '', executada_em: agora,
          iniciada_em: o.iniciada_em || (E.locais[o.id] && E.locais[o.id].iniciada_em) || null },
        fotos: Object.fromEntries(Object.entries(fotos).filter(([, f]) => f.valor()).map(([k, f]) => [k, f.valor()]))
      };
      await Fila.adicionar(item);
      await lerFila();
      location.hash = '';
      aviso(navigator.onLine ? 'OS fechada. Enviando…' : 'OS fechada e guardada no celular. Será enviada quando tiver internet.');
      enviar();
    } catch (e) {
      mensagem(msg, 'Não consegui guardar no celular: ' + e.message);
      botao.disabled = false; botao.textContent = '✓ Fechar OS';
    }
  });
  conteudo(el('div', { class: 'trilha' }, el('a', { href: '#os/' + id, text: '← Voltar' })),
    el('div', { class: 'cabeca-os' }, [el('h1', { class: 'placa-grande', text: o.placa || 'sem placa' }), el('span', { class: 'tipo', text: 'Fechar ' + numeroOS(o.id) })]),
    el('p', { class: 'dica', text: oQue(o) }), form);
}
