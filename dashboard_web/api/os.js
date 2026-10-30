// Sistema de OS. Toda regra de quem vê e quem faz está em public/js/os/regras.js; aqui ela é aplicada de novo.
// GET  /api/os              → OS que o usuário pode ver (+ lista de mecânicos para a matriz)
// GET  /api/os?id=12        → uma OS com o histórico de etapas
// GET  /api/os?chassi=XYZ   → histórico de um veículo
// POST /api/os { acao, id?, ... }  acao: abrir, aprovar, devolver, reenviar, cancelar, direcionar, iniciar,
//                                     executar, financeiro, gerar_servico
import { json, lerCorpo, metodo, pedidoJsonDaPagina } from './_lib/http.js';
import { exigir } from './_lib/acesso.js';
import { banco } from './_lib/banco.js';
import { listarUsuarios } from './_lib/usuarios.js';
import {
  podeVer, recortarOS, acoesPossiveis, erroAbertura, erroFechamento, conferirFinanceiro, lerNumero, numeroOS,
  RESULTADOS, FOTOS_FECHAMENTO
} from '../public/js/os/regras.js';

const LIMITE_LISTA = 3000;
const agoraISO = () => new Date().toISOString();
const texto = (v, max = 2000) => String(v === null || v === undefined ? '' : v).trim().slice(0, max);

class ErroOS extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

const comAcoes = (u, os) => ({ ...recortarOS(u, os), numero: numeroOS(os.id), acoes: acoesPossiveis(u, os) });

async function carregarOS(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ErroOS(400, 'OS inválida.');
  const [os] = await banco.listar('os', { eq: { id: n } });
  if (!os) throw new ErroOS(404, 'OS não encontrada.');
  return os;
}

async function evento(os_id, etapa, por, obs = '', exemplo = false) {
  await banco.inserir('os_eventos', { os_id, etapa, por, em: agoraISO(), obs: texto(obs, 500), exemplo });
}

/** Muda a OS só se ela ainda estiver na etapa lida (duas pessoas mexendo ao mesmo tempo não se atropelam). */
async function mudar(os, mudancas, etapa, por, obs = '') {
  const [nova] = await banco.atualizar('os', { eq: { id: os.id, status: os.status } }, { ...mudancas, alterado_em: agoraISO() });
  if (!nova) throw new ErroOS(409, 'Esta OS mudou enquanto você mexia nela. Atualize a tela e confira.');
  await evento(os.id, etapa, por, obs, !!os.exemplo);
  return nova;
}

async function mecanicosAtivos() {
  return (await listarUsuarios()).filter((u) => u.perfil === 'MECANICO' && u.ativo !== false);
}

/** Confere responsável e ajudantes escolhidos pela matriz. */
async function equipeEscolhida(d) {
  const mecs = new Set((await mecanicosAtivos()).map((m) => m.login));
  const resp = texto(d.mecanico, 80).toLowerCase();
  if (!mecs.has(resp)) throw new ErroOS(400, 'Escolha um mecânico ativo.');
  const ajud = [...new Set((Array.isArray(d.ajudantes) ? d.ajudantes : []).map((x) => texto(x, 80).toLowerCase()))]
    .filter((x) => x && x !== resp);
  if (ajud.some((a) => !mecs.has(a))) throw new ErroOS(400, 'Ajudante inválido.');
  if (ajud.length > 5) throw new ErroOS(400, 'No máximo 5 ajudantes.');
  return { direcionada_para: resp, ajudantes: ajud };
}

/** Arquivo enviado antes por /api/fotos: confere dono, tipo e OS. */
async function arquivoValido(caminho, { tipo, por, os_id }) {
  if (!caminho) return null;
  const [a] = await banco.listar('arquivos', { eq: { caminho: String(caminho) } });
  if (!a || a.tipo !== tipo || (por && a.enviado_por !== por) || (os_id !== undefined && (a.os_id ?? null) !== os_id)) {
    throw new ErroOS(400, 'Arquivo não encontrado: envie a foto de novo.');
  }
  return a.caminho;
}

async function veiculoDe(chassi) {
  const [v] = await banco.listar('veiculos', { eq: { chassi: texto(chassi, 40) } });
  return v || null;
}

function camposAbertura(d) {
  const diag = d.tipo === 'DIAGNOSTICO';
  return {
    tipo: d.tipo, local_servico: texto(d.local_servico, 200), parado: d.parado === true,
    sintoma: texto(d.sintoma), grupo: diag ? '' : texto(d.grupo, 10), servico: diag ? '' : texto(d.servico)
  };
}

// ───────────────────────── ações ─────────────────────────

async function abrir(u, d) {
  const v = await veiculoDe(d.chassi);
  const erro = erroAbertura(d, v, u);
  if (erro) throw new ErroOS(400, erro);
  const fotos = [];
  for (const c of (Array.isArray(d.fotos_problema) ? d.fotos_problema : []).slice(0, 3)) {
    fotos.push(await arquivoValido(c, { tipo: 'problema', por: u.login, os_id: null }));
  }
  const agora = agoraISO();
  const base = {
    ...camposAbertura(d), chassi: v.chassi, placa: v.placa, veiculo: [v.tipo, v.modelo].filter(Boolean).join(' · '),
    filial: v.filial, fotos_problema: fotos, aberta_por: u.login, aberta_em: agora, ajudantes: [], devolucao_motivo: '',
    defeito_encontrado: '', nf_numero: '', fornecedor: '', cancelamento_motivo: '', exemplo: false, alterado_em: agora
  };
  if (u.perfil === 'ADMIN') {
    Object.assign(base, { status: 'APROVADA', aprovada_por: u.login, aprovada_em: agora });
    if (d.mecanico) Object.assign(base, await equipeEscolhida(d), { status: 'DIRECIONADA', direcionada_por: u.login, direcionada_em: agora });
  } else {
    base.status = 'AGUARDANDO_APROVACAO';
  }
  const [os] = await banco.inserir('os', base);
  for (const c of fotos) await banco.atualizar('arquivos', { eq: { caminho: c } }, { os_id: os.id });
  await evento(os.id, 'ABERTA', u.login);
  if (os.status === 'DIRECIONADA') await evento(os.id, 'DIRECIONADA', u.login, os.direcionada_para);
  return os;
}

async function aprovar(u, os, d) {
  const agora = agoraISO();
  if (d.mecanico) {
    const eq = await equipeEscolhida(d);
    const nova = await mudar(os, { status: 'DIRECIONADA', aprovada_por: u.login, aprovada_em: agora, ...eq,
      direcionada_por: u.login, direcionada_em: agora }, 'APROVADA', u.login);
    await evento(os.id, 'DIRECIONADA', u.login, eq.direcionada_para, !!os.exemplo);
    return nova;
  }
  return mudar(os, { status: 'APROVADA', aprovada_por: u.login, aprovada_em: agora }, 'APROVADA', u.login);
}

async function devolver(u, os, d) {
  const motivo = texto(d.motivo, 500);
  if (motivo.length < 3) throw new ErroOS(400, 'Diga o que a filial precisa corrigir.');
  return mudar(os, { status: 'DEVOLVIDA', devolucao_motivo: motivo }, 'DEVOLVIDA', u.login, motivo);
}

async function reenviar(u, os, d) {
  const v = await veiculoDe(os.chassi);
  const dados = { ...os, ...d };
  const erro = erroAbertura(dados, v, u.perfil === 'ADMIN' ? u : { ...u, filial: os.filial });
  if (erro) throw new ErroOS(400, erro);
  return mudar(os, { ...camposAbertura(dados), status: 'AGUARDANDO_APROVACAO' }, 'REENVIADA', u.login);
}

async function cancelar(u, os, d) {
  const motivo = texto(d.motivo, 500);
  if (motivo.length < 3) throw new ErroOS(400, 'Informe o motivo do cancelamento.');
  return mudar(os, { status: 'CANCELADA', cancelada_por: u.login, cancelada_em: agoraISO(), cancelamento_motivo: motivo },
    'CANCELADA', u.login, motivo);
}

async function direcionar(u, os, d) {
  const eq = await equipeEscolhida(d);
  return mudar(os, { status: 'DIRECIONADA', ...eq, direcionada_por: u.login, direcionada_em: agoraISO() },
    'DIRECIONADA', u.login, eq.direcionada_para);
}

async function iniciar(u, os) {
  return mudar(os, { status: 'EM_EXECUCAO', iniciada_em: agoraISO() }, 'INICIADA', u.login);
}

async function executar(u, os, d) {
  const erro = erroFechamento(d, os);
  if (erro) throw new ErroOS(400, erro);
  const fotos = {};
  for (const tipo of FOTOS_FECHAMENTO) {
    fotos['foto_' + tipo] = await arquivoValido((d.fotos || {})[tipo], { tipo, por: u.login, os_id: os.id });
  }
  const executada = new Date(Date.parse(d.executada_em)).toISOString();
  const iniciada = os.iniciada_em || (Date.parse(d.iniciada_em) ? new Date(Date.parse(d.iniciada_em)).toISOString() : executada);
  return mudar(os, {
    status: 'EXECUTADA', km: lerNumero(d.km), horimetro: lerNumero(d.horimetro), ...fotos,
    resultado: os.tipo === 'DIAGNOSTICO' ? d.resultado : null, defeito_encontrado: texto(d.defeito_encontrado, 1000),
    iniciada_em: iniciada, executada_em: executada, recebida_em: agoraISO(), envio_id: texto(d.envio_id, 64)
  }, 'EXECUTADA', u.login, os.tipo === 'DIAGNOSTICO' ? RESULTADOS[d.resultado] : '');
}

async function financeiro(u, os, d) {
  const { erro, valores } = conferirFinanceiro(d);
  if (erro) throw new ErroOS(400, erro);
  const nf = d.nf_arquivo ? await arquivoValido(d.nf_arquivo, { tipo: 'nf', os_id: os.id }) : (os.nf_arquivo || null);
  return mudar(os, { ...valores, nf_arquivo: nf, status: 'FECHADA', fechada_por: u.login, fechada_em: agoraISO() },
    'FECHADA', u.login);
}

async function gerarServico(u, os, d) {
  const dados = {
    tipo: 'SERVICO', grupo: d.grupo, servico: d.servico, local_servico: d.local_servico || os.local_servico,
    parado: d.parado === undefined ? os.parado : d.parado === true,
    sintoma: `Diagnóstico ${numeroOS(os.id)}: ${os.defeito_encontrado || os.sintoma}`.slice(0, 2000),
    mecanico: d.mecanico, ajudantes: d.ajudantes, chassi: os.chassi
  };
  const nova = await abrir(u, dados);
  await banco.atualizar('os', { eq: { id: nova.id } }, { os_origem: os.id });
  await banco.atualizar('os', { eq: { id: os.id } }, { os_servico: nova.id, alterado_em: agoraISO() });
  await evento(os.id, 'SERVICO_GERADO', u.login, numeroOS(nova.id), !!os.exemplo);
  return { ...nova, os_origem: os.id };
}

const ACOES = { aprovar, devolver, reenviar, cancelar, direcionar, iniciar, executar, financeiro, gerar_servico: gerarServico };

// ───────────────────────── leitura ─────────────────────────

/** Último km e horímetro registrados de cada veículo (para o celular avisar número menor que o anterior). */
function ultimasLeituras(lista) {
  const out = {};
  lista.filter((o) => o.executada_em && (o.km !== null || o.horimetro !== null)).sort((a, b) => (a.executada_em < b.executada_em ? -1 : 1))
    .forEach((o) => {
      const l = out[o.chassi] || (out[o.chassi] = {});
      if (o.km !== null && o.km !== undefined) l.km = Number(o.km);
      if (o.horimetro !== null && o.horimetro !== undefined) l.horimetro = Number(o.horimetro);
    });
  return out;
}

async function ler(u, q) {
  if (q.get('id')) {
    const os = await carregarOS(q.get('id'));
    if (!podeVer(u, os)) throw new ErroOS(404, 'OS não encontrada.');
    const eventos = await banco.listar('os_eventos', { eq: { os_id: os.id }, ordem: 'em.asc' });
    const ligadas = [];
    for (const id of [os.os_origem, os.os_servico].filter(Boolean)) {
      const [o] = await banco.listar('os', { eq: { id } });
      if (o && podeVer(u, o)) ligadas.push({ id: o.id, numero: numeroOS(o.id), status: o.status, tipo: o.tipo });
    }
    return { os: comAcoes(u, os), eventos, ligadas };
  }
  const filtro = q.get('chassi') ? { eq: { chassi: q.get('chassi') } } : {};
  const todas = await banco.listar('os', { ...filtro, ordem: 'id.desc', limite: LIMITE_LISTA });
  const visiveis = todas.filter((o) => podeVer(u, o));
  const out = { os: visiveis.map((o) => comAcoes(u, o)), agora: agoraISO() };
  if (u.perfil === 'ADMIN') {
    out.mecanicos = (await mecanicosAtivos()).map((m) => ({ login: m.login, nome: m.nome, equipe: m.equipe || '' }));
  }
  if (u.perfil === 'MECANICO') {
    const chassis = [...new Set(visiveis.map((o) => o.chassi))];
    const historico = chassis.length ? await banco.listar('os', { em: { chassi: chassis } }) : [];
    out.leituras = ultimasLeituras(historico);
  }
  if (u.perfil !== 'MECANICO') {
    const nomes = Object.fromEntries((await listarUsuarios()).map((x) => [x.login, x.nome]));
    out.nomes = nomes;
  }
  return out;
}

export default async function handler(req, res) {
  if (!metodo(req, res, ['GET', 'POST'])) return;
  try {
    const u = await exigir(req, res);
    if (!u) return;
    if (req.method === 'GET') return json(res, 200, await ler(u, new URL(req.url, 'http://x').searchParams));

    if (!pedidoJsonDaPagina(req)) return json(res, 415, { erro: 'Formato inválido.' });
    const d = await lerCorpo(req);
    let os;
    if (d.acao === 'abrir') {
      os = await abrir(u, d);
    } else {
      const f = ACOES[d.acao];
      if (!f) return json(res, 400, { erro: 'Ação desconhecida.' });
      const atual = await carregarOS(d.id);
      if (!podeVer(u, atual)) return json(res, 404, { erro: 'OS não encontrada.' });
      // fechamento repetido pelo celular (sem internet, reenviou): responde que já está feito
      if (d.acao === 'executar' && atual.envio_id && atual.envio_id === texto(d.envio_id, 64)) {
        return json(res, 200, { os: comAcoes(u, atual), repetido: true });
      }
      if (!acoesPossiveis(u, atual).includes(d.acao)) {
        const msg = u.perfil === 'MECANICO' && !['DIRECIONADA', 'EM_EXECUCAO'].includes(atual.status)
          ? 'Esta OS não está mais com você (' + atual.status.toLowerCase().replace('_', ' ') + '). Fale com a matriz.'
          : 'Esta ação não é possível agora. Atualize a tela.';
        return json(res, 409, { erro: msg });
      }
      os = await f(u, atual, d);
    }
    return json(res, 200, { os: comAcoes(u, os) });
  } catch (e) {
    return json(res, e.status || 500, { erro: e.message });
  }
}
