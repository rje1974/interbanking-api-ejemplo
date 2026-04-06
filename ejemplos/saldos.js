/**
 * saldos.js - Consultar saldos de todas las cuentas bancarias
 *
 * Uso:
 *   node ejemplos/saldos.js
 *   npm run saldos
 */

const { getBalances } = require('../interbanking');

async function main() {
  try {
    console.log('Consultando saldos de todas las cuentas...\n');

    const data = await getBalances();

    console.log(`Periodo: ${data.general_data.date_since} a ${data.general_data.date_until}`);
    console.log(`Cuentas encontradas: ${data.general_data.total_rows}\n`);

    // Tabla de saldos
    console.log('='.repeat(80));
    console.log(
      'Banco'.padEnd(6),
      'Tipo'.padEnd(4),
      'Moneda'.padEnd(7),
      'Cuenta'.padEnd(20),
      'Saldo contable'.padStart(18),
      'Saldo operativo'.padStart(18),
    );
    console.log('='.repeat(80));

    let totalARS = 0;
    let totalUSD = 0;

    for (const account of data.accounts) {
      const saldo = account.balances.countable_balance;
      const operativo = account.balances.current_operating_balance;

      console.log(
        account.bank_number.padEnd(6),
        account.account_type.padEnd(4),
        account.currency.padEnd(7),
        account.account_number.padEnd(20),
        formatMonto(saldo).padStart(18),
        formatMonto(operativo).padStart(18),
      );

      if (account.currency === 'ARS') totalARS += saldo;
      if (account.currency === 'USD') totalUSD += saldo;
    }

    console.log('='.repeat(80));
    if (totalARS !== 0) console.log(`\nTotal ARS: ${formatMonto(totalARS)}`);
    if (totalUSD !== 0) console.log(`Total USD: ${formatMonto(totalUSD)}`);

  } catch (error) {
    console.error('Error:', error.response?.data?.message || error.message);
    if (error.response?.status === 403) {
      console.error('\nPosible causa: tu app no esta suscripta al plan "Informacion Financiera".');
      console.error('Anda a https://developers.interbanking.com.ar/api/prod/product/3178');
    }
    process.exit(1);
  }
}

/**
 * Formatea un monto numerico con separador de miles y 2 decimales.
 * @param {number} monto
 * @returns {string}
 */
function formatMonto(monto) {
  return monto.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

main();
