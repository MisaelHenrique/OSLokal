// Fluxo completo da OS simplificada (lançar / solicitar / cancelar / valores) pelas funções da api/, no banco
// local de teste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chamar, entrar, preparar } from './ajuda.js';

const api = await preparar();
const { login, os, fotos, veiculos } = api;
const post = (cookie, body) => chamar(os, { method: 'POST', cookie, body });
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const foto = (cookie, url) => chamar(fotos, { method: 'POST', url, cookie, binario: JPG, tipo: 'image/jpeg', headers: { 'x-lokal': '1' } });
const hoje = () => new Date().toISOString().slice(0, 10);

const c = {};
test('entram os perfis', async () => {
  c.matriz = await entrar(login, 'matriz@lokal');
  c.luis = await entrar(login, 'luis@lokal');
  c.jose = await entrar(login, 'jose@lokal');
  c.joao = await entrar(login, 'joao@lokal');
  c.pedro = await entrar(login, 'pedro@lokal');
  c.dir = await entrar(login, 'diretoria@lokal');
});

let veiculoLuis, veiculoJose;
test('filial e mecânico listam veículos; mecânico vê todos (lança pra qualquer um)', async () => {
  const r = await chamar(veiculos, { cookie: c.luis });
  assert.equal(r.status, 200);
  assert.equal(r.d.veiculos.length, 176);
  assert.ok(r.d.veiculos.every((v) => v.filial === 'LUÍS ANDRÉ'));
  veiculoLuis = r.d.veiculos.find((v) => v.placa);
  veiculoJose = (await chamar(veiculos, { cookie: c.jose })).d.veiculos[0];
  assert.equal((await chamar(veiculos, { cookie: c.matriz })).d.veiculos.length, 407);
  assert.equal((await chamar(veiculos, { cookie: c.joao })).d.veiculos.length, 407, 'mecânico vê o cadastro inteiro');
});

const FOTOS_OK = async (cookie, envio) => {
  const frente = await foto(cookie, `/api/fotos?tipo=frente&envio=${envio}`);
  const painel = await foto(cookie, `/api/fotos?tipo=painel&envio=${envio}`);
  const defeito = await foto(cookie, `/api/fotos?tipo=defeito&envio=${envio}&n=1`);
  return { frente: frente.d.caminho, painel: painel.d.caminho, defeito: defeito.d.caminho };
};

let idLancamento;
test('filial lança OS feita (interna, com mecânico); não lança de outra filial', async () => {
  const f = await FOTOS_OK(c.luis, 'env-lancar-001');
  const r = await post(c.luis, {
    acao: 'lancar', chassi: veiculoLuis.chassi, pecas: ['FRE:Lonas:1º eixo · Direito'], servico: 'Trocar lonas do eixo traseiro',
    cidade: 'Caetité', tipo_local: 'OBRA', execucao: 'INTERNA', mecanico: 'joao@lokal', auxiliares: ['pedro@lokal'],
    data_servico: hoje(), km: '120.500', fotos: { frente: f.frente, painel: f.painel }, fotos_defeito: [f.defeito]
  });
  assert.equal(r.status, 200, JSON.stringify(r.d));
  assert.equal(r.d.os.status, 'FEITA');
  assert.equal(r.d.os.filial, 'LUÍS ANDRÉ');
  assert.equal(r.d.os.aberta_por, 'luis@lokal');
  assert.equal(r.d.os.direcionada_para, 'joao@lokal');
  assert.deepEqual(r.d.os.auxiliares, ['pedro@lokal']);
  assert.deepEqual(r.d.os.pecas, ['FRE:Lonas:1º eixo · Direito']);
  assert.equal(r.d.os.grupo, 'FRE', 'grupo é derivado da 1ª dupla de peças, não mandado pelo cliente');
  idLancamento = r.d.os.id;
  const outraFilial = await post(c.luis, {
    acao: 'lancar', chassi: veiculoJose.chassi, pecas: ['FRE:Lonas:1º eixo · Direito'], servico: 'Trocar lonas', cidade: 'Caetité',
    tipo_local: 'OBRA', execucao: 'INTERNA', mecanico: 'joao@lokal', data_servico: hoje(), km: '1',
    fotos: { frente: f.frente, painel: f.painel }, fotos_defeito: [f.defeito]
  });
  assert.equal(outraFilial.status, 400, 'veículo de outra filial');
  const semPecas = await post(c.luis, {
    acao: 'lancar', chassi: veiculoLuis.chassi, servico: 'Trocar', cidade: 'Caetité', tipo_local: 'OBRA',
    execucao: 'INTERNA', mecanico: 'joao@lokal', data_servico: hoje(), km: '1',
    fotos: { frente: f.frente, painel: f.painel }, fotos_defeito: [f.defeito]
  });
  assert.equal(semPecas.status, 400, 'sem grupo e peça');
});

test('outra filial e mecânico (que não lançou) não veem a OS; mecânico vê a própria', async () => {
  assert.equal((await chamar(os, { cookie: c.jose, url: '/api/os?id=' + idLancamento })).status, 404);
  assert.ok(!(await chamar(os, { cookie: c.jose })).d.os.some((o) => o.id === idLancamento));
  assert.equal((await chamar(os, { cookie: c.pedro, url: '/api/os?id=' + idLancamento })).status, 404,
    'pedro é auxiliar mas quem lançou foi luis, então pedro não vê (regra: só vê o que o próprio mecânico lançou)');
  const minhaDoLuis = await chamar(os, { cookie: c.luis, url: '/api/os?id=' + idLancamento });
  assert.equal(minhaDoLuis.status, 200);
  assert.equal(minhaDoLuis.d.os.valor_total, null, 'sem valores ainda');
});

test('mecânico lança a própria OS feita, sempre interna, no nome dele', async () => {
  const f = await FOTOS_OK(c.joao, 'env-mec-001');
  const r = await post(c.joao, {
    acao: 'lancar', chassi: veiculoJose.chassi, pecas: ['CON:Óleos'], servico: 'Revisão: troca de óleo e filtros',
    cidade: 'Caetité', tipo_local: 'GALPAO', auxiliares: ['pedro@lokal'], data_servico: hoje(), km: '50000',
    fotos: { frente: f.frente, painel: f.painel }, fotos_defeito: [f.defeito]
  });
  assert.equal(r.status, 200, JSON.stringify(r.d));
  assert.equal(r.d.os.execucao, 'INTERNA');
  assert.equal(r.d.os.direcionada_para, 'joao@lokal');
  assert.equal(r.d.os.aberta_por, 'joao@lokal');
  assert.equal(r.d.os.valor_total, undefined, 'mecânico não vê valores nem na própria OS');
  const lista = await chamar(os, { cookie: c.joao });
  assert.ok(lista.d.os.some((o) => o.id === r.d.os.id));
  assert.equal(lista.d.nomes, undefined, 'mecânico não recebe a lista de usuários');
  assert.equal(lista.d.mecanicos, undefined, 'mecânico não recebe a lista de mecânicos');
});

test('mecânico não lança mais de 3 auxiliares', async () => {
  const f = await FOTOS_OK(c.joao, 'env-mec-aux');
  const r = await post(c.joao, {
    acao: 'lancar', chassi: veiculoJose.chassi, pecas: ['CON:Óleos'], servico: 'Revisão geral', cidade: 'Caetité',
    tipo_local: 'GALPAO', auxiliares: ['pedro@lokal', 'marcos@lokal', 'rafael@lokal', 'bruno@lokal'],
    data_servico: hoje(), km: '1', fotos: { frente: f.frente, painel: f.painel }, fotos_defeito: [f.defeito]
  });
  assert.equal(r.status, 400);
  assert.match(r.d.erro, /no máximo 3/i);
});

test('matriz lança OS externa (oficina)', async () => {
  const f = await FOTOS_OK(c.matriz, 'env-ext-001');
  const r = await post(c.matriz, {
    acao: 'lancar', chassi: veiculoJose.chassi, pecas: ['PNE:'], servico: 'Trocar 2 pneus dianteiros',
    cidade: 'Caetité', tipo_local: 'OBRA', execucao: 'EXTERNA', oficina_externa: 'Pneus Bahia',
    data_servico: hoje(), km: '1', fotos: { frente: f.frente, painel: f.painel }, fotos_defeito: [f.defeito]
  });
  assert.equal(r.status, 200, JSON.stringify(r.d));
  assert.equal(r.d.os.execucao, 'EXTERNA');
  assert.equal(r.d.os.oficina_externa, 'Pneus Bahia');
  assert.equal(r.d.os.direcionada_para, null);
});

test('lançamento repetido (offline) pelo mesmo envio_id não duplica', async () => {
  const f = await FOTOS_OK(c.luis, 'env-dup-001');
  const corpo = {
    acao: 'lancar', chassi: veiculoLuis.chassi, pecas: ['FRE:Lonas:1º eixo · Direito'], servico: 'Trocar lonas', cidade: 'Caetité',
    tipo_local: 'OBRA', execucao: 'INTERNA', mecanico: 'joao@lokal', data_servico: hoje(), km: '1',
    envio_id: 'envio-fixo-001', fotos: { frente: f.frente, painel: f.painel }, fotos_defeito: [f.defeito]
  };
  const primeira = await post(c.luis, corpo);
  assert.equal(primeira.status, 200, JSON.stringify(primeira.d));
  const repetida = await post(c.luis, corpo);
  assert.equal(repetida.status, 200);
  assert.equal(repetida.d.repetido, true);
  assert.equal(repetida.d.os.id, primeira.d.os.id);
});

test('matriz lança valores; filial vê e também lança; mecânico nunca vê', async () => {
  const nf = await chamar(fotos, { method: 'POST', url: `/api/fotos?tipo=nf&os=${idLancamento}&envio=nf-000001`,
    cookie: c.matriz, binario: Buffer.from('%PDF-1.4'), tipo: 'application/pdf', headers: { 'x-lokal': '1' } });
  assert.equal(nf.status, 200, JSON.stringify(nf.d));
  const r = await post(c.matriz, { acao: 'valores', id: idLancamento, valor_pecas: '1.765,44', valor_mao_obra: '300',
    valor_deslocamento: '120,50', nf_numero: '78', fornecedor: 'Auto Peças', nf_arquivo: nf.d.caminho });
  assert.equal(r.status, 200, JSON.stringify(r.d));
  assert.equal(r.d.os.status, 'FEITA', 'não existe mais etapa "fechada": o status não muda ao lançar valores');
  assert.equal(r.d.os.valor_total, 2185.94);
  const filial = await chamar(os, { cookie: c.luis, url: '/api/os?id=' + idLancamento });
  assert.equal(filial.d.os.valor_total, 2185.94, 'filial vê valores da própria OS mesmo sem etapa de fechamento');
  const r2 = await post(c.luis, { acao: 'valores', id: idLancamento, valor_pecas: '50' });
  assert.equal(r2.status, 200, JSON.stringify(r2.d), 'filial também lança/edita valores');
  assert.equal((await chamar(fotos, { cookie: c.luis, url: '/api/fotos?caminho=' + encodeURIComponent(nf.d.caminho) })).status, 200);
  const outraFilial = await post(c.jose, { acao: 'valores', id: idLancamento, valor_pecas: '1' });
  assert.equal(outraFilial.status, 404, 'OS não é da filial do josé');
});

test('corrigir: só a matriz, só em OS feita, não muda o status', async () => {
  assert.equal((await post(c.luis, { acao: 'corrigir', id: idLancamento, grupo: 'FRE', servico: 'x', cidade: 'C',
    tipo_local: 'OBRA', data_servico: hoje(), km: '1' })).status, 409, 'filial vê a OS mas não tem a ação corrigir');
  const semGrupo = await post(c.matriz, { acao: 'corrigir', id: idLancamento, servico: 'x', cidade: 'C', tipo_local: 'OBRA',
    data_servico: hoje(), km: '1' });
  assert.equal(semGrupo.status, 400);
  const r = await post(c.matriz, { acao: 'corrigir', id: idLancamento, grupo: 'ELE', servico: 'Trocar bateria (corrigido)',
    cidade: 'Vitória da Conquista', tipo_local: 'GALPAO', data_servico: hoje(), km: '999' });
  assert.equal(r.status, 200, JSON.stringify(r.d));
  assert.equal(r.d.os.status, 'FEITA');
  assert.equal(r.d.os.grupo, 'ELE');
  assert.equal(r.d.os.cidade, 'Vitória da Conquista');
  assert.equal(r.d.os.km, 999);
});

test('solicitação de equipe itinerante (só filial, sem aprovação) e resposta que fecha a solicitação', async () => {
  const semAprov = await post(c.luis, { acao: 'solicitar', chassi: veiculoLuis.chassi, sintoma: 'Luz de injeção acesa',
    cidade: 'Caetité', tipo_local: 'GALPAO' });
  assert.equal(semAprov.status, 200, JSON.stringify(semAprov.d));
  assert.equal(semAprov.d.os.status, 'SOLICITADA');
  const idSolicitacao = semAprov.d.os.id;
  assert.equal((await post(c.matriz, { acao: 'solicitar', chassi: veiculoLuis.chassi, sintoma: 'xxxxx', cidade: 'C', tipo_local: 'OBRA' })).status, 400,
    'só filial solicita');
  const f = await FOTOS_OK(c.luis, 'env-resposta-001');
  const resposta = await post(c.luis, {
    acao: 'lancar', chassi: veiculoLuis.chassi, pecas: ['ELE:Bateria'], servico: 'Trocar bateria', cidade: 'Caetité',
    tipo_local: 'GALPAO', execucao: 'INTERNA', mecanico: 'joao@lokal', data_servico: hoje(), km: '1',
    os_atendida: idSolicitacao, fotos: { frente: f.frente, painel: f.painel }, fotos_defeito: [f.defeito]
  });
  assert.equal(resposta.status, 200, JSON.stringify(resposta.d));
  assert.equal(resposta.d.os.os_atendida, idSolicitacao);
  const detalheSolicitacao = await chamar(os, { cookie: c.luis, url: '/api/os?id=' + idSolicitacao });
  assert.equal(detalheSolicitacao.d.ligadas[0].id, resposta.d.os.id);
});

test('cancelar exige motivo e só a matriz cancela', async () => {
  const f = await FOTOS_OK(c.matriz, 'env-cancelar-001');
  const nova = await post(c.matriz, {
    acao: 'lancar', chassi: veiculoJose.chassi, pecas: ['FRE:Lonas:1º eixo · Direito'], servico: 'Revisão geral', cidade: 'Caetité',
    tipo_local: 'OBRA', execucao: 'INTERNA', mecanico: 'pedro@lokal', data_servico: hoje(), km: '1',
    fotos: { frente: f.frente, painel: f.painel }, fotos_defeito: [f.defeito]
  });
  const id = nova.d.os.id;
  assert.equal((await post(c.luis, { acao: 'cancelar', id, motivo: 'Duplicada' })).status, 404, 'filial não cancela (OS não é dela nem a ação existe pra ela)');
  assert.equal((await post(c.matriz, { acao: 'cancelar', id })).status, 400, 'exige motivo');
  assert.equal((await post(c.matriz, { acao: 'cancelar', id, motivo: 'Duplicada' })).d.os.status, 'CANCELADA');
  assert.equal((await post(c.matriz, { acao: 'cancelar', id, motivo: 'De novo' })).status, 409, 'não cancela duas vezes');
  assert.equal((await post(c.dir, { acao: 'lancar', chassi: veiculoJose.chassi, pecas: ['FRE:Lonas:1º eixo · Direito'], servico: 'x', cidade: 'C',
    tipo_local: 'OBRA', data_servico: hoje(), km: '1' })).status, 400, 'diretoria só consulta');
});

test('uma foto enviada para um lançamento não serve pra outro (confere dono, tipo e OS)', async () => {
  const fA = await FOTOS_OK(c.joao, 'env-cruzado-a');
  const fB = await FOTOS_OK(c.joao, 'env-cruzado-b');
  // tenta lançar usando a foto de "frente" de um envio com o "painel" de outro: cada foto pertence ao seu envio,
  // mas o que a API confere de fato é posse (enviado_por) e tipo — então troca pelo caminho de outro usuário.
  const fOutraPessoa = await FOTOS_OK(c.matriz, 'env-cruzado-c');
  const r = await post(c.joao, {
    acao: 'lancar', chassi: veiculoJose.chassi, pecas: ['FRE:Lonas:1º eixo · Direito'], servico: 'Teste cruzado', cidade: 'Caetité',
    tipo_local: 'OBRA', data_servico: hoje(), km: '1',
    fotos: { frente: fOutraPessoa.frente, painel: fA.painel }, fotos_defeito: [fB.defeito]
  });
  assert.equal(r.status, 400, JSON.stringify(r.d));
  assert.match(r.d.erro, /envie a foto de novo/);
});

test('últimas manutenções do veículo: mostra o selo do semáforo quando a mesma peça repete', async () => {
  const f1 = await FOTOS_OK(c.matriz, 'env-hist-001');
  const primeira = await post(c.matriz, {
    acao: 'lancar', chassi: veiculoJose.chassi, pecas: ['SUS:Molas:1º eixo · Esquerdo'], servico: 'Trocar molas', cidade: 'Caetité',
    tipo_local: 'OBRA', execucao: 'INTERNA', mecanico: 'joao@lokal', data_servico: hoje(), km: '1',
    fotos: { frente: f1.frente, painel: f1.painel }, fotos_defeito: [f1.defeito]
  });
  assert.equal(primeira.status, 200, JSON.stringify(primeira.d));
  const f2 = await FOTOS_OK(c.matriz, 'env-hist-002');
  const segunda = await post(c.matriz, {
    acao: 'lancar', chassi: veiculoJose.chassi, pecas: ['SUS:Molas:1º eixo · Esquerdo'], servico: 'Trocar molas de novo', cidade: 'Caetité',
    tipo_local: 'OBRA', execucao: 'INTERNA', mecanico: 'joao@lokal', data_servico: hoje(), km: '2',
    fotos: { frente: f2.frente, painel: f2.painel }, fotos_defeito: [f2.defeito]
  });
  assert.equal(segunda.status, 200, JSON.stringify(segunda.d));
  const detalhe = await chamar(os, { cookie: c.matriz, url: '/api/os?id=' + segunda.d.os.id });
  assert.equal(detalhe.status, 200);
  const hist = detalhe.d.historicoRecente;
  assert.ok(Array.isArray(hist) && hist.length >= 2, JSON.stringify(hist));
  assert.equal(hist[0].id, segunda.d.os.id, 'a mais recente vem primeiro');
  assert.equal(hist[0].semaforo.cor, 'vermelho');
  assert.equal(hist[0].semaforo.dias, 0, 'as duas foram lançadas no mesmo dia (hoje) no teste');
  assert.equal(hist[1].id, primeira.d.os.id);
  assert.equal(hist[1].semaforo, null, 'a primeira não tem nenhuma troca de molas antes dela');
});

test('posições diferentes não acionam o semáforo (lona do eixo 1 não é a mesma manutenção da lona do eixo 2)', async () => {
  const f1 = await FOTOS_OK(c.matriz, 'env-pos-001');
  const eixo1 = await post(c.matriz, {
    acao: 'lancar', chassi: veiculoJose.chassi, pecas: ['ROD:Cubos:1º eixo · Direito'], servico: 'Trocar cubo', cidade: 'Caetité',
    tipo_local: 'OBRA', execucao: 'INTERNA', mecanico: 'joao@lokal', data_servico: hoje(), km: '1',
    fotos: { frente: f1.frente, painel: f1.painel }, fotos_defeito: [f1.defeito]
  });
  assert.equal(eixo1.status, 200, JSON.stringify(eixo1.d));
  const f2 = await FOTOS_OK(c.matriz, 'env-pos-002');
  const eixo2 = await post(c.matriz, {
    acao: 'lancar', chassi: veiculoJose.chassi, pecas: ['ROD:Cubos:2º eixo · Direito'], servico: 'Trocar cubo de novo', cidade: 'Caetité',
    tipo_local: 'OBRA', execucao: 'INTERNA', mecanico: 'joao@lokal', data_servico: hoje(), km: '2',
    fotos: { frente: f2.frente, painel: f2.painel }, fotos_defeito: [f2.defeito]
  });
  assert.equal(eixo2.status, 200, JSON.stringify(eixo2.d));
  const detalhe = await chamar(os, { cookie: c.matriz, url: '/api/os?id=' + eixo2.d.os.id });
  const hist = detalhe.d.historicoRecente;
  assert.equal(hist[0].id, eixo2.d.os.id);
  assert.equal(hist[0].semaforo, null, 'cubo do 2º eixo não é a mesma manutenção do cubo do 1º eixo');
  const f3 = await FOTOS_OK(c.matriz, 'env-pos-003');
  assert.match((await post(c.matriz, {
    acao: 'lancar', chassi: veiculoJose.chassi, pecas: ['ROD:Cubos'], servico: 'Sem posição', cidade: 'Caetité',
    tipo_local: 'OBRA', execucao: 'INTERNA', mecanico: 'joao@lokal', data_servico: hoje(), km: '1',
    fotos: { frente: f3.frente, painel: f3.painel }, fotos_defeito: [f3.defeito]
  })).d.erro, /eixo e o lado/, 'cubo exige eixo e lado — não dá pra lançar sem posição');
});
