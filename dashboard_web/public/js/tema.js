// Carregado no <head>, antes de desenhar: aplica o tema salvo neste aparelho (claro, escuro ou automático).
try {
  const t = localStorage.getItem('lokal_tema');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch { /* sem armazenamento: segue o sistema */ }
