"""IA predictiva (HU-25). Solo ADMIN.

Los calculos viven en app/prediccion.py; aqui solo hay permisos y parametros.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import prediccion
from app.database import get_db
from app.models import Usuario
from app.schemas.prediccion import PrediccionInventario, ProyeccionVentas, VentaMensual
from app.seguridad import requerir_password_actualizada, solo_admin

router = APIRouter(
    prefix="/prediccion",
    tags=["IA predictiva"],
    dependencies=[Depends(requerir_password_actualizada)],
)


# --- Endpoints --------------------------------------------------------------
@router.get("/ventas", response_model=ProyeccionVentas)
def proyeccion_ventas(
    dias: int = Query(default=7, description="Horizonte: 7, 15 o 30 dias"),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(solo_admin),
):
    """Proyeccion diaria del total vendido con Holt-Winters, con intervalo
    inferior y superior por dia y el error del backtesting (MAE y MAPE).

    Con menos de 14 dias con ventas responde `datos_suficientes: false` y sin
    proyeccion.
    """
    if dias not in prediccion.HORIZONTES:
        raise HTTPException(422, "dias debe ser 7, 15 o 30")
    return prediccion.calcular_proyeccion(db, dias)


@router.get("/inventario", response_model=PrediccionInventario)
def prediccion_inventario(
    cobertura: int = Query(
        default=prediccion.COBERTURA_DEFECTO,
        ge=1,
        le=180,
        description="Dias de venta que debe cubrir la compra",
    ),
    tiempo_entrega: int = Query(
        default=prediccion.TIEMPO_ENTREGA_DEFECTO,
        ge=0,
        le=90,
        description="Dias que tarda el proveedor en entregar",
    ),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(solo_admin),
):
    """Por producto activo: demanda diaria, dias de stock restantes, nivel de
    alerta, compra sugerida, probabilidad de venta a 30 dias (Poisson) y si
    es de baja rotacion."""
    return prediccion.calcular_inventario(db, cobertura, tiempo_entrega)


@router.get("/ventas-mensuales", response_model=list[VentaMensual])
def ventas_mensuales(
    meses: int = Query(default=12, ge=1, le=24),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(solo_admin),
):
    """Total vendido por mes (ventas PAGADA), para el grafico del informe."""
    return prediccion.ventas_mensuales(db, meses)
