from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.categoria import CategoriaResumen


def _limpiar_codigo(valor: str | None) -> str | None:
    """Sin espacios alrededor; vacio cuenta como "sin codigo" (NULL), para que
    el indice unico no choque entre productos que no tienen."""
    limpio = (valor or "").strip()
    return limpio or None


class ProductoCrear(BaseModel):
    # El SKU no se manda: lo arma el backend con el prefijo de la categoria.
    nombre: str = Field(min_length=1, max_length=150)
    codigo_barras: str | None = Field(default=None, max_length=50)
    descripcion: str | None = None
    precio_venta: Decimal = Field(ge=0)
    costo: Decimal = Field(default=Decimal("0"), ge=0)
    # Sin iva_pct: lo pone el backend con el IVA del comercio (Mi empresa).
    stock_actual: int = Field(default=0, ge=0)
    stock_minimo: int = Field(default=0, ge=0)
    unidad_medida: str = Field(default="UND")
    categoria_id: int

    @field_validator("codigo_barras")
    @classmethod
    def limpiar_codigo(cls, valor: str | None) -> str | None:
        return _limpiar_codigo(valor)


class ProductoActualizar(BaseModel):
    # El SKU tampoco se edita: es un codigo derivado de la categoria.
    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    codigo_barras: str | None = Field(default=None, max_length=50)
    descripcion: str | None = None
    precio_venta: Decimal | None = Field(default=None, ge=0)
    costo: Decimal | None = Field(default=None, ge=0)
    stock_actual: int | None = Field(default=None, ge=0)
    stock_minimo: int | None = Field(default=None, ge=0)
    unidad_medida: str | None = None
    activo: bool | None = None
    categoria_id: int | None = None

    @field_validator("codigo_barras")
    @classmethod
    def limpiar_codigo(cls, valor: str | None) -> str | None:
        return _limpiar_codigo(valor)


class ProductoLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    codigo_barras: str | None = None
    nombre: str
    descripcion: str | None
    precio_venta: Decimal
    costo: Decimal
    iva_pct: Decimal
    stock_actual: int
    stock_minimo: int
    unidad_medida: str
    activo: bool
    creado_en: datetime
    actualizado_en: datetime
    categoria: CategoriaResumen
    # Calculados en el modelo, no son columnas.
    stock_bajo: bool
    margen_pct: Decimal | None


class ProductoResumen(BaseModel):
    """Version corta, la que va anidada dentro de una compra o una venta."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    codigo_barras: str | None = None
    nombre: str
    unidad_medida: str
