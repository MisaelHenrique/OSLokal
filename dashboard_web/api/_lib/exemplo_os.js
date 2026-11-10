// Conteúdo de EXEMPLO do sistema de OS (simplificado): usuários (1 equipe de 12 mecânicos), solicitações de equipe
// itinerante e OS feitas (algumas com valores já lançados, algumas externas, algumas respondendo uma solicitação).
// Usado no banco local (npm run dev) e por "npm run exemplo-os" para a demonstração no Supabase.
// Tudo marcado com exemplo = true; "npm run limpar-exemplo" apaga antes de entregar ao cliente.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gerarHash } from './senha.js';
import { registrarSemeador } from './banco.js';
import { gerarLogin, codificarPeca } from '../../public/js/os/regras.js';

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
// [grupo, serviço, peças] — peças vazio (PNE) é um grupo sem lista, controlado à parte.
const SERVICOS = [
  ['FRE', 'Trocar lonas do eixo traseiro', ['Lonas']],
  ['CON', 'Revisão: troca de óleo e filtros', ['Óleos', 'Filtros']],
  ['PNE', 'Trocar 2 pneus dianteiros', []],
  ['ELE', 'Trocar bateria', ['Bateria']],
  ['SUS', 'Trocar feixe de mola dianteira', ['Molas']],
  ['HID', 'Trocar mangueira do cilindro de basculamento', ['Cilindros', 'Mangueiras']],
  ['ARC', 'Recarga de gás e filtro', ['Recarga de gás', 'Filtro de cabine']],
  ['MOT', 'Trocar correia do alternador', ['Correias']],
  ['TRA', 'Regular embreagem', ['Embreagem']],
  ['ROD', 'Trocar rolamento do cubo', ['Rolamentos']]
];
const pecasDoServico = (grupo, lista) => (lista.length ? lista.map((p) => codificarPeca(grupo, p)) : [codificarPeca(grupo, '')]);
const CIDADES = ['Caetité', 'Vitória da Conquista', 'Brumado', 'Guanambi', 'Livramento de Nossa Senhora'];
const OFICINAS = ['Auto Peças Caetité', 'Diesel Center MS', 'Volvo Rental Peças', 'Pneus Bahia'];

/** Solicitações e OS feitas de exemplo, com veículos reais do cadastro. ids a partir de `primeiroId`. */
export function osExemplo(veiculos, usuarios, { primeiroId = 1, agora = Date.now() } = {}) {
  const r = sorteio(20261030);
  const pega = (lista) => lista[Math.floor(r() * lista.length)];
  const mec = usuarios.filter((u) => u.perfil === 'MECANICO').map((u) => u.login);
  const admin = usuarios.find((u) => u.perfil === 'ADMIN').login;
  const daFilial = (f) => (usuarios.find((u) => u.perfil === 'FILIAL' && u.filial.split(';').includes(f)) || {}).login || admin;
  const comPlaca = veiculos.filter((v) => v.placa);
  const os = [], eventos = [];
  let id = primeiroId;
  const h = (horas) => new Date(agora - horas * 3600 * 1000).toISOString();
  const dia = (horas) => h(horas).slice(0, 10);
  const ev = (os_id, etapa, por, em, obs = '') => eventos.push({ os_id, etapa, por, em, obs, exemplo: true });

  const nova = (v, horasAtras) => {
    const quem = v.filial !== 'MATRIZ' && r() < 0.7 ? daFilial(v.filial) : admin;
    return {
      id: id++, chassi: v.chassi, placa: v.placa, veiculo: [v.tipo, v.modelo].filter(Boolean).join(' · '), filial: v.filial,
      cidade: pega(CIDADES), tipo_local: r() < 0.6 ? 'OBRA' : 'GALPAO', sintoma: '', grupo: '', pecas: [], servico: '', data_servico: null,
      execucao: null, oficina_externa: '', direcionada_para: null, auxiliares: [], foto_frente: null, foto_painel: null,
      fotos_defeito: [], os_atendida: null, km: null, horimetro: null, envio_id: null,
      valor_pecas: null, valor_mao_obra: null, valor_deslocamento: null, valor_total: null, nf_numero: '', fornecedor: '', nf_arquivo: null,
      cancelamento_motivo: '', aberta_por: quem, aberta_em: h(horasAtras), alterado_em: h(horasAtras), exemplo: true
    };
  };

  // Solicitações de equipe itinerante: as 5 primeiras já foram respondidas (ver abaixo); 3 ficam em aberto.
  const solicitacoes = [];
  for (let i = 0; i < 8; i++) {
    const horasAtras = 2 + r() * 150;
    const o = { ...nova(pega(comPlaca), horasAtras), status: 'SOLICITADA', sintoma: pega(SINTOMAS) };
    ev(o.id, 'SOLICITADA', o.aberta_por, o.aberta_em);
    solicitacoes.push(o);
    os.push(o);
  }

  // OS feitas: a maioria internas (mecânico da equipe), algumas externas (oficina), algumas com valores já lançados.
  for (let i = 0; i < 25; i++) {
    const v = pega(comPlaca);
    const horasAtras = 1 + r() * 2880; // até ~120 dias, pra variar as 3 cores do semáforo de garantia na demonstração
    const [grupo, servico, pecasBase] = pega(SERVICOS);
    const externa = r() < 0.2;
    const equipe = externa
      ? { execucao: 'EXTERNA', direcionada_para: null, auxiliares: [], oficina_externa: pega(OFICINAS) }
      : { execucao: 'INTERNA', direcionada_para: i === 0 ? mec[0] : pega(mec),
        auxiliares: r() < 0.3 ? [pega(mec)] : [] };
    const responde = i < 5 ? solicitacoes[i] : null;
    const comValores = r() < 0.6;
    const o = {
      ...nova(v, horasAtras), status: 'FEITA', grupo, pecas: pecasDoServico(grupo, pecasBase), servico, data_servico: dia(horasAtras),
      km: Math.round(20000 + r() * 280000), horimetro: r() < 0.3 ? Math.round(1000 + r() * 9000) : null,
      os_atendida: responde ? responde.id : null, ...equipe
    };
    if (equipe.direcionada_para) o.auxiliares = o.auxiliares.filter((m) => m !== o.direcionada_para);
    if (comValores) {
      o.valor_pecas = Math.round(200 + r() * 6000) + Math.round(r() * 99) / 100;
      o.valor_mao_obra = Math.round(150 + r() * 1800);
      o.valor_deslocamento = r() < 0.3 ? Math.round(80 + r() * 400) : null;
      o.valor_total = Math.round((o.valor_pecas + o.valor_mao_obra + (o.valor_deslocamento || 0)) * 100) / 100;
      o.nf_numero = String(1000 + Math.floor(r() * 9000));
      o.fornecedor = pega(OFICINAS);
    }
    ev(o.id, 'LANCADA', o.aberta_por, o.aberta_em);
    if (comValores) ev(o.id, 'VALORES', admin, h(Math.max(0.2, horasAtras - 2)));
    os.push(o);
  }

  // Pares plantados pro cartão do semáforo de garantia: mesmo grupo+peça+posição (FRE:Lonas, 1º eixo · Ambos os
  // lados) em 3 veículos fixos, a 10/45/75 dias — demonstra vermelho/amarelo/verde ao lançar hoje uma OS nova
  // com essa peça NESSA MESMA posição nesses veículos (posição diferente não acende o card, de propósito).
  const SEMAFORO_DEMO = [[0, 10, 'vermelho'], [2, 45, 'amarelo'], [4, 75, 'verde']];
  const POSICAO_SEMAFORO_DEMO = '1º eixo · Ambos os lados';
  for (const [indiceVeiculo, dias, cor] of SEMAFORO_DEMO) {
    const v = comPlaca[indiceVeiculo % comPlaca.length];
    const horasAtras = dias * 24;
    const o = {
      ...nova(v, horasAtras), status: 'FEITA', grupo: 'FRE', pecas: [codificarPeca('FRE', 'Lonas', POSICAO_SEMAFORO_DEMO)],
      servico: 'Trocar lonas do eixo traseiro (' + POSICAO_SEMAFORO_DEMO + ')', data_servico: dia(horasAtras),
      execucao: 'INTERNA', direcionada_para: pega(mec), auxiliares: [],
      km: Math.round(20000 + r() * 280000), horimetro: null
    };
    ev(o.id, 'LANCADA', o.aberta_por, o.aberta_em, 'Exemplo pro semáforo de garantia (' + cor + ', ' + dias + ' dias).');
    os.push(o);
  }

  // Mais 3 placas/serviços plantados, com peças diferentes (não só freio), pra testar o semáforo também na hora
  // de LANÇAR uma OS nova — escolhendo a mesma peça e a mesma posição dessas, o card aparece com a cor certa.
  const SEMAFORO_LANCAMENTO_2 = [
    { indiceVeiculo: 12, grupo: 'SUS', peca: 'Amortecedores', posicao: '2º eixo · Esquerdo', dias: 12, cor: 'vermelho' },
    { indiceVeiculo: 14, grupo: 'ROD', peca: 'Rolamentos', posicao: '1º eixo · Direito', dias: 48, cor: 'amarelo' },
    { indiceVeiculo: 16, grupo: 'FRE', peca: 'Tambores', posicao: '3º eixo · Ambos os lados', dias: 82, cor: 'verde' }
  ];
  for (const { indiceVeiculo, grupo, peca, posicao, dias, cor } of SEMAFORO_LANCAMENTO_2) {
    const v = comPlaca[indiceVeiculo % comPlaca.length];
    const horasAtras = dias * 24;
    const o = {
      ...nova(v, horasAtras), status: 'FEITA', grupo, pecas: [codificarPeca(grupo, peca, posicao)],
      servico: 'Trocar ' + peca.toLowerCase() + ' (' + posicao + ')', data_servico: dia(horasAtras),
      execucao: 'INTERNA', direcionada_para: pega(mec), auxiliares: [],
      km: Math.round(20000 + r() * 280000), horimetro: null
    };
    ev(o.id, 'LANCADA', o.aberta_por, o.aberta_em, 'Exemplo pro semáforo (' + cor + ', ' + dias + ' dias).');
    os.push(o);
  }

  // Mesma peça, posições diferentes no mesmo veículo: prova que o semáforo NÃO acende à toa quando é outro eixo
  // (o problema de "lonas tem lado e posição" apontado pelo Misael). "1º eixo" há ~25 dias e "2º eixo" há ~3
  // dias — nenhuma das duas bate com a outra, então "Últimas manutenções" não mostra selo em nenhuma das duas.
  const veiculoPosicaoDiferente = comPlaca[18 % comPlaca.length];
  for (const { dias, posicao } of [{ dias: 25, posicao: '1º eixo · Esquerdo' }, { dias: 3, posicao: '2º eixo · Esquerdo' }]) {
    const horasAtras = dias * 24;
    const o = {
      ...nova(veiculoPosicaoDiferente, horasAtras), status: 'FEITA', grupo: 'FRE', pecas: [codificarPeca('FRE', 'Lonas', posicao)],
      servico: 'Trocar lonas do eixo traseiro (' + posicao + ')', data_servico: dia(horasAtras),
      execucao: 'INTERNA', direcionada_para: pega(mec), auxiliares: [],
      km: Math.round(20000 + r() * 280000), horimetro: null
    };
    ev(o.id, 'LANCADA', o.aberta_por, o.aberta_em);
    os.push(o);
  }

  // Algumas OS recentes (últimos 7 dias) direcionadas pro joao@lokal (João Silva), pra "Minhas OS" não ficar
  // vazia pra ele na demonstração.
  const JOAO_RECENTE = [[1, 6, 0], [3, 30, 3], [5, 70, 8]]; // [índice do veículo, horas atrás, índice em SERVICOS]
  for (const [indiceVeiculo, horasAtras, indiceServico] of JOAO_RECENTE) {
    const v = comPlaca[indiceVeiculo % comPlaca.length];
    const [grupo, servico, pecasBase] = SERVICOS[indiceServico % SERVICOS.length];
    const o = {
      ...nova(v, horasAtras), status: 'FEITA', grupo, pecas: pecasDoServico(grupo, pecasBase), servico, data_servico: dia(horasAtras),
      execucao: 'INTERNA', direcionada_para: 'joao@lokal', auxiliares: [],
      km: Math.round(20000 + r() * 280000), horimetro: null,
      aberta_por: 'joao@lokal' // quem lançou, não só quem fez — "Minhas OS" do mecânico filtra por aberta_por (ver podeVer em regras.js)
    };
    ev(o.id, 'LANCADA', o.aberta_por, o.aberta_em);
    os.push(o);
  }

  // Reincidência de verdade (duas OS guardadas, não só comparadas com hoje): mesma troca de lona de freio
  // voltando a acontecer no mesmo veículo, nos 3 intervalos do semáforo — pra "Últimas manutenções" (no card do
  // veículo, na tela da OS) já nascer com o selo colorido, sem precisar lançar nada na mão.
  const REINCIDENCIA_DEMO = [
    { indiceVeiculo: 6, diasAntiga: 23, diasNova: 3 },  // ~20 dias entre as duas → vermelho
    { indiceVeiculo: 8, diasAntiga: 50, diasNova: 5 },  // ~45 dias entre as duas → amarelo
    { indiceVeiculo: 10, diasAntiga: 74, diasNova: 4 }  // ~70 dias entre as duas → verde
  ];
  const POSICAO_REINCIDENCIA_DEMO = '2º eixo · Direito';
  for (const { indiceVeiculo, diasAntiga, diasNova } of REINCIDENCIA_DEMO) {
    const v = comPlaca[indiceVeiculo % comPlaca.length];
    for (const dias of [diasAntiga, diasNova]) {
      const horasAtras = dias * 24;
      const o = {
        ...nova(v, horasAtras), status: 'FEITA', grupo: 'FRE', pecas: [codificarPeca('FRE', 'Lonas', POSICAO_REINCIDENCIA_DEMO)],
        servico: 'Trocar lonas do eixo traseiro (' + POSICAO_REINCIDENCIA_DEMO + ')', data_servico: dia(horasAtras),
        execucao: 'INTERNA', direcionada_para: pega(mec), auxiliares: [],
        km: Math.round(20000 + r() * 280000), horimetro: null
      };
      ev(o.id, 'LANCADA', o.aberta_por, o.aberta_em);
      os.push(o);
    }
  }

  // Canceladas: registro errado, só a matriz cancela.
  for (let i = 0; i < 2; i++) {
    const v = pega(comPlaca);
    const horasAtras = 10 + r() * 200;
    const [grupo, servico, pecasBase] = pega(SERVICOS);
    const canceladaEm = h(Math.max(0.1, horasAtras - 1));
    const o = {
      ...nova(v, horasAtras), status: 'CANCELADA', grupo, pecas: pecasDoServico(grupo, pecasBase), servico, data_servico: dia(horasAtras),
      km: Math.round(20000 + r() * 280000), execucao: 'INTERNA', direcionada_para: mec[0],
      cancelada_por: admin, cancelada_em: canceladaEm, cancelamento_motivo: 'Aberta em duplicidade.'
    };
    ev(o.id, 'LANCADA', o.aberta_por, o.aberta_em);
    ev(o.id, 'CANCELADA', admin, canceladaEm, o.cancelamento_motivo);
    os.push(o);
  }

  return { os, os_eventos: eventos };
}

registrarSemeador(() => {
  const veiculos = veiculosDaPlanilha();
  const usuarios = usuariosExemplo();
  return { veiculos, usuarios, ...osExemplo(veiculos, usuarios) };
});
