# Changelog

## [Unreleased]

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
