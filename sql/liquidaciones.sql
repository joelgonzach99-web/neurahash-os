-- ═══════════════════════════════════════════════════════════════════
-- NeuraHash — Setup completo: produccion_diaria + liquidaciones + RLS
-- Ejecutar completo en Supabase SQL Editor (idempotente, se puede re-correr)
--
-- NOTA: el sql/produccion_diaria.sql original usaba CREATE POLICY IF NOT
-- EXISTS (sintaxis inválida en Postgres) → el script entero se revertía y
-- la tabla nunca se creó. Este archivo la crea con políticas corregidas.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Tabla produccion_diaria (sync diario desde F2Pool) ────────────
CREATE TABLE IF NOT EXISTS produccion_diaria (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id           uuid REFERENCES clientes(id) ON DELETE CASCADE,
  fecha                date NOT NULL,
  hashrate_ths         numeric(10,2)  DEFAULT 0,
  btc_bruto            numeric(16,8)  DEFAULT 0,
  btc_hosting          numeric(16,8)  DEFAULT 0,
  btc_neto             numeric(16,8)  DEFAULT 0,
  energia_usd          numeric(10,4)  DEFAULT 0,
  fuente               varchar(20)    DEFAULT 'f2pool_api',
  ultima_actualizacion timestamptz    DEFAULT now(),
  UNIQUE(cliente_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_prod_diaria_cliente_fecha ON produccion_diaria(cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_prod_diaria_fecha         ON produccion_diaria(fecha DESC);

ALTER TABLE produccion_diaria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access diaria" ON produccion_diaria;
CREATE POLICY "Service role full access diaria"
  ON produccion_diaria FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- El portal usa la anon key (login por token_acceso, sin Supabase Auth),
-- por eso la política de lectura incluye al rol anon.
DROP POLICY IF EXISTS "Auth users can read diaria" ON produccion_diaria;
DROP POLICY IF EXISTS "Anon can read diaria" ON produccion_diaria;
CREATE POLICY "Anon can read diaria"
  ON produccion_diaria FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── 2. Tabla liquidaciones (períodos cerrados, ciclo 15 → 14) ────────
CREATE TABLE IF NOT EXISTS liquidaciones (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id           uuid REFERENCES clientes(id) ON DELETE CASCADE,
  periodo_inicio       date NOT NULL,                -- ej. 2026-06-15
  periodo_fin          date NOT NULL,                -- ej. 2026-07-14
  btc_bruto            numeric(16,8) DEFAULT 0,
  btc_hosting          numeric(16,8) DEFAULT 0,
  btc_neto             numeric(16,8) DEFAULT 0,
  energia_usd          numeric(10,4) DEFAULT 0,
  btc_price_referencia numeric(12,2),
  pdf_url              text,                          -- nullable, se completa al subir el PDF
  creado_en            timestamptz DEFAULT now(),
  UNIQUE(cliente_id, periodo_inicio)
);

CREATE INDEX IF NOT EXISTS idx_liquidaciones_cliente
  ON liquidaciones(cliente_id, periodo_inicio DESC);

ALTER TABLE liquidaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access liquidaciones" ON liquidaciones;
CREATE POLICY "Service role full access liquidaciones"
  ON liquidaciones FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can read liquidaciones" ON liquidaciones;
CREATE POLICY "Anon can read liquidaciones"
  ON liquidaciones FOR SELECT
  TO anon, authenticated
  USING (true);

-- ═══════════════════════════════════════════════════════════════════
-- NOTA DE SEGURIDAD: con la anon key se puede leer la producción de
-- todos los clientes (mismo nivel de exposición que la tabla clientes
-- hoy). Mejora futura acordada: endpoint serverless con service key
-- que valide token_acceso y filtre por cliente.
-- ═══════════════════════════════════════════════════════════════════
