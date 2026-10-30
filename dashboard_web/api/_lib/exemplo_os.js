// Conteúdo de EXEMPLO do sistema de OS: usuários (1 equipe de 12 mecânicos) e OS em todas as etapas.
// Usado no banco local (npm run dev) e por "npm run exemplo-os" para a demonstração no Supabase.
// Tudo marcado com exemplo = true; "npm run limpar-exemplo" apaga antes de entregar ao cliente.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gerarHash } from './senha.js';
import { registrarSemeador } from './banco.js';
import { gerarLogin } from '../../public/js/os/regras.js';

export const SENHA_EXEMPLO = 'lokal1234';

export function veiculosDaPlanilha() {
  return JSON.parse(readFileSync(join(process.cwd(), 'exemplo', 'veiculos.json'), 'utf8')).veiculos;
}

const PESSOAS = [
  ['Matriz Exemplo', 'ADMIN', '', ''],
  ['Diretoria Exemplo', 'DIRETORIA', '', ''],
  ['Luís André Exemplo', 'FILIAL', 'LUÍS ANDRÉ', ''],
  ['José Geraldo Exemplo', 'FILIAL', 'JOSÉ GERALDO', ''],
  ['Thiago Santiago Exemplo', 'FILIAL', 'THIAGO SANTIAGO', ''],
  ['Álvaro Júnior Exemplo', 'FILIAL', 'ÁLVARO JÚNIOR', ''],
  ['Pátio Matriz Exemplo', 'FILIAL', 'MATRIZ;OUTROS', ''],
  ['João Silva', 'MECANICO', '', 'Equipe itinerante'],
  ['João Pereira', 'MECANICO', '', 'Equipe itinerante'],
  ['Pedro Alves', 'MECANICO', '', 'Equipe itinerante'],
  ['Marcos Souza', 'MECANICO', '', 'Equipe itinerante'],
  ['Rafael Lima', 'MECANICO', '', 'Equipe itinerante'],
  ['Bruno Costa', 'MECANICO', '', 'Equipe itinerante'],
  ['Diego Rocha', 'MECANICO', '', 'Equipe itinerante'],
  ['Lucas Martins', 'MECANICO', '', 'Equipe itinerante'],
  ['Fábio Gomes', 'MECANICO', '', 'Equipe itinerante'],
  ['Renato Dias', 'MECANICO', '', 'Equipe itinerante'],
  ['Sérgio Ribeiro', 'MECANICO', '', 'Equipe itinerante'],
  ['Edson Barbosa', 'MECANICO', '', 'Equipe itinerante']
];

export function usuariosExemplo(existentes = []) {
  const hash = gerarHash(SENHA_EXEMPLO);
  const usados = [...existentes];
  const agora = new Date().toISOString();
  return PESSOAS.map(([nome, perfil, filial, equipe]) => {
    // os de exemplo levam o perfil no login (matriz@lokal...) para facilitar o teste; mecânicos seguem a regra do nome
    const login = perfil === 'MECANICO' ? gerarLogin(nome, usados)
      : gerarLogin(nome.split(' ')[0] === 'Pátio' ? 'patio' : nome.split(' ')[0], usados);
    usados.push(login);
    return { login, nome, perfil, filial, equipe, senha_hash: hash, trocar_senha: false, ativo: true, exemplo: true,
      criado_em: agora, alterado_em: agora };
  });
}

// Gerador pseudoaleatório fixo, para o exemplo sair igual toda vez.
function sorteio(semente) {
  let s = semente;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

const SINTOMAS = ['Perdendo força na subida', 'Luz de injeção acesa no painel', 'Barulho na roda traseira ao frear',
  'Vazamento de óleo embaixo do motor', 'Ar-condicionado não gela', 'Caçamba não sobe até o fim',
  'Bomba d\'água do implemento sem pressão', 'Pedal de freio baixo', 'Fumaça preta ao acelerar', 'Não dá partida pela manhã'];
const SERVICOS = [['FRE', 'Trocar lonas do eixo traseiro'], ['CON', 'Revisão: troca de óleo e filtros'], ['PNE', 'Trocar 2 pneus dianteiros'],
  ['ELE', 'Trocar bateria'], ['SUS', 'Trocar feixe de mola dianteira'], ['HID', 'Trocar mangueira do cilindro de basculamento'],
  ['ARC', 'Recarga de gás e filtro'], ['MOT', 'Trocar correia do alternador'], ['TRA', 'Regular embreagem'], ['ROD', 'Trocar rolamento do cubo']];

/** OS de exemplo em todas as etapas, com veículos reais do cadastro. ids a partir de `primeiroId`. */
export function osExemplo(veiculos, usuarios, { primeiroId = 1, agora = Date.now() } = {}) {
  const r = sorteio(20261030);
  const pega = (lista) => lista[Math.floor(r() * lista.length)];
  const mec = usuarios.filter((u) => u.perfil === 'MECANICO').map((u) => u.login);
  const admin = usuarios.find((u) => u.perfil === 'ADMIN').login;
  const daFilial = (f) => (usuarios.find((u) => u.perfil === 'FILIAL' && u.filial.split(';').includes(f)) || {}).login || admin;
  const comPlaca = veiculos.filter((v) => v.placa);
  const plano = [
    ['AGUARDANDO_APROVACAO', 4], ['DEVOLVIDA', 1], ['APROVADA', 3], ['DIRECIONADA', 5], ['EM_EXECUCAO', 3],
    ['EXECUTADA', 4], ['FECHADA', 12], ['CANCELADA', 1]
  ];
  const os = [], eventos = [];
  const comEmExecucao = new Set();
  let id = primeiroId;
  const h = (horas) => new Date(agora - horas * 3600 * 1000).toISOString();
  plano.forEach(([status, n]) => {
    for (let i = 0; i < n; i++) {
      const v = pega(comPlaca);
      const diag = r() < 0.4;
      const [grupo, servico] = pega(SERVICOS);
      const idade = status === 'FECHADA' ? 24 * (5 + r() * 80) : 2 + r() * 70;
      const abertaPorFilial = v.filial !== 'MATRIZ' && r() < 0.7;
      const quem = abertaPorFilial ? daFilial(v.filial) : admin;
      const o = {
        id, tipo: diag ? 'DIAGNOSTICO' : 'SERVICO', status, chassi: v.chassi, placa: v.placa,
        veiculo: [v.tipo, v.modelo].filter(Boolean).join(' · '), filial: v.filial,
        local_servico: v.obra || 'Pátio Matriz', parado: r() < 0.35,
        sintoma: diag ? pega(SINTOMAS) : '', grupo: diag ? '' : grupo, servico: diag ? '' : servico, fotos_problema: [],
        aberta_por: quem, aberta_em: h(idade), ajudantes: [], devolucao_motivo: '', defeito_encontrado: '',
        nf_numero: '', fornecedor: '', cancelamento_motivo: '', exemplo: true
      };
      const ev = (etapa, por, horasAtras, obs = '') => eventos.push({ os_id: id, etapa, por, em: h(horasAtras), obs, exemplo: true });
      ev('ABERTA', quem, idade);
      let t = idade;
      const passo = () => { t = Math.max(0.2, t - (0.5 + r() * Math.min(20, t / 4))); return t; };
      if (status === 'DEVOLVIDA') {
        o.devolucao_motivo = 'Informe a obra exata onde o caminhão está.';
        ev('DEVOLVIDA', admin, passo(), o.devolucao_motivo);
      }
      if (status === 'CANCELADA') {
        o.cancelada_por = admin; o.cancelada_em = h(passo()); o.cancelamento_motivo = 'Aberta em duplicidade.';
        ev('CANCELADA', admin, t, o.cancelamento_motivo);
      }
      const depois = ['APROVADA', 'DIRECIONADA', 'EM_EXECUCAO', 'EXECUTADA', 'FECHADA'];
      if (depois.includes(status)) {
        o.aprovada_por = admin; o.aprovada_em = abertaPorFilial ? h(passo()) : o.aberta_em;
        if (abertaPorFilial) ev('APROVADA', admin, t);
      }
      if (depois.slice(1).includes(status)) {
        // o primeiro mecânico (joao@lokal) sempre tem serviço na lista, para a demonstração. Em EM_EXECUCAO,
        // no máximo 1 por mecânico (mesma regra do sistema de verdade: não dá pra iniciar duas ao mesmo tempo).
        if (status === 'EM_EXECUCAO') {
          o.direcionada_para = i === 0 ? mec[0] : pega(mec.filter((m) => !comEmExecucao.has(m)));
          comEmExecucao.add(o.direcionada_para);
        } else {
          o.direcionada_para = status === 'DIRECIONADA' && i < 2 ? mec[0] : pega(mec);
        }
        o.direcionada_por = admin; o.direcionada_em = h(passo());
        if (r() < 0.3) o.ajudantes = [pega(mec.filter((m) => m !== o.direcionada_para))];
        ev('DIRECIONADA', admin, t, o.direcionada_para);
      }
      if (depois.slice(2).includes(status)) {
        o.iniciada_em = h(passo());
        ev('INICIADA', o.direcionada_para, t);
      }
      if (depois.slice(3).includes(status)) {
        o.executada_em = h(passo()); o.recebida_em = o.executada_em;
        o.km = Math.round(20000 + r() * 280000); o.horimetro = r() < 0.4 ? Math.round(1000 + r() * 9000) : null;
        if (diag) {
          o.resultado = r() < 0.5 ? 'RESOLVIDO' : 'PRECISA_SERVICO';
          o.defeito_encontrado = o.resultado === 'PRECISA_SERVICO' ? 'Bico injetor do 3º cilindro com defeito' : 'Mangueira solta, reapertada';
        }
        ev('EXECUTADA', o.direcionada_para, t);
      }
      if (status === 'FECHADA') {
        o.valor_pecas = Math.round(200 + r() * 6000) + Math.round(r() * 99) / 100;
        o.valor_mao_obra = Math.round(150 + r() * 1800);
        o.valor_deslocamento = r() < 0.3 ? Math.round(80 + r() * 400) : null;
        o.valor_total = Math.round((o.valor_pecas + o.valor_mao_obra + (o.valor_deslocamento || 0)) * 100) / 100;
        o.nf_numero = String(1000 + Math.floor(r() * 9000)); o.fornecedor = pega(['Auto Peças Caetité', 'Diesel Center MS', 'Volvo Rental Peças', 'Pneus Bahia']);
        o.fechada_por = admin; o.fechada_em = h(passo());
        ev('FECHADA', admin, t);
      }
      o.alterado_em = h(t);
      os.push(o);
      id++;
    }
  });
  return { os, os_eventos: eventos };
}

registrarSemeador(() => {
  const veiculos = veiculosDaPlanilha();
  const usuarios = usuariosExemplo();
  return { veiculos, usuarios, ...osExemplo(veiculos, usuarios) };
});
