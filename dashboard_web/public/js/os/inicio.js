// Atalho do celular abre /os. Se este aparelho é de mecânico, vai direto para a lista dele (funciona sem internet).
try {
  if (localStorage.getItem('lokal_perfil') === 'MECANICO' && location.pathname.replace(/\/$/, '') === '/os') {
    location.replace('/os/mecanico');
  }
} catch { /* sem armazenamento */ }
