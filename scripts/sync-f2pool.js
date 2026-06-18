import { WebSocket } from 'ws';
global.WebSocket = WebSocket;

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MES_ACTUAL = new Date().toISOString().slice(0, 7); // "2026-06"

async function getF2PoolData(username) {
  try {
    const res = await fetch(`https://api.f2pool.com/bitcoin/${username}`, {
      headers: { 'F2P-API-SECRET': process.env.F2POOL_API_KEY }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log(`  balance: ${data.balance}  fixed_value: ${data.fixed_value}  hashrate: ${(data.hashes_last_day/1e12).toFixed(1)} TH/s`);
    return data;
  } catch (e) {
    console.error(`  ✗ Error ${username}:`, e.message);
    return null;
  }
}

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

    const f2data = await getF2PoolData(cliente.f2pool_username);
    if (!f2data) continue;

    const btc_bruto          = Number(f2data.balance        || 0);
    const btc_hosting        = btc_bruto * 0.10;
    const btc_neto_cliente   = btc_bruto * 0.90;
    const hashrate_promedio  = Number(f2data.hashes_last_day || 0) / 1e12;

    const { error: upsertErr } = await supabase
      .from('produccion_mensual')
      .upsert({
        cliente_id:           cliente.id,
        mes:                  MES_ACTUAL,
        btc_bruto,
        btc_hosting,
        btc_neto_cliente,
        hashrate_promedio,
        ultima_actualizacion: new Date().toISOString(),
      }, { onConflict: 'cliente_id,mes' });

    if (upsertErr) console.error('  ✗ Upsert error:', upsertErr.message);
    else console.log(`  ✓ OK — btc_bruto: ${btc_bruto} BTC  hosting: ${btc_hosting.toFixed(8)}  neto: ${btc_neto_cliente.toFixed(8)}  hashrate: ${hashrate_promedio.toFixed(1)} TH/s`);
  }

  console.log(`\n✓ Sync completado — ${MES_ACTUAL}\n`);
}

syncClientes().catch(e => { console.error('Fatal:', e); process.exit(1); });
