import { api } from './api.js';
import { el, fmt } from './ui.js';
import { PERFIS } from './os/regras.js';

const $ = (id) => document.getElementById(id);
// Filiais do sistema (mesmos nomes do cadastro de veículos e das planilhas por filial)
const FILIAIS = ['LUÍS ANDRÉ', 'JOSÉ GERALDO', 'THIAGO SANTIAGO', 'ÁLVARO JÚNIOR', 'MATRIZ', 'OUTROS'];
let editando = null, todos = [];

iniciar();

async function iniciar() {
  const s = await api.sessao().catch(() => null);
  if (!s) return;
  if (s.usuario.perfil !== 'ADMIN') {
    document.querySelector('.corpo').replaceChildren(el('div', { class: 'aviso vermelho' }, 'Só a matriz (administrador) mexe nos usuários.'));
    return;
  }
  $('filiais').replaceChildren(...FILIAIS.map((f) => el('label', {}, [el('input', { type: 'checkbox', value: f }), f])));
  $('perfil').addEventListener('change', mostrarCampos);
  $('novo').addEventListener('click', () => preencher(null));
  $('form').addEventListener('submit', salvar);
  $('resetar').addEventListener('click', resetar);
  $('busca').addEventListener('input', desenharLista);
  preencher(null);
  await listar();
}

function mostrarCampos() {
  $('caixa-filiais').hidden = $('perfil').value !== 'FILIAL';
  $('caixa-equipe').hidden = $('perfil').value !== 'MECANICO';
}

function preencher(u) {
  editando = u;
  $('titulo-form').textContent = u ? 'Alterar ' + u.login : 'Novo usuário';
  $('nome').value = u ? u.nome : '';
  $('perfil').value = u ? u.perfil : 'MECANICO';
  $('equipe').value = u ? u.equipe : '';
  $('ativo').value = !u || u.ativo ? '1' : '0';
  $('login').value = u ? u.login : '';
  $('caixa-login').hidden = !u;
  $('resetar').hidden = !u;
  $('salvar').textContent = u ? 'Salvar alterações' : 'Criar usuário';
  document.querySelectorAll('#filiais input').forEach((c) => { c.checked = !!u && u.filiais.includes(c.value); });
  mostrarCampos();
  $('msg').hidden = true;
}

async function listar() {
  todos = (await api.usuarios()).usuarios;
  desenharLista();
}

function desenharLista() {
  const t = $('busca').value.trim().toLowerCase();
  const lista = todos.filter((u) => !t || (u.nome + ' ' + u.login).toLowerCase().includes(t))
    .sort((a, b) => a.perfil.localeCompare(b.perfil) || a.nome.localeCompare(b.nome));
  if (!lista.length) { $('lista').replaceChildren(el('div', { class: 'vazio', text: 'Nenhum usuário.' })); return; }
  const corpo = el('tbody', {}, lista.map((u) => {
    const tr = el('tr', { class: 'clicavel' }, [el('td', {}, el('b', { text: u.login })), el('td', { text: u.nome }), el('td', { text: PERFIS[u.perfil] || u.perfil }),
      el('td', { text: u.perfil === 'FILIAL' ? u.filiais.join(', ') : u.perfil === 'MECANICO' ? u.equipe : 'Todas' }),
      el('td', {}, [el('span', { class: 'etiqueta', text: u.ativo ? 'Ativo' : 'Desativado' }), u.trocar_senha ? ' ' : null,
        u.trocar_senha ? el('span', { class: 'etiqueta', text: 'senha provisória' }) : null, u.exemplo ? ' ' : null,
        u.exemplo ? el('span', { class: 'etiqueta', text: 'exemplo' }) : null])]);
    tr.addEventListener('click', () => { preencher(u); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    return tr;
  }));
  $('lista').replaceChildren(el('p', { class: 'dica', text: fmt.int(lista.length) + ' usuários' }), el('div', { class: 'tabela-rolagem' }, el('table', {}, [
    el('thead', {}, el('tr', {}, ['Usuário', 'Nome', 'Perfil', 'Filiais / equipe', 'Situação'].map((x) => el('th', { text: x })))), corpo])));
}

function aviso(texto, tipo) {
  const msg = $('msg');
  msg.className = 'mensagem largo ' + tipo;
  msg.replaceChildren(...(Array.isArray(texto) ? texto : [texto]));
  msg.hidden = false;
}

async function salvar(ev) {
  ev.preventDefault();
  const u = {
    login: editando ? editando.login : undefined, nome: $('nome').value.trim(), perfil: $('perfil').value,
    filiais: [...document.querySelectorAll('#filiais input:checked')].map((c) => c.value), equipe: $('equipe').value.trim(),
    ativo: $('ativo').value === '1'
  };
  const erro = u.nome.length < 2 ? 'Informe o nome completo.' : u.perfil === 'FILIAL' && !u.filiais.length ? 'Marque ao menos uma filial.' : '';
  if (erro) return aviso(erro, 'erro');
  $('salvar').disabled = true;
  try {
    const r = await api.salvarUsuario(u);
    if (r.senha) {
      aviso(['Criado. Passe para a pessoa: usuário ', el('b', { text: r.usuario.login }), ' e senha ', el('b', { text: r.senha }),
        '. No primeiro acesso o sistema pede uma senha nova.'], 'ok');
    } else aviso('Salvo: ' + r.usuario.login + '.', 'ok');
    await listar();
    const msg = $('msg').cloneNode(true);
    preencher(null);
    $('msg').replaceWith(msg);
  } catch (e) {
    aviso(e.message, 'erro');
  } finally {
    $('salvar').disabled = false;
  }
}

async function resetar() {
  if (!editando) return;
  const b = $('resetar');
  if (b.dataset.armado !== '1') { b.dataset.armado = '1'; b.textContent = 'Toque de novo para confirmar'; return; }
  b.dataset.armado = ''; b.disabled = true;
  try {
    const r = await api.resetarSenha(editando.login);
    aviso(['Senha de ', el('b', { text: r.usuario.login }), ' voltou para ', el('b', { text: r.senha }), '. A troca é obrigatória no próximo acesso.'], 'ok');
    await listar();
  } catch (e) { aviso(e.message, 'erro'); }
  b.disabled = false; b.textContent = 'Voltar senha para mudar123';
}
