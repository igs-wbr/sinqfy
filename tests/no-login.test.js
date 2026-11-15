// LOGIN=off: o painel abre direto como o dono, sem cookie e sem a tela de login.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

process.env.LOGIN = 'off';
const { req, close } = await boot();
after(close);

test('LOGIN=off com HOST de loopback entra sem login', async () => {
  const home = await req('/account');
  assert.equal(home.status, 200);
  assert.doesNotMatch(home.text, /action="\/logout"/);
  assert.equal((await req('/login')).location, '/');
});
