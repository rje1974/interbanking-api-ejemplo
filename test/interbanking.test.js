const test = require('node:test');
const assert = require('node:assert/strict');

const { _internals } = require('../interbanking');

const VALID_ENV = {
  IB_CLIENT_ID: 'client-id',
  IB_CLIENT_SECRET: 'client-secret',
  IB_REDIRECT_URL: 'https://localhost',
  IB_CUSTOMER_ID: 'E12345A',
  IB_TOKEN_URL: 'https://auth.example/token',
  IB_API_BASE_URL: 'https://api.example/api/prod/v1/',
};

test('getConfig valida variables requeridas', () => {
  assert.throws(
    () => _internals.getConfig({ ...VALID_ENV, IB_CLIENT_SECRET: '' }),
    /IB_CLIENT_SECRET/
  );
});

test('getConfig exige redirect URL con https', () => {
  assert.throws(
    () => _internals.getConfig({ ...VALID_ENV, IB_REDIRECT_URL: 'localhost' }),
    /https:\/\//
  );
});

test('getMovementsBaseUrl deriva la base sin duplicar v1', () => {
  const config = _internals.getConfig(VALID_ENV);

  assert.equal(_internals.getApiBaseUrl(config), 'https://api.example/api/prod/v1');
  assert.equal(_internals.getMovementsBaseUrl(config), 'https://api.example/api/prod');
});

test('buildDateChunks cubre el rango completo sin solaparse', () => {
  assert.deepEqual(_internals.buildDateChunks('2025-01-01', '2025-03-05', 30), [
    { since: '2025-01-01', until: '2025-01-30' },
    { since: '2025-01-31', until: '2025-03-01' },
    { since: '2025-03-02', until: '2025-03-05' },
  ]);
});

test('buildDateChunks incluye rangos de un solo dia', () => {
  assert.deepEqual(_internals.buildDateChunks('2025-01-01', '2025-01-01'), [
    { since: '2025-01-01', until: '2025-01-01' },
  ]);
});

test('buildDateChunks rechaza fechas invalidas', () => {
  assert.throws(
    () => _internals.buildDateChunks('2025-02-01', '2025-01-01'),
    /dateSince/
  );
  assert.throws(
    () => _internals.buildDateChunks('01-01-2025', '2025-01-02'),
    /YYYY-MM-DD/
  );
  assert.throws(
    () => _internals.buildDateChunks('2025-02-31', '2025-03-02'),
    /fecha valida/
  );
});
