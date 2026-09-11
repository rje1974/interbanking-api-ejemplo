# AGENTS.md

Contexto para agentes de codigo que mantengan este repositorio.

## Objetivo

Este repo es dos cosas a la vez, y en ese orden de prioridad:

1. **El ejemplo documentado** de la API de Interbanking Argentina. Es lo que hace valioso
   al repo: la gente llega por Google buscando los quirks. Prioriza claridad operativa y
   documentar trampas reales por encima de abstracciones grandes.
2. **El paquete `interbanking-client`** publicado en npm, que consume tambien el servidor
   MCP (`rje1974/interbanking-mcp`).

## Stack

- Node.js 18+
- CommonJS
- `axios` para HTTP
- `dotenv` y `express` solo para los ejemplos (son devDependencies)
- Tests con `node:test`, sin framework externo

## Comandos

```bash
npm install
npm run check
npm test
npm run saldos
npm run movimientos
npm run movimientos-rango
npm run dashboard
```

Los comandos que llaman a Interbanking requieren `.env` real y credenciales activas.

## Reglas de dominio

- **Nada escribe en stdout.** Los mensajes de progreso van al `logger` de la config, que
  por defecto escribe a stderr. Si el cliente corre dentro del servidor MCP, stdout es el
  canal del protocolo JSON-RPC y un solo `console.log` lo corrompe.
- **La libreria no llama a `dotenv`.** Cargar el `.env` es del consumidor; los ejemplos lo
  hacen en su primera linea.
- Cada cliente de `createClient` tiene su propio cache de token: dos clientes con
  credenciales distintas nunca comparten token. Hay tests que lo cubren.
- No hardcodear credenciales ni customer IDs reales.
- No commitear `.env`, tokens, saldos, movimientos, CUITs o respuestas reales de bancos.
- El token request de Interbanking lleva parametros OAuth en query string, no en body.
- El header `service` debe coincidir con `IB_REDIRECT_URL` e incluir `https://`.
- `customer-id` va como query parameter.
- Cada request API lleva header `client_id` ademas del Bearer token.
- Saldos usa `IB_API_BASE_URL`, normalmente terminado en `/v1`.
- Movimientos debe derivar la base sin `/v1` y luego construir `/v1/accounts/...` para no generar `/v1/v1`.

## Estilo de cambios

- Mantener el ejemplo simple: preferir funciones chicas en `interbanking.js` antes que una arquitectura nueva.
- Si se toca un quirk documentado en README, actualizar tambien el codigo o tests relacionados.
- Los tests deben ser offline por defecto; no deben depender de credenciales ni red real.
  Los del factory levantan un servidor HTTP local que hace de Interbanking falso.
- Si agregas ejemplos con datos, usar placeholders obvios y no datos productivos.

## Verificacion esperada

Antes de commitear, correr:

```bash
npm run check
npm test
```

Si se cambian dependencias, actualizar `package-lock.json` con `npm install`.

## Al publicar en npm

- `npm version` + `npm publish`, y tag/release en GitHub con el mismo numero.
- Actualizar `CHANGELOG.md`: si cambia algo de la superficie publica, decir explicitamente
  que tiene que tocar quien ya venia usando el paquete.
- `files` en `package.json` acota lo que se publica: los ejemplos y los tests quedan en el
  repo, no en el tarball.
- El repo **no se renombra**: su nombre es el que rankea en Google. El paquete se llama
  distinto a proposito.
