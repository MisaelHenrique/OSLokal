// Regras do sistema de OS (simplificado, 09/11/2026 — ver PLANO_OS_SIMPLIFICADA.md): a OS é um registro de
// serviço já feito, não um pedido que passa por aprovação. Funções puras, usadas pelo servidor (api/os.js) e
// pelas telas. O servidor sempre confere de novo: a tela só usa para mostrar ou esconder botões.
import { GRUPOS } from '../sistema.js';

export const STATUS = { SOLICITADA: 'Solicitada', FEITA: 'Feita', CANCELADA: 'Cancelada' };
export const EXECUCAO = { INTERNA: 'Interna', EXTERNA: 'Externa' };
export const TIPO_LOCAL = { OBRA: 'Obra', GALPAO: 'Galpão' };
export const PERFIS = { ADMIN: 'Matriz (administrador)', FILIAL: 'Filial', MECANICO: 'Mecânico', DIRETORIA: 'Diretoria' };
export const SENHA_PADRAO = 'mudar123';

export const TIPOS_FOTO = {
  frente: 'Foto da frente (com a placa)', painel: 'Foto do painel (km/horímetro)',
  defeito: 'Foto do defeito ou serviço', nf: 'Nota fiscal'
};
export const FOTOS_OBRIGATORIAS = ['frente', 'painel'];
export const MAX_FOTOS_DEFEITO = 3;
export const MAX_AUXILIARES = 3;

export const CAMPOS_FINANCEIROS = ['valor_pecas', 'valor_mao_obra', 'valor_deslocamento', 'valor_total', 'nf_numero',
  'fornecedor', 'nf_arquivo'];

// Peças por grupo (ver Pecas_por_Grupo_LOKAL.md na raiz do projeto — não confundir com SUBGRUPOS de sistema.js,
// que é outra lista, usada pelo /painel). PNE não tem lista no documento: o grupo existe, mas sem peças pra marcar.
export const PECAS_POR_GRUPO = {
  MOT: ['Injeção', 'Turbo', 'Radiador', 'Bomba d\'água', 'Mangueiras', 'Correias', 'Cabeçote', 'Juntas'],
  TRA: ['Caixa de câmbio', 'Embreagem', 'Cardan', 'Diferencial', 'Tomada de força (PTO)'],
  FRE: ['Lonas', 'Tambores', 'Válvulas', 'Compressor de ar', 'Secador', 'Cuícas', 'Retarder'],
  SUS: ['Molas', 'Amortecedores', 'Buchas', 'Barras', 'Caixa de direção', 'Terminais'],
  ELE: ['Bateria', 'Alternador', 'Motor de partida', 'Chicotes', 'Iluminação', 'ECU', 'Sensores', 'Tacógrafo', 'Rastreador'],
  ARC: ['Compressor', 'Condensador', 'Evaporador', 'Recarga de gás', 'Filtro de cabine'],
  HID: ['Bomba hidráulica', 'Cilindros', 'Mangueiras', 'Comandos', 'Válvulas', 'Óleo hidráulico'],
  EMI: ['Arla 32', 'SCR', 'DPF', 'Sensores NOx'],
  ROD: ['Cubos', 'Rolamentos', 'Retentores', 'Prisioneiros'],
  CAB: ['Vidros', 'Portas', 'Bancos', 'Para-choque', 'Chassi', 'Solda', 'Pintura'],
  CON: ['Óleos', 'Filtros', 'Graxa'],
  PNE: []
};

// Implemento (IMP) depende do tipo do veículo (ver seção 2 do documento).
const PECAS_IMPLEMENTO_POR_TIPO = {
  PIPA: ['Bomba d\'água do implemento', 'Tanque', 'Canhão', 'Aspersores', 'Registros', 'Mangotes'],
  CACAMBA: ['Báscula', 'Pistão de basculamento', 'Tampa', 'Assoalho'],
  COMBOIO: ['Bomba de combustível', 'Medidor', 'Bico', 'Carretel', 'Lubrificador', 'Filtro'],
  MUNCK: ['Guindaste (lança)', 'Guindaste (giro)', 'Guindaste (patolas)', 'Guindaste (cabo)', 'Sistema de segurança'],
  OFICINA: ['Compressor', 'Gerador', 'Lubrificador', 'Ferramental'],
  PRANCHA: ['Rampas', 'Guinchos', 'Travas']
};

const normalizarTipo = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Peças disponíveis pra um grupo. Pra IMP, depende do tipo do veículo; tipo desconhecido junta tudo. */
export function pecasDoGrupo(grupo, veiculoTipo) {
  if (grupo === 'IMP') {
    const t = normalizarTipo(veiculoTipo);
    const achado = Object.entries(PECAS_IMPLEMENTO_POR_TIPO).find(([chave]) => t.includes(chave));
    return achado ? achado[1] : [...new Set(Object.values(PECAS_IMPLEMENTO_POR_TIPO).flat())];
  }
  return PECAS_POR_GRUPO[grupo] || [];
}

// Peças que têm lado/posição no caminhão (eixo + esquerdo/direito/ambos) — só onde isso faz diferença de
// verdade pra garantia: trocar a lona do 1º eixo não "conta" como a mesma manutenção da lona do 2º eixo, mesmo
// sendo o mesmo veículo e a mesma peça. "Eixo" é contado da frente pra trás (1º, 2º...), pra cobrir caminhão com
// mais de 2 eixos sem precisar adivinhar se um "traseiro" é o único ou não.
const PECAS_COM_POSICAO = new Set([
  'FRE:Lonas', 'FRE:Tambores', 'FRE:Cuícas',
  'SUS:Molas', 'SUS:Amortecedores', 'SUS:Buchas', 'SUS:Terminais', 'SUS:Barras',
  'ROD:Cubos', 'ROD:Rolamentos', 'ROD:Retentores', 'ROD:Prisioneiros'
]);
export const pecaTemPosicao = (grupo, peca) => PECAS_COM_POSICAO.has(grupo + ':' + peca);
export const EIXOS = ['1º eixo', '2º eixo', '3º eixo', '4º eixo'];
export const LADOS = ['Esquerdo', 'Direito', 'Ambos os lados'];
const posicaoValida = (posicao) => {
  const i = String(posicao || '').indexOf(' · ');
  if (i < 0) return false;
  return EIXOS.includes(posicao.slice(0, i)) && LADOS.includes(posicao.slice(i + 3));
};

export const codificarPeca = (grupo, peca, posicao = '') => grupo + ':' + peca + (posicao ? ':' + posicao : '');
export function decodificarPeca(codigo) {
  const s = String(codigo || '');
  const i = s.indexOf(':');
  if (i < 0) return null;
  const resto = s.slice(i + 1);
  const j = resto.indexOf(':');
  return j < 0 ? { grupo: s.slice(0, i), peca: resto, posicao: '' }
    : { grupo: s.slice(0, i), peca: resto.slice(0, j), posicao: resto.slice(j + 1) };
}

export const MAX_PECAS = 30;

/** Confere a lista de "GRUPO:Peça[:Posição]" escolhida no lançamento. */
export function erroPecas(pecas, veiculoTipo) {
  if (!Array.isArray(pecas) || !pecas.length) return 'Escolha ao menos um grupo e peça.';
  if (pecas.length > MAX_PECAS) return 'Muitas peças selecionadas.';
  for (const cod of pecas) {
    const par = decodificarPeca(cod);
    if (!par || !GRUPOS[par.grupo]) return 'Grupo de peças inválido.';
    const validas = pecasDoGrupo(par.grupo, veiculoTipo);
    if (validas.length && !validas.includes(par.peca)) return 'Peça inválida pro grupo escolhido.';
    if (pecaTemPosicao(par.grupo, par.peca) && !posicaoValida(par.posicao)) return 'Escolha o eixo e o lado dessa peça.';
  }
  return '';
}

/**
 * Semáforo de garantia: cruza a data do lançamento atual com uma manutenção anterior na mesma peça.
 * 0–30 dias = vermelho, 31–60 = amarelo, 61–90 = verde, fora disso (ou datas inválidas) não mostra nada.
 */
export function semaforoPeca(dataAtual, dataAnterior) {
  const atual = Date.parse(dataAtual + 'T12:00:00');
  const anterior = Date.parse(dataAnterior + 'T12:00:00');
  if (Number.isNaN(atual) || Number.isNaN(anterior)) return null;
  const dias = Math.round((atual - anterior) / 86400000);
  if (dias < 0 || dias > 90) return null;
  if (dias <= 30) return { cor: 'vermelho', dias };
  if (dias <= 60) return { cor: 'amarelo', dias };
  return { cor: 'verde', dias };
}

/**
 * Entre as peças de uma manutenção (`alvo`, ex.: as marcadas num lançamento em andamento, ou as de uma OS já
 * feita) e um histórico de peças já trocadas (`historico`, pares grupo+peça+posição+data), acha a reincidência
 * mais urgente (menor nº de dias). `null` se nenhuma peça de `alvo` já tinha sido trocada antes dentro da janela
 * do semáforo (0–90 dias). Usado tanto no formulário de lançamento quanto na lista de últimas manutenções da OS.
 * Posição (eixo + lado): só exige bater quando os dois lados têm posição registrada — lançamento antigo, de
 * antes desse campo existir, continua comparando só por grupo+peça, pra não perder aviso por falta de dado velho.
 */
export function melhorSemaforo(alvo, dataAlvo, historico) {
  let melhor = null;
  for (const sel of alvo) for (const h of historico) {
    if (h.grupo !== sel.grupo || h.peca !== sel.peca) continue;
    if (sel.posicao && h.posicao && sel.posicao !== h.posicao) continue;
    const r = semaforoPeca(dataAlvo, h.data_servico);
    if (r && (!melhor || r.dias < melhor.dias)) {
      melhor = { ...r, peca: sel.peca, grupo: sel.grupo, posicao: h.posicao || sel.posicao || '', dataAnterior: h.data_servico };
    }
  }
  return melhor;
}

export function filiaisDe(u) {
  return String((u && u.filial) || '').split(';').map((s) => s.trim()).filter(Boolean);
}

/** Quem enxerga a OS. Mecânico só o que ele mesmo lançou (não tem mais fila de trabalho atribuído). */
export function podeVer(u, os) {
  if (!u || !os) return false;
  if (u.perfil === 'ADMIN' || u.perfil === 'DIRETORIA') return true;
  if (u.perfil === 'FILIAL') return filiaisDe(u).includes(os.filial);
  if (u.perfil === 'MECANICO') return os.aberta_por === u.login;
  return false;
}

/** Cópia da OS sem o que o perfil não pode ver: só o mecânico nunca vê valores/NF. */
export function recortarOS(u, os) {
  const c = { ...os };
  if (u.perfil === 'MECANICO') CAMPOS_FINANCEIROS.forEach((k) => { delete c[k]; });
  return c;
}

/** Ações que este usuário pode fazer agora nesta OS já existente (lançar e solicitar são criação, não ação). */
export function acoesPossiveis(u, os) {
  if (!podeVer(u, os)) return [];
  const a = [];
  if (u.perfil === 'ADMIN') {
    if (os.status !== 'CANCELADA') a.push('cancelar');
    if (os.status === 'FEITA') a.push('valores', 'corrigir');
  } else if (u.perfil === 'FILIAL' && os.status === 'FEITA') {
    a.push('valores');
  }
  return a;
}

/** Lança uma OS feita: mecânico (qualquer veículo, offline), filial (só a dela) e matriz (qualquer). */
export function podeLancar(u) {
  return !!u && ['ADMIN', 'FILIAL', 'MECANICO'].includes(u.perfil);
}

/** Pede a equipe itinerante: só a filial, para os veículos dela. */
export function podeSolicitar(u) {
  return !!u && u.perfil === 'FILIAL';
}

/** Lê número em formato brasileiro ("1.765,44", "1765,44", "1765.44") ou número. Vazio = null. */
export function lerNumero(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let t = String(v).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const texto = (v) => String(v === null || v === undefined ? '' : v).trim();

/** Confere cidade e tipo de local, comuns ao lançamento e à solicitação. */
function erroLocal(d) {
  if (texto(d.cidade).length < 2) return 'Informe a cidade.';
  if (!TIPO_LOCAL[d.tipo_local]) return 'Escolha o tipo de local: obra ou galpão.';
  return '';
}

/** Confere um lançamento de OS feita. Devolve a mensagem de erro ou '' se estiver tudo certo. */
export function erroLancamento(d, veiculo, u, agora = Date.now()) {
  if (!podeLancar(u)) return 'Seu perfil não lança OS.';
  if (!veiculo) return 'Escolha o veículo.';
  if (veiculo.ativo === false) return 'Veículo inativo no cadastro.';
  if (u.perfil === 'FILIAL' && !filiaisDe(u).includes(veiculo.filial)) return 'Este veículo não é da sua filial.';
  const erroP = erroPecas(d.pecas, veiculo.tipo);
  if (erroP) return erroP;
  if (texto(d.servico).length < 5) return 'Descreva o serviço feito.';
  if (texto(d.servico).length > 2000) return 'Texto longo demais.';
  const erroL = erroLocal(d);
  if (erroL) return erroL;
  if (u.perfil !== 'MECANICO') {
    if (!EXECUCAO[d.execucao]) return 'Escolha interna ou externa.';
    if (d.execucao === 'EXTERNA' && texto(d.oficina_externa).length < 2) return 'Informe o nome da oficina.';
  }
  const quando = /^\d{4}-\d{2}-\d{2}$/.test(texto(d.data_servico)) ? Date.parse(d.data_servico) : NaN;
  if (Number.isNaN(quando)) return 'Data do serviço inválida.';
  if (quando > agora + 24 * 3600 * 1000) return 'A data do serviço está no futuro.';
  const km = lerNumero(d.km), hor = lerNumero(d.horimetro);
  if (km === null && hor === null) return 'Informe o km ou o horímetro.';
  if (Number.isNaN(km) || Number.isNaN(hor) || (km !== null && km < 0) || (hor !== null && hor < 0)) {
    return 'Km e horímetro precisam ser números.';
  }
  if (km !== null && km > 5_000_000) return 'Km fora do esperado.';
  if (hor !== null && hor > 500_000) return 'Horímetro fora do esperado.';
  const fotos = d.fotos || {};
  for (const f of FOTOS_OBRIGATORIAS) if (!fotos[f]) return 'Falta a ' + TIPOS_FOTO[f].toLowerCase() + '.';
  const defeito = Array.isArray(d.fotos_defeito) ? d.fotos_defeito : [];
  if (!defeito.length) return 'Falta pelo menos 1 foto do defeito ou serviço.';
  if (defeito.length > MAX_FOTOS_DEFEITO) return 'No máximo ' + MAX_FOTOS_DEFEITO + ' fotos do defeito.';
  return '';
}

/** Confere a correção de uma OS feita (só a matriz corrige; não mexe em fotos nem em quem fez o serviço). */
export function erroCorrecao(d, agora = Date.now()) {
  if (!GRUPOS[d.grupo]) return 'Escolha o grupo de peças.';
  if (texto(d.servico).length < 5) return 'Descreva o serviço feito.';
  if (texto(d.servico).length > 2000) return 'Texto longo demais.';
  const erroL = erroLocal(d);
  if (erroL) return erroL;
  const quando = /^\d{4}-\d{2}-\d{2}$/.test(texto(d.data_servico)) ? Date.parse(d.data_servico) : NaN;
  if (Number.isNaN(quando)) return 'Data do serviço inválida.';
  if (quando > agora + 24 * 3600 * 1000) return 'A data do serviço está no futuro.';
  const km = lerNumero(d.km), hor = lerNumero(d.horimetro);
  if (km === null && hor === null) return 'Informe o km ou o horímetro.';
  if (Number.isNaN(km) || Number.isNaN(hor) || (km !== null && km < 0) || (hor !== null && hor < 0)) {
    return 'Km e horímetro precisam ser números.';
  }
  if (km !== null && km > 5_000_000) return 'Km fora do esperado.';
  if (hor !== null && hor > 500_000) return 'Horímetro fora do esperado.';
  return '';
}

/** Confere uma solicitação de equipe itinerante (só a filial, sem aprovação). */
export function erroSolicitacao(d, veiculo, u) {
  if (!podeSolicitar(u)) return 'Seu perfil não solicita a equipe itinerante.';
  if (!veiculo) return 'Escolha o veículo.';
  if (veiculo.ativo === false) return 'Veículo inativo no cadastro.';
  if (!filiaisDe(u).includes(veiculo.filial)) return 'Este veículo não é da sua filial.';
  if (texto(d.sintoma).length < 5) return 'Descreva o que está acontecendo.';
  if (texto(d.sintoma).length > 2000) return 'Texto longo demais.';
  return erroLocal(d);
}

/** Confere os valores (opcionais) de peças, mão de obra e deslocamento. Tudo vazio é aceito. */
export function conferirFinanceiro(d) {
  const v = {
    valor_pecas: lerNumero(d.valor_pecas), valor_mao_obra: lerNumero(d.valor_mao_obra),
    valor_deslocamento: lerNumero(d.valor_deslocamento)
  };
  for (const [k, n] of Object.entries(v)) {
    if (Number.isNaN(n) || (n !== null && n < 0)) return { erro: 'Valor inválido: ' + k.replace('valor_', '').replace('_', ' ') + '.' };
  }
  const total = (v.valor_pecas || 0) + (v.valor_mao_obra || 0) + (v.valor_deslocamento || 0);
  return {
    erro: '',
    valores: { ...v, valor_total: total > 0 ? Math.round(total * 100) / 100 : null, nf_numero: texto(d.nf_numero).slice(0, 40),
      fornecedor: texto(d.fornecedor).slice(0, 120) }
  };
}

/** Usuário automático: primeiro nome, minúsculo, sem acento, + "@lokal". Repetido ganha 1, 2, 3... */
export function gerarLogin(nome, existentes) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
  const base = primeiro.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!base) throw new Error('Informe o nome da pessoa.');
  const usados = new Set([...existentes].map((s) => String(s).toLowerCase()));
  if (!usados.has(base + '@lokal')) return base + '@lokal';
  for (let i = 1; ; i++) if (!usados.has(base + i + '@lokal')) return base + i + '@lokal';
}

export function erroNovaSenha(nova, atual) {
  const s = String(nova || '');
  if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (s === SENHA_PADRAO) return 'Escolha uma senha diferente de ' + SENHA_PADRAO + '.';
  if (atual && s === atual) return 'A senha nova precisa ser diferente da atual.';
  return '';
}

/** Número da OS para mostrar: OS-000123. */
export const numeroOS = (id) => 'OS-' + String(id).padStart(6, '0');

/** Nome curto do veículo para listas. */
export function nomeVeiculo(v) {
  if (!v) return '';
  const id = v.placa || ('sem placa · chassi …' + String(v.chassi || '').slice(-6));
  return [id, v.tipo, v.modelo].filter(Boolean).join(' · ');
}
