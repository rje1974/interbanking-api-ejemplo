/**
 * interbanking.js - Cliente para la API de Interbanking (Argentina)
 *
 * Este modulo maneja toda la comunicacion con la API de Interbanking:
 *   - Autenticacion OAuth2 con cache automatico de token
 *   - Requests autenticados con los headers correctos
 *   - Wrappers para saldos, movimientos y rangos largos de fechas
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

require('dotenv').config();
const axios = require('axios');

// Credenciales desde .env (nunca hardcodear)
const {
  IB_CLIENT_ID,         // API Key - generada al crear la app en el portal
  IB_CLIENT_SECRET,     // API Secret - se muestra 1 sola vez al crear la app
  IB_REDIRECT_URL,      // URL de redireccion OAuth configurada en el portal
  IB_CUSTOMER_ID,       // Codigo de suscriptor/abonado en Interbanking
  IB_TOKEN_URL,         // https://auth.interbanking.com.ar/cas/oidc/accessToken
  IB_API_BASE_URL,      // https://api-gw.interbanking.com.ar/api/prod/v1
} = process.env;

// Cache del token - evita pedir uno nuevo en cada llamada
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
 *
 * @example
 * const token = await getToken();
 * console.log(token); // "AT-xxxxx-yyyyyyy"
 */
async function getToken() {
  // Devolver token cacheado si todavia es valido
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  // Construir query string con todos los parametros OAuth2
  const params = new URLSearchParams({
    scope: 'info-financiera',           // Scope requerido para APIs financieras
    client_id: IB_CLIENT_ID,
    client_secret: IB_CLIENT_SECRET,
    grant_type: 'client_credentials',   // Flujo maquina-a-maquina
  });

  // Parametros van en la URL, NO en el body (requisito de Interbanking)
  const url = `${IB_TOKEN_URL}?${params.toString()}`;

  const response = await axios.post(url, null, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      // 'service' DEBE coincidir con la Redirect URL del portal.
      // DEBE incluir https:// o te da invalid_grant.
      'service': IB_REDIRECT_URL,
    },
    timeout: 30000,
  });

  // Cachear el token, renovar 1 minuto antes de que expire
  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;

  console.log('Token obtenido. Expira en', response.data.expires_in, 'segundos.');
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
 *
 * @example
 * const data = await apiRequest('GET', '/accounts/balances');
 * console.log(data.accounts);
 */
async function apiRequest(method, path, queryParams = {}, data = null) {
  const token = await getToken();

  // customer-id es OBLIGATORIO en cada llamada, como query parameter
  const params = { 'customer-id': IB_CUSTOMER_ID, ...queryParams };

  const config = {
    method,
    url: `${IB_API_BASE_URL}${path}`,
    params,   // Axios los manda como query parameters (?customer-id=xxx&...)
    headers: {
      'Authorization': `Bearer ${token}`,     // Token OAuth2
      'client_id': IB_CLIENT_ID,              // Requerido por IBM API Connect
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    timeout: 30000,
  };

  // Body para requests POST/PUT (ej: crear transferencias)
  if (data) {
    config.data = data;
  }

  const response = await axios(config);
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
 *
 * @example
 * // Saldos actuales (ultimos ~60 dias)
 * const data = await getBalances();
 * for (const account of data.accounts) {
 *   console.log(`${account.account_name} (${account.bank_number}): $${account.balances.countable_balance}`);
 * }
 *
 * @example
 * // Saldos de un periodo especifico (max 64 dias)
 * const data = await getBalances({ 'date-since': '2025-01-01', 'date-until': '2025-02-28' });
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
 *
 * @example
 * // Saldos de todo un anio
 * const data = await getBalancesRange('2025-01-01', '2025-12-31');
 * console.log(`${data.accounts[0].historical_balances.length} dias de historia`);
 */
async function getBalancesRange(dateSince, dateUntil) {
  const CHUNK_DAYS = 60; // Margen por debajo del limite de 64 dias
  const start = new Date(dateSince);
  const end = new Date(dateUntil);

  // Armar lista de chunks de fechas
  const chunks = [];
  let chunkStart = new Date(start);
  while (chunkStart < end) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + CHUNK_DAYS);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({
      since: chunkStart.toISOString().split('T')[0],
      until: chunkEnd.toISOString().split('T')[0],
    });
    // Siguiente chunk empieza el dia despues (evitar overlap)
    chunkStart = new Date(chunkEnd);
    chunkStart.setDate(chunkStart.getDate() + 1);
  }

  console.log(`Consultando ${chunks.length} chunks para rango ${dateSince} a ${dateUntil}...`);

  // Consultar secuencialmente (evitar rate limits)
  let mergedResult = null;
  for (const chunk of chunks) {
    console.log(`  Consultando ${chunk.since} a ${chunk.until}...`);
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
      for (let i = 0; i < data.accounts.length; i++) {
        const existingDates = new Set(
          mergedResult.accounts[i].historical_balances.map(h => h.operation_date)
        );
        for (const entry of data.accounts[i].historical_balances) {
          if (!existingDates.has(entry.operation_date)) {
            mergedResult.accounts[i].historical_balances.push(entry);
          }
        }
        // Actualizar saldos actuales con los del ultimo chunk
        mergedResult.accounts[i].balances = data.accounts[i].balances;
        mergedResult.accounts[i].row_date = data.accounts[i].row_date;
      }
    }
  }

  // Ordenar saldos historicos por fecha
  for (const account of mergedResult.accounts) {
    account.historical_balances.sort(
      (a, b) => new Date(a.operation_date) - new Date(b.operation_date)
    );
  }

  console.log('Listo! Datos de', mergedResult.accounts[0]?.historical_balances.length, 'dias.');
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
 *
 * @example
 * const data = await getMovements('000123456789', '007', {
 *   dateSince: '2025-01-01',
 *   dateUntil: '2025-01-31',
 *   movementType: 'anteriores',
 * });
 * for (const mov of data.movements_detail) {
 *   console.log(`${mov.movement_date} | ${mov.amount} | ${mov.code_description_ib}`);
 * }
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
    'customer-id': IB_CUSTOMER_ID,
    'bank-number': bankNumber,
    'account-type': accountType,
    'currency': currency,
    'limit': limit,
    'page': page,
  };
  if (dateSince) params['date-since'] = dateSince;
  if (dateUntil) params['date-until'] = dateUntil;

  // IMPORTANTE: NO usar IB_API_BASE_URL aca porque termina en /v1
  // y el path ya incluye /v1, lo que duplicaria el segmento y daria 404.
  const baseUrl = 'https://api-gw.interbanking.com.ar/api/prod';
  const url = `${baseUrl}/v1/accounts/${accountNumber}/movements/${movementType}`;

  const response = await axios.get(url, {
    params,
    headers: {
      'Authorization': `Bearer ${token}`,
      'client_id': IB_CLIENT_ID,
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
 *
 * @example
 * const movimientos = await getAllMovements('2025-01-01', '2025-01-31');
 * console.log(`Total: ${movimientos.length} movimientos en todas las cuentas`);
 *
 * // Agrupar por cuenta
 * const porCuenta = {};
 * for (const m of movimientos) {
 *   const key = `${m._bank_number}-${m._account_number}`;
 *   (porCuenta[key] = porCuenta[key] || []).push(m);
 * }
 */
async function getAllMovements(dateSince, dateUntil, options = {}) {
  const { movementType = 'anteriores' } = options;

  // Descubrir cuentas dinamicamente via saldos
  console.log('Descubriendo cuentas via /accounts/balances...');
  const balancesData = await getBalances();
  const accounts = balancesData.accounts.map(acc => ({
    bank: acc.bank_number,
    account: acc.account_number,
    name: `${acc.account_name} - ${acc.account_type} (${acc.bank_number})`,
    type: acc.account_type,
    currency: acc.currency,
  }));
  console.log(`Encontradas ${accounts.length} cuentas.\n`);

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
      console.log(`  ${acc.name}: ${movements.length} movimientos`);
    } catch (e) {
      console.error(`  ${acc.name}: error - ${e.response?.data?.message || e.message}`);
    }
  }

  return allMovements;
}

module.exports = {
  getToken,
  apiRequest,
  getBalances,
  getBalancesRange,
  getMovements,
  getAllMovements,
};
