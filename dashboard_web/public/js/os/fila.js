// Fila de fechamentos feitos SEM internet. Script comum (não módulo) para rodar igual na página do mecânico e no
// service worker (sw.js), que envia a fila sozinho quando o sinal volta, mesmo com o app fechado (Android/Chrome).
// Tudo fica no IndexedDB do celular: o fechamento e as fotos só saem dali depois que o servidor confirma.
(function (escopo) {
  const BANCO = 'lokal_os', VERSAO = 1;
  let conexao = null, rodando = null;

  function abrir() {
    if (conexao) return conexao;
    conexao = new Promise((ok, falha) => {
      const r = indexedDB.open(BANCO, VERSAO);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('fila')) db.createObjectStore('fila', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => { conexao = null; falha(r.error); };
    });
    return conexao;
  }

  async function op(loja, modo, f) {
    const db = await abrir();
    return new Promise((ok, falha) => {
      const t = db.transaction(loja, modo);
      const r = f(t.objectStore(loja));
      t.oncomplete = () => ok(r && r.result);
      t.onerror = () => falha(t.error);
      t.onabort = () => falha(t.error || new Error('Não consegui gravar no celular (memória cheia?).'));
    });
  }

  const Fila = {
    guardarCache: (chave, valor) => op('cache', 'readwrite', (s) => s.put(valor, chave)),
    lerCache: (chave) => op('cache', 'readonly', (s) => s.get(chave)),
    adicionar: (item) => op('fila', 'readwrite', (s) => s.put(item)),
    atualizar: (item) => op('fila', 'readwrite', (s) => s.put(item)),
    remover: (id) => op('fila', 'readwrite', (s) => s.delete(id)),
    listar: () => op('fila', 'readonly', (s) => s.getAll()),

    /** Envia o que estiver pendente. Devolve { enviados, pendentes, erros, precisaLogin }. Repetir não duplica nada. */
    processar() {
      if (rodando) return rodando;
      rodando = (async () => {
        const res = { enviados: 0, pendentes: 0, erros: 0, precisaLogin: false };
        const itens = (await Fila.listar()).sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1));
        for (const item of itens) {
          if (item.estado === 'erro') { res.erros++; continue; }
          const r = await enviarItem(item);
          if (r === 'ok') res.enviados++;
          else if (r === 'erro') res.erros++;
          else { res.precisaLogin = r === 'login'; break; }
        }
        res.pendentes = (await Fila.listar()).filter((i) => i.estado !== 'erro').length;
        return res;
      })().finally(() => { rodando = null; });
      return rodando;
    }
  };

  async function enviarItem(item) {
    try {
      item.caminhos = item.caminhos || {};
      for (const [tipo, blob] of Object.entries(item.fotos || {})) {
        if (!blob || item.caminhos[tipo]) continue;
        const q = new URLSearchParams({ tipo, os: item.os_id, envio: item.id });
        const r = await fetch('/api/fotos?' + q, { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': blob.type || 'image/jpeg', 'X-Lokal': '1' }, body: blob });
        const fim = await tratar(r, item);
        if (fim) return fim;
        item.caminhos[tipo] = (await r.json()).caminho;
        await Fila.atualizar(item);
      }
      const r = await fetch('/api/os', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item.dados, acao: 'executar', id: item.os_id, envio_id: item.id, fotos: item.caminhos }) });
      const fim = await tratar(r, item);
      if (fim) return fim;
      await Fila.remover(item.id);
      return 'ok';
    } catch (e) {
      return 'rede';   // sem internet ou caiu no meio: tenta de novo depois
    }
  }

  /** null = seguiu bem; 'login', 'erro' ou 'rede' = parar este item. */
  async function tratar(r, item) {
    if (r.ok) return null;
    if (r.status === 401) { item.estado = 'login'; await Fila.atualizar(item); return 'login'; }
    if (r.status === 403) {
      let d = {};
      try { d = await r.json(); } catch { /* vazio */ }
      if (d.trocar_senha) return 'login';
      item.estado = 'erro'; item.erro = d.erro || 'Recusado pelo servidor.'; await Fila.atualizar(item); return 'erro';
    }
    if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) {
      let d = {};
      try { d = await r.json(); } catch { /* vazio */ }
      item.estado = 'erro'; item.erro = d.erro || ('Erro ' + r.status); await Fila.atualizar(item); return 'erro';
    }
    return 'rede';
  }

  escopo.LokalFila = Fila;
})(typeof self !== 'undefined' ? self : this);
