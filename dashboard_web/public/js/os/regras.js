// Regras do sistema de OS: etapas, quem vê e quem faz o quê. Funções puras, usadas pelo servidor (api/os.js)
// e pelas telas. O servidor sempre confere de novo: a tela só usa para mostrar ou esconder botões.
import { GRUPOS } from '../sistema.js';

export const STATUS = {
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  DEVOLVIDA: 'Devolvida à filial',
  APROVADA: 'Aprovada',
  DIRECIONADA: 'Direcionada',
  EM_EXECUCAO: 'Em execução',
  EXECUTADA: 'Executada',
  FECHADA: 'Fechada',
  CANCELADA: 'Cancelada'
};
export const ABERTAS = ['AGUARDANDO_APROVACAO', 'DEVOLVIDA', 'APROVADA', 'DIRECIONADA', 'EM_EXECUCAO', 'EXECUTADA'];

export const TIPOS = { DIAGNOSTICO: 'Diagnóstico', SERVICO: 'Serviço' };
export const RESULTADOS = { RESOLVIDO: 'Resolvido na hora', PRECISA_SERVICO: 'Precisa de serviço' };
export const PERFIS = { ADMIN: 'Matriz (administrador)', FILIAL: 'Filial', MECANICO: 'Mecânico', DIRETORIA: 'Diretoria' };
export const SENHA_PADRAO = 'mudar123';

export const TIPOS_FOTO = {
  placa: 'Foto da placa', servico: 'Foto do serviço', km: 'Foto do painel (km)', horimetro: 'Foto do horímetro',
  problema: 'Foto do problema', nf: 'Nota fiscal'
};
export const FOTOS_FECHAMENTO = ['placa', 'servico', 'km', 'horimetro'];
export const FOTOS_OBRIGATORIAS = ['placa', 'servico'];

export const CAMPOS_FINANCEIROS = ['valor_pecas', 'valor_mao_obra', 'valor_deslocamento', 'valor_total', 'nf_numero',
  'fornecedor', 'nf_arquivo'];

export function filiaisDe(u) {
  return String((u && u.filial) || '').split(';').map((s) => s.trim()).filter(Boolean);
}

export function ehResponsavel(u, os) {
  return !!u && u.perfil === 'MECANICO' && os.direcionada_para === u.login;
}

export function ehAjudante(u, os) {
  return !!u && u.perfil === 'MECANICO' && (os.ajudantes || []).includes(u.login);
}

/** Quem enxerga a OS. Mecânico só a que está com ele (responsável ou ajudante) depois de direcionada. */
export function podeVer(u, os) {
  if (!u || !os) return false;
  if (u.perfil === 'ADMIN' || u.perfil === 'DIRETORIA') return true;
  if (u.perfil === 'FILIAL') return filiaisDe(u).includes(os.filial);
  if (u.perfil === 'MECANICO') {
    return ['DIRECIONADA', 'EM_EXECUCAO', 'EXECUTADA', 'FECHADA'].includes(os.status) && (ehResponsavel(u, os) || ehAjudante(u, os));
  }
  return false;
}

/** Cópia da OS sem o que o perfil não pode ver: mecânico nunca vê valores; filial só depois de fechada. */
export function recortarOS(u, os) {
  const c = { ...os };
  const esconder = u.perfil === 'MECANICO' || (u.perfil === 'FILIAL' && os.status !== 'FECHADA');
  if (esconder) CAMPOS_FINANCEIROS.forEach((k) => { delete c[k]; });
  return c;
}

/** Ações que este usuário pode fazer agora nesta OS. */
export function acoesPossiveis(u, os) {
  if (!podeVer(u, os)) return [];
  const s = os.status;
  const a = [];
  if (u.perfil === 'ADMIN') {
    if (s === 'AGUARDANDO_APROVACAO') a.push('aprovar', 'devolver');
    if (s === 'DEVOLVIDA') a.push('reenviar');
    if (['APROVADA', 'DIRECIONADA', 'EM_EXECUCAO'].includes(s)) a.push('direcionar');
    if (s === 'EXECUTADA') a.push('financeiro');
    if (['AGUARDANDO_APROVACAO', 'DEVOLVIDA', 'APROVADA', 'DIRECIONADA', 'EM_EXECUCAO'].includes(s)) a.push('cancelar');
    if (os.tipo === 'DIAGNOSTICO' && os.resultado === 'PRECISA_SERVICO' && !os.os_servico &&
      ['EXECUTADA', 'FECHADA'].includes(s)) a.push('gerar_servico');
  } else if (u.perfil === 'FILIAL') {
    if (s === 'DEVOLVIDA') a.push('reenviar');
    if (['AGUARDANDO_APROVACAO', 'DEVOLVIDA'].includes(s)) a.push('cancelar');
  } else if (u.perfil === 'MECANICO' && ehResponsavel(u, os)) {
    if (s === 'DIRECIONADA') a.push('iniciar', 'executar');
    if (s === 'EM_EXECUCAO') a.push('executar');
  }
  return a;
}

export function podeAbrir(u) {
  return !!u && (u.perfil === 'ADMIN' || u.perfil === 'FILIAL');
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

/** Confere os dados de abertura. Devolve a mensagem de erro ou '' se estiver tudo certo. */
export function erroAbertura(d, veiculo, u) {
  if (!podeAbrir(u)) return 'Seu perfil não abre OS.';
  if (!veiculo) return 'Escolha o veículo.';
  if (veiculo.ativo === false) return 'Veículo inativo no cadastro.';
  if (u.perfil === 'FILIAL' && !filiaisDe(u).includes(veiculo.filial)) return 'Este veículo não é da sua filial.';
  if (!TIPOS[d.tipo]) return 'Escolha o tipo: diagnóstico ou serviço.';
  if (d.tipo === 'DIAGNOSTICO' && texto(d.sintoma).length < 5) return 'Descreva o sintoma (o que está acontecendo).';
  if (d.tipo === 'SERVICO') {
    if (!GRUPOS[d.grupo]) return 'Escolha o grupo de peças.';
    if (texto(d.servico).length < 5) return 'Descreva o serviço a fazer.';
  }
  if (texto(d.local_servico).length < 3) return 'Informe o local do serviço.';
  if (texto(d.sintoma).length > 2000 || texto(d.servico).length > 2000) return 'Texto longo demais.';
  return '';
}

/** Confere o fechamento do mecânico. */
export function erroFechamento(d, os, agora = Date.now()) {
  if (!os) return 'OS não encontrada.';
  const km = lerNumero(d.km), hor = lerNumero(d.horimetro);
  if (km === null && hor === null) return 'Informe o km ou o horímetro.';
  if (Number.isNaN(km) || Number.isNaN(hor) || (km !== null && km < 0) || (hor !== null && hor < 0)) {
    return 'Km e horímetro precisam ser números.';
  }
  if (km !== null && km > 5_000_000) return 'Km fora do esperado.';
  if (hor !== null && hor > 500_000) return 'Horímetro fora do esperado.';
  const fotos = d.fotos || {};
  for (const f of FOTOS_OBRIGATORIAS) if (!fotos[f]) return 'Falta a ' + TIPOS_FOTO[f].toLowerCase() + '.';
  if (os.tipo === 'DIAGNOSTICO' && !RESULTADOS[d.resultado]) return 'Diga se resolveu na hora ou se precisa de serviço.';
  if (texto(d.defeito_encontrado).length > 1000) return 'Texto longo demais.';
  const quando = Date.parse(d.executada_em);
  if (!quando) return 'Data do fechamento inválida.';
  if (quando > agora + 10 * 60 * 1000) return 'A data do fechamento está no futuro. Confira o relógio do celular.';
  if (os.aberta_em && quando < Date.parse(os.aberta_em) - 60 * 1000) return 'A data do fechamento é anterior à abertura da OS.';
  return '';
}

/** Confere os valores do administrador e devolve { erro, valores }. */
export function conferirFinanceiro(d) {
  const v = {
    valor_pecas: lerNumero(d.valor_pecas), valor_mao_obra: lerNumero(d.valor_mao_obra),
    valor_deslocamento: lerNumero(d.valor_deslocamento)
  };
  for (const [k, n] of Object.entries(v)) {
    if (Number.isNaN(n) || (n !== null && n < 0)) return { erro: 'Valor inválido: ' + k.replace('valor_', '').replace('_', ' ') + '.' };
  }
  if (!(v.valor_pecas > 0) && !(v.valor_mao_obra > 0)) return { erro: 'Informe o valor de peças ou de mão de obra.' };
  const total = (v.valor_pecas || 0) + (v.valor_mao_obra || 0) + (v.valor_deslocamento || 0);
  return {
    erro: '',
    valores: { ...v, valor_total: Math.round(total * 100) / 100, nf_numero: texto(d.nf_numero).slice(0, 40),
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
