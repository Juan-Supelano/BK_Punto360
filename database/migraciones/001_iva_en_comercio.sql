-- IVA por defecto del comercio (Mi empresa) e IVA por linea de compra.
--
-- configuracion_comercio guarda el IVA por defecto (el que toman los productos
-- nuevos) y si los precios y costos ya traen IVA (lo que viene marcado en
-- Vender y en Compras). Cada producto conserva su propio IVA: la compra lo
-- actualiza con el de su linea y la venta lo usa.
--
-- No modifica ningun dato existente: solo agrega columnas.
--
-- Se puede correr varias veces sin problema (IF NOT EXISTS). Las bases nuevas
-- ya lo traen en database/schema.sql.
--
-- Desde pgAdmin: abre la base, Query Tool, pega este archivo y ejecuta (F5).
-- Desde consola: psql -U postgres -d proyecto_nube -f database/migraciones/001_iva_en_comercio.sql

BEGIN;

ALTER TABLE public.configuracion_comercio
    ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2) DEFAULT 19 NOT NULL;

ALTER TABLE public.configuracion_comercio
    ADD COLUMN IF NOT EXISTS precio_incluye_iva boolean DEFAULT true NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_config_iva') THEN
        ALTER TABLE public.configuracion_comercio
            ADD CONSTRAINT ck_config_iva CHECK (iva_pct >= 0 AND iva_pct <= 100);
    END IF;
END $$;

-- IVA con el que se facturo cada linea de compra (NULL en las compras viejas).
ALTER TABLE public.compra_item
    ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2);

COMMIT;
