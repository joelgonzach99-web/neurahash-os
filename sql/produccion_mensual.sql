-- Producción mensual por cliente — sincronizada desde F2Pool via GitHub Actions
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS produccion_mensual (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid REFERENCES clientes(id) ON DELETE CASCADE,
  mes varchar(7) NOT NULL,                          -- formato "2026-06"
  btc_bruto numeric(16,8) DEFAULT 0,                -- producción total acumulada del mes
  btc_hosting numeric(16,8) DEFAULT 0,              -- fee NeuraHash (según hosting_fee_pct del cliente)
  btc_neto_cliente numeric(16,8) DEFAULT 0,         -- lo que recibe el cliente
  hashrate_promedio numeric(10,2) DEFAULT 0,        -- TH/s promedio (último dato del mes)
  maquinas integer DEFAULT 0,                       -- workers activos (último dato)
  energia_usd numeric(10,2) DEFAULT 0,              -- energia_usd_por_maquina × maquinas
  energia_pagada boolean DEFAULT false,
  energia_fecha_pago date,
  energia_metodo varchar(20),                       -- 'btc', 'zelle', 'usdt'
  notas text,
  ultima_actualizacion timestamptz DEFAULT now(),
  UNIQUE(cliente_id, mes)
);

-- f2pool_username ya existe en clientes (no agregar duplicado)

-- Agregar columna energía por máquina si no existe
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS energia_usd_por_maquina numeric(8,2) DEFAULT 163;

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_produccion_cliente_mes ON produccion_mensual(cliente_id, mes);
CREATE INDEX IF NOT EXISTS idx_produccion_mes ON produccion_mensual(mes);

-- RLS: solo service role puede insertar/actualizar (el sync corre con service key)
ALTER TABLE produccion_mensual ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Service role full access"
  ON produccion_mensual FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Auth users can read"
  ON produccion_mensual FOR SELECT
  TO authenticated
  USING (true);
