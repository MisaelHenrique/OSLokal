// Conversa com as funções da Vercel (pasta api/). Sessão vencida leva de volta ao login; senha provisória leva
// à troca de senha.

async function pedir(url, opcoes = {}) {
  const r = await fetch(url, { credentials: 'same-origin', ...opcoes });
  let d = {};
  try { d = await r.json(); } catch { /* resposta vazia */ }
  if (r.status === 401 && !url.endsWith('/api/login')) {
    location.href = '/?voltar=' + encodeURIComponent(location.pathname + location.hash);
    throw new Error('Sessão encerrada.');
  }
  if (r.status === 403 && d.trocar_senha) {
    location.href = '/trocar-senha';
    throw new Error(d.erro);
  }
  if (!r.ok) throw new Error(d.erro || 'Erro ' + r.status);
  return d;
}

const postar = (url, corpo) => pedir(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });

/** Envia um arquivo (foto já reduzida ou PDF) e devolve o caminho guardado. */
async function enviarArquivo(params, blob) {
  return pedir('/api/fotos?' + new URLSearchParams(params), {
    method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg', 'X-Lokal': '1' }, body: blob
  });
}

export const api = {
  sessao: () => pedir('/api/sessao'),
  entrar: (usuario, senha) => postar('/api/login', { usuario, senha }),
  sair: () => postar('/api/logout'),
  trocarSenha: (atual, nova) => postar('/api/senha', { atual, nova }),
  dados: ({ exemplo = false, atualizar = false } = {}) =>
    pedir('/api/dados' + (exemplo ? '?modo=exemplo' : atualizar ? '?atualizar=1' : '')),
  usuarios: () => pedir('/api/usuarios'),
  salvarUsuario: (u) => postar('/api/usuarios', u),
  resetarSenha: (login) => postar('/api/usuarios', { login, acao: 'resetar_senha' }),
  veiculos: () => pedir('/api/veiculos'),
  listaOS: (params = {}) => pedir('/api/os' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')),
  os: (id) => pedir('/api/os?id=' + encodeURIComponent(id)),
  acaoOS: (acao, dados) => postar('/api/os', { ...dados, acao }),
  enviarArquivo
};

/** Página de destino depois do login, conforme o perfil. */
export function inicioDoPerfil(u) {
  if (u.trocar_senha) return '/trocar-senha';
  if (u.perfil === 'MECANICO') return '/os/mecanico';
  if (u.perfil === 'DIRETORIA') return '/painel';
  return '/os';
}
