// Service worker do LOKAL: guarda as telas do mecânico no celular (abrem sem internet) e envia sozinho a fila de
// fechamentos quando o sinal volta (Background Sync, no Android). Ao mudar arquivos desta lista, suba a VERSAO.
importScripts('/js/os/fila.js');

const VERSAO = 'lokal-os-v1';
const ARQUIVOS = [
  '/os', '/os/mecanico', '/manifest.json', '/css/estilo.css', '/css/os.css', '/js/tema.js', '/js/ui.js', '/js/api.js',
  '/js/sistema.js', '/js/os/inicio.js', '/js/os/regras.js', '/js/os/comum.js', '/js/os/fila.js', '/js/os/mecanico.js',
  '/img/logo.svg', '/favicon.svg', '/img/icone-192.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Telas e arquivos: tenta a internet (pega a versão nova) e cai no que está guardado. A api/ nunca é guardada aqui.
self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const chave = url.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  ev.respondWith((async () => {
    try {
      const r = await fetch(ev.request);
      if (r.ok && ARQUIVOS.includes(chave)) (await caches.open(VERSAO)).put(chave, r.clone());
      return r;
    } catch (e) {
      const guardado = await caches.match(chave, { ignoreSearch: true });
      if (guardado) return guardado;
      if (ev.request.mode === 'navigate') return caches.match('/os/mecanico');
      throw e;
    }
  })());
});

async function enviarFila() {
  const r = await self.LokalFila.processar();
  const clientes = await self.clients.matchAll({ includeUncontrolled: true });
  clientes.forEach((c) => c.postMessage({ tipo: 'fila', ...r }));
  if (r.pendentes && !r.precisaLogin) throw new Error('ainda pendente');   // o navegador tenta de novo depois
}

self.addEventListener('sync', (ev) => {
  if (ev.tag === 'enviar-fechamentos') ev.waitUntil(enviarFila());
});

self.addEventListener('message', (ev) => {
  if (ev.data === 'enviar-fila') ev.waitUntil(enviarFila().catch(() => {}));
});
