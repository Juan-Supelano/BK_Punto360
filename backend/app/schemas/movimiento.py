from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class MovimientoLeer(BaseModel):
    """Una fila del kardex de un producto."""

    id: int
    fecha: datetime
    tipo: str
    cantidad: Decimal
    stock_anterior: int
    stock_resultante: int
    motivo: str | None
    usuario: str | None = Field(description="Nombre de quien hizo el movimiento")
    origen: str | None = Field(
        description="VENTA o COMPRA si el movimiento salio de un documento"
    )
    documento: str | None = Field(
        description="Numero de la venta (F-000001) o de la compra (FC-000001)"
    )
