import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarLogin, lerNumero, conferirFinanceiro, erroNovaSenha, erroLancamento, erroSolicitacao, erroCorrecao, podeVer,
  recortarOS, acoesPossiveis, pecasDoGrupo, codificarPeca, decodificarPeca, erroPecas, semaforoPeca, melhorSemaforo,
  MAX_NOTAS, relatorioReincidencias } from '../public/js/os/regras.js';

test('login automático: primeiro nome sem acento + @lokal, repetidos numerados a partir de 1', () => {
  assert.equal(gerarLogin('André Souza', []), 'andre@lokal');
  assert.equal(gerarLogin('André Lima', ['andre@lokal']), 'andre1@lokal');
  assert.equal(gerarLogin('ANDRE x', ['andre@lokal', 'andre1@lokal']), 'andre2@lokal');
  assert.equal(gerarLogin('  João  da Silva', []), 'joao@lokal');
  assert.equal(gerarLogin('Fábio', ['andre@lokal']), 'fabio@lokal');
  assert.throws(() => gerarLogin('   ', []));
});

test('números em formato brasileiro', () => {
  assert.equal(lerNumero('1.765,44'), 1765.44);
  assert.equal(lerNumero('R$ 1.765,44'), 1765.44);
  assert.equal(lerNumero('120.500'), 120500);
  assert.equal(lerNumero('1765.44'), 1765.44);
  assert.equal(lerNumero(''), null);
  assert.ok(Number.isNaN(lerNumero('abc')));
});

test('financeiro soma o total e aceita tudo vazio (valores são opcionais)', () => {
  assert.equal(conferirFinanceiro({}).erro, '');
  assert.equal(conferirFinanceiro({}).valores.valor_total, null);
  assert.equal(conferirFinanceiro({ valor_pecas: '10,10', valor_mao_obra: '0,20', valor_deslocamento: '' }).valores.valor_total, 10.3);
  assert.ok(conferirFinanceiro({ valor_pecas: '-1' }).erro);
});

test('financeiro aceita zero ou várias notas fiscais e confere cada uma', () => {
  assert.deepEqual(conferirFinanceiro({}).valores.notas, []);
  const r = conferirFinanceiro({ notas: [{ numero: '1', fornecedor: 'A', valor: '10,50' }, { numero: '2', fornecedor: 'B', valor: '' }] });
  assert.equal(r.erro, '');
  assert.equal(r.valores.notas.length, 2);
  assert.equal(r.valores.notas[0].valor, 10.5);
  assert.equal(r.valores.notas[1].valor, null);
  assert.ok(conferirFinanceiro({ notas: [{ numero: '1', valor: '-5' }] }).erro, 'valor negativo numa nota é inválido');
  assert.ok(conferirFinanceiro({ notas: Array.from({ length: MAX_NOTAS + 1 }, () => ({})) }).erro, 'passa do máximo de notas');
});

const VEICULO = { chassi: 'ABC123', placa: 'ABC-1234', filial: 'LUÍS ANDRÉ', ativo: true };
const BASE_LANCAMENTO = {
  pecas: ['FRE:Lonas:1º eixo · Direito'], servico: 'Trocar lonas do eixo traseiro', cidade: 'Caetité', tipo_local: 'OBRA',
  execucao: 'INTERNA', data_servico: '2026-11-01', km: '100', fotos: { frente: 'a', painel: 'b' }, fotos_defeito: ['c']
};
const HOJE = Date.parse('2026-11-09T12:00:00.000Z');

test('lançamento: exige cada campo e aceita o caso válido', () => {
  const u = { perfil: 'FILIAL', filial: 'LUÍS ANDRÉ', login: 'luis@lokal' };
  assert.equal(erroLancamento(BASE_LANCAMENTO, VEICULO, u, HOJE), '', 'caso válido não devia dar erro');
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, pecas: [] }, VEICULO, u, HOJE), /grupo e peça/);
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, servico: 'oi' }, VEICULO, u, HOJE), /serviço feito/);
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, cidade: 'a' }, VEICULO, u, HOJE), /cidade/);
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, tipo_local: '' }, VEICULO, u, HOJE), /obra ou galpão/);
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, execucao: '' }, VEICULO, u, HOJE), /interna ou externa/);
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, execucao: 'EXTERNA', oficina_externa: '' }, VEICULO, u, HOJE), /oficina/);
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, data_servico: 'não é data' }, VEICULO, u, HOJE), /inválida/);
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, data_servico: '2026-11-11' }, VEICULO, u, HOJE), /futuro/);
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, km: '', horimetro: '' }, VEICULO, u, HOJE), /km ou o horímetro/);
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, km: '5000001' }, VEICULO, u, HOJE), /Km fora do esperado/);
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, km: '', horimetro: '500001' }, VEICULO, u, HOJE), /Horímetro fora do esperado/);
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, fotos: { frente: 'a' } }, VEICULO, u, HOJE), /painel/);
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, fotos_defeito: [] }, VEICULO, u, HOJE), /pelo menos 1 foto/);
  assert.match(erroLancamento({ ...BASE_LANCAMENTO, fotos_defeito: ['a', 'b', 'c', 'd'] }, VEICULO, u, HOJE), /no máximo 3/i);
  assert.match(erroLancamento(BASE_LANCAMENTO, VEICULO, { perfil: 'FILIAL', filial: 'OUTRA' }, HOJE), /não é da sua filial/);
  assert.match(erroLancamento(BASE_LANCAMENTO, VEICULO, { perfil: 'DIRETORIA' }, HOJE), /não lança/);
});

test('lançamento do mecânico não exige execução nem oficina (sempre interna, forçado no servidor)', () => {
  const u = { perfil: 'MECANICO', login: 'joao@lokal' };
  const { execucao, ...semExecucao } = BASE_LANCAMENTO;
  assert.equal(erroLancamento(semExecucao, VEICULO, u, HOJE), '');
});

test('solicitação de equipe itinerante: só a filial, sem aprovação', () => {
  const u = { perfil: 'FILIAL', filial: 'LUÍS ANDRÉ' };
  const base = { sintoma: 'Luz de injeção acesa no painel', cidade: 'Caetité', tipo_local: 'GALPAO' };
  assert.equal(erroSolicitacao(base, VEICULO, u), '');
  assert.match(erroSolicitacao({ ...base, sintoma: 'oi' }, VEICULO, u), /o que está acontecendo/);
  assert.match(erroSolicitacao(base, VEICULO, { perfil: 'MECANICO' }), /não solicita/);
  assert.match(erroSolicitacao(base, VEICULO, { perfil: 'FILIAL', filial: 'OUTRA' }), /não é da sua filial/);
});

test('correção: mesmos limites do lançamento, mas sem execução/oficina/fotos', () => {
  const base = { grupo: 'FRE', servico: 'Trocar lonas do eixo traseiro', cidade: 'Caetité', tipo_local: 'OBRA',
    data_servico: '2026-11-01', km: '100' };
  assert.equal(erroCorrecao(base, HOJE), '');
  assert.match(erroCorrecao({ ...base, grupo: '' }, HOJE), /grupo de peças/);
  assert.match(erroCorrecao({ ...base, data_servico: '2026-11-11' }, HOJE), /futuro/);
  assert.match(erroCorrecao({ ...base, km: '', horimetro: '' }, HOJE), /km ou o horímetro/);
});

test('codificação de peça: "GRUPO:Peça[:Posição]", ida e volta', () => {
  assert.equal(codificarPeca('FRE', 'Lonas'), 'FRE:Lonas');
  assert.deepEqual(decodificarPeca('FRE:Lonas'), { grupo: 'FRE', peca: 'Lonas', posicao: '' });
  assert.equal(codificarPeca('FRE', 'Lonas', '1º eixo · Direito'), 'FRE:Lonas:1º eixo · Direito');
  assert.deepEqual(decodificarPeca('FRE:Lonas:1º eixo · Direito'), { grupo: 'FRE', peca: 'Lonas', posicao: '1º eixo · Direito' });
  assert.equal(decodificarPeca(''), null);
  assert.equal(decodificarPeca('sem dois pontos'), null);
});

test('peças por grupo: catálogo fixo, IMP por tipo de veículo e PNE sem lista', () => {
  assert.ok(pecasDoGrupo('FRE').includes('Lonas'));
  assert.deepEqual(pecasDoGrupo('PNE'), []);
  assert.ok(pecasDoGrupo('IMP', 'Caçamba').includes('Báscula'));
  assert.ok(pecasDoGrupo('IMP', 'Pipa').includes('Tanque'));
  assert.ok(!pecasDoGrupo('IMP', 'Caçamba').includes('Tanque'));
  // tipo desconhecido: cai pra união de tudo, não quebra
  const uniao = pecasDoGrupo('IMP', 'Tipo que não existe');
  assert.ok(uniao.includes('Báscula') && uniao.includes('Tanque'));
});

test('erroPecas: exige pelo menos uma dupla válida; grupo sem catálogo aceita peça vazia', () => {
  assert.equal(erroPecas(['FRE:Lonas:1º eixo · Direito'], 'Caçamba'), '');
  assert.match(erroPecas([], 'Caçamba'), /grupo e peça/);
  assert.match(erroPecas(['XXX:Nada'], 'Caçamba'), /inválido/);
  assert.match(erroPecas(['FRE:PeçaQueNãoExiste'], 'Caçamba'), /inválida/);
  assert.equal(erroPecas(['PNE:'], 'Caçamba'), '', 'PNE não tem lista — peça vazia é aceita');
  // bateria não tem lado/eixo — não exige posição; lona (freio) exige
  assert.equal(erroPecas(['ELE:Bateria'], 'Caçamba'), '', 'peça sem posição não exige nada extra');
  assert.match(erroPecas(['FRE:Lonas'], 'Caçamba'), /eixo e o lado/, 'lona exige posição');
  assert.match(erroPecas(['FRE:Lonas:posição qualquer'], 'Caçamba'), /eixo e o lado/, 'posição tem que ser eixo válido · lado válido');
  assert.equal(erroPecas(['SUS:Amortecedores:3º eixo · Ambos os lados'], 'Caçamba'), '');
});

test('semáforo de garantia: 0-30 vermelho, 31-60 amarelo, 61-90 verde, fora disso sem cartão', () => {
  assert.equal(semaforoPeca('2026-11-09', '2026-11-09').cor, 'vermelho'); // 0 dias
  assert.equal(semaforoPeca('2026-11-09', '2026-10-10').cor, 'vermelho'); // 30 dias
  assert.equal(semaforoPeca('2026-11-09', '2026-10-09').cor, 'amarelo'); // 31 dias
  assert.equal(semaforoPeca('2026-11-09', '2026-09-10').cor, 'amarelo'); // 60 dias
  assert.equal(semaforoPeca('2026-11-09', '2026-09-09').cor, 'verde'); // 61 dias
  assert.equal(semaforoPeca('2026-11-09', '2026-08-11').cor, 'verde'); // 90 dias
  assert.equal(semaforoPeca('2026-11-09', '2026-08-10'), null); // 91 dias — sem cartão
  assert.equal(semaforoPeca('2026-11-09', '2026-11-10'), null); // manutenção "no futuro" em relação à atual — sem cartão
});

test('melhorSemaforo: cruza peças com histórico e fica com a reincidência mais urgente', () => {
  const historico = [
    { grupo: 'FRE', peca: 'Lonas', data_servico: '2026-10-09' },  // 31 dias antes de 2026-11-09 → amarelo
    { grupo: 'FRE', peca: 'Lonas', data_servico: '2026-10-25' },  // 15 dias antes → vermelho (mais urgente)
    { grupo: 'ELE', peca: 'Bateria', data_servico: '2026-01-01' } // fora da janela de 90 dias
  ];
  const r = melhorSemaforo([{ grupo: 'FRE', peca: 'Lonas' }], '2026-11-09', historico);
  assert.equal(r.cor, 'vermelho');
  assert.equal(r.dias, 15);
  assert.equal(r.dataAnterior, '2026-10-25');
  assert.equal(melhorSemaforo([{ grupo: 'ELE', peca: 'Bateria' }], '2026-11-09', historico), null);
  assert.equal(melhorSemaforo([], '2026-11-09', historico), null);
});

test('melhorSemaforo com posição: só acende se for o mesmo eixo/lado; sem posição de um dos lados, compara frouxo (como antes)', () => {
  const historico = [{ grupo: 'FRE', peca: 'Lonas', posicao: '1º eixo · Direito', data_servico: '2026-10-25' }]; // 15 dias
  // posição igual: bate
  const bate = melhorSemaforo([{ grupo: 'FRE', peca: 'Lonas', posicao: '1º eixo · Direito' }], '2026-11-09', historico);
  assert.equal(bate.cor, 'vermelho');
  assert.equal(bate.posicao, '1º eixo · Direito');
  // posição diferente: não bate (o caso que o Misael apontou — lona de outro eixo não é a mesma manutenção)
  assert.equal(melhorSemaforo([{ grupo: 'FRE', peca: 'Lonas', posicao: '2º eixo · Direito' }], '2026-11-09', historico), null);
  // lançamento novo sem informar posição (não devia acontecer pro formulário, mas no histórico antigo acontece):
  // sem posição de um dos lados, volta a comparar só por grupo+peça
  const semPosicaoNoAlvo = melhorSemaforo([{ grupo: 'FRE', peca: 'Lonas', posicao: '' }], '2026-11-09', historico);
  assert.equal(semPosicaoNoAlvo.cor, 'vermelho');
  const semPosicaoNoHistorico = melhorSemaforo([{ grupo: 'FRE', peca: 'Lonas', posicao: '2º eixo · Direito' }], '2026-11-09',
    [{ grupo: 'FRE', peca: 'Lonas', posicao: '', data_servico: '2026-10-25' }]);
  assert.equal(semPosicaoNoHistorico.cor, 'vermelho');
});

test('relatorioReincidencias: cruza cada veículo com o próprio histórico, atribui ao responsável da 1ª troca (não da 2ª) e aponta o que ainda está em garantia hoje', () => {
  const osList = [
    { id: 1, status: 'FEITA', chassi: 'A1', placa: 'AAA-0001', veiculo: 'CAMINHAO X', filial: 'MATRIZ',
      pecas: ['FRE:Lonas:1º eixo · Esquerdo'], data_servico: '2026-08-01', execucao: 'INTERNA', direcionada_para: 'joao@lokal' },
    { id: 2, status: 'FEITA', chassi: 'A1', placa: 'AAA-0001', veiculo: 'CAMINHAO X', filial: 'MATRIZ',
      pecas: ['FRE:Lonas:1º eixo · Esquerdo'], data_servico: '2026-08-20', execucao: 'INTERNA', direcionada_para: 'pedro@lokal' }, // 19 dias da OS 1: vermelho
    { id: 3, status: 'FEITA', chassi: 'A1', placa: 'AAA-0001', veiculo: 'CAMINHAO X', filial: 'MATRIZ',
      pecas: ['FRE:Lonas:1º eixo · Esquerdo'], data_servico: '2026-11-10', execucao: 'INTERNA', direcionada_para: 'joao@lokal' }, // 82 dias da OS 2: verde
    { id: 4, status: 'FEITA', chassi: 'B1', placa: 'BBB-0002', veiculo: 'CAMINHAO Y', filial: 'OUTROS',
      pecas: ['SUS:Molas'], data_servico: '2026-11-01', execucao: 'EXTERNA', oficina_externa: 'Borracharia X' }, // sem histórico: não reincide
    { id: 5, status: 'SOLICITADA', chassi: 'A1', placa: 'AAA-0001', veiculo: 'CAMINHAO X', filial: 'MATRIZ', pecas: [] },
    { id: 6, status: 'FEITA', chassi: 'A1', placa: 'AAA-0001', veiculo: 'CAMINHAO X', filial: 'MATRIZ', pecas: [], data_servico: '2026-11-05' }
  ];
  const { reincidencias, emGarantia } = relatorioReincidencias(osList, '2026-11-23');

  assert.equal(reincidencias.length, 2, 'só as OS 2 e 3 repetem peça trocada há até 90 dias no mesmo veículo');
  assert.deepEqual(reincidencias.map((r) => r.segunda.osId).sort(), [2, 3]);
  const rOS2 = reincidencias.find((r) => r.segunda.osId === 2);
  assert.equal(rOS2.cor, 'vermelho'); assert.equal(rOS2.dias, 19);
  assert.equal(rOS2.primeira.osId, 1); assert.equal(rOS2.primeira.direcionada_para, 'joao@lokal', 'quem fez o serviço que falhou, não quem consertou de novo');
  assert.equal(rOS2.segunda.direcionada_para, 'pedro@lokal');
  const rOS3 = reincidencias.find((r) => r.segunda.osId === 3);
  assert.equal(rOS3.cor, 'verde'); assert.equal(rOS3.dias, 82, 'compara com a OS 2 (82 dias), não com a OS 1 (fora da janela de 90)');
  assert.equal(rOS3.primeira.osId, 2); assert.equal(rOS3.primeira.direcionada_para, 'pedro@lokal');

  // emGarantia: a troca mais recente de cada peça por veículo, contra "hoje" — uma entrada por veículo aqui
  assert.equal(emGarantia.length, 2);
  const garantiaA = emGarantia.find((a) => a.chassi === 'A1');
  assert.equal(garantiaA.osId, 3, 'usa a troca mais recente (OS 3), não a 1 ou 2');
  assert.equal(garantiaA.dias, 13); assert.equal(garantiaA.restam, 77); // 2026-11-10 -> 2026-11-23
  const garantiaB = emGarantia.find((a) => a.chassi === 'B1');
  assert.equal(garantiaB.dias, 22); assert.equal(garantiaB.restam, 68); assert.equal(garantiaB.oficina_externa, 'Borracharia X');
});

test('senha nova', () => {
  assert.ok(erroNovaSenha('mudar123'));
  assert.ok(erroNovaSenha('1234567'));
  assert.equal(erroNovaSenha('boa-senha-1', 'mudar123'), '');
});

test('quem vê e o que vê', () => {
  const os = { status: 'FEITA', filial: 'MATRIZ', aberta_por: 'b@lokal', valor_total: 10 };
  assert.ok(podeVer({ perfil: 'FILIAL', filial: 'MATRIZ;OUTROS' }, os));
  assert.ok(!podeVer({ perfil: 'FILIAL', filial: 'OUTROS' }, os));
  assert.ok(podeVer({ perfil: 'MECANICO', login: 'b@lokal' }, os));
  assert.ok(!podeVer({ perfil: 'MECANICO', login: 'c@lokal' }, os));
  assert.equal(recortarOS({ perfil: 'MECANICO' }, os).valor_total, undefined);
  assert.equal(recortarOS({ perfil: 'FILIAL' }, os).valor_total, 10, 'filial vê valores mesmo sem ser "fechada" (não existe mais essa etapa)');
});

test('ações possíveis: só a matriz cancela e lança valores; filial só lança valores na própria', () => {
  const os = { status: 'FEITA', filial: 'LUÍS ANDRÉ', aberta_por: 'joao@lokal' };
  assert.deepEqual(acoesPossiveis({ perfil: 'ADMIN' }, os), ['cancelar', 'valores', 'corrigir']);
  assert.deepEqual(acoesPossiveis({ perfil: 'FILIAL', filial: 'LUÍS ANDRÉ' }, os), ['valores']);
  assert.deepEqual(acoesPossiveis({ perfil: 'FILIAL', filial: 'OUTRA' }, os), []);
  assert.deepEqual(acoesPossiveis({ perfil: 'MECANICO', login: 'joao@lokal' }, os), []);
  assert.deepEqual(acoesPossiveis({ perfil: 'DIRETORIA' }, os), []);
  assert.deepEqual(acoesPossiveis({ perfil: 'ADMIN' }, { ...os, status: 'CANCELADA' }), []);
  assert.deepEqual(acoesPossiveis({ perfil: 'ADMIN' }, { ...os, status: 'SOLICITADA' }), ['cancelar']);
});
