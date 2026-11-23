import re
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app import auditoria
from app.database import get_db
from app.models import Categoria, MovimientoInventario, Producto, Usuario, Venta
from app.models.producto import UNIDADES
from app.schemas.movimiento import MovimientoLeer
from app.schemas.producto import ProductoActualizar, ProductoCrear, ProductoLeer
from app.seguridad import requerir_password_actualizada, solo_admin, usuario_actual
from app.texto import columna_plana, patron

router = APIRouter(
    prefix="/productos",
    tags=["Productos"],
    dependencies=[Depends(requerir_password_actualizada)],
)


def _buscar(db: Session, producto_id: int) -> Producto:
    producto = db.get(Producto, producto_id)
    if producto is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado")
    return producto


def _buscar_categoria(db: Session, categoria_id: int) -> Categoria:
    categoria = db.get(Categoria, categoria_id)
    if categoria is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La categoria no existe")
    if not categoria.activo:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "La categoria esta desactivada"
        )
    return categoria


def _validar_unidad(unidad: str | None) -> None:
    if unidad is not None and unidad not in UNIDADES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unidad de medida invalida. Use una de: {', '.join(UNIDADES)}",
        )


def _siguiente_sku(db: Session, categoria: Categoria) -> str:
    """Arma el SKU a partir del prefijo de la categoria: BEB-001, BEB-002...

    Se mira el consecutivo mas alto que ya exista con ese prefijo, incluyendo
    productos inactivos, para no reutilizar nunca un codigo dado de baja.
    """
    prefijo = categoria.prefijo_sku
    usados = db.scalars(
        select(Producto.sku).where(Producto.sku.like(f"{prefijo}-%"))
    ).all()

    mayor = 0
    for sku in usados:
        cola = sku.rsplit("-", 1)[-1]
        if cola.isdigit():
            mayor = max(mayor, int(cola))

    return f"{prefijo}-{mayor + 1:03d}"


# compras.py deja el numero de la compra en el motivo del kardex: "Compra
# FC-000001 - Proveedor" y, al anularla, "Anulacion compra FC-000001: motivo".
# movimiento_inventario no tiene columna compra_id, asi que se lee de ahi.
_NUMERO_COMPRA = re.compile(r"^(?:Compra|Anulacion compra) (.+?)(?: - |: | \(|$)")


def validar_codigo_libre(
    db: Session, codigo: str | None, excepto_id: int | None = None
) -> None:
    """Un codigo de barras identifica un solo producto. Si ya lo tiene otro,
    el mensaje dice cual, para que se pueda revisar."""
    if not codigo:
        return
    consulta = select(Producto).where(Producto.codigo_barras == codigo)
    if excepto_id is not None:
        consulta = consulta.where(Producto.id != excepto_id)
    otro = db.scalar(consulta)
    if otro is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Ese codigo de barras ya lo tiene {otro.nombre} ({otro.sku})",
        )


def nuevo_producto(db: Session, campos: dict, iva_pct: Decimal) -> Producto:
    """Producto listo para agregar a la sesion, con su SKU y el IVA del
    comercio. Lo usan este router y el alta desde una compra."""
    categoria = _buscar_categoria(db, campos["categoria_id"])
    _validar_unidad(campos.get("unidad_medida"))
    validar_codigo_libre(db, campos.get("codigo_barras"))
    return Producto(
        **campos, iva_pct=iva_pct, sku=_siguiente_sku(db, categoria), activo=True
    )


def _numero_compra(motivo: str | None) -> str | None:
    hallado = _NUMERO_COMPRA.match(motivo or "")
    return hallado.group(1) if hallado else None


@router.get("", response_model=list[ProductoLeer])
def listar(
    categoria_id: int | None = None,
    buscar: str | None = None,
    solo_stock_bajo: bool = False,
    incluir_inactivos: bool = False,
    db: Session = Depends(get_db),
):
    consulta = (
        select(Producto)
        .options(selectinload(Producto.categoria))
        .order_by(Producto.nombre)
    )
    if not incluir_inactivos:
        consulta = consulta.where(Producto.activo.is_(True))
    if categoria_id is not None:
        consulta = consulta.where(Producto.categoria_id == categoria_id)
    if buscar:
        # Busca ignorando tildes: "panaderia" encuentra "Panadería". El codigo
        # de barras tambien cuenta, aunque no se muestre en la tabla.
        aguja = patron(buscar)
        consulta = consulta.where(
            or_(
                columna_plana(Producto.nombre).like(aguja),
                columna_plana(Producto.sku).like(aguja),
                Producto.codigo_barras.like(f"%{buscar.strip()}%"),
            )
        )
    if solo_stock_bajo:
        consulta = consulta.where(Producto.stock_actual <= Producto.stock_minimo)
    return db.scalars(consulta).all()


# Va ANTES de /{producto_id}: si no, FastAPI intenta leer "siguiente-sku"
# como un id entero y responde 422.
@router.get("/siguiente-sku")
def siguiente_sku(categoria_id: int = Query(), db: Session = Depends(get_db)):
    """Vista previa del SKU que se asignaria. No reserva nada."""
    categoria = _buscar_categoria(db, categoria_id)
    return {
        "categoria_id": categoria.id,
        "prefijo_sku": categoria.prefijo_sku,
        "sku": _siguiente_sku(db, categoria),
    }


@router.get("/{producto_id}", response_model=ProductoLeer)
def obtener(producto_id: int, db: Session = Depends(get_db)):
    return _buscar(db, producto_id)


@router.get("/{producto_id}/movimientos", response_model=list[MovimientoLeer])
def movimientos(
    producto_id: int,
    limite: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Kardex del producto, del mas reciente al mas antiguo.

    Cada fila trae el documento que movio el stock: el numero de la venta
    (F-000001) o el de la compra (FC-000001). Los ajustes manuales no tienen.
    """
    _buscar(db, producto_id)
    filas = db.execute(
        select(MovimientoInventario, Venta.numero, Usuario.nombre)
        .outerjoin(Venta, Venta.id == MovimientoInventario.venta_id)
        .outerjoin(Usuario, Usuario.id == MovimientoInventario.usuario_id)
        .where(MovimientoInventario.producto_id == producto_id)
        .order_by(MovimientoInventario.fecha.desc(), MovimientoInventario.id.desc())
        .limit(limite)
    ).all()

    resultado = []
    for mov, numero_venta, nombre_usuario in filas:
        if numero_venta:
            origen, documento = "VENTA", numero_venta
        else:
            documento = _numero_compra(mov.motivo)
            origen = "COMPRA" if documento else None
        resultado.append(
            MovimientoLeer(
                id=mov.id,
                fecha=mov.fecha,
                tipo=mov.tipo,
                cantidad=mov.cantidad,
                stock_anterior=mov.stock_anterior,
                stock_resultante=mov.stock_resultante,
                motivo=mov.motivo,
                usuario=nombre_usuario,
                origen=origen,
                documento=documento,
            )
        )
    return resultado


@router.post("", response_model=ProductoLeer, status_code=status.HTTP_201_CREATED)
def crear(
    datos: ProductoCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    """El SKU no se recibe: siempre lo arma el backend con el prefijo de la
    categoria, que es lo que digito el administrador al crearla. El IVA
    tampoco: es el del comercio."""
    campos = datos.model_dump()

    # Si dos cajeros crean productos a la vez pueden calcular el mismo
    # consecutivo. El UNIQUE de la base rechaza al segundo y aqui se reintenta.
    for _ in range(5):
        producto = nuevo_producto(db, campos, usuario.comercio.iva_pct)
        db.add(producto)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            continue
        db.refresh(producto)
        return producto

    raise HTTPException(
        status.HTTP_409_CONFLICT,
        "No se pudo asignar un SKU libre. Intenta de nuevo.",
    )


@router.put("/{producto_id}", response_model=ProductoLeer)
def actualizar(
    producto_id: int,
    datos: ProductoActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    producto = _buscar(db, producto_id)
    cambios = datos.model_dump(exclude_unset=True)

    # Activar o desactivar un producto es solo del ADMIN, tambien por aqui.
    if "activo" in cambios and not usuario.es_admin:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Solo un ADMIN puede activar o desactivar productos"
        )

    if "categoria_id" in cambios:
        _buscar_categoria(db, cambios["categoria_id"])
        # El SKU NO se recalcula al mover un producto de categoria: ya puede
        # estar impreso en etiquetas o usado por un proveedor.
    if "unidad_medida" in cambios:
        _validar_unidad(cambios["unidad_medida"])
    if cambios.get("codigo_barras"):
        validar_codigo_libre(db, cambios["codigo_barras"], excepto_id=producto.id)

    antes = auditoria.foto(producto, auditoria.CAMPOS_PRODUCTO)
    for campo, valor in cambios.items():
        setattr(producto, campo, valor)
    auditoria.registrar(db, usuario, "producto", producto, antes, auditoria.CAMPOS_PRODUCTO)

    db.commit()
    db.refresh(producto)
    return producto


@router.patch("/{producto_id}/stock", response_model=ProductoLeer)
def ajustar_stock(
    producto_id: int,
    cantidad: int = Query(
        description="Positivo suma unidades, negativo las resta."
    ),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    """Ajuste manual de inventario. Queda registrado en el kardex."""
    if cantidad == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La cantidad no puede ser 0")

    producto = _buscar(db, producto_id)
    anterior = producto.stock_actual
    nuevo = anterior + cantidad
    if nuevo < 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"No hay stock suficiente. Disponible: {anterior}",
        )

    producto.stock_actual = nuevo
    db.add(
        MovimientoInventario(
            producto_id=producto.id,
            tipo="AJUSTE",
            cantidad=Decimal(abs(cantidad)),
            stock_anterior=anterior,
            stock_resultante=nuevo,
            usuario_id=usuario.id,
            motivo=f"Ajuste manual de {cantidad:+d} desde la pantalla de productos",
        )
    )
    db.commit()
    db.refresh(producto)
    return producto


@router.delete("/{producto_id}", response_model=ProductoLeer)
def desactivar(
    producto_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(solo_admin),
):
    """Solo ADMIN. No borra el registro: lo marca como inactivo."""
    producto = _buscar(db, producto_id)
    if producto.activo:
        auditoria.anotar(db, admin, "producto", producto, "activo", "Sí", "No")
    producto.activo = False
    db.commit()
    db.refresh(producto)
    return producto


@router.post("/{producto_id}/reactivar", response_model=ProductoLeer)
def reactivar(
    producto_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(solo_admin),
):
    """Solo ADMIN."""
    producto = _buscar(db, producto_id)
    if not producto.activo:
        auditoria.anotar(db, admin, "producto", producto, "activo", "No", "Sí")
    producto.activo = True
    db.commit()
    db.refresh(producto)
    return producto
