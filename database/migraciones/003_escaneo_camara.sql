-- Interruptor para escanear codigos con la camara (HU-31).
--
-- Apagado por defecto. El ADMIN lo activa en Mi empresa cuando el punto de
-- venta no tiene lector de codigos. No modifica ningun dato existente.
--
-- Se puede correr varias veces sin problema. Las bases nuevas ya lo traen en
-- database/schema.sql. Requiere haber corrido antes 001 y 002.
--
-- Desde pgAdmin: abre la base, Query Tool, pega este archivo y ejecuta (F5).

ALTER TABLE public.configuracion_comercio
    ADD COLUMN IF NOT EXISTS escaneo_camara boolean DEFAULT false NOT NULL;
