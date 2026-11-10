// Sistema de OS (simplificado): um lançamento é um registro de serviço já feito, não um pedido com aprovação.
// Toda regra de quem vê e quem faz está em public/js/os/regras.js; aqui ela é aplicada de novo.
// GET  /api/os              → OS que o usuário pode ver (mecânico: só as próprias, últimos 7 dias)
// GET  /api/os?id=12        → uma OS com o histórico de eventos
// GET  /api/os?chassi=XYZ   → histórico de um veículo
// POST /api/os { acao, id?, ... }  acao: lancar, solicitar, cancelar, valores
import { json, lerCorpo, metodo, pedidoJsonDaPagina } from './_lib/http.js';
import { exigir } from './_lib/acesso.js';
import { banco } from './_lib/banco.js';
import { listarUsuarios } from './_lib/usuarios.js';
import {
  podeVer, recortarOS, acoesPossiveis, podeLancar, erroLancamento, erroSolicitacao, erroCorrecao, conferirFinanceiro,
  lerNumero, numeroOS, MAX_FOTOS_DEFEITO, MAX_AUXILIARES, filiaisDe, decodificarPeca, melhorSemaforo
} from '../public/js/os/regras.js';

const LIMITE_LISTA = 3000;
const DIAS_MECANICO = 7;
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

/** Resolve quem executou o serviço: mecânico sempre interno (ele mesmo); filial/matriz escolhem. */
async function equipeLancamento(u, d) {
  const mecs = new Set((await mecanicosAtivos()).map((m) => m.login));
  const auxiliaresDe = (resp) => {
    const aux = [...new Set((Array.isArray(d.auxiliares) ? d.auxiliares : []).map((x) => texto(x, 80).toLowerCase()))]
      .filter((x) => x && x !== resp);
    if (aux.some((a) => !mecs.has(a))) throw new ErroOS(400, 'Auxiliar inválido.');
    if (aux.length > MAX_AUXILIARES) throw new ErroOS(400, 'No máximo ' + MAX_AUXILIARES + ' auxiliares.');
    return aux;
  };
  if (u.perfil === 'MECANICO') {
    return { execucao: 'INTERNA', direcionada_para: u.login, auxiliares: auxiliaresDe(u.login), oficina_externa: '' };
  }
  if (d.execucao === 'EXTERNA') {
    return { execucao: 'EXTERNA', direcionada_para: null, auxiliares: [], oficina_externa: texto(d.oficina_externa, 120) };
  }
  const resp = texto(d.mecanico, 80).toLowerCase();
  if (!mecs.has(resp)) throw new ErroOS(400, 'Escolha um mecânico ativo.');
  return { execucao: 'INTERNA', direcionada_para: resp, auxiliares: auxiliaresDe(resp), oficina_externa: '' };
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

// ───────────────────────── criação ─────────────────────────

/** Lança uma OS feita: mecânico, filial ou matriz, sempre já "feita". */
async function lancar(u, d) {
  const v = await veiculoDe(d.chassi);
  const erro = erroLancamento(d, v, u);
  if (erro) throw new ErroOS(400, erro);
  const equipe = await equipeLancamento(u, d);
  let os_atendida = null;
  if (d.os_atendida) {
    const [sol] = await banco.listar('os', { eq: { id: Number(d.os_atendida), status: 'SOLICITADA' } });
    if (!sol || sol.chassi !== v.chassi) throw new ErroOS(400, 'Solicitação inválida.');
    os_atendida = sol.id;
  }
  const fotoFrente = await arquivoValido(d.fotos && d.fotos.frente, { tipo: 'frente', por: u.login, os_id: null });
  const fotoPainel = await arquivoValido(d.fotos && d.fotos.painel, { tipo: 'painel', por: u.login, os_id: null });
  const fotosDefeito = [];
  for (const c of (Array.isArray(d.fotos_defeito) ? d.fotos_defeito : []).slice(0, MAX_FOTOS_DEFEITO)) {
    fotosDefeito.push(await arquivoValido(c, { tipo: 'defeito', por: u.login, os_id: null }));
  }
  // o grupo vem das próprias peças (primeira dupla), nunca do que o cliente mandar solto em d.grupo
  const pecas = (Array.isArray(d.pecas) ? d.pecas : []).map((c) => texto(c, 50));
  const grupo = (decodificarPeca(pecas[0]) || {}).grupo || '';
  const agora = agoraISO();
  const base = {
    status: 'FEITA', chassi: v.chassi, placa: v.placa, veiculo: [v.tipo, v.modelo].filter(Boolean).join(' · '),
    filial: v.filial, cidade: texto(d.cidade, 120), tipo_local: d.tipo_local, grupo, pecas,
    servico: texto(d.servico), data_servico: texto(d.data_servico, 10), km: lerNumero(d.km), horimetro: lerNumero(d.horimetro),
    foto_frente: fotoFrente, foto_painel: fotoPainel, fotos_defeito: fotosDefeito, os_atendida,
    aberta_por: u.login, aberta_em: agora, envio_id: texto(d.envio_id, 64) || null, cancelamento_motivo: '', exemplo: false,
    alterado_em: agora, valor_pecas: null, valor_mao_obra: null, valor_deslocamento: null, valor_total: null,
    nf_numero: '', fornecedor: '', nf_arquivo: null, ...equipe
  };
  const [os] = await banco.inserir('os', base);
  for (const c of [fotoFrente, fotoPainel, ...fotosDefeito].filter(Boolean)) {
    await banco.atualizar('arquivos', { eq: { caminho: c } }, { os_id: os.id });
  }
  await evento(os.id, 'LANCADA', u.login);
  return os;
}

/** Solicita a equipe itinerante: só a filial, sem aprovação. Fica "aberta" até uma OS feita responder (os_atendida). */
async function solicitar(u, d) {
  const v = await veiculoDe(d.chassi);
  const erro = erroSolicitacao(d, v, u);
  if (erro) throw new ErroOS(400, erro);
  const fotos = [];
  for (const c of (Array.isArray(d.fotos_defeito) ? d.fotos_defeito : []).slice(0, MAX_FOTOS_DEFEITO)) {
    fotos.push(await arquivoValido(c, { tipo: 'defeito', por: u.login, os_id: null }));
  }
  const agora = agoraISO();
  const base = {
    status: 'SOLICITADA', chassi: v.chassi, placa: v.placa, veiculo: [v.tipo, v.modelo].filter(Boolean).join(' · '),
    filial: v.filial, sintoma: texto(d.sintoma), cidade: texto(d.cidade, 120), tipo_local: d.tipo_local, pecas: [],
    fotos_defeito: fotos, execucao: 'INTERNA', auxiliares: [], oficina_externa: '', aberta_por: u.login, aberta_em: agora,
    cancelamento_motivo: '', exemplo: false, alterado_em: agora, valor_pecas: null, valor_mao_obra: null,
    valor_deslocamento: null, valor_total: null, nf_numero: '', fornecedor: '', nf_arquivo: null
  };
  const [os] = await banco.inserir('os', base);
  for (const c of fotos) await banco.atualizar('arquivos', { eq: { caminho: c } }, { os_id: os.id });
  await evento(os.id, 'SOLICITADA', u.login);
  return os;
}

// ───────────────────────── ações sobre OS existente ─────────────────────────

async function cancelar(u, os, d) {
  const motivo = texto(d.motivo, 500);
  if (motivo.length < 3) throw new ErroOS(400, 'Informe o motivo do cancelamento.');
  return mudar(os, { status: 'CANCELADA', cancelada_por: u.login, cancelada_em: agoraISO(), cancelamento_motivo: motivo },
    'CANCELADA', u.login, motivo);
}

async function valores(u, os, d) {
  const { erro, valores: vals } = conferirFinanceiro(d);
  if (erro) throw new ErroOS(400, erro);
  const nf = d.nf_arquivo ? await arquivoValido(d.nf_arquivo, { tipo: 'nf', os_id: os.id }) : (os.nf_arquivo || null);
  return mudar(os, { ...vals, nf_arquivo: nf }, 'VALORES', u.login);
}

/** Corrige um lançamento errado (só a matriz; não mexe em fotos nem em quem fez o serviço). */
async function corrigir(u, os, d) {
  const erro = erroCorrecao(d);
  if (erro) throw new ErroOS(400, erro);
  return mudar(os, {
    grupo: texto(d.grupo, 10), servico: texto(d.servico), cidade: texto(d.cidade, 120), tipo_local: d.tipo_local,
    data_servico: texto(d.data_servico, 10), km: lerNumero(d.km), horimetro: lerNumero(d.horimetro)
  }, 'CORRIGIDA', u.login);
}

const ACOES = { cancelar, valores, corrigir };

// ───────────────────────── leitura ─────────────────────────

/** Solicitações sem nenhuma OS feita que aponte os_atendida para elas (equipe itinerante ainda não foi). */
function solicitacoesAbertas(todas) {
  const respondidas = new Set(todas.map((o) => o.os_atendida).filter(Boolean));
  return todas.filter((o) => o.status === 'SOLICITADA' && !respondidas.has(o.id));
}

/** Histórico de peças já trocadas num veículo (pro semáforo de garantia no formulário de lançamento). */
async function historicoPecas(u, chassi) {
  if (!podeLancar(u)) throw new ErroOS(403, 'Seu perfil não lança OS.');
  const v = await veiculoDe(chassi);
  if (!v) throw new ErroOS(404, 'Veículo não encontrado.');
  if (u.perfil === 'FILIAL' && !filiaisDe(u).includes(v.filial)) throw new ErroOS(404, 'Veículo não encontrado.');
  const feitas = await banco.listar('os', { eq: { chassi: v.chassi, status: 'FEITA' } });
  const linhas = [];
  for (const o of feitas) {
    for (const cod of (o.pecas || [])) {
      const par = decodificarPeca(cod);
      if (par) linhas.push({ grupo: par.grupo, peca: par.peca, posicao: par.posicao, data_servico: o.data_servico });
    }
  }
  return { pecas: linhas };
}

/**
 * As 3 manutenções feitas mais recentes no veículo desta OS (de todos os tempos, não só antes dela), com o selo
 * do semáforo quando a peça daquela manutenção já tinha sido trocada antes. Detalhe da OS (id/número) só entra
 * se o usuário também puder ver aquela OS específica — a data/peça em si segue o mesmo nível de exposição do
 * histórico de peças já usado no formulário de lançamento (pecas_chassi), que não filtra por podeVer.
 */
async function ultimasManutencoes(u, os) {
  const feitas = await banco.listar('os', { eq: { chassi: os.chassi, status: 'FEITA' } });
  const comPecas = feitas.map((o) => ({ ...o, pecasDecodificadas: (o.pecas || []).map(decodificarPeca).filter(Boolean) }));
  // empate na data_servico (comum: vários serviços no mesmo dia) desempata pela mais lançada por último (id maior)
  const ordenadas = [...comPecas].sort((a, b) => (a.data_servico !== b.data_servico ? (a.data_servico < b.data_servico ? 1 : -1) : b.id - a.id));
  // "anterior" = data menor, ou mesma data mas lançada antes (id menor) — cobre o caso raro de duas trocas no
  // mesmo dia, que ainda conta como reincidência (0 dias, vermelho).
  const antesDe = (h, o) => h.data_servico < o.data_servico || (h.data_servico === o.data_servico && h.id < o.id);
  return ordenadas.slice(0, 3).map((o) => {
    const anteriores = comPecas.flatMap((h) => (antesDe(h, o)
      ? h.pecasDecodificadas.map((p) => ({ grupo: p.grupo, peca: p.peca, posicao: p.posicao, data_servico: h.data_servico })) : []));
    const melhor = melhorSemaforo(o.pecasDecodificadas, o.data_servico, anteriores);
    return {
      ...(podeVer(u, o) ? { id: o.id, numero: numeroOS(o.id) } : {}),
      data_servico: o.data_servico, grupo: o.grupo, servico: o.servico,
      semaforo: melhor ? { cor: melhor.cor, dias: melhor.dias, posicao: melhor.posicao } : null
    };
  });
}

async function ler(u, q) {
  if (q.get('pecas_chassi')) return historicoPecas(u, q.get('pecas_chassi'));
  if (q.get('id')) {
    const os = await carregarOS(q.get('id'));
    if (!podeVer(u, os)) throw new ErroOS(404, 'OS não encontrada.');
    const eventos = await banco.listar('os_eventos', { eq: { os_id: os.id }, ordem: 'em.asc' });
    const ligadas = [];
    if (os.os_atendida) {
      const [sol] = await banco.listar('os', { eq: { id: os.os_atendida } });
      if (sol && podeVer(u, sol)) ligadas.push({ id: sol.id, numero: numeroOS(sol.id), status: sol.status, papel: 'solicitacao' });
    }
    if (os.status === 'SOLICITADA') {
      const respostas = await banco.listar('os', { eq: { os_atendida: os.id } });
      respostas.filter((o) => podeVer(u, o)).forEach((o) => ligadas.push({ id: o.id, numero: numeroOS(o.id), status: o.status, papel: 'resposta' }));
    }
    const historicoRecente = await ultimasManutencoes(u, os);
    return { os: comAcoes(u, os), eventos, ligadas, historicoRecente };
  }
  const filtro = q.get('chassi') ? { eq: { chassi: q.get('chassi') } } : {};
  const todas = await banco.listar('os', { ...filtro, ordem: 'id.desc', limite: LIMITE_LISTA });
  let visiveis = todas.filter((o) => podeVer(u, o));
  if (u.perfil === 'MECANICO') {
    const corte = Date.now() - DIAS_MECANICO * 24 * 3600 * 1000;
    visiveis = visiveis.filter((o) => Date.parse(o.aberta_em) >= corte);
  }
  const out = { os: visiveis.map((o) => comAcoes(u, o)), agora: agoraISO() };
  if (['ADMIN', 'FILIAL'].includes(u.perfil)) {
    out.mecanicos = (await mecanicosAtivos()).map((m) => ({ login: m.login, nome: m.nome, equipe: m.equipe || '' }));
    out.oficinas = [...new Set(visiveis.map((o) => o.oficina_externa).filter(Boolean))].sort();
  }
  if (u.perfil !== 'MECANICO') {
    out.nomes = Object.fromEntries((await listarUsuarios()).map((x) => [x.login, x.nome]));
  } else {
    // só os colegas mecânicos (pra escolher auxiliares), não a lista de usuários inteira
    out.colegas = (await mecanicosAtivos()).filter((m) => m.login !== u.login).map((m) => ({ login: m.login, nome: m.nome }));
    // mínimo pra oferecer "esta OS atende a uma solicitação?" (a equipe itinerante são os próprios mecânicos)
    out.solicitacoes_abertas = solicitacoesAbertas(todas).map((o) => ({ id: o.id, chassi: o.chassi, aberta_em: o.aberta_em }));
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
    let os, repetido = false;
    if (d.acao === 'lancar') {
      if (d.envio_id) {
        const [existe] = await banco.listar('os', { eq: { envio_id: texto(d.envio_id, 64) } });
        if (existe && podeVer(u, existe)) { os = existe; repetido = true; }
      }
      if (!os) os = await lancar(u, d);
    } else if (d.acao === 'solicitar') {
      os = await solicitar(u, d);
    } else {
      const f = ACOES[d.acao];
      if (!f) return json(res, 400, { erro: 'Ação desconhecida.' });
      const atual = await carregarOS(d.id);
      if (!podeVer(u, atual)) return json(res, 404, { erro: 'OS não encontrada.' });
      if (!acoesPossiveis(u, atual).includes(d.acao)) return json(res, 409, { erro: 'Esta ação não é possível agora. Atualize a tela.' });
      os = await f(u, atual, d);
    }
    return json(res, 200, { os: comAcoes(u, os), ...(repetido ? { repetido: true } : {}) });
  } catch (e) {
    return json(res, e.status || 500, { erro: e.message });
  }
}
