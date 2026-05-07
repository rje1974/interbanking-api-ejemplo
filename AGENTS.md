# AGENTS.md

Contexto para agentes de codigo que mantengan este repositorio.

## Objetivo

Este repo es un ejemplo practico para usar la API de Interbanking Argentina. Prioriza claridad operativa y documentar quirks reales por encima de abstracciones grandes.

## Stack

- Node.js 18+
- CommonJS
- `axios` para HTTP
- `dotenv` para `.env`
- `express` solo para el dashboard de ejemplo
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
- Si agregas ejemplos con datos, usar placeholders obvios y no datos productivos.

## Verificacion esperada

Antes de commitear, correr:

```bash
npm run check
npm test
```

Si se cambian dependencias, actualizar `package-lock.json` con `npm install`.
