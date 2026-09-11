/**
 * Tests del factory createClient.
 *
 * Levantan un servidor HTTP local que hace de Interbanking falso: son offline,
 * no necesitan credenciales ni red real.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createClient, _internals } = require('../interbanking');

const BASE = {
  clientSecret: 'secret',
  redirectUrl: 'https://localhost',
};

// Servidor que responde tokens distintos por client_id y registra cada pedido.
function fakeInterbanking() {
  const tokenRequests = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/token') {
      const clientId = url.searchParams.get('client_id');
      tokenRequests.push({ clientId, service: req.headers.service });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ access_token: `AT-${clientId}`, expires_in: 7200 }));
      return;
    }

    if (url.pathname === '/v1/accounts/balances') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        _authorization: req.headers.authorization,
        _customerId: url.searchParams.get('customer-id'),
        accounts: [],
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        tokenRequests,
        close: () => new Promise(r => server.close(r)),
        options: clientId => ({
          ...BASE,
          clientId,
          customerId: `CUST-${clientId}`,
          tokenUrl: `http://127.0.0.1:${port}/token`,
          apiBaseUrl: `http://127.0.0.1:${port}/v1`,
          logger: null,
        }),
      });
    });
  });
}

test('dos clientes con credenciales distintas no comparten token', async () => {
  const ib = await fakeInterbanking();
  try {
    const empresaA = createClient(ib.options('empresa-a'));
    const empresaB = createClient(ib.options('empresa-b'));

    assert.equal(await empresaA.getToken(), 'AT-empresa-a');
    assert.equal(await empresaB.getToken(), 'AT-empresa-b');

    // Cada cliente pidió el suyo, con su propio client_id
    assert.deepEqual(ib.tokenRequests.map(r => r.clientId), ['empresa-a', 'empresa-b']);
  } finally {
    await ib.close();
  }
});

test('el token se cachea por cliente y no se vuelve a pedir', async () => {
  const ib = await fakeInterbanking();
  try {
    const cliente = createClient(ib.options('empresa-a'));

    await cliente.getToken();
    await cliente.getToken();
    await cliente.getBalances();

    assert.equal(ib.tokenRequests.length, 1, 'debería pedir el token una sola vez');
  } finally {
    await ib.close();
  }
});

test('cada request usa el customer-id y el token de su propio cliente', async () => {
  const ib = await fakeInterbanking();
  try {
    const empresaA = createClient(ib.options('empresa-a'));
    const empresaB = createClient(ib.options('empresa-b'));

    const [a, b] = await Promise.all([empresaA.getBalances(), empresaB.getBalances()]);

    assert.equal(a._authorization, 'Bearer AT-empresa-a');
    assert.equal(a._customerId, 'CUST-empresa-a');
    assert.equal(b._authorization, 'Bearer AT-empresa-b');
    assert.equal(b._customerId, 'CUST-empresa-b');
  } finally {
    await ib.close();
  }
});

test('el header service lleva la redirect URL con https', async () => {
  const ib = await fakeInterbanking();
  try {
    await createClient(ib.options('empresa-a')).getToken();
    assert.equal(ib.tokenRequests[0].service, 'https://localhost');
  } finally {
    await ib.close();
  }
});

test('createClient valida las credenciales al construirse', () => {
  assert.throws(
    () => createClient({ clientId: 'x', clientSecret: '', redirectUrl: 'https://localhost', customerId: 'c' }),
    /IB_CLIENT_SECRET/
  );
  assert.throws(
    () => createClient({ clientId: 'x', clientSecret: 'y', redirectUrl: 'localhost', customerId: 'c' }),
    /https:\/\//
  );
});

test('lo que no se pasa explicito se completa desde el entorno', () => {
  const config = _internals.resolveConfig(
    { clientId: 'explicito' },
    {
      IB_CLIENT_ID: 'del-entorno',
      IB_CLIENT_SECRET: 'secret',
      IB_REDIRECT_URL: 'https://localhost',
      IB_CUSTOMER_ID: 'E12345A',
    }
  );

  assert.equal(config.clientId, 'explicito', 'lo explicito gana');
  assert.equal(config.customerId, 'E12345A', 'lo que falta viene del entorno');
});

test('el logger se puede silenciar', () => {
  const mensajes = [];
  const cliente = createClient({
    clientId: 'x', clientSecret: 'y', redirectUrl: 'https://localhost', customerId: 'c',
    logger: m => mensajes.push(m),
  });

  assert.ok(cliente.config);
  assert.deepEqual(mensajes, [], 'construir un cliente no loguea nada');
});
