/**
 * interbanking.js - Cliente para la API de Interbanking (Argentina)
 *
 * Este modulo maneja toda la comunicacion con la API de Interbanking:
 *   - Autenticacion OAuth2 con cache automatico de token
 *   - Requests autenticados con los headers correctos
 *   - Wrappers para saldos, movimientos y rangos largos de fechas
 *
 * Dos formas de usarlo:
 *   1. createClient(config) - cada cliente con sus credenciales y su propio token.
 *      Es la forma recomendada: permite consultar varias empresas en el mismo proceso.
 *   2. Las funciones sueltas (getBalances, getMovements, ...) - usan un cliente
 *      construido desde process.env. Comodo para scripts de una sola empresa.
 *
 * Quirks descubiertos durante meses de uso:
 *   1. Token: parametros van en URL query string, NO en body POST
 *   2. Header 'service' debe incluir https:// y coincidir con Redirect URL
 *   3. 'customer-id' va como query parameter, NO como header
 *   4. Header 'client_id' requerido en cada llamada (IBM API Connect)
 *   5. Token dura 2h (7200s), se cachea automaticamente
 *   6. Rango maximo: 64 dias por request (usar getBalancesRange para mas)
 *   7. Movimientos usa URL base DISTINTA a saldos (ver getMovements)
 *
 * Portal: https://developers.interbanking.com.ar/api/prod/
 *
 * @module interbanking
 */

const axios = require('axios');

const DEFAULT_TOKEN_URL = 'https://auth.interbanking.com.ar/cas/oidc/accessToken';
const DEFAULT_API_BASE_URL = 'https://api-gw.interbanking.com.ar/api/prod/v1';
const REQUIRED_ENV = ['IB_CLIENT_ID', 'IB_CLIENT_SECRET', 'IB_REDIRECT_URL', 'IB_CUSTOMER_ID'];

// Los mensajes de progreso van a stderr, nunca a stdout: si este cliente corre
// dentro de un servidor MCP, stdout es el canal del protocolo JSON-RPC y
// cualquier console.log lo corrompe.
function defaultLogger(message) {
  process.stderr.write(`${message}\n`);
}

function readEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Lee y valida la configuracion requerida antes de llamar a Interbanking.
 * Esto evita errores opacos cuando falta una credencial o una URL esta mal.
 *
 * @param {NodeJS.ProcessEnv|Object} [env=process.env]
 * @returns {Object}
 */
function getConfig(env = process.env) {
  const missing = REQUIRED_ENV.filter(name => !readEnv(env[name]));
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`);
  }

  const redirectUrl = readEnv(env.IB_REDIRECT_URL);
  if (!redirectUrl.startsWith('https://')) {
    throw new Error('IB_REDIRECT_URL debe incluir https:// y coincidir con la Redirect URL del portal');
  }

  return {
    clientId: readEnv(env.IB_CLIENT_ID),
    clientSecret: readEnv(env.IB_CLIENT_SECRET),
    redirectUrl,
    customerId: readEnv(env.IB_CUSTOMER_ID),
    tokenUrl: readEnv(env.IB_TOKEN_URL) || DEFAULT_TOKEN_URL,
    apiBaseUrl: readEnv(env.IB_API_BASE_URL) || DEFAULT_API_BASE_URL,
  };
}

/**
 * Resuelve la config de un cliente: lo que venga explicito gana, y lo que falte
 * se completa desde el entorno. Valida siempre con getConfig().
 *
 * @param {Object} [options={}] - Credenciales en camelCase
 * @param {NodeJS.ProcessEnv|Object} [env=process.env] - Entorno de respaldo
 * @returns {Object}
 */
function resolveConfig(options = {}, env = process.env) {
  return getConfig({
    IB_CLIENT_ID: options.clientId ?? env.IB_CLIENT_ID,
    IB_CLIENT_SECRET: options.clientSecret ?? env.IB_CLIENT_SECRET,
    IB_REDIRECT_URL: options.redirectUrl ?? env.IB_REDIRECT_URL,
    IB_CUSTOMER_ID: options.customerId ?? env.IB_CUSTOMER_ID,
    IB_TOKEN_URL: options.tokenUrl ?? env.IB_TOKEN_URL,
    IB_API_BASE_URL: options.apiBaseUrl ?? env.IB_API_BASE_URL,
  });
}

function getApiBaseUrl(config) {
  return config.apiBaseUrl.replace(/\/+$/, '');
}

function getMovementsBaseUrl(config) {
  return getApiBaseUrl(config).replace(/\/v1$/, '');
}

function parseIsoDate(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} debe tener formato YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || toIsoDate(date) !== value) {
    throw new Error(`${name} no es una fecha valida`);
  }
  return date;
}

function toIsoDate(date) {
  return date.toISOString().split('T')[0];
}

function buildDateChunks(dateSince, dateUntil, maxDays = 60) {
  if (!Number.isInteger(maxDays) || maxDays <= 0) {
    throw new Error('maxDays debe ser un entero mayor a 0');
  }

  const start = parseIsoDate(dateSince, 'dateSince');
  const end = parseIsoDate(dateUntil, 'dateUntil');
  if (start > end) {
    throw new Error('dateSince no puede ser posterior a dateUntil');
  }

  const chunks = [];
  let chunkStart = new Date(start);
  while (chunkStart <= end) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push({
      since: toIsoDate(chunkStart),
      until: toIsoDate(chunkEnd),
    });

    chunkStart = new Date(chunkEnd);
    chunkStart.setUTCDate(chunkStart.getUTCDate() + 1);
  }

  return chunks;
}

function accountKey(account) {
  return [account.bank_number, account.account_type, account.currency, account.account_number].join(':');
}

/**
 * Crea un cliente de Interbanking con sus propias credenciales y su propio
 * cache de token.
 *
 * Cada cliente es independiente: dos clientes con credenciales distintas no
 * comparten token. Eso es lo que permite consultar varias empresas en el mismo
 * proceso.
 *
 * Lo que no se pase explicito se toma de process.env (IB_CLIENT_ID, etc).
 *
 * @param {Object} [options={}]
 * @param {string} [options.clientId] - Client ID de la aplicacion del portal
 * @param {string} [options.clientSecret] - Client Secret de la aplicacion
 * @param {string} [options.redirectUrl] - Debe coincidir con la Redirect URL del portal e incluir https://
 * @param {string} [options.customerId] - Codigo de suscriptor de Interbanking web
 * @param {string} [options.tokenUrl] - Default: produccion
 * @param {string} [options.apiBaseUrl] - Default: produccion
 * @param {Function|null} [options.logger] - Recibe mensajes de progreso. Default: stderr. `null` los silencia.
 * @returns {Object} Cliente con getToken, apiRequest, getBalances, getBalancesRange, getMovements, getAllMovements
 *
 * @example
 * const { createClient } = require('interbanking-client');
 * const empresaA = createClient({ clientId, clientSecret, redirectUrl, customerId });
 * const saldos = await empresaA.getBalances();
 *
 * @example
 * // Dos empresas en el mismo proceso, cada una con su token
 * const empresaB = createClient({ clientId: otroId, clientSecret: otroSecret, ... });
 * const [a, b] = await Promise.all([empresaA.getBalances(), empresaB.getBalances()]);
 */
function createClient(options = {}) {
  const { logger = defaultLogger, ...credentials } = options;
  const config = resolveConfig(credentials);
  const log = typeof logger === 'function' ? logger : () => {};

  // Cache del token, privado de este cliente
  let accessToken = null;
  let tokenExpiry = null;

  /**
   * Obtiene un token OAuth2 usando el flujo client_credentials.
   *
   * IMPORTANTE: Interbanking requiere que TODOS los parametros vayan en la URL
   * (query string), no en el body del POST. Si los mandas en el body, falla.
   *
   * El token se cachea y se renueva automaticamente 1 minuto antes de expirar.
   *
   * @returns {Promise<string>} El access token (Bearer)
   * @throws {Error} Si la autenticacion falla (credenciales invalidas, service mal configurado, etc.)
   */
  async function getToken() {
    // Devolver token cacheado si todavia es valido
    if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
      return accessToken;
    }

    // Construir query string con todos los parametros OAuth2
    const params = new URLSearchParams({
      scope: 'info-financiera',           // Scope requerido para APIs financieras
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'client_credentials',   // Flujo maquina-a-maquina
    });

    // Parametros van en la URL, NO en el body (requisito de Interbanking)
    const url = `${config.tokenUrl}?${params.toString()}`;

    const response = await axios.post(url, null, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        // 'service' DEBE coincidir con la Redirect URL del portal.
        // DEBE incluir https:// o te da invalid_grant.
        'service': config.redirectUrl,
      },
      timeout: 30000,
    });

    // Cachear el token, renovar 1 minuto antes de que expire
    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;

    // Nunca loguear el token en si, solo cuando vence.
    log(`Token obtenido. Expira en ${response.data.expires_in} segundos.`);
    return accessToken;
  }

  /**
   * Hace un request autenticado a la API de Interbanking.
   *
   * Cada llamada requiere:
   *   - Authorization: Bearer <token>
   *   - Header client_id (requerido por IBM API Connect)
   *   - customer-id como QUERY PARAMETER
   *
   * @param {string} method - Metodo HTTP ('GET', 'POST', etc.)
   * @param {string} path - Path de la API (ej: '/accounts/balances')
   * @param {Object} [queryParams={}] - Query parameters adicionales
   * @param {Object|null} [data=null] - Body para requests POST/PUT
   * @returns {Promise<Object>} Los datos de la respuesta de la API
   * @throws {Error} Si el request falla (token expirado, parametros invalidos, etc.)
   */
  async function apiRequest(method, path, queryParams = {}, data = null) {
    const token = await getToken();

    // customer-id es OBLIGATORIO en cada llamada, como query parameter
    const params = { 'customer-id': config.customerId, ...queryParams };

    const requestConfig = {
      method,
      url: `${getApiBaseUrl(config)}${path}`,
      params,   // Axios los manda como query parameters (?customer-id=xxx&...)
      headers: {
        'Authorization': `Bearer ${token}`,   // Token OAuth2
        'client_id': config.clientId,         // Requerido por IBM API Connect
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
    };

    // Body para requests POST/PUT (ej: crear transferencias)
    if (data) {
      requestConfig.data = data;
    }

    const response = await axios(requestConfig);
    return response.data;
  }

  /**
   * Consulta saldos de todas las cuentas bancarias.
   *
   * Endpoint: GET /accounts/balances?customer-id=xxx
   *
   * Devuelve todas las cuentas con:
   *   - Saldos actuales (contable, operativo, proyectado 24h/48h)
   *   - Saldos historicos diarios con debitos y creditos
   *
   * Requiere suscripcion al plan "Informacion Financiera" en el portal.
   *
   * @param {Object} [queryParams={}] - Filtros opcionales
   * @param {string} [queryParams.date-since] - Fecha desde (YYYY-MM-DD)
   * @param {string} [queryParams.date-until] - Fecha hasta (YYYY-MM-DD)
   * @param {string} [queryParams.bank_number] - Filtrar por banco (ej: '007')
   * @param {string} [queryParams.currency] - Filtrar por moneda ('ARS', 'USD')
   * @returns {Promise<Object>} Datos de saldos con array de cuentas
   */
  async function getBalances(queryParams = {}) {
    return apiRequest('GET', '/accounts/balances', queryParams);
  }

  /**
   * Consulta saldos en un rango de fechas largo, superando el limite de 64 dias.
   *
   * La API de Interbanking solo permite rangos de hasta 64 dias por request.
   * Esta funcion divide un rango largo en chunks de 60 dias, hace multiples
   * llamadas, y unifica los resultados eliminando duplicados.
   *
   * @param {string} dateSince - Fecha inicio en formato YYYY-MM-DD
   * @param {string} dateUntil - Fecha fin en formato YYYY-MM-DD
   * @returns {Promise<Object>} Datos de saldos unificados con el rango completo
   */
  async function getBalancesRange(dateSince, dateUntil) {
    const CHUNK_DAYS = 60; // Margen por debajo del limite de 64 dias
    const chunks = buildDateChunks(dateSince, dateUntil, CHUNK_DAYS);

    log(`Consultando ${chunks.length} chunks para rango ${dateSince} a ${dateUntil}...`);

    // Consultar secuencialmente (evitar rate limits)
    let mergedResult = null;
    for (const chunk of chunks) {
      log(`  Consultando ${chunk.since} a ${chunk.until}...`);
      const data = await getBalances({
        'date-since': chunk.since,
        'date-until': chunk.until,
      });

      if (!mergedResult) {
        // Primer chunk: usar como base
        mergedResult = data;
        mergedResult.general_data.date_since = dateSince;
        mergedResult.general_data.date_until = dateUntil;
      } else {
        // Chunks siguientes: mergear historical_balances en cada cuenta
        const accountsByKey = new Map(mergedResult.accounts.map(account => [accountKey(account), account]));
        for (const account of data.accounts) {
          const existingAccount = accountsByKey.get(accountKey(account));
          if (!existingAccount) {
            mergedResult.accounts.push(account);
            continue;
          }

          const existingDates = new Set(
            existingAccount.historical_balances.map(h => h.operation_date)
          );
          for (const entry of account.historical_balances) {
            if (!existingDates.has(entry.operation_date)) {
              existingAccount.historical_balances.push(entry);
            }
          }
          // Actualizar saldos actuales con los del ultimo chunk
          existingAccount.balances = account.balances;
          existingAccount.row_date = account.row_date;
        }
      }
    }

    // Ordenar saldos historicos por fecha
    for (const account of mergedResult.accounts) {
      account.historical_balances.sort(
        (a, b) => new Date(a.operation_date) - new Date(b.operation_date)
      );
    }

    log(`Listo! Datos de ${mergedResult.accounts[0]?.historical_balances.length} dias.`);
    return mergedResult;
  }

  /**
   * Consulta movimientos de UNA cuenta bancaria.
   *
   * IMPORTANTE: Este endpoint usa una URL base DISTINTA a saldos.
   * Saldos usa IB_API_BASE_URL (termina en /v1).
   * Movimientos necesita la URL base SIN /v1, porque el path ya incluye /v1.
   * Si usas IB_API_BASE_URL, el /v1 se duplica y te da 404.
   *
   * Endpoint: GET https://api-gw.interbanking.com.ar/api/prod/v1/accounts/{account}/movements/{type}
   *
   * @param {string} accountNumber - Numero de cuenta (ej: '000123456789'). Va en el PATH, no como query param.
   * @param {string} bankNumber - Codigo de banco de 3 digitos (ej: '007' para Galicia)
   * @param {Object} [options={}] - Opciones de consulta
   * @param {string} [options.dateSince] - Fecha desde (YYYY-MM-DD)
   * @param {string} [options.dateUntil] - Fecha hasta (YYYY-MM-DD)
   * @param {string} [options.movementType='anteriores'] - Tipo: 'dia', 'anteriores', 'diferidos'
   * @param {string} [options.accountType='CC'] - Tipo de cuenta: 'CC' (corriente) o 'CA' (ahorro)
   * @param {string} [options.currency='ARS'] - Moneda: 'ARS' o 'USD'
   * @param {number} [options.limit=1000] - Limite de resultados (max 1000)
   * @param {number} [options.page=0] - Pagina de resultados
   * @returns {Promise<Object>} Datos de movimientos con array movements_detail
   */
  async function getMovements(accountNumber, bankNumber, options = {}) {
    const token = await getToken();
    const {
      dateSince, dateUntil,
      movementType = 'anteriores',
      accountType = 'CC',
      currency = 'ARS',
      limit = 1000,
      page = 0,
    } = options;

    const params = {
      'customer-id': config.customerId,
      'bank-number': bankNumber,
      'account-type': accountType,
      'currency': currency,
      'limit': limit,
      'page': page,
    };
    if (dateSince) params['date-since'] = dateSince;
    if (dateUntil) params['date-until'] = dateUntil;

    // IMPORTANTE: movimientos necesita la base sin /v1 porque el path ya lo incluye.
    const baseUrl = getMovementsBaseUrl(config);
    const url = `${baseUrl}/v1/accounts/${accountNumber}/movements/${movementType}`;

    const response = await axios.get(url, {
      params,
      headers: {
        'Authorization': `Bearer ${token}`,
        'client_id': config.clientId,
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    return response.data;
  }

  /**
   * Consulta movimientos de TODAS las cuentas en un rango de fechas.
   *
   * Primero descubre las cuentas disponibles via getBalances(), y luego
   * consulta los movimientos de cada una. No necesitas hardcodear cuentas.
   *
   * @param {string} dateSince - Fecha inicio (YYYY-MM-DD)
   * @param {string} dateUntil - Fecha fin (YYYY-MM-DD)
   * @param {Object} [options={}] - Opciones adicionales
   * @param {string} [options.movementType='anteriores'] - Tipo: 'dia', 'anteriores', 'diferidos'
   * @returns {Promise<Array>} Array de movimientos de todas las cuentas, con info del banco/cuenta agregada
   */
  async function getAllMovements(dateSince, dateUntil, options = {}) {
    const { movementType = 'anteriores' } = options;

    // Descubrir cuentas dinamicamente via saldos
    log('Descubriendo cuentas via /accounts/balances...');
    const balancesData = await getBalances();
    const accounts = balancesData.accounts.map(acc => ({
      bank: acc.bank_number,
      account: acc.account_number,
      name: `${acc.account_name} - ${acc.account_type} (${acc.bank_number})`,
      type: acc.account_type,
      currency: acc.currency,
    }));
    log(`Encontradas ${accounts.length} cuentas.`);

    const allMovements = [];
    for (const acc of accounts) {
      try {
        const data = await getMovements(acc.account, acc.bank, {
          dateSince, dateUntil,
          accountType: acc.type,
          currency: acc.currency,
          movementType,
        });
        const movements = (data.movements_detail || []).map(m => ({
          ...m,
          _bank_name: acc.name,
          _bank_number: acc.bank,
          _account_number: acc.account,
        }));
        allMovements.push(...movements);
        log(`  ${acc.name}: ${movements.length} movimientos`);
      } catch (e) {
        log(`  ${acc.name}: error - ${e.response?.data?.message || e.message}`);
      }
    }

    return allMovements;
  }

  return {
    getToken,
    apiRequest,
    getBalances,
    getBalancesRange,
    getMovements,
    getAllMovements,
    config,
  };
}

// --- Atajo compatible: funciones sueltas sobre un cliente de process.env ---
//
// Se construye la primera vez que se usa, no al importar el modulo: asi el
// consumidor puede cargar su .env despues del require sin que explote por
// credenciales faltantes.

let defaultClient = null;

function getDefaultClient() {
  if (!defaultClient) {
    defaultClient = createClient();
  }
  return defaultClient;
}

module.exports = {
  createClient,
  getToken: (...args) => getDefaultClient().getToken(...args),
  apiRequest: (...args) => getDefaultClient().apiRequest(...args),
  getBalances: (...args) => getDefaultClient().getBalances(...args),
  getBalancesRange: (...args) => getDefaultClient().getBalancesRange(...args),
  getMovements: (...args) => getDefaultClient().getMovements(...args),
  getAllMovements: (...args) => getDefaultClient().getAllMovements(...args),
  _internals: {
    buildDateChunks,
    getApiBaseUrl,
    getConfig,
    getMovementsBaseUrl,
    resolveConfig,
  },
};
