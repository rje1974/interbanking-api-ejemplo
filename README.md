# Interbanking API - Ejemplo practico (Argentina)

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![License](https://img.shields.io/badge/License-MIT-blue)
![API](https://img.shields.io/badge/Interbanking-API%20v1-orange)

Ejemplo funcional para conectarse a la **API de Interbanking** (Argentina) y consultar saldos y movimientos de todas tus cuentas bancarias desde codigo.

> **Interbanking** es una plataforma que conecta empresas con multiples bancos argentinos desde un solo lugar. Su API permite consultar saldos, movimientos, extractos y confeccionar transferencias de forma programatica.

Este proyecto nacio de meses de uso real de la API. La documentacion oficial es escasa y tiene varias trampas no documentadas. Este ejemplo las documenta todas.

**Tres formas de usarlo:**

| | Para que |
|---|---|
| **Leer este repo** | Entender la API y sus trampas antes de escribir tu propia integracion |
| **`npm install interbanking-client`** | Usar el cliente ya hecho en tu proyecto Node |
| **[`interbanking-mcp`](https://github.com/rje1974/interbanking-mcp)** | Consultar tus cuentas en castellano desde un agente de IA |

---

## Contenido

- [Requisitos previos](#requisitos-previos)
- [Registro en el portal de desarrolladores](#registro-en-el-portal-de-desarrolladores)
- [Instalacion y configuracion](#instalacion-y-configuracion)
- [Uso](#uso)
- [Gestion de tokens y credenciales](#gestion-de-tokens-y-credenciales)
- [Quirks y trampas (IMPORTANTE)](#quirks-y-trampas-importante)
- [Estructura de respuestas](#estructura-de-respuestas)
- [Errores comunes y soluciones](#errores-comunes-y-soluciones)
- [Contacto soporte Interbanking](#contacto-soporte-interbanking)

---

## Requisitos previos

- Node.js 18 o superior
- Una cuenta **empresa** en Interbanking (no funciona con cuentas personales)
- Al menos un banco adherido en tu cuenta de Interbanking

---

## Registro en el portal de desarrolladores

### 1. Crear cuenta en el portal

Anda a [https://developers.interbanking.com.ar/api/prod/](https://developers.interbanking.com.ar/api/prod/) y registrate con tu email corporativo.

### 2. Crear una aplicacion

1. En el portal, anda a **Aplicaciones** > **Crear nueva aplicacion**
2. Ponele un nombre descriptivo (ej: "Mi Dashboard Financiero")
3. Configura la **Redirect URL** (puede ser `https://localhost` si no necesitas OAuth interactivo)
4. Al crear la app te van a mostrar el **Client ID** (API Key) y el **Client Secret**
5. **IMPORTANTE:** El Client Secret se muestra **una sola vez**. Copialo y guardalo en un lugar seguro

### 3. Suscribirse al plan "Informacion Financiera"

1. En el portal, anda a **Productos de API**
2. Busca el plan **Informacion Financiera** ([link directo](https://developers.interbanking.com.ar/api/prod/product/3178))
3. Suscribi tu aplicacion al plan
4. Este plan incluye: Saldos, Movimientos, Extractos

### 4. Obtener el Customer ID

El Customer ID (codigo de abonado) no esta en el portal de desarrolladores. Lo encontras en:

1. Entra a la **web de Interbanking** (no el portal de desarrolladores)
2. Anda a **Administracion** > **Bancos y cuentas**
3. Ahi vas a ver tu codigo de suscriptor/abonado (ej: `E12345A`)

---

## Instalacion y configuracion

### Como paquete, en tu proyecto

```bash
npm install interbanking-client
```

```javascript
const { createClient } = require('interbanking-client');

const ib = createClient({
  clientId: process.env.IB_CLIENT_ID,
  clientSecret: process.env.IB_CLIENT_SECRET,
  redirectUrl: process.env.IB_REDIRECT_URL,
  customerId: process.env.IB_CUSTOMER_ID,
});

const saldos = await ib.getBalances();
```

### Clonando este repo, para leerlo y correr los ejemplos

```bash
# Clonar o descargar el proyecto
git clone https://github.com/rje1974/interbanking-api-ejemplo.git
cd interbanking-api-ejemplo

# Instalar dependencias
npm install

# Copiar y completar el archivo de configuracion
cp .env.example .env
# Editar .env con tus credenciales
```

### Variables de entorno (.env)

| Variable | Descripcion | Donde encontrarla |
|----------|-------------|-------------------|
| `IB_CLIENT_ID` | API Key de tu aplicacion | Portal > Aplicaciones > tu app |
| `IB_CLIENT_SECRET` | Secret de la app (se muestra 1 sola vez) | Portal > al crear la app |
| `IB_REDIRECT_URL` | URL de redireccion OAuth | Portal > configuracion de la app |
| `IB_CUSTOMER_ID` | Codigo de suscriptor/abonado | Interbanking web > Administracion > Bancos y cuentas |
| `IB_TOKEN_URL` | URL de autenticacion | Siempre `https://auth.interbanking.com.ar/cas/oidc/accessToken` |
| `IB_API_BASE_URL` | URL base de la API | Siempre `https://api-gw.interbanking.com.ar/api/prod/v1` |

---

## Uso

### Consultar saldos

```bash
npm run saldos
```

### Consultar movimientos de una cuenta

```bash
npm run movimientos
```

### Mini dashboard web

```bash
npm run dashboard
# Abrir http://localhost:3000
```

### Desde tu propio codigo

```javascript
const { createClient } = require('interbanking-client');

const ib = createClient({
  clientId: '...', clientSecret: '...',
  redirectUrl: 'https://localhost', customerId: '...',
});

const saldos = await ib.getBalances();
const historico = await ib.getBalancesRange('2025-01-01', '2025-12-31');
const movimientos = await ib.getMovements('000123456789', '007', {
  dateSince: '2025-01-01', dateUntil: '2025-01-31',
});
const todos = await ib.getAllMovements('2025-01-01', '2025-01-31');
```

Lo que no le pases explicito lo toma de las variables de entorno, asi que si ya tenes el
`.env` armado alcanza con `createClient()`.

### Desde un agente de IA

Con [`interbanking-mcp`](https://github.com/rje1974/interbanking-mcp) consultas tus
cuentas preguntando en castellano, sin escribir codigo. Es de solo lectura.

### Con las funciones sueltas (compatible con versiones anteriores)

```javascript
require('dotenv').config();
const { getBalances, getBalancesRange, getMovements, getAllMovements } = require('interbanking-client');

// Saldos de todas las cuentas
const saldos = await getBalances();

// Saldos historicos (rango largo, se divide automaticamente en chunks)
const historico = await getBalancesRange('2025-01-01', '2025-12-31');

// Movimientos de una cuenta especifica
const movimientos = await getMovements('000123456789', '007', {
  dateSince: '2025-01-01',
  dateUntil: '2025-01-31',
  movementType: 'anteriores', // 'dia', 'anteriores', 'diferidos'
});

// Movimientos de TODAS las cuentas (descubre las cuentas automaticamente via saldos)
const todos = await getAllMovements('2025-01-01', '2025-01-31');
```

---

## Validaciones y tests

Este repo incluye tests offline para la logica que no requiere credenciales reales:

```bash
npm run check
npm test
```

`npm run check` valida sintaxis con `node --check`. `npm test` usa `node:test` y cubre:

- Variables de entorno requeridas.
- `IB_REDIRECT_URL` con `https://`.
- Derivacion de URL base para movimientos sin duplicar `/v1`.
- Division de rangos largos de fechas en chunks sin solaparse.
- Aislamiento del token entre clientes: dos `createClient` con credenciales distintas no
  comparten token, y cada request usa el `customer-id` que le corresponde. Estos tests
  levantan un servidor HTTP local que hace de Interbanking falso, asi que siguen siendo
  offline.

Los comandos `npm run saldos`, `npm run movimientos`, `npm run movimientos-rango` y `npm run dashboard` llaman a la API real y requieren `.env` completo.

---

## Gestion de tokens y credenciales

### Como funciona el token

Interbanking usa OAuth2 con flujo `client_credentials`: no hay usuario que autorice nada
en un navegador, tu aplicacion cambia `client_id` + `client_secret` por un token y listo.
Es el flujo maquina-a-maquina, pensado para procesos automaticos.

Tres cosas que la documentacion oficial no dice y te hacen perder una tarde:

1. **Los parametros van en la query string, no en el body.** Es un POST, pero los
   parametros viajan en la URL. Si los mandas en el body, falla sin explicar por que.
2. **El header `service` tiene que incluir `https://`** y coincidir exactamente con la
   Redirect URL del portal. Si no, `invalid_grant`.
3. **El token dura 2 horas** (`expires_in: 7200`).

El cliente se encarga de las tres.

### Ciclo de vida

El token se guarda **en memoria** y se renueva solo, un minuto antes de vencer:

```javascript
const ib = createClient({ ... });

await ib.getBalances();   // pide el token
await ib.getMovements();  // reutiliza el mismo
// ... dos horas despues ...
await ib.getBalances();   // lo renueva solo
```

No se persiste a disco a proposito. Un token es una credencial completa mientras vive:
guardarlo en un archivo agrega una superficie de exposicion para ahorrar una llamada que
tarda menos de un segundo y ocurre una vez cada dos horas. Si tu proceso es de vida corta
(un cron que corre y termina), simplemente pide uno nuevo en cada corrida.

### Varias empresas en el mismo proceso

Cada cliente tiene su propio token. Dos clientes con credenciales distintas nunca se
pisan, asi que podes consultar varias empresas en la misma corrida:

```javascript
const empresaA = createClient({ clientId: idA, clientSecret: secretA, customerId: custA, redirectUrl });
const empresaB = createClient({ clientId: idB, clientSecret: secretB, customerId: custB, redirectUrl });

const [saldosA, saldosB] = await Promise.all([
  empresaA.getBalances(),
  empresaB.getBalances(),
]);
```

Cada empresa necesita su propia aplicacion en el portal y su propio `customer-id`. **No
compartas credenciales entre empresas**: ademas de ser mala idea, el `customer-id` define
que cuentas ves.

### Donde viven las credenciales

| Escenario | Donde | Cuidado |
|---|---|---|
| Script o proyecto propio | `.env` en la raiz, fuera de git | Que `.gitignore` lo incluya |
| Cron o servicio | Variables de entorno del proceso o un archivo de secretos con permisos `600` | Que no queden en el `ps` ni en los logs |
| Servidor MCP | El archivo de configuracion del cliente MCP | **Es texto plano en tu disco**, ver abajo |
| CI | El gestor de secretos de la plataforma | Nunca en el YAML |

Sobre el **MCP**: la configuracion de Claude Desktop y similares es un JSON sin cifrar en
tu carpeta de usuario. Para credenciales de solo lectura sobre tus propias cuentas suele
ser un riesgo aceptable, pero conviene saberlo antes de pegarlas: cualquier proceso que
corra como tu usuario puede leer ese archivo. Si tu sistema operativo ofrece un llavero,
es mejor lugar.

### Que no hacer

- **No commitear `.env`** ni variantes con credenciales.
- **No loguear el token.** El cliente informa cuando vence, nunca su valor.
- **No pegar** tokens, Client Secret, saldos, movimientos, CUIT ni respuestas reales en
  issues, commits o ejemplos. Si necesitas mostrar un error, reemplazalos por
  placeholders.
- **No compartir un cliente entre empresas** cambiandole las credenciales: crea uno por
  empresa.

El `Client Secret` **se muestra una sola vez** al crear la aplicacion en el portal.
Guardalo en un gestor de secretos apenas lo veas: si lo perdes, hay que regenerarlo.

---

## Quirks y trampas (IMPORTANTE)

Esta es la seccion mas valiosa de este proyecto. Estas son cosas que descubri a fuerza de prueba y error, porque la documentacion oficial no las menciona o las explica mal.

### 1. Token: los parametros van en la URL, NO en el body

A diferencia de la mayoria de las APIs OAuth2, Interbanking requiere que los parametros del token request vayan como **query string** en la URL, no en el body del POST.

```javascript
// MAL - esto da error
await axios.post(tokenUrl, {
  grant_type: 'client_credentials',
  client_id: '...',
  client_secret: '...',
  scope: 'info-financiera',
});

// BIEN - parametros en la URL
const params = new URLSearchParams({
  scope: 'info-financiera',
  client_id: '...',
  client_secret: '...',
  grant_type: 'client_credentials',
});
await axios.post(`${tokenUrl}?${params}`, null, { headers: { ... } });
```

### 2. El header `service` debe incluir `https://` y coincidir con la Redirect URL

Al pedir el token, hay que enviar un header `service` que coincida **exactamente** con la Redirect URL configurada en el portal. Si le falta el `https://`, vas a recibir un error `invalid_grant`.

```javascript
headers: {
  'service': 'https://localhost',  // Debe coincidir con la Redirect URL del portal
}
```

### 3. `customer-id` va como query parameter, no como header

En cada llamada a la API, el `customer-id` (codigo de abonado) tiene que ir como **query parameter**, no como header. Si lo mandas como header, te devuelve error 400.

```
// BIEN
GET /accounts/balances?customer-id=E12345A

// MAL
GET /accounts/balances
Headers: customer-id: E12345A
```

### 4. Header `client_id` obligatorio en cada llamada

Ademas del Bearer token, cada llamada a la API requiere un header `client_id` con tu API Key. Esto es un requerimiento del gateway IBM API Connect que usa Interbanking. Sin este header, te devuelve `401 - Client id missing`.

```javascript
headers: {
  'Authorization': 'Bearer AT-xxxxx',
  'client_id': 'tu_api_key',  // Requerido por IBM API Connect
}
```

### 5. El token dura 2 horas (7200 segundos)

El token expira a las 2 horas. El modulo `interbanking.js` incluido lo cachea automaticamente y lo renueva 1 minuto antes de que expire.

### 6. Rango maximo de fechas: 64 dias por request

Si pedis saldos o movimientos con un rango mayor a 64 dias, la API devuelve error. Para rangos mas largos, hay que dividir en chunks de 60 dias y unificar los resultados. La funcion `getBalancesRange()` ya hace esto automaticamente.

### 7. Movimientos usa una URL base DISTINTA a saldos

Esta es la trampa mas dificil de encontrar:

```
# Saldos - usa IB_API_BASE_URL completa (termina en /v1)
GET https://api-gw.interbanking.com.ar/api/prod/v1/accounts/balances

# Movimientos - el /v1 ya es parte del path, NO usar la base URL con /v1
GET https://api-gw.interbanking.com.ar/api/prod/v1/accounts/{account}/movements/{type}
```

Si usas la variable `IB_API_BASE_URL` (que termina en `/v1`) para construir la URL de movimientos, te queda `/v1/v1/accounts/...` y te da **404**. La solucion es usar la URL base sin `/v1` para movimientos:

```javascript
// Para saldos: usar IB_API_BASE_URL
const saldosUrl = `${IB_API_BASE_URL}/accounts/balances`;

// Para movimientos: derivar URL base SIN /v1 y despues agregar el path /v1/...
const apiBaseSinV1 = IB_API_BASE_URL.replace(/\/v1$/, '');
const movUrl = `${apiBaseSinV1}/v1/accounts/${account}/movements/${type}`;
```

### 8. `account-number` en movimientos va en el PATH

En el endpoint de saldos, no necesitas especificar un numero de cuenta (te devuelve todas). Pero en movimientos, el numero de cuenta va **en el path de la URL**, no como query parameter ni header.

```
// BIEN
GET /v1/accounts/000123456789/movements/anteriores

// MAL
GET /v1/accounts/movements/anteriores?account-number=000123456789
```

### 9. Tipos de movimiento: `dia`, `anteriores`, `diferidos`

El ultimo segmento de la URL de movimientos indica el tipo:

| Tipo | Descripcion |
|------|-------------|
| `dia` | Movimientos del dia actual |
| `anteriores` | Movimientos de dias anteriores (historicos) |
| `diferidos` | Movimientos diferidos/pendientes |

### 10. Los numeros de cuenta de saldos son los mismos que se usan en movimientos

El campo `account_number` que devuelve `/accounts/balances` es exactamente el mismo que se usa en el path de `/accounts/{account-number}/movements/...`. No hay que transformarlo ni formatearlo.

---

## Estructura de respuestas

### Respuesta de saldos

```json
{
  "general_data": {
    "bank_number": "Todos",
    "date_since": "2025-01-01",
    "date_until": "2025-02-28",
    "currency": "ARS",
    "total_rows": 3
  },
  "accounts": [
    {
      "bank_number": "007",
      "currency": "ARS",
      "account_number": "000123456789",
      "account_type": "CC",
      "account_name": "MI EMPRESA S.A.",
      "balances": {
        "countable_balance": 1500000.50,
        "initial_operating_balance": 1500000.50,
        "current_operating_balance": 1500000.50,
        "projected_balance_24hs": 1500000.50,
        "projected_balance_48hs": 1500000.50
      },
      "historical_balances": [
        {
          "operation_date": "2025-02-28T00:00:00",
          "day_balance": 1500000.50,
          "total_debits": 250000.00,
          "total_credits": 800000.00
        }
      ]
    }
  ]
}
```

**Codigos de banco comunes:**

| Codigo | Banco |
|--------|-------|
| 007 | Banco Galicia |
| 011 | Banco de la Nacion Argentina |
| 014 | Banco de la Provincia de Buenos Aires |
| 017 | BBVA Argentina |
| 072 | Banco Santander |
| 285 | Banco Macro |

### Respuesta de movimientos

```json
{
  "general_data": {
    "bank_number": "007",
    "account_number": "000123456789",
    "date_since": "2025-01-01",
    "date_until": "2025-01-31",
    "total_rows": 15
  },
  "movements_detail": [
    {
      "id": 16018110956,
      "amount": -5500.00,
      "debit_credit_type": "D",
      "movement_date": "2025-01-15T00:00:00",
      "process_date": "2025-01-15T00:00:00",
      "value_date": "2025-01-15T00:00:00",
      "real_date_activity": "2025-01-15T00:00:00",
      "code_description_ib": "TRANSFERENCIA EMITIDA",
      "code_description_bank": "TRANSF.INMEDIATA",
      "operation_code_ib": "T01",
      "operation_code_bank": "00501",
      "customer_cuit": "30-12345678-9",
      "depositor_description": "PROVEEDOR S.R.L.",
      "voucher_number": 0,
      "account_cbu": "",
      "branch_office_activity": "00001"
    }
  ]
}
```

**Campos importantes de movimientos:**

| Campo | Descripcion |
|-------|-------------|
| `amount` | Monto (negativo = debito, positivo = credito) |
| `debit_credit_type` | `D` = debito, `C` = credito |
| `code_description_ib` | Descripcion estandarizada por Interbanking |
| `code_description_bank` | Descripcion original del banco |
| `customer_cuit` | CUIT del tercero (si aplica) |
| `depositor_description` | Nombre del tercero |

---

## Errores comunes y soluciones

| Error | Causa | Solucion |
|-------|-------|----------|
| `400 - One or more required API parameters are missing` | Falta `customer-id` en los query params | Agregar `?customer-id=TU_CODIGO` a la URL |
| `401 - Client id missing` | Falta el header `client_id` | Agregar header `client_id: TU_API_KEY` |
| `401 - Unauthorized` | Token expirado o invalido | Solicitar un nuevo token |
| `403 - Not registered to plan` | App no suscripta al plan | Portal > Productos de API > suscribir la app |
| `404 - Not Found` | URL con `/v1` duplicado | Usar base URL sin `/v1` para movimientos (ver Quirk #7) |
| `400 - Error en parametro account-number` | account-number como query/header | Moverlo al PATH de la URL (ver Quirk #8) |
| `invalid_grant` | Header `service` sin `https://` | Agregar `https://` al header `service` |
| `400 - Date range exceeded` | Rango mayor a 64 dias | Dividir en chunks de 60 dias (ver Quirk #6) |

---

## APIs disponibles en Interbanking

Con la suscripcion al plan **Informacion Financiera** tenes acceso a:

| API | Endpoint | Descripcion |
|-----|----------|-------------|
| Saldos | `GET /accounts/balances` | Saldos actuales e historicos de todas las cuentas |
| Movimientos | `GET /accounts/{account}/movements/{type}` | Movimientos por cuenta y tipo |
| Extractos | `GET /accounts/{account}/statements/...` | Extractos bancarios |
| Transferencias | `POST /transfers` | Confeccion de transferencias |

---

## Contacto soporte Interbanking

- **Email:** consultasapi@interbanking.com.ar
- **Portal de soporte:** [https://developers.interbanking.com.ar/api/prod/support](https://developers.interbanking.com.ar/api/prod/support)

---

## Licencia

MIT - Ver [LICENSE](LICENSE)

---

## Autores

Desarrollado por [Juan Eduardo Riva](https://github.com/rje1974) con la asistencia de [Claude](https://claude.ai) (Anthropic).

Los quirks y soluciones documentados en este repo fueron descubiertos durante el desarrollo real de integraciones bancarias para gestión agropecuaria. Si la documentación oficial te dejó trabado, esperamos que esto te ahorre horas.

---

> Hecho con mate, paciencia y muchas horas de prueba y error contra la API de Interbanking.
> Si te sirvió, dejale una ⭐ al repo.
