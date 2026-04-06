/**
 * movimientos-rango.js - Consultar movimientos de un periodo largo
 *
 * La API de Interbanking tiene un limite de 64 dias por request.
 * Este ejemplo muestra como consultar periodos mas largos dividiendolos
 * en chunks de 60 dias.
 *
 * Uso:
 *   node ejemplos/movimientos-rango.js
 *   node ejemplos/movimientos-rango.js 2025-01-01 2025-06-30
 *   npm run movimientos-rango
 */

const { getBalances, getMovements } = require('../interbanking');

const CHUNK_DAYS = 60; // Margen por debajo del limite de 64 dias

async function main() {
  try {
    // Parsear fechas de argumentos o usar ultimos 6 meses
    let dateSince, dateUntil;

    if (process.argv[2] && process.argv[3]) {
      dateSince = process.argv[2];
      dateUntil = process.argv[3];
    } else {
      const hoy = new Date();
      const hace6meses = new Date();
      hace6meses.setMonth(hace6meses.getMonth() - 6);
      dateUntil = hoy.toISOString().split('T')[0];
      dateSince = hace6meses.toISOString().split('T')[0];
    }

    console.log(`Consultando movimientos del ${dateSince} al ${dateUntil}\n`);

    // 1. Descubrir cuentas
    console.log('Descubriendo cuentas...');
    const balances = await getBalances();
    const accounts = balances.accounts;
    console.log(`Encontradas ${accounts.length} cuentas.\n`);

    // 2. Dividir el rango en chunks de 60 dias
    const chunks = buildDateChunks(dateSince, dateUntil, CHUNK_DAYS);
    console.log(`Rango dividido en ${chunks.length} chunks de hasta ${CHUNK_DAYS} dias.\n`);

    // 3. Para cada cuenta, consultar todos los chunks
    const resultados = {};

    for (const acc of accounts) {
      const label = `Banco ${acc.bank_number} | ${acc.account_type} | ${acc.account_number}`;
      console.log(`--- ${label} ---`);

      resultados[acc.account_number] = [];

      for (const chunk of chunks) {
        try {
          process.stdout.write(`  ${chunk.since} a ${chunk.until}... `);

          const data = await getMovements(acc.account_number, acc.bank_number, {
            dateSince: chunk.since,
            dateUntil: chunk.until,
            accountType: acc.account_type,
            currency: acc.currency,
            movementType: 'anteriores',
          });

          const movimientos = data.movements_detail || [];
          resultados[acc.account_number].push(...movimientos);
          console.log(`${movimientos.length} movimientos`);

        } catch (e) {
          console.log(`error: ${e.response?.data?.message || e.message}`);
        }
      }

      console.log(`  Total: ${resultados[acc.account_number].length} movimientos\n`);
    }

    // 4. Resumen final
    console.log('='.repeat(60));
    console.log('RESUMEN');
    console.log('='.repeat(60));

    let grandTotal = 0;
    for (const acc of accounts) {
      const movs = resultados[acc.account_number];
      const debitos = movs.filter(m => m.debit_credit_type === 'D').reduce((s, m) => s + m.amount, 0);
      const creditos = movs.filter(m => m.debit_credit_type === 'C').reduce((s, m) => s + m.amount, 0);

      console.log(`\nBanco ${acc.bank_number} - ${acc.account_number} (${acc.currency}):`);
      console.log(`  Movimientos: ${movs.length}`);
      console.log(`  Total debitos: ${formatMonto(debitos)}`);
      console.log(`  Total creditos: ${formatMonto(creditos)}`);

      grandTotal += movs.length;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Total general: ${grandTotal} movimientos en ${accounts.length} cuentas`);

  } catch (error) {
    console.error('Error:', error.response?.data?.message || error.message);
    process.exit(1);
  }
}

/**
 * Divide un rango de fechas en chunks de N dias maximo.
 *
 * @param {string} since - Fecha inicio YYYY-MM-DD
 * @param {string} until - Fecha fin YYYY-MM-DD
 * @param {number} maxDays - Dias maximo por chunk
 * @returns {Array<{since: string, until: string}>} Array de rangos
 */
function buildDateChunks(since, until, maxDays) {
  const start = new Date(since);
  const end = new Date(until);
  const chunks = [];

  let chunkStart = new Date(start);
  while (chunkStart < end) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push({
      since: chunkStart.toISOString().split('T')[0],
      until: chunkEnd.toISOString().split('T')[0],
    });

    chunkStart = new Date(chunkEnd);
    chunkStart.setDate(chunkStart.getDate() + 1);
  }

  return chunks;
}

function formatMonto(monto) {
  return monto.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

main();
