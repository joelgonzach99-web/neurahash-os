// sync-f2pool.js — Corre diariamente a las 21:00 Paraguay via GitHub Actions
// Lee clientes con f2pool_token de Supabase, llama F2Pool API, acumula producción mensual

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MES_ACTUAL = new Date().toISOString().slice(0, 7); // "2026-06"

async function getF2PoolData(token) {
  try {
    const apiKey = process.env.F2POOL_API_KEY;
    const res = await fetch(`https://neurahash-client.vercel.app/api/f2pool?path=bitcoin/${token}`, {
      headers: { 'F2P-API-SECRET': apiKey }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log(`  [debug] keys:`, Object.keys(data).join(', '));
    console.log(`  [debug] btc:`, data.value_last_day || data.paid_mining_value || 0);
    return data;
  } catch (e) {
    console.error(`  ✗ Error F2Pool token ${token}:`, e.message);
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
  if (!clientes?.length) { console.log('Sin clientes con f2pool_token.'); return; }

  console.log(`${clientes.length} cliente(s) con token F2Pool\n`);

  for (const cliente of clientes) {
    console.log(`→ ${cliente.nombre}`);

    const f2data = await getF2PoolData(cliente.f2pool_username);
    if (!f2data) continue;

    // Hashrate: F2Pool retorna H/s, convertir a TH/s
    const hashrateTH = (f2data.hashes_last_day || f2data.hashrate || 0) / 1e12;

    // BTC producido hoy — probar varios campos que F2Pool puede usar
    const btcHoyBruto = Number(
      f2data.value_last_day ||
      f2data.paid_mining_value_last_day ||
      f2data.income_last_day ||
      f2data.earnings_last_day ||
      0
    );

    // Fee según configuración del cliente (default 10%)
    const feePct = Number(cliente.hosting_fee_pct || 10) / 100;
    const btcHosting = btcHoyBruto * feePct;
    const btcNeto    = btcHoyBruto * (1 - feePct);

    // Máquinas activas
    const maquinasActivas = (f2data.workers || []).filter(w => w.status === 'active').length;

    // Energía mensual
    const energiaPorMaquina = Number(cliente.energia_usd_por_maquina || 163);
    const energiaUSD = maquinasActivas * energiaPorMaquina;

    // Buscar registro del mes actual
    const { data: existing } = await supabase
      .from('produccion_mensual')
      .select('*')
      .eq('cliente_id', cliente.id)
      .eq('mes', MES_ACTUAL)
      .maybeSingle();

    if (existing) {
      const { error: updErr } = await supabase
        .from('produccion_mensual')
        .update({
          btc_bruto:          Number((existing.btc_bruto || 0)) + btcHoyBruto,
          btc_hosting:        Number((existing.btc_hosting || 0)) + btcHosting,
          btc_neto_cliente:   Number((existing.btc_neto_cliente || 0)) + btcNeto,
          hashrate_promedio:  hashrateTH,
          maquinas:           maquinasActivas,
          energia_usd:        energiaUSD,
          ultima_actualizacion: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (updErr) console.error('  ✗ Update error:', updErr.message);
      else console.log(`  ✓ Acumulado: +${btcHoyBruto.toFixed(8)} BTC bruto hoy`);
    } else {
      const { error: insErr } = await supabase
        .from('produccion_mensual')
        .insert({
          cliente_id:           cliente.id,
          mes:                  MES_ACTUAL,
          btc_bruto:            btcHoyBruto,
          btc_hosting:          btcHosting,
          btc_neto_cliente:     btcNeto,
          hashrate_promedio:    hashrateTH,
          maquinas:             maquinasActivas,
          energia_usd:          energiaUSD,
          energia_pagada:       false,
          ultima_actualizacion: new Date().toISOString()
        });

      if (insErr) console.error('  ✗ Insert error:', insErr.message);
      else console.log(`  ✓ Nuevo registro: ${btcHoyBruto.toFixed(8)} BTC bruto`);
    }
  }

  console.log(`\n✓ Sync completado — ${MES_ACTUAL}\n`);
}

syncClientes().catch(e => { console.error('Fatal:', e); process.exit(1); });
