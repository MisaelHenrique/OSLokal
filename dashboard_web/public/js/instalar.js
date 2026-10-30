// Botão "Instalar agora" quando o navegador oferece (Chrome/Android/computador). No iPhone, só o passo a passo.
let pedido = null;
const b = document.getElementById('instalar');
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) document.getElementById('instalado').hidden = false;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); pedido = ev; b.hidden = false; });
b.addEventListener('click', async () => {
  if (!pedido) return;
  pedido.prompt();
  await pedido.userChoice;
  pedido = null; b.hidden = true;
});
window.addEventListener('appinstalled', () => { document.getElementById('instalado').hidden = false; b.hidden = true; });
