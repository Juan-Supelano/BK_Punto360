"""IA predictiva (HU-25 y HU-26). Solo ADMIN.

Los calculos viven en app/prediccion.py; aqui solo hay permisos, parametros
y metricas de Prometheus.
"""

import time
from contextlib import contextmanager

from fastapi import APIRouter, Depends, HTTPException, Query
from prometheus_client import Counter, Gauge, Histogram
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

# --- Metricas (HU-26) -------------------------------------------------------
# Van al registro por defecto de prometheus-client, el mismo que publica
# /metrics. tipo: ventas | inventario | mensual.
# resultado: ok | sin_datos | error.
CALCULOS = Counter(
    "punto360_prediccion_calculos_total",
    "Calculos del modulo predictivo",
    ["tipo", "resultado"],
)
DURACION = Histogram(
    "punto360_prediccion_duracion_segundos",
    "Duracion de los calculos del modulo predictivo",
    ["tipo"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)
MAPE = Gauge(
    "punto360_prediccion_mape",
    "MAPE (%) del ultimo backtesting de la proyeccion de ventas",
)


@contextmanager
def _medir(tipo: str):
    """Cuenta el calculo y mide cuanto tarda. Quien llama puede cambiar
    estado["resultado"] a "sin_datos"; si hay excepcion queda "error"."""
    estado = {"resultado": "ok"}
    inicio = time.perf_counter()
    try:
        yield estado
    except Exception:
        estado["resultado"] = "error"
        raise
    finally:
        DURACION.labels(tipo=tipo).observe(time.perf_counter() - inicio)
        CALCULOS.labels(tipo=tipo, resultado=estado["resultado"]).inc()


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
    with _medir("ventas") as estado:
        resultado = prediccion.calcular_proyeccion(db, dias)
        if not resultado["datos_suficientes"]:
            estado["resultado"] = "sin_datos"
        elif resultado["error"] and resultado["error"]["mape"] is not None:
            MAPE.set(resultado["error"]["mape"])
    return resultado


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
    with _medir("inventario") as estado:
        resultado = prediccion.calcular_inventario(db, cobertura, tiempo_entrega)
        if not resultado["productos"]:
            estado["resultado"] = "sin_datos"
    return resultado


@router.get("/ventas-mensuales", response_model=list[VentaMensual])
def ventas_mensuales(
    meses: int = Query(default=12, ge=1, le=24),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(solo_admin),
):
    """Total vendido por mes (ventas PAGADA), para el grafico del informe."""
    with _medir("mensual"):
        return prediccion.ventas_mensuales(db, meses)
