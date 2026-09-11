/**
 * movimientos.js - Consultar movimientos de una cuenta
 *
 * Uso:
 *   node ejemplos/movimientos.js
 *   npm run movimientos
 *
 * Primero consulta las cuentas disponibles, te deja elegir una,
 * y muestra los movimientos de los ultimos 30 dias.
 */

require('dotenv').config();

const { getBalances, getMovements } = require('../interbanking');

async function main() {
  try {
    // 1. Descubrir cuentas disponibles
    console.log('Descubriendo cuentas...\n');
    const balances = await getBalances();

    console.log('Cuentas disponibles:');
    balances.accounts.forEach((acc, i) => {
      console.log(`  [${i}] Banco ${acc.bank_number} | ${acc.account_type} | ${acc.currency} | ${acc.account_number}`);
    });

    // Usar la primera cuenta como ejemplo (o pasar un indice como argumento)
    const idx = parseInt(process.argv[2]) || 0;
    const cuenta = balances.accounts[idx];

    if (!cuenta) {
      console.error(`No se encontro la cuenta con indice ${idx}`);
      process.exit(1);
    }

    console.log(`\nConsultando movimientos de: Banco ${cuenta.bank_number} - ${cuenta.account_number}\n`);

    // 2. Calcular rango de fechas (ultimos 30 dias)
    const hoy = new Date();
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);

    const dateUntil = hoy.toISOString().split('T')[0];
    const dateSince = hace30.toISOString().split('T')[0];

    console.log(`Periodo: ${dateSince} a ${dateUntil}\n`);

    // 3. Consultar movimientos
    const data = await getMovements(cuenta.account_number, cuenta.bank_number, {
      dateSince,
      dateUntil,
      accountType: cuenta.account_type,
      currency: cuenta.currency,
      movementType: 'anteriores',
    });

    const movimientos = data.movements_detail || [];
    console.log(`Movimientos encontrados: ${movimientos.length}\n`);

    if (movimientos.length === 0) {
      console.log('No hay movimientos en este periodo.');
      return;
    }

    // 4. Mostrar tabla de movimientos
    console.log('='.repeat(100));
    console.log(
      'Fecha'.padEnd(12),
      'D/C'.padEnd(4),
      'Monto'.padStart(15),
      'Descripcion'.padEnd(40),
      'Tercero'.padEnd(25),
    );
    console.log('='.repeat(100));

    for (const mov of movimientos) {
      const fecha = mov.movement_date.split('T')[0];
      const monto = mov.amount.toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      console.log(
        fecha.padEnd(12),
        mov.debit_credit_type.padEnd(4),
        monto.padStart(15),
        (mov.code_description_ib || mov.code_description_bank || '').substring(0, 38).padEnd(40),
        (mov.depositor_description || '').substring(0, 23).padEnd(25),
      );
    }

    console.log('='.repeat(100));

    // Resumen
    const debitos = movimientos.filter(m => m.debit_credit_type === 'D');
    const creditos = movimientos.filter(m => m.debit_credit_type === 'C');
    const totalDebitos = debitos.reduce((sum, m) => sum + m.amount, 0);
    const totalCreditos = creditos.reduce((sum, m) => sum + m.amount, 0);

    console.log(`\nResumen:`);
    console.log(`  Debitos:  ${debitos.length} movimientos, total: ${formatMonto(totalDebitos)}`);
    console.log(`  Creditos: ${creditos.length} movimientos, total: ${formatMonto(totalCreditos)}`);

  } catch (error) {
    console.error('Error:', error.response?.data?.message || error.message);
    if (error.response?.status === 404) {
      console.error('\nPosible causa: URL con /v1 duplicado. Ver Quirk #7 en README.md');
    }
    process.exit(1);
  }
}

function formatMonto(monto) {
  return monto.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

main();
