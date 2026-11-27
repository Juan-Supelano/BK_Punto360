-- Registro de auditoria de cambios (HU-32).
--
-- Guarda que cambio (nombre, codigo de barras, precio, categoria y estado de
-- productos; rol, estado y contrasena reiniciada de usuarios; IVA y escaneo en
-- Mi empresa), el valor antes y despues, quien y cuando. Solo admite INSERT.
-- No modifica ningun dato existente.
--
-- Se puede correr varias veces sin problema. Las bases nuevas ya lo traen en
-- database/schema.sql. Requiere haber corrido antes 001, 002 y 003.
--
-- Desde pgAdmin: abre la base, Query Tool, pega este archivo y ejecuta (F5).

BEGIN;

CREATE TABLE IF NOT EXISTS public.auditoria_cambio (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    usuario_id integer REFERENCES public.usuario(id),
    entidad character varying(20) NOT NULL,
    entidad_id integer NOT NULL,
    descripcion character varying(200) NOT NULL,
    campo character varying(40) NOT NULL,
    valor_antes text,
    valor_despues text,
    CONSTRAINT ck_auditoria_entidad CHECK (((entidad)::text = ANY ((ARRAY['producto'::character varying, 'usuario'::character varying, 'comercio'::character varying])::text[])))
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON public.auditoria_cambio USING btree (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON public.auditoria_cambio USING btree (entidad, entidad_id);

-- El registro solo admite INSERT: ni la aplicacion ni una consulta manual
-- pueden modificarlo o borrarlo sin quitar antes este trigger.
CREATE OR REPLACE FUNCTION public.auditoria_solo_insertar() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'auditoria_cambio solo admite INSERT: el registro no se modifica ni se borra';
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_solo_insertar ON public.auditoria_cambio;
CREATE TRIGGER trg_auditoria_solo_insertar
    BEFORE UPDATE OR DELETE ON public.auditoria_cambio
    FOR EACH ROW EXECUTE FUNCTION public.auditoria_solo_insertar();

DROP TRIGGER IF EXISTS trg_auditoria_sin_truncate ON public.auditoria_cambio;
CREATE TRIGGER trg_auditoria_sin_truncate
    BEFORE TRUNCATE ON public.auditoria_cambio
    FOR EACH STATEMENT EXECUTE FUNCTION public.auditoria_solo_insertar();

-- Si la API se conecta con un usuario distinto al dueno de las tablas (por
-- ejemplo en Cloud SQL), dale permiso de leer e insertar:
-- GRANT SELECT, INSERT ON public.auditoria_cambio TO usuario_de_la_api;

COMMIT;
