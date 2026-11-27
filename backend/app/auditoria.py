"""Registro de auditoria (HU-32): que cambio, valor antes y despues, quien y
cuando.

Se usa asi en un router, ANTES de aplicar los cambios:

    antes = auditoria.foto(producto, CAMPOS_PRODUCTO)
    ...aplicar cambios...
    auditoria.registrar(db, usuario, "producto", producto, antes, CAMPOS_PRODUCTO)
    db.commit()

registrar() solo agrega filas a la sesion: el commit es el mismo del cambio,
asi que no puede quedar un cambio sin registro ni un registro sin cambio.

Los movimientos de stock no van aqui: ya los guarda el kardex.
"""

from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import AuditoriaCambio, Categoria, Usuario

# Campos que se auditan por entidad.
CAMPOS_PRODUCTO = (
    "nombre",
    "codigo_barras",
    "precio_venta",
    "iva_pct",
    "categoria_id",
    "activo",
)
CAMPOS_USUARIO = ("rol", "activo")
CAMPOS_COMERCIO = ("iva_pct", "precio_incluye_iva", "escaneo_camara")


def _texto(valor) -> str | None:
    """Valor legible y estable para guardar: 1500.00 -> "1500", True -> "Sí"."""
    if valor is None or valor == "":
        return None
    if isinstance(valor, bool):
        return "Sí" if valor else "No"
    if isinstance(valor, Decimal):
        normal = valor.normalize()
        return format(normal, "f")
    return str(valor)


def foto(objeto, campos) -> dict:
    """Valores actuales de los campos, para comparar despues."""
    return {campo: getattr(objeto, campo) for campo in campos}


def descripcion(entidad: str, objeto) -> str:
    if entidad == "producto":
        return f"{objeto.nombre} ({objeto.sku})"[:200]
    if entidad == "usuario":
        return f"{objeto.nombre} ({objeto.email})"[:200]
    return (objeto.nombre_comercial or objeto.razon_social or "Empresa")[:200]


def _legible(db: Session, campo: str, valor):
    # La categoria se guarda por nombre: el id solo no le dice nada a nadie.
    if campo == "categoria_id" and valor is not None:
        categoria = db.get(Categoria, valor)
        return categoria.nombre if categoria else valor
    return valor


def registrar(
    db: Session,
    usuario: Usuario | None,
    entidad: str,
    objeto,
    antes: dict,
    campos,
) -> int:
    """Agrega una fila por cada campo que cambio. Devuelve cuantas."""
    filas = 0
    for campo in campos:
        viejo, nuevo = antes.get(campo), getattr(objeto, campo)
        texto_viejo = _texto(_legible(db, campo, viejo))
        texto_nuevo = _texto(_legible(db, campo, nuevo))
        if texto_viejo == texto_nuevo:
            continue
        anotar(db, usuario, entidad, objeto, campo, texto_viejo, texto_nuevo)
        filas += 1
    return filas


def anotar(
    db: Session,
    usuario: Usuario | None,
    entidad: str,
    objeto,
    campo: str,
    antes: str | None,
    despues: str | None,
) -> None:
    """Una fila suelta, para eventos que no son un campo (contrasena reiniciada)."""
    db.add(
        AuditoriaCambio(
            usuario_id=usuario.id if usuario else None,
            entidad=entidad,
            entidad_id=objeto.id,
            descripcion=descripcion(entidad, objeto),
            campo=campo,
            valor_antes=antes,
            valor_despues=despues,
        )
    )
