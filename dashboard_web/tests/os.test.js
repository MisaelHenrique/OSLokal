// Fluxo completo da OS pelas funções da api/, no banco local de teste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chamar, entrar, preparar } from './ajuda.js';
import { numeroOS } from '../public/js/os/regras.js';

const api = await preparar();
const { login, os, fotos, veiculos } = api;
const post = (cookie, body) => chamar(os, { method: 'POST', cookie, body });
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const foto = (cookie, url) => chamar(fotos, { method: 'POST', url, cookie, binario: JPG, tipo: 'image/jpeg', headers: { 'x-lokal': '1' } });

const c = {};
test('entram os perfis', async () => {
  c.matriz = await entrar(login, 'matriz@lokal');
  c.luis = await entrar(login, 'luis@lokal');
  c.jose = await entrar(login, 'jose@lokal');
  c.joao = await entrar(login, 'joao@lokal');
  c.pedro = await entrar(login, 'pedro@lokal');
  c.dir = await entrar(login, 'diretoria@lokal');
});

// O banco local de teste é semeado com os mesmos dados de exemplo (exemplo_os.js), que de propósito já deixa o
// joao@lokal com 1 OS "em execução" para a demonstração nunca ficar vazia. Com a regra de "só uma por vez" isso
// bloquearia o resto da suíte (que também usa o joao@lokal para testar iniciar/executar) — fecha essa OS do seed
// primeiro, pra suíte começar com ele livre.
test('limpa a OS semeada em execução do mecânico de teste', async () => {
  const lista = await chamar(os, { cookie: c.joao });
  const presa = lista.d.os.find((o) => o.status === 'EM_EXECUCAO' && o.acoes.includes('executar'));
  if (!presa) return;
  const placa = await foto(c.joao, `/api/fotos?tipo=placa&os=${presa.id}&envio=env-limpa-seed`);
  const serv = await foto(c.joao, `/api/fotos?tipo=servico&os=${presa.id}&envio=env-limpa-seed`);
  const r = await post(c.joao, { acao: 'executar', id: presa.id, envio_id: 'env-limpa-seed', executada_em: new Date().toISOString(),
    km: '1', fotos: { placa: placa.d.caminho, servico: serv.d.caminho } });
  assert.equal(r.status, 200, JSON.stringify(r.d));
});

let veiculoLuis, veiculoJose, id;
test('filial vê só os veículos dela', async () => {
  const r = await chamar(veiculos, { cookie: c.luis });
  assert.equal(r.status, 200);
  assert.equal(r.d.veiculos.length, 176);
  assert.ok(r.d.veiculos.every((v) => v.filial === 'LUÍS ANDRÉ'));
  veiculoLuis = r.d.veiculos.find((v) => v.placa);
  veiculoJose = (await chamar(veiculos, { cookie: c.jose })).d.veiculos[0];
  assert.equal((await chamar(veiculos, { cookie: c.matriz })).d.veiculos.length, 407);
  assert.equal((await chamar(veiculos, { cookie: c.joao })).status, 403, 'mecânico não lista o cadastro');
});

test('filial abre OS de diagnóstico com foto do problema; não abre de outra filial', async () => {
  const f = await foto(c.luis, '/api/fotos?tipo=problema&envio=abc12345&n=1');
  assert.equal(f.status, 200, JSON.stringify(f.d));
  const r = await post(c.luis, { acao: 'abrir', chassi: veiculoLuis.chassi, tipo: 'DIAGNOSTICO', sintoma: 'Perdendo força na subida',
    local_servico: 'Obra X', parado: true, fotos_problema: [f.d.caminho] });
  assert.equal(r.status, 200, JSON.stringify(r.d));
  assert.equal(r.d.os.status, 'AGUARDANDO_APROVACAO');
  assert.equal(r.d.os.filial, 'LUÍS ANDRÉ');
  assert.equal(r.d.os.aberta_por, 'luis@lokal');
  id = r.d.os.id;
  const outra = await post(c.luis, { acao: 'abrir', chassi: veiculoJose.chassi, tipo: 'DIAGNOSTICO', sintoma: 'Teste teste', local_servico: 'Obra' });
  assert.equal(outra.status, 400);
  const sem = await post(c.luis, { acao: 'abrir', chassi: veiculoLuis.chassi, tipo: 'SERVICO', servico: 'Trocar', local_servico: 'Obra' });
  assert.equal(sem.status, 400, 'serviço sem grupo');
  assert.equal((await post(c.joao, { acao: 'abrir', chassi: veiculoLuis.chassi, tipo: 'DIAGNOSTICO', sintoma: 'xxxxxx', local_servico: 'Obra' })).status, 400);
});

test('outra filial e mecânicos não veem a OS; foto do problema só para quem pode', async () => {
  assert.equal((await chamar(os, { cookie: c.jose, url: '/api/os?id=' + id })).status, 404);
  assert.ok(!(await chamar(os, { cookie: c.jose })).d.os.some((o) => o.id === id));
  assert.equal((await chamar(os, { cookie: c.joao, url: '/api/os?id=' + id })).status, 404);
  const det = await chamar(os, { cookie: c.matriz, url: '/api/os?id=' + id });
  const caminho = det.d.os.fotos_problema[0];
  assert.equal((await chamar(fotos, { cookie: c.matriz, url: '/api/fotos?caminho=' + encodeURIComponent(caminho) })).status, 200);
  assert.equal((await chamar(fotos, { cookie: c.jose, url: '/api/fotos?caminho=' + encodeURIComponent(caminho) })).status, 404);
});

test('filial não aprova; matriz devolve, filial reenvia, matriz aprova e direciona', async () => {
  assert.equal((await post(c.luis, { acao: 'aprovar', id })).status, 409);
  assert.equal((await post(c.matriz, { acao: 'devolver', id })).status, 400, 'devolver exige motivo');
  assert.equal((await post(c.matriz, { acao: 'devolver', id, motivo: 'Diga a obra exata' })).d.os.status, 'DEVOLVIDA');
  const re = await post(c.luis, { acao: 'reenviar', id, local_servico: 'Obra X, km 12 da BR-030' });
  assert.equal(re.d.os.status, 'AGUARDANDO_APROVACAO');
  assert.equal(re.d.os.local_servico, 'Obra X, km 12 da BR-030');
  const r = await post(c.matriz, { acao: 'aprovar', id, mecanico: 'joao@lokal', ajudantes: ['pedro@lokal', 'joao@lokal'] });
  assert.equal(r.status, 200, JSON.stringify(r.d));
  assert.equal(r.d.os.status, 'DIRECIONADA');
  assert.deepEqual(r.d.os.ajudantes, ['pedro@lokal']);
  assert.equal((await post(c.matriz, { acao: 'aprovar', id })).status, 409, 'não aprova duas vezes');
});

test('mecânico vê a OS (responsável e ajudante); só o responsável fecha', async () => {
  const l = await chamar(os, { cookie: c.joao });
  const minha = l.d.os.find((o) => o.id === id);
  assert.ok(minha);
  assert.deepEqual(minha.acoes, ['iniciar', 'executar']);
  assert.ok(l.d.os.every((o) => o.direcionada_para === 'joao@lokal' || o.ajudantes.includes('joao@lokal')));
  assert.equal(l.d.nomes, undefined, 'mecânico não recebe a lista de usuários');
  const p = await chamar(os, { cookie: c.pedro, url: '/api/os?id=' + id });
  assert.equal(p.status, 200);
  assert.deepEqual(p.d.os.acoes, []);
  assert.equal((await foto(c.pedro, `/api/fotos?tipo=placa&os=${id}&envio=env-pedro-1`)).status, 409);
});

test('fechamento do mecânico: exige números e fotos; repetido (offline) não duplica', async () => {
  assert.equal((await post(c.joao, { acao: 'iniciar', id })).d.os.status, 'EM_EXECUCAO');
  const envio = 'envio-joao-0001';
  const placa = await foto(c.joao, `/api/fotos?tipo=placa&os=${id}&envio=${envio}`);
  const serv = await foto(c.joao, `/api/fotos?tipo=servico&os=${id}&envio=${envio}`);
  assert.equal(placa.status, 200, JSON.stringify(placa.d));
  const base = { acao: 'executar', id, envio_id: envio, executada_em: new Date().toISOString(), resultado: 'PRECISA_SERVICO',
    defeito_encontrado: 'Bico injetor', fotos: { placa: placa.d.caminho, servico: serv.d.caminho } };
  assert.equal((await post(c.joao, { ...base, km: '', horimetro: '' })).status, 400, 'sem km e sem horímetro');
  assert.equal((await post(c.joao, { ...base, km: '120.500', fotos: { placa: placa.d.caminho } })).status, 400, 'sem foto do serviço');
  assert.equal((await post(c.joao, { ...base, km: '120.500', resultado: '' })).status, 400, 'diagnóstico sem resultado');
  assert.equal((await post(c.joao, { ...base, km: '1', executada_em: new Date(Date.now() + 3600e3).toISOString() })).status, 400, 'futuro');
  const r = await post(c.joao, { ...base, km: '120.500' });
  assert.equal(r.status, 200, JSON.stringify(r.d));
  assert.equal(r.d.os.status, 'EXECUTADA');
  assert.equal(r.d.os.km, 120500);
  assert.equal(r.d.os.valor_total, undefined, 'mecânico não vê valores');
  const de_novo = await post(c.joao, { ...base, km: '120.500' });
  assert.equal(de_novo.status, 200);
  assert.equal(de_novo.d.repetido, true);
  const outra = await post(c.joao, { ...base, envio_id: 'outro-envio-99', km: '1' });
  assert.equal(outra.status, 409, 'já executada: outro envio é recusado');
});

test('matriz lança valores e fecha; filial vê valores só depois; mecânico nunca', async () => {
  const antes = await chamar(os, { cookie: c.luis, url: '/api/os?id=' + id });
  assert.ok(!('valor_total' in antes.d.os));
  const nf = await chamar(fotos, { method: 'POST', url: `/api/fotos?tipo=nf&os=${id}&envio=nf-000001`, cookie: c.matriz,
    binario: Buffer.from('%PDF-1.4'), tipo: 'application/pdf', headers: { 'x-lokal': '1' } });
  assert.equal(nf.status, 200, JSON.stringify(nf.d));
  assert.equal((await post(c.matriz, { acao: 'financeiro', id, valor_pecas: '' })).status, 400);
  const r = await post(c.matriz, { acao: 'financeiro', id, valor_pecas: '1.765,44', valor_mao_obra: '300', valor_deslocamento: '120,50',
    nf_numero: '78', fornecedor: 'Auto Peças', nf_arquivo: nf.d.caminho });
  assert.equal(r.status, 200, JSON.stringify(r.d));
  assert.equal(r.d.os.status, 'FECHADA');
  assert.equal(r.d.os.valor_total, 2185.94);
  const filial = await chamar(os, { cookie: c.luis, url: '/api/os?id=' + id });
  assert.equal(filial.d.os.valor_total, 2185.94);
  assert.equal((await chamar(fotos, { cookie: c.luis, url: '/api/fotos?caminho=' + encodeURIComponent(nf.d.caminho) })).status, 200);
  const mec = await chamar(os, { cookie: c.joao, url: '/api/os?id=' + id });
  assert.equal(mec.d.os.valor_total, undefined);
  assert.equal(mec.d.os.nf_numero, undefined);
  assert.equal((await chamar(fotos, { cookie: c.joao, url: '/api/fotos?caminho=' + encodeURIComponent(nf.d.caminho) })).status, 404);
  const ev = (await chamar(os, { cookie: c.matriz, url: '/api/os?id=' + id })).d.eventos.map((e) => e.etapa);
  assert.deepEqual(ev, ['ABERTA', 'DEVOLVIDA', 'REENVIADA', 'APROVADA', 'DIRECIONADA', 'INICIADA', 'EXECUTADA', 'FECHADA']);
});

test('diagnóstico que precisa de serviço gera OS de serviço ligada', async () => {
  const r = await post(c.matriz, { acao: 'gerar_servico', id, grupo: 'MOT', servico: 'Trocar bico injetor', mecanico: 'pedro@lokal' });
  assert.equal(r.status, 200, JSON.stringify(r.d));
  assert.equal(r.d.os.tipo, 'SERVICO');
  assert.equal(r.d.os.status, 'DIRECIONADA');
  assert.equal(r.d.os.os_origem, id);
  const origem = await chamar(os, { cookie: c.matriz, url: '/api/os?id=' + id });
  assert.equal(origem.d.os.os_servico, r.d.os.id);
  assert.deepEqual(origem.d.os.acoes, [], 'não gera duas vezes');
  assert.equal(origem.d.ligadas[0].id, r.d.os.id);
});

test('troca de mecânico tira a OS da lista do anterior; cancelar exige motivo', async () => {
  const nova = await post(c.matriz, { acao: 'abrir', chassi: veiculoJose.chassi, tipo: 'SERVICO', grupo: 'FRE', servico: 'Trocar lonas',
    local_servico: 'Pátio', mecanico: 'joao@lokal' });
  assert.equal(nova.d.os.status, 'DIRECIONADA');
  const n = nova.d.os.id;
  await post(c.matriz, { acao: 'direcionar', id: n, mecanico: 'pedro@lokal' });
  assert.equal((await chamar(os, { cookie: c.joao, url: '/api/os?id=' + n })).status, 404);
  const r = await post(c.joao, { acao: 'iniciar', id: n });
  assert.equal(r.status, 404);
  assert.equal((await post(c.matriz, { acao: 'cancelar', id: n })).status, 400);
  assert.equal((await post(c.matriz, { acao: 'cancelar', id: n, motivo: 'Duplicada' })).d.os.status, 'CANCELADA');
  assert.equal((await post(c.dir, { acao: 'abrir', chassi: veiculoJose.chassi, tipo: 'SERVICO', grupo: 'FRE', servico: 'Trocar lonas', local_servico: 'P' })).status, 400,
    'diretoria só consulta');
});

test('direcionar recusa mais de 5 ajudantes', async () => {
  const nova = await post(c.matriz, { acao: 'abrir', chassi: veiculoJose.chassi, tipo: 'SERVICO', grupo: 'FRE', servico: 'Revisão geral',
    local_servico: 'Pátio' });
  assert.equal(nova.d.os.status, 'APROVADA', JSON.stringify(nova.d));
  const r = await post(c.matriz, { acao: 'direcionar', id: nova.d.os.id, mecanico: 'joao@lokal',
    ajudantes: ['pedro@lokal', 'marcos@lokal', 'rafael@lokal', 'bruno@lokal', 'diego@lokal', 'lucas@lokal'] });
  assert.equal(r.status, 400, JSON.stringify(r.d));
  assert.match(r.d.erro, /máximo 5 ajudantes/);
  // com 5 (não 6) é aceito
  const ok = await post(c.matriz, { acao: 'direcionar', id: nova.d.os.id, mecanico: 'joao@lokal',
    ajudantes: ['pedro@lokal', 'marcos@lokal', 'rafael@lokal', 'bruno@lokal', 'diego@lokal'] });
  assert.equal(ok.status, 200, JSON.stringify(ok.d));
  assert.equal(ok.d.os.ajudantes.length, 5);
});

test('mecânico não inicia uma segunda OS enquanto a primeira está em execução', async () => {
  const a = await post(c.matriz, { acao: 'abrir', chassi: veiculoJose.chassi, tipo: 'SERVICO', grupo: 'FRE', servico: 'OS simultânea A',
    local_servico: 'Pátio', mecanico: 'joao@lokal' });
  const b = await post(c.matriz, { acao: 'abrir', chassi: veiculoLuis.chassi, tipo: 'SERVICO', grupo: 'FRE', servico: 'OS simultânea B',
    local_servico: 'Pátio', mecanico: 'joao@lokal' });
  const idA = a.d.os.id, idB = b.d.os.id;
  assert.equal((await post(c.joao, { acao: 'iniciar', id: idA })).status, 200);
  const bloqueada = await post(c.joao, { acao: 'iniciar', id: idB });
  assert.equal(bloqueada.status, 409, JSON.stringify(bloqueada.d));
  assert.match(bloqueada.d.erro, new RegExp(numeroOS(idA)));
  // fechando a primeira, libera a segunda
  const placa = await foto(c.joao, `/api/fotos?tipo=placa&os=${idA}&envio=env-simult-a`);
  const serv = await foto(c.joao, `/api/fotos?tipo=servico&os=${idA}&envio=env-simult-a`);
  await post(c.joao, { acao: 'executar', id: idA, envio_id: 'env-simult-a', executada_em: new Date().toISOString(), km: '1',
    fotos: { placa: placa.d.caminho, servico: serv.d.caminho } });
  assert.equal((await post(c.joao, { acao: 'iniciar', id: idB })).status, 200);
});

test('uma foto enviada para uma OS não serve pra fechar outra (confere dono, tipo e OS)', async () => {
  const a = await post(c.matriz, { acao: 'abrir', chassi: veiculoJose.chassi, tipo: 'SERVICO', grupo: 'FRE', servico: 'Revisão A',
    local_servico: 'Pátio', mecanico: 'joao@lokal' });
  const b = await post(c.matriz, { acao: 'abrir', chassi: veiculoLuis.chassi, tipo: 'SERVICO', grupo: 'FRE', servico: 'Revisão B',
    local_servico: 'Pátio', mecanico: 'joao@lokal' });
  const idA = a.d.os.id, idB = b.d.os.id;
  const placaA = await foto(c.joao, `/api/fotos?tipo=placa&os=${idA}&envio=env-cruzado-1`);
  const servA = await foto(c.joao, `/api/fotos?tipo=servico&os=${idA}&envio=env-cruzado-1`);
  assert.equal(placaA.status, 200, JSON.stringify(placaA.d));
  // tenta fechar B usando as fotos que foram enviadas pra A
  const r = await post(c.joao, { acao: 'executar', id: idB, envio_id: 'env-cruzado-2', executada_em: new Date().toISOString(),
    km: '10', fotos: { placa: placaA.d.caminho, servico: servA.d.caminho } });
  assert.equal(r.status, 400, JSON.stringify(r.d));
  assert.match(r.d.erro, /envie a foto de novo/);
});
