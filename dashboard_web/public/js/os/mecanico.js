// Tela do mecânico (simplificada): só lança OS já feitas (sem fila de trabalho atribuído) e vê as próprias dos
// últimos 7 dias. Funciona sem internet: o lançamento entra numa fila (fila.js) enviada sozinha quando o sinal
// volta. Rotas: #nova, #os/<id>.
import { el, fmt } from '../ui.js';
import { STATUS, numeroOS } from './regras.js';
import { $, montarTopo, campoFoto, fotoGuardada, idEnvio, registrarServiceWorker, formularioLancamento, textoServico } from './comum.js';

const Fila = self.LokalFila;
const E = { u: null, lista: [], fila: [], veiculos: [], colegas: [], solicitacoes: [], atualizadoEm: null, semSessao: false };
const conteudo = (...f) => $('conteudo').replaceChildren(...f.flat().filter(Boolean));

iniciar();

async function iniciar() {
  registrarServiceWorker();
  const [cacheLista, cacheU, cacheVeiculos, cacheColegas, cacheSolicitacoes] = await Promise.all([
    Fila.lerCache('lista'), Fila.lerCache('usuario'), Fila.lerCache('veiculos'), Fila.lerCache('colegas'), Fila.lerCache('solicitacoes')
  ]).catch(() => []);
  if (cacheLista) Object.assign(E, { lista: cacheLista.os, atualizadoEm: cacheLista.em });
  E.veiculos = cacheVeiculos || []; E.colegas = cacheColegas || []; E.solicitacoes = cacheSolicitacoes || [];
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
  window.addEventListener('online', () => { conexao(); enviarFila(); });
  window.addEventListener('offline', conexao);
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (ev) => { if (ev.data && ev.data.tipo === 'fila') depoisDeEnviar(ev.data); });
  if (!E.semSessao) {
    // voltou a entrar: o que esperava login volta para a fila
    for (const i of await Fila.listar()) if (i.estado === 'login') { i.estado = 'pendente'; await Fila.atualizar(i); }
  }
  await lerFila();
  desenhar();
  await atualizarLista();
  enviarFila();
}

async function lerFila() { E.fila = await Fila.listar(); conexao(); }

/** Cadastro de veículos: atualiza online, cai no que está guardado offline. Mecânico lança pra qualquer veículo. */
async function veiculosFn() {
  if (navigator.onLine && !E.semSessao) {
    try {
      const r = await fetch('/api/veiculos', { credentials: 'same-origin' });
      if (r.ok) { E.veiculos = (await r.json()).veiculos; await Fila.guardarCache('veiculos', E.veiculos); }
    } catch { /* sem internet: fica o guardado */ }
  }
  return E.veiculos;
}

async function atualizarLista() {
  if (E.semSessao || !navigator.onLine) return;
  try {
    const r = await fetch('/api/os', { credentials: 'same-origin' });
    if (r.status === 401) { E.semSessao = true; conexao(); return; }
    if (!r.ok) return;
    const d = await r.json();
    E.lista = d.os; E.colegas = d.colegas || []; E.solicitacoes = d.solicitacoes_abertas || []; E.atualizadoEm = d.agora;
    await Fila.guardarCache('lista', { os: d.os, em: d.agora });
    await Fila.guardarCache('colegas', E.colegas);
    await Fila.guardarCache('solicitacoes', E.solicitacoes);
    desenhar();
  } catch { /* sem internet: fica a lista guardada */ }
}

async function enviarFila() {
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
    aviso(r.enviados === 1 ? 'OS enviada para o sistema.' : r.enviados + ' OS enviadas para o sistema.');
    await atualizarLista();
  }
  desenhar();
}

function conexao() {
  const c = $('conexao');
  const pend = E.fila.filter((i) => i.estado !== 'erro').length;
  const partes = [];
  if (!navigator.onLine) partes.push(el('b', { text: 'Sem internet.' }), ' Pode lançar OS normalmente: fica guardado no celular. ');
  if (E.semSessao) partes.push(el('b', { text: 'Seu login venceu. ' }), el('a', { href: '/?voltar=/os/mecanico', text: 'Entrar de novo' }), ' para enviar. ');
  if (pend) {
    partes.push(pend + (pend === 1 ? ' OS aguardando envio. ' : ' OS aguardando envio. '));
    if (navigator.onLine && !E.semSessao) partes.push(el('button', { class: 'botao mini', type: 'button', text: 'Enviar agora', onclick: enviarFila }));
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

function quando(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function desenhar() {
  if (!E.u) return;
  conexao();
  const h = location.hash.slice(1);
  if (h === 'nova') return telaNova();
  const m = h.match(/^os\/(\d+)$/);
  if (m) return telaOS(Number(m[1]));
  telaInicio();
}

function voltar() {
  return el('div', { class: 'trilha' }, el('a', { href: '#', text: '← Minhas OS' }));
}

function telaInicio() {
  const guardadas = E.fila;
  const enviadas = [...E.lista].sort((a, b) => (a.aberta_em < b.aberta_em ? 1 : -1));
  conteudo(
    el('h1', { class: 'titulo-mec', text: 'Minhas OS' }),
    el('a', { class: 'botao prim grande', href: '#nova', text: '+ Lançar OS realizada' }),
    el('h2', { class: 'titulo-mec', text: 'Últimos 7 dias' }),
    (guardadas.length || enviadas.length)
      ? el('div', { class: 'lista-mec' }, [...guardadas.map(cartaoFila), ...enviadas.map(cartaoOS)])
      : el('div', { class: 'vazio', text: 'Nenhuma OS lançada ainda.' }),
    el('p', { class: 'dica centro', text: E.atualizadoEm ? 'Lista atualizada em ' + quando(E.atualizadoEm) + '.' : '' }),
    el('p', { class: 'centro' }, el('button', { class: 'botao', type: 'button', text: '⟳ Atualizar lista', onclick: async () => { await atualizarLista(); await enviarFila(); desenhar(); } })));
}

function cartaoOS(o) {
  return el('a', { class: 'cartao-mec' + (o.status === 'CANCELADA' ? ' erro' : ''), href: '#os/' + o.id }, [
    el('div', { class: 'l1' }, [el('span', { class: 'placa-grande', text: o.placa || 'sem placa' }),
      el('span', { class: 'situacao', text: o.status === 'CANCELADA' ? 'Cancelada' : 'Enviada ✓' })]),
    el('div', { class: 'l2', text: o.veiculo }),
    el('div', { class: 'l3', text: textoServico(o) }),
    el('div', { class: 'l4' }, [el('span', { text: '📍 ' + (o.cidade || '—') }), el('span', { class: 'num', text: numeroOS(o.id) })])
  ]);
}

function cartaoFila(i) {
  const erro = i.estado === 'erro';
  const v = E.veiculos.find((x) => x.chassi === i.dados.chassi);
  const desc = erro ? 'Não foi aceito: ' + i.erro : i.estado === 'login' ? 'Aguardando você entrar de novo para enviar.'
    : navigator.onLine ? 'Enviando…' : 'Guardado no celular. Será enviado quando tiver internet.';
  return el('div', { class: 'cartao-mec' + (erro ? ' erro' : ' guardado') }, [
    el('div', { class: 'l1' }, [el('span', { class: 'placa-grande', text: v ? (v.placa || 'sem placa') : '—' }),
      el('span', { class: 'situacao', text: erro ? 'Com problema' : 'Aguardando envio' })]),
    el('div', { class: 'l3', text: desc }),
    el('div', { class: 'l4' }, [el('span', { text: 'Lançada em ' + quando(i.criado_em) })]),
    erro ? el('div', { class: 'botoes' }, [
      el('button', { class: 'botao', type: 'button', text: 'Tentar de novo', onclick: async () => { i.estado = 'pendente'; i.erro = ''; await Fila.atualizar(i); await enviarFila(); desenhar(); } }),
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

async function telaNova() {
  conteudo(el('div', { class: 'carregando' }, [el('div', { class: 'giro' }), 'Carregando o cadastro de veículos…']));
  const lista = await veiculosFn();
  if (!lista.length) return conteudo(voltar(), el('div', { class: 'aviso vermelho', text: 'Sem veículos guardados neste celular. Abra o app uma vez com internet.' }));
  const { form, focar } = formularioLancamento({
    u: E.u, veiculos: lista, mecanicos: E.colegas, solicitacoesAbertas: E.solicitacoes,
    enviar: async (d) => {
      const item = {
        id: idEnvio(), criado_em: new Date().toISOString(), estado: 'pendente', erro: '', caminhos: {},
        dados: { chassi: d.chassi, pecas: d.pecas, servico: d.servico, cidade: d.cidade, tipo_local: d.tipo_local,
          data_servico: d.data_servico, km: d.km, horimetro: d.horimetro, auxiliares: d.auxiliares, os_atendida: d.os_atendida },
        fotos: { frente: d.fotoFrente, painel: d.fotoPainel, defeito: d.fotosDefeito }
      };
      await Fila.adicionar(item);
      await lerFila();
      location.hash = '';
      aviso(navigator.onLine ? 'OS lançada. Enviando…' : 'OS lançada e guardada no celular. Será enviada quando tiver internet.');
      enviarFila();
    }
  });
  conteudo(voltar(), el('h1', { class: 'titulo-mec', text: 'Lançar OS realizada' }), form);
  focar();
}

function telaOS(id) {
  const o = E.lista.find((x) => x.id === id);
  if (!o) return conteudo(voltar(), el('div', { class: 'aviso amarelo', text: 'Esta OS não está mais na sua lista (fica disponível por 7 dias).' }));
  const linha = (k, v) => (v ? [el('dt', { text: k }), el('dd', { text: v })] : []);
  conteudo(voltar(),
    el('div', { class: 'cabeca-os' }, [el('h1', { class: 'placa-grande', text: o.placa || 'sem placa' })]),
    el('p', { class: 'dica', text: numeroOS(o.id) + ' · ' + o.veiculo }),
    el('section', { class: 'cartao' }, [el('dl', { class: 'dados' }, [
      ...linha('Status', STATUS[o.status]), ...linha('Serviço', textoServico(o)),
      ...linha('Data do serviço', fmt.data(o.data_servico)), ...linha('Cidade', o.cidade),
      ...linha('Auxiliares', (o.auxiliares || []).join(', '))]),
    navigator.onLine ? el('div', { class: 'fotos' }, [fotoGuardada(o.foto_frente, 'Frente'), fotoGuardada(o.foto_painel, 'Painel'),
      ...(o.fotos_defeito || []).map((c, i) => fotoGuardada(c, 'Defeito ' + (i + 1)))]) : null]));
}
