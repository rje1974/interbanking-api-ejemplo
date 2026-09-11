# Changelog

## [1.1.0] - 2026-09-11

Primera version publicada en npm como `interbanking-client`.

### Added
- `createClient(config)`: cada cliente con sus propias credenciales y su propio
  cache de token. Permite consultar varias empresas en el mismo proceso.
- Opcion `logger` en la config del cliente, para redirigir o silenciar los
  mensajes de progreso.
- Tests del factory con un servidor HTTP local que hace de Interbanking falso:
  verifican aislamiento de token entre clientes, cacheo y headers.
- Metadatos de paquete (`files`, `repository`, `author`) para publicar en npm.

### Changed
- **Los mensajes de progreso van a stderr, no a stdout.** Necesario para poder
  usar el cliente dentro de un servidor MCP, donde stdout es el canal del
  protocolo JSON-RPC y cualquier escritura lo corrompe.
- **El modulo ya no llama `dotenv` al importarse.** Cargar el `.env` es
  responsabilidad de quien usa la libreria; los ejemplos lo hacen en su primera
  linea. Si venias importando `interbanking.js` y confiabas en que leia el
  `.env` solo, agrega `require('dotenv').config()` antes del require.
- `express` y `dotenv` pasaron a `devDependencies`: solo los usan los ejemplos.
  El cliente depende unicamente de `axios`.

### Compatibilidad
- Las funciones sueltas (`getBalances`, `getMovements`, `getAllMovements`,
  `getBalancesRange`, `getToken`, `apiRequest`) siguen exportadas y funcionando
  sobre `process.env`, salvo por el cambio de `dotenv` descrito arriba.

## [1.0.0]

### Added
- Tests offline para validacion de configuracion, URLs base y chunks de fechas.
- Script `npm test` con `node:test` y script `npm run check` con `node --check`.
- `AGENTS.md` con contexto de mantenimiento para agentes de codigo.

### Changed
- El cliente valida variables de entorno requeridas antes de llamar a Interbanking.
- La URL base de movimientos se deriva de `IB_API_BASE_URL` para evitar hardcodear produccion y prevenir `/v1/v1`.
- Los rangos largos de saldos usan chunks inclusivos, testeables y sin solapamiento.

### Security
- Se reforzo la documentacion para no commitear `.env`, tokens ni respuestas reales con datos bancarios.
