-- Codigo de barras en los productos (HU-30).
--
-- Opcional y unico: dos productos no pueden tener el mismo codigo, pero
-- muchos pueden no tener ninguno (el indice solo mira los que tienen).
-- No modifica ningun dato existente.
--
-- Se puede correr varias veces sin problema. Las bases nuevas ya lo traen en
-- database/schema.sql. Requiere haber corrido antes 001_iva_en_comercio.sql.
--
-- Desde pgAdmin: abre la base, Query Tool, pega este archivo y ejecuta (F5).

BEGIN;

ALTER TABLE public.producto
    ADD COLUMN IF NOT EXISTS codigo_barras character varying(50);

CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_codigo_barras
    ON public.producto USING btree (codigo_barras)
    WHERE codigo_barras IS NOT NULL;

COMMIT;
