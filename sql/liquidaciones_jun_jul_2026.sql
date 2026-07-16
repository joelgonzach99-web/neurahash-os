-- ═══════════════════════════════════════════════════════════════════
-- NeuraHash — Carga del ciclo cerrado manualmente (jun – 14 jul 2026)
-- + capacidad/tarifa por cliente + bucket de PDFs
-- Ejecutar completo en Supabase SQL Editor (idempotente)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Columnas nuevas en clientes ───────────────────────────────────
-- capacidad_ths: TH/s nominal contratado (suma de sus máquinas)
-- tarifa_energia_mensual: USD/mes total de energía a capacidad plena
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS capacidad_ths numeric(10,2);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tarifa_energia_mensual numeric(10,2);

-- Alvaro: 1× S21 aire (200 TH/s, $90/mes)
UPDATE clientes SET capacidad_ths = 200, tarifa_energia_mensual = 90,
                    hosting_fee_pct = 10, unidades_asic = 1
  WHERE f2pool_username = 'alvarobtc21';

-- Jordan: 1× S21 200 TH/s ($90) + 1× S21 Hydro 395 TH/s ($163, conectada
-- 27 jun, rinde ~48%, en revisión técnica) → 595 TH/s, $253/mes
UPDATE clientes SET capacidad_ths = 595, tarifa_energia_mensual = 253,
                    hosting_fee_pct = 10, unidades_asic = 2
  WHERE f2pool_username = 'jordanbtc21';

-- ── 2. Liquidaciones verificadas al satoshi (cierre manual) ──────────
-- Los 3 primeros clientes arrancaron el 1 jun; Alvaro y Jordan el 13 jun.
-- btc_price_referencia = 64091 en todas. pdf_url apunta al bucket
-- 'liquidaciones' (ruta relativa; el portal arma la URL pública).
INSERT INTO liquidaciones
  (cliente_id, periodo_inicio, periodo_fin, btc_bruto, btc_hosting, btc_neto, energia_usd, btc_price_referencia, pdf_url)
SELECT c.id, v.pi::date, v.pf::date, v.bruto, v.hosting, v.neto, v.energia, 64091, v.pdf
FROM (VALUES
  ('flaviobtc21',  '2026-06-01', '2026-07-14', 0.05325940, 0.00446014, 0.04879926, 1542.16, 'liquidaciones/flaviobtc21_2026-06.pdf'),
  ('rodolfobtc21', '2026-06-01', '2026-07-14', 0.06138071, 0.00514207, 0.05623864, 1791.83, 'liquidaciones/rodolfobtc21_2026-06.pdf'),
  ('fabiobtc21',   '2026-06-01', '2026-07-14', 0.01526024, 0.00126849, 0.01399175,  448.22, 'liquidaciones/fabiobtc21_2026-06.pdf'),
  ('alvarobtc21',  '2026-06-13', '2026-07-14', 0.00252717, 0.00024860, 0.00227857,   80.70, 'liquidaciones/alvarobtc21_2026-06.pdf'),
  ('jordanbtc21',  '2026-06-13', '2026-07-14', 0.00432996, 0.00042903, 0.00390093,  134.00, 'liquidaciones/jordanbtc21_2026-06.pdf')
) AS v(username, pi, pf, bruto, hosting, neto, energia, pdf)
JOIN clientes c ON c.f2pool_username = v.username
ON CONFLICT (cliente_id, periodo_inicio) DO UPDATE SET
  periodo_fin = EXCLUDED.periodo_fin,
  btc_bruto = EXCLUDED.btc_bruto,
  btc_hosting = EXCLUDED.btc_hosting,
  btc_neto = EXCLUDED.btc_neto,
  energia_usd = EXCLUDED.energia_usd,
  btc_price_referencia = EXCLUDED.btc_price_referencia,
  pdf_url = EXCLUDED.pdf_url;

-- ── 3. Bucket de PDFs: público de solo lectura ───────────────────────
-- Elegido público (no URL firmada): el portal no tiene service key en el
-- cliente y los PDFs se linkean directo. Subida solo vía dashboard/service.
INSERT INTO storage.buckets (id, name, public)
VALUES ('liquidaciones', 'liquidaciones', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Verificación rápida (debería devolver 5 filas):
SELECT c.f2pool_username, l.periodo_inicio, l.periodo_fin, l.btc_neto, l.energia_usd, l.pdf_url
FROM liquidaciones l JOIN clientes c ON c.id = l.cliente_id
ORDER BY c.f2pool_username;
