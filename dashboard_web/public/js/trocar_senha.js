import { api, inicioDoPerfil } from './api.js';

const $ = (id) => document.getElementById(id);
let eu = null;

api.sessao().then(({ usuario }) => {
  eu = usuario;
  $('quem').textContent = usuario.nome + ' · ' + usuario.login;
  $('login').value = usuario.login;
  $('aviso').hidden = !usuario.trocar_senha;
  if (usuario.trocar_senha) $('atual').value = '';
}).catch(() => {});

$('sair').addEventListener('click', async (ev) => {
  ev.preventDefault();
  await api.sair().catch(() => {});
  location.replace('/');
});

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const atual = $('atual').value, nova = $('nova').value;
  const erro = !atual ? 'Digite a senha atual.' : nova.length < 8 ? 'A senha nova precisa ter pelo menos 8 caracteres.'
    : nova !== $('repete').value ? 'As duas senhas novas não são iguais.' : '';
  if (erro) { $('msg').textContent = erro; $('msg').hidden = false; return; }
  $('msg').hidden = true;
  $('salvar').disabled = true;
  try {
    const { usuario } = await api.trocarSenha(atual, nova);
    location.replace(inicioDoPerfil(usuario || eu));
  } catch (e) {
    $('msg').textContent = e.message; $('msg').hidden = false;
  } finally {
    $('salvar').disabled = false;
  }
});
