// Cierre de liquidación NeuraHash — corre el día 15 a las 02:00 UTC
// (una hora después del sync diario, con el día 14 ya incluido en produccion_diaria).
// Suma produccion_diaria del ciclo cerrado [15 mes anterior → 14 mes actual]
// e inserta una fila por cliente en liquidaciones. pdf_url se completa a mano.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Getters UTC: las fechas se construyen con Date.UTC — con getters locales
// el día quedaría corrido en cualquier máquina fuera de UTC.
const iso = d =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

// ── Transición del piloto ─────────────────────────────────────────────────────
// El piloto se facturó manualmente hasta el 11 de julio de 2026 inclusive.
// El ciclo 15 jun – 14 jul NO genera liquidación automática.
// La primera liquidación real cierra el 15 ago y cubre 12 jul → 14 ago.
const ULTIMO_CIERRE_MANUAL = '2026-07-14'; // ciclos con fin <= esta fecha se saltean
const PRIMER_INICIO_AUTO   = '2026-07-12'; // arranque de la primera liquidación automática

// Ciclo cerrado: 15 del mes anterior → 14 del mes actual (referido a hoy, día 15)
function getCicloCerrado(hoy = new Date()) {
  const y = hoy.getUTCFullYear();
  const m = hoy.getUTCMonth();
  return {
    inicio: iso(new Date(Date.UTC(y, m - 1, 15))),
    fin:    iso(new Date(Date.UTC(y, m, 14))),
  };
}

// Override manual: node cerrar-liquidacion.js --inicio=2026-07-12  (o --inicio 2026-07-12)
function getInicioOverride() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--inicio=')) return args[i].split('=')[1];
    if (args[i] === '--inicio' && args[i + 1]) return args[i + 1];
  }
  return null;
}

async function getBtcPrice() {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const d = await r.json();
    if (d?.bitcoin?.usd > 0) return d.bitcoin.usd;
  } catch {}
  try {
    const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    const d = await r.json();
    if (Number(d?.price) > 0) return Number(d.price);
  } catch {}
  return null;
}

async function cerrarLiquidaciones() {
  const ciclo = getCicloCerrado();
  const inicioOverride = getInicioOverride();

  if (inicioOverride) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicioOverride)) {
      console.error(`--inicio inválido: "${inicioOverride}" (formato YYYY-MM-DD)`);
      process.exit(1);
    }
    ciclo.inicio = inicioOverride;
    console.log(`Override manual: --inicio ${inicioOverride}`);
  } else {
    // Reglas de transición del piloto (solo sin override explícito)
    if (ciclo.fin <= ULTIMO_CIERRE_MANUAL) {
      console.log(`Ciclo ${ciclo.inicio} → ${ciclo.fin} ya facturado manualmente (piloto hasta 2026-07-11). No se genera liquidación.`);
      return;
    }
    if (ciclo.inicio === '2026-07-15') {
      ciclo.inicio = PRIMER_INICIO_AUTO;
      console.log(`Primera liquidación automática: inicio ajustado a ${PRIMER_INICIO_AUTO} (el piloto cubrió hasta el 11 jul).`);
    }
  }

  console.log(`\n═══ Cierre de liquidación — ${ciclo.inicio} → ${ciclo.fin} ═══\n`);

  const btcPrice = await getBtcPrice();
  console.log(`Precio BTC referencia: ${btcPrice ? '$' + btcPrice.toLocaleString() : 'no disponible'}\n`);

  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('id, nombre, f2pool_username')
    .not('f2pool_username', 'is', null);

  if (error) { console.error('Error cargando clientes:', error.message); process.exit(1); }
  if (!clientes?.length) { console.log('Sin clientes.'); return; }

  let cerradas = 0;
  for (const cliente of clientes) {
    console.log(`→ ${cliente.nombre}`);

    const { data: dias, error: e1 } = await supabase
      .from('produccion_diaria')
      .select('btc_bruto, btc_hosting, btc_neto, energia_usd')
      .eq('cliente_id', cliente.id)
      .gte('fecha', ciclo.inicio)
      .lte('fecha', ciclo.fin);

    if (e1) { console.error('  ✗ Error leyendo producción:', e1.message); continue; }
    if (!dias?.length) { console.log('  Sin producción en el ciclo — saltando'); continue; }

    const tot = dias.reduce((a, d) => ({
      btc_bruto:   a.btc_bruto   + (Number(d.btc_bruto)   || 0),
      btc_hosting: a.btc_hosting + (Number(d.btc_hosting) || 0),
      btc_neto:    a.btc_neto    + (Number(d.btc_neto)    || 0),
      energia_usd: a.energia_usd + (Number(d.energia_usd) || 0),
    }), { btc_bruto: 0, btc_hosting: 0, btc_neto: 0, energia_usd: 0 });

    const { error: e2 } = await supabase
      .from('liquidaciones')
      .upsert({
        cliente_id:           cliente.id,
        periodo_inicio:       ciclo.inicio,
        periodo_fin:          ciclo.fin,
        btc_bruto:            Number(tot.btc_bruto.toFixed(8)),
        btc_hosting:          Number(tot.btc_hosting.toFixed(8)),
        btc_neto:             Number(tot.btc_neto.toFixed(8)),
        energia_usd:          Number(tot.energia_usd.toFixed(4)),
        btc_price_referencia: btcPrice,
      }, { onConflict: 'cliente_id,periodo_inicio' });

    if (e2) {
      console.error('  ✗ Upsert error:', e2.message);
    } else {
      cerradas++;
      console.log(`  ✓ ${dias.length} días — bruto: ${tot.btc_bruto.toFixed(8)}  neto: ${tot.btc_neto.toFixed(8)}  energía: $${tot.energia_usd.toFixed(2)}`);
    }
  }

  console.log(`\n✓ Cierre completado — ${cerradas}/${clientes.length} liquidaciones\n`);
}

cerrarLiquidaciones().catch(e => { console.error('Fatal:', e); process.exit(1); });
