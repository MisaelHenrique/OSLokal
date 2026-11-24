import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filiaisDoUsuario } from '../api/_lib/acesso.js';

test('filiaisDoUsuario aceita ; com espaços', () => {
  assert.deepEqual(filiaisDoUsuario({ filial: ' MATRIZ ; OUTROS;' }), ['MATRIZ', 'OUTROS']);
});
