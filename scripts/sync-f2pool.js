import { WebSocket } from 'ws';
global.WebSocket = WebSocket;

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MES_ACTUAL = new Date().toISOString().slice(0, 7); // "2026-07"
const HOY        = new Date().toISOString().slice(0, 10); // "2026-07-06"

// hosting_fee_pct puede venir como 7 (porcentaje) o 0.07 (decimal)
function normalizeFee(raw) {
  const n = Number(raw);
  if (!n || n <= 0) return 0.07; // default 7%
  return n > 1 ? n / 100 : n;
}

async function getF2PoolData(username) {
  try {
    const res = await fetch(`https://api.f2pool.com/bitcoin/${username}`, {
      headers: { 'F2P-API-SECRET': process.env.F2POOL_API_KEY }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const pDays = data.payout_history?.length || 0;
    console.log(`  hashrate: ${(data.hashrate / 1e12).toFixed(1)} TH/s  fixed_value: ${data.fixed_value}  balance: ${data.balance}  payout_history: ${pDays} días`);
    return data;
  } catch (e) {
    console.error(`  ✗ Error ${username}:`, e.message);
    return null;
  }
}

// ── Sync produccion_mensual ───────────────────────────────────────────────────
async function syncMensual(cliente, stats) {
  const fee               = normalizeFee(cliente.hosting_fee_pct);
  const energiaUsdMaquina = Number(cliente.energia_usd_por_maquina) || 163;
  const nMaquinas         = stats.worker_length || 0;

  const btc_bruto        = Number(stats.fixed_value || 0);
  const btc_hosting      = btc_bruto * fee;
  const btc_neto_cliente = btc_bruto - btc_hosting;
  const hashrate_promedio = Number(stats.hashrate || 0) / 1e12;

  const { error } = await supabase
    .from('produccion_mensual')
    .upsert({
      cliente_id:           cliente.id,
      mes:                  MES_ACTUAL,
      btc_bruto,
      btc_hosting,
      btc_neto_cliente,
      hashrate_promedio,
      maquinas:             nMaquinas,
      energia_usd:          nMaquinas * energiaUsdMaquina,
      ultima_actualizacion: new Date().toISOString(),
    }, { onConflict: 'cliente_id,mes' });

  if (error) {
    console.error('  ✗ Mensual upsert error:', error.message);
  } else {
    console.log(`  ✓ Mensual — bruto: ${btc_bruto}  hosting(${(fee*100).toFixed(1)}%): ${btc_hosting.toFixed(8)}  neto: ${btc_neto_cliente.toFixed(8)}  hr: ${hashrate_promedio.toFixed(1)} TH/s`);
  }
}

// ── Sync produccion_diaria ────────────────────────────────────────────────────
async function syncDiarios(cliente, stats) {
  const payoutHistory = stats.payout_history;
  if (!Array.isArray(payoutHistory) || payoutHistory.length === 0) {
    console.log('  Sin payout_history — saltando diarios');
    return;
  }

  const fee               = normalizeFee(cliente.hosting_fee_pct);
  const energiaUsdMaquina = Number(cliente.energia_usd_por_maquina) || 163;

  // Tasa FPPS de referencia: BTC/TH/día basada en el dato de ayer (exacto)
  // Usada para estimar hashrate_ths en días históricos
  const valueLast  = Number(stats.value_last_day)  || 0;
  const hashesLast = Number(stats.hashes_last_day) || 0;
  const fppsRate   = (valueLast > 0 && hashesLast > 0)
    ? valueLast / (hashesLast / 86400 / 1e12)  // BTC per TH/s per day
    : 0;

  // Hashrate exacto de hoy desde hashes_last_day
  const hashrateHoy = hashesLast > 0 ? hashesLast / 86400 / 1e12 : 0;

  const rows = payoutHistory.map(entry => {
    const fecha     = String(entry[0]).slice(0, 10); // "2026-07-06"
    const btc_bruto = Number(entry[2]) || 0;

    const btc_hosting = btc_bruto * fee;
    const btc_neto    = btc_bruto - btc_hosting;

    // hashrate_ths: exacto para hoy, estimado vía FPPS para días anteriores
    let hashrate_ths = 0;
    if (fecha === HOY && hashrateHoy > 0) {
      hashrate_ths = hashrateHoy;
    } else if (fppsRate > 0 && btc_bruto > 0) {
      hashrate_ths = btc_bruto / fppsRate;
    }

    // energia_usd = máquinas efectivas × costo diario por máquina
    // máquinas efectivas = hashrate_ths / 395 (TH/s nominal S21 Hydro)
    const energia_usd = (hashrate_ths / 395) * (energiaUsdMaquina / 30);

    return {
      cliente_id:           cliente.id,
      fecha,
      hashrate_ths:         Number(hashrate_ths.toFixed(2)),
      btc_bruto,
      btc_hosting:          Number(btc_hosting.toFixed(8)),
      btc_neto:             Number(btc_neto.toFixed(8)),
      energia_usd:          Number(energia_usd.toFixed(4)),
      fuente:               'f2pool_api',
      ultima_actualizacion: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from('produccion_diaria')
    .upsert(rows, { onConflict: 'cliente_id,fecha' });

  if (error) {
    console.error('  ✗ Diarios upsert error:', error.message);
  } else {
    const fechas = rows.map(r => r.fecha).sort();
    console.log(`  ✓ Diarios — ${rows.length} días (${fechas[0]} → ${fechas[fechas.length - 1]})`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function syncClientes() {
  console.log(`\n═══ Sync F2Pool — ${MES_ACTUAL} ═══\n`);

  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('id, nombre, f2pool_username, hosting_fee_pct, energia_usd_por_maquina')
    .not('f2pool_username', 'is', null);

  if (error) { console.error('Error cargando clientes:', error.message); process.exit(1); }
  if (!clientes?.length) { console.log('Sin clientes con f2pool_username.'); return; }

  console.log(`${clientes.length} cliente(s) encontrados\n`);

  for (const cliente of clientes) {
    console.log(`→ ${cliente.nombre} (${cliente.f2pool_username})`);

    const stats = await getF2PoolData(cliente.f2pool_username);
    if (!stats) continue;

    await syncMensual(cliente, stats);
    await syncDiarios(cliente, stats);
  }

  console.log(`\n✓ Sync completado — ${MES_ACTUAL}\n`);
}

syncClientes().catch(e => { console.error('Fatal:', e); process.exit(1); });
