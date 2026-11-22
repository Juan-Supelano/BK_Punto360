from datetime import date
from typing import Literal

from pydantic import BaseModel


# --- Proyeccion de ventas ---------------------------------------------------
class PuntoHistorico(BaseModel):
    fecha: date
    total: float


class PuntoProyeccion(BaseModel):
    fecha: date
    estimado: float
    inferior: float
    superior: float


class ErrorModelo(BaseModel):
    """Error del backtesting: el modelo pronostica los ultimos dias reales sin
    haberlos visto al entrenar."""

    mae: float
    mape: float | None
    dias_evaluados: int


class ProyeccionVentas(BaseModel):
    datos_suficientes: bool
    horizonte: int
    dias_historia: int
    dias_con_ventas: int
    minimo_dias_con_ventas: int
    modelo: str | None
    mensaje: str | None
    historico: list[PuntoHistorico]
    proyeccion: list[PuntoProyeccion]
    error: ErrorModelo | None


# --- Inventario -------------------------------------------------------------
class ProductoPrediccion(BaseModel):
    producto_id: int
    sku: str
    nombre: str
    unidad_medida: str
    stock_actual: int
    stock_minimo: int
    costo: float
    unidades_30d: float
    demanda_diaria: float
    dias_restantes: float | None
    nivel_alerta: Literal["critico", "advertencia", "normal"]
    cantidad_sugerida: int
    probabilidad_venta_30d: float
    dias_sin_venta: int | None
    nunca_vendido: bool
    compra_reciente: bool
    baja_rotacion: bool
    valor_inmovilizado: float


class ResumenInventario(BaseModel):
    productos: int
    criticos: int
    advertencias: int
    por_comprar: int
    baja_rotacion: int
    valor_inmovilizado: float


class PrediccionInventario(BaseModel):
    generado_en: date
    cobertura: int
    tiempo_entrega: int
    resumen: ResumenInventario
    productos: list[ProductoPrediccion]


# --- Historico mensual ------------------------------------------------------
class VentaMensual(BaseModel):
    mes: str  # "2026-11"
    ventas: int
    total: float
