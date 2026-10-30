import { api, inicioDoPerfil } from './api.js';
import { guardar } from './ui.js';

const $ = (id) => document.getElementById(id);
const voltar = () => {
  const v = new URLSearchParams(location.search).get('voltar') || '';
  return /^\/[a-z_/-]*(#[\w/%-]*)?$/i.test(v) && v !== '/' && !v.startsWith('//') ? v : '';
};
const ir = (u) => {
  guardar('lokal_perfil', u.perfil);
  location.replace(u.trocar_senha ? '/trocar-senha' : voltar() || inicioDoPerfil(u));
};

// Já tem sessão? Vai direto.
fetch('/api/sessao', { credentials: 'same-origin' }).then(async (r) => { if (r.ok) ir((await r.json()).usuario); }).catch(() => {});
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) $('local').hidden = false;

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const usuario = $('usuario').value.trim(), senha = $('senha').value;
  $('msg').hidden = true;
  if (!usuario || !senha) { $('msg').textContent = 'Preencha usuário e senha.'; $('msg').hidden = false; return; }
  $('entrar').disabled = true; $('entrar').textContent = 'Entrando…';
  try {
    const { usuario: u } = await api.entrar(usuario, senha);
    ir(u);
  } catch (e) {
    $('msg').textContent = e.message; $('msg').hidden = false;
    $('senha').value = ''; $('senha').focus();
  } finally {
    $('entrar').disabled = false; $('entrar').textContent = 'Entrar';
  }
});
