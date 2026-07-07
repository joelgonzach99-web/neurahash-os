-- Producción diaria por cliente — sincronizada desde F2Pool via GitHub Actions
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS produccion_diaria (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id           uuid REFERENCES clientes(id) ON DELETE CASCADE,
  fecha                date NOT NULL,                           -- "2026-07-06"
  hashrate_ths         numeric(10,2)  DEFAULT 0,               -- TH/s real (exacto hoy, estimado histórico)
  btc_bruto            numeric(16,8)  DEFAULT 0,               -- crédito FPPS del día
  btc_hosting          numeric(16,8)  DEFAULT 0,               -- fee según hosting_fee_pct del cliente
  btc_neto             numeric(16,8)  DEFAULT 0,               -- btc_bruto − btc_hosting
  energia_usd          numeric(10,4)  DEFAULT 0,               -- (hashrate_ths/395) × (energia_usd_por_maquina/30)
  fuente               varchar(20)    DEFAULT 'f2pool_api',
  ultima_actualizacion timestamptz    DEFAULT now(),
  UNIQUE(cliente_id, fecha)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_prod_diaria_cliente_fecha ON produccion_diaria(cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_prod_diaria_fecha         ON produccion_diaria(fecha DESC);

-- RLS: misma política que produccion_mensual
ALTER TABLE produccion_diaria ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Service role full access diaria"
  ON produccion_diaria FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Auth users can read diaria"
  ON produccion_diaria FOR SELECT
  TO authenticated
  USING (true);
