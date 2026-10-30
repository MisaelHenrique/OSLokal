// Peças de tela do sistema de OS usadas pela matriz, filiais e mecânicos.
import { el, botaoTema, guardar } from '../ui.js';
import { STATUS } from './regras.js';

export const $ = (id) => document.getElementById(id);

export function etiquetaStatus(status) {
  return el('span', { class: 'status s-' + String(status || '').toLowerCase(), text: STATUS[status] || status });
}

export function etiquetaParado(os) {
  return os.parado ? el('span', { class: 'status s-parado', text: 'Veículo parado' }) : null;
}

/** Topo das páginas de OS: marca, botões entre os sistemas, tema e menu do usuário. */
export function montarTopo(u, { titulo = 'Ordens de serviço', extras = [] } = {}) {
  guardar('lokal_perfil', u.perfil);
  const menu = el('div', { class: 'usuario-menu', role: 'menu', hidden: true }, [
    el('div', { class: 'quem' }, [el('b', { text: u.nome }), el('small', { text: u.login })]),
    u.perfil !== 'MECANICO' ? el('a', { href: '/painel', role: 'menuitem', text: 'Dashboard' }) : null,
    u.perfil === 'ADMIN' ? el('a', { href: '/usuarios', role: 'menuitem', text: 'Usuários' }) : null,
    el('a', { href: '/trocar-senha', role: 'menuitem', text: 'Trocar minha senha' }),
    el('a', { href: '/instalar', role: 'menuitem', text: 'Instalar no celular' }),
    el('button', { type: 'button', role: 'menuitem', text: 'Sair', onclick: sair })
  ]);
  const quem = el('button', { class: 'botao fantasma', type: 'button', 'aria-haspopup': 'menu', text: u.nome.split(' ')[0] + ' ▾',
    onclick: (ev) => { ev.stopPropagation(); menu.hidden = !menu.hidden; } });
  document.addEventListener('click', () => { menu.hidden = true; });
  const topo = el('header', { class: 'topo' }, [
    el('a', { class: 'marca', href: u.perfil === 'MECANICO' ? '/os/mecanico' : '/os' }, [
      el('img', { src: '/img/logo.svg', alt: '' }),
      el('div', {}, [el('b', { text: 'LOKAL' }), el('small', { text: titulo })])]),
    el('div', { class: 'estado', id: 'estado' }),
    el('div', { class: 'acoes' }, [
      ...extras,
      u.perfil !== 'MECANICO' ? el('a', { class: 'botao', href: '/painel', title: 'Abrir a dashboard' }, [el('span', { text: '▦' }),
        el('span', { class: 'texto-longo', text: 'Dashboard' })]) : null,
      botaoTema(), el('div', { class: 'usuario' }, [quem, menu])])
  ]);
  document.body.prepend(topo);
}

export async function sair() {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }); } catch { /* sem internet */ }
  guardar('lokal_perfil', '');
  location.replace('/');
}

export function idEnvio() {
  if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

/** Reduz a foto no próprio celular (lado maior 1600 px, JPEG) antes de guardar ou enviar: ~300 KB. */
export async function reduzirFoto(arquivo, lado = 1600, qualidade = 0.72) {
  if (!arquivo || !/^image\//.test(arquivo.type)) throw new Error('Escolha uma foto.');
  let img;
  try {
    img = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    img = await new Promise((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i); i.onerror = () => falha(new Error('Não consegui abrir a foto.'));
      i.src = URL.createObjectURL(arquivo);
    });
  }
  const w = img.width, h = img.height, f = Math.min(1, lado / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * f); c.height = Math.round(h * f);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', qualidade));
  if (!blob) throw new Error('Não consegui preparar a foto.');
  return blob;
}

/** Campo de foto com miniatura: devolve { caixa, valor() }. obrigatoria só muda o rótulo. */
export function campoFoto(rotulo, { obrigatoria = false, camera = true } = {}) {
  let blob = null;
  const entrada = el('input', { type: 'file', accept: 'image/*', capture: camera ? 'environment' : null, class: 'escondido' });
  const mini = el('div', { class: 'mini-foto vazia', text: '📷' });
  const estado = el('small', { text: obrigatoria ? 'obrigatória' : 'opcional' });
  const botao = el('button', { type: 'button', class: 'botao foto-botao', onclick: () => entrada.click() }, [mini,
    el('span', {}, [el('b', { text: rotulo }), estado])]);
  entrada.addEventListener('change', async () => {
    const f = entrada.files[0];
    if (!f) return;
    estado.textContent = 'preparando…';
    try {
      blob = await reduzirFoto(f);
      mini.textContent = '';
      mini.classList.remove('vazia');
      mini.style.backgroundImage = `url(${URL.createObjectURL(blob)})`;
      estado.textContent = 'ok · ' + Math.round(blob.size / 1024) + ' KB · toque para trocar';
    } catch (e) {
      blob = null; estado.textContent = e.message;
    }
  });
  return { caixa: el('div', { class: 'campo-foto' }, [botao, entrada]), valor: () => blob, obrigatoria, rotulo };
}

/** Miniatura de uma foto já guardada (abre grande em nova aba). */
export function fotoGuardada(caminho, rotulo) {
  if (!caminho) return null;
  const url = '/api/fotos?caminho=' + encodeURIComponent(caminho);
  const pdf = /\.pdf$/i.test(caminho);
  return el('a', { class: 'foto-guardada', href: url, target: '_blank', rel: 'noopener' }, [
    pdf ? el('div', { class: 'mini-foto pdf', text: 'PDF' }) : el('img', { src: url, alt: rotulo, loading: 'lazy' }),
    el('small', { text: rotulo })]);
}

export function registrarServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

export function mensagem(alvo, texto, tipo = 'erro') {
  alvo.className = 'mensagem ' + tipo;
  alvo.textContent = texto;
  alvo.hidden = !texto;
}
