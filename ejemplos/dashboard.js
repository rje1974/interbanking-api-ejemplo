/**
 * dashboard.js - Mini dashboard web para ver saldos bancarios
 *
 * Levanta un servidor Express que sirve:
 *   - GET /           - Pagina HTML con tabla de saldos
 *   - GET /api/saldos - JSON con saldos actuales
 *   - GET /api/saldos?range=year - JSON con saldos del ultimo anio (chunks de 60 dias)
 *   - GET /api/saldos?since=YYYY-MM-DD&until=YYYY-MM-DD - Rango personalizado
 *
 * Uso:
 *   node ejemplos/dashboard.js
 *   npm run dashboard
 *   Abrir http://localhost:3000
 */

const express = require('express');
const { getBalances, getBalancesRange } = require('../interbanking');

const app = express();
const PORT = process.env.PORT || 3000;

// API endpoint: saldos
app.get('/api/saldos', async (req, res) => {
  try {
    const { range, since, until } = req.query;

    let data;
    if (range === 'year') {
      // Ultimo anio (multiples llamadas en chunks de 60 dias)
      const hoy = new Date().toISOString().split('T')[0];
      const hace1anio = new Date();
      hace1anio.setFullYear(hace1anio.getFullYear() - 1);
      data = await getBalancesRange(hace1anio.toISOString().split('T')[0], hoy);
    } else if (since && until) {
      data = await getBalancesRange(since, until);
    } else {
      // Default: ultimos ~60 dias (una sola llamada)
      data = await getBalances();
    }

    res.json(data);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.response?.data?.moreInformation || error.message;
    res.status(status).json({ error: message });
  }
});

// Pagina HTML principal
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard Interbanking</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
    h1 { margin-bottom: 20px; color: #333; }
    .controls { margin-bottom: 20px; }
    .controls button {
      padding: 8px 16px; margin-right: 8px; border: 1px solid #ccc;
      background: white; border-radius: 4px; cursor: pointer;
    }
    .controls button:hover { background: #e8e8e8; }
    .controls button.active { background: #007bff; color: white; border-color: #007bff; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; color: #555; }
    .monto { text-align: right; font-variant-numeric: tabular-nums; }
    .positivo { color: #28a745; }
    .negativo { color: #dc3545; }
    .loading { text-align: center; padding: 40px; color: #999; }
    .error { color: #dc3545; padding: 20px; background: #fff; border-radius: 8px; }
    .total { font-weight: bold; background: #f0f7ff; }
  </style>
</head>
<body>
  <h1>Dashboard Interbanking</h1>
  <div class="controls">
    <button onclick="cargar()" class="active" id="btn-default">Ultimos 60 dias</button>
    <button onclick="cargar('year')" id="btn-year">Ultimo anio</button>
  </div>
  <div id="contenido"><div class="loading">Cargando saldos...</div></div>

  <script>
    async function cargar(range) {
      const contenido = document.getElementById('contenido');
      contenido.innerHTML = '<div class="loading">Cargando saldos...</div>';

      // Actualizar botones
      document.querySelectorAll('.controls button').forEach(b => b.classList.remove('active'));
      document.getElementById(range === 'year' ? 'btn-year' : 'btn-default').classList.add('active');

      try {
        const url = range ? '/api/saldos?range=' + range : '/api/saldos';
        const res = await fetch(url);
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
        const data = await res.json();
        renderizar(data);
      } catch (e) {
        contenido.innerHTML = '<div class="error">Error: ' + e.message + '</div>';
      }
    }

    function renderizar(data) {
      const formatMonto = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const clsMonto = (n) => 'monto ' + (n >= 0 ? 'positivo' : 'negativo');

      let html = '<table><thead><tr>';
      html += '<th>Banco</th><th>Tipo</th><th>Moneda</th><th>Cuenta</th>';
      html += '<th class="monto">Saldo contable</th><th class="monto">Saldo operativo</th>';
      html += '</tr></thead><tbody>';

      let totalARS = 0;
      for (const acc of data.accounts) {
        const s = acc.balances;
        if (acc.currency === 'ARS') totalARS += s.countable_balance;
        html += '<tr>';
        html += '<td>' + acc.bank_number + '</td>';
        html += '<td>' + acc.account_type + '</td>';
        html += '<td>' + acc.currency + '</td>';
        html += '<td>' + acc.account_number + '</td>';
        html += '<td class="' + clsMonto(s.countable_balance) + '">$ ' + formatMonto(s.countable_balance) + '</td>';
        html += '<td class="' + clsMonto(s.current_operating_balance) + '">$ ' + formatMonto(s.current_operating_balance) + '</td>';
        html += '</tr>';
      }

      html += '<tr class="total"><td colspan="4">Total ARS</td>';
      html += '<td class="' + clsMonto(totalARS) + '">$ ' + formatMonto(totalARS) + '</td>';
      html += '<td></td></tr>';
      html += '</tbody></table>';
      html += '<p style="margin-top:12px;color:#999;font-size:13px">Periodo: ' + data.general_data.date_since + ' a ' + data.general_data.date_until + '</p>';

      document.getElementById('contenido').innerHTML = html;
    }

    // Cargar al inicio
    cargar();
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Dashboard corriendo en http://localhost:${PORT}`);
});
