// Pequenos utilitários de tela usados por todas as páginas.

export function el(tag, attrs = {}, filhos = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  (Array.isArray(filhos) ? filhos : [filhos]).forEach((f) => {
    if (f === null || f === undefined || f === false) return;
    e.appendChild(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f);
  });
  return e;
}

const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const reaisCurto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

export const fmt = {
  reais: (v) => (v === null || v === undefined ? '—' : reais.format(v)),
  reaisCurto: (v) => (v === null || v === undefined ? '—' : reaisCurto.format(v)),
  int: (v) => (v === null || v === undefined ? '—' : inteiro.format(v)),
  dec: (v) => (v === null || v === undefined ? '—' : decimal.format(v)),
  pct: (v) => (v === null || v === undefined ? '—' : pct.format(v)),
  data: (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—'),
  dataHora: (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') + ' ' + s.slice(11, 16) : '—'),
  mes: (m) => {
    if (!m) return '—';
    const [a, n] = m.split('-');
    return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(n) - 1] + '/' + a.slice(2);
  }
};

export function guardar(chave, valor) {
  try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento */ }
}
export function lembrar(chave) {
  try { return localStorage.getItem(chave); } catch { return null; }
}

/** Botão de tema: alterna claro/escuro e avisa quem precisa redesenhar (gráficos). */
export function botaoTema(aoTrocar) {
  const escuroAgora = () => {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const b = el('button', { class: 'botao fantasma', type: 'button', title: 'Trocar tema claro/escuro', 'aria-label': 'Trocar tema claro/escuro' });
  const rotulo = () => { b.textContent = escuroAgora() ? '☀' : '☾'; };
  b.addEventListener('click', () => {
    const novo = escuroAgora() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo);
    guardar('lokal_tema', novo);
    rotulo();
    aoTrocar && aoTrocar();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { rotulo(); aoTrocar && aoTrocar(); });
  rotulo();
  return b;
}

export function baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = el('a', { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
