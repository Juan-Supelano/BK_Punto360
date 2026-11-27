from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.producto import ProductoResumen
from app.schemas.proveedor import ProveedorResumen


class ProductoNuevoCompra(BaseModel):
    """Producto que no existia y se crea con la compra. Si la compra no se
    guarda, el producto tampoco: van en la misma transaccion. El costo sale de
    la linea de la compra, el stock de la cantidad comprada y el IVA del
    comercio."""

    nombre: str = Field(min_length=1, max_length=150)
    codigo_barras: str | None = Field(default=None, max_length=50)
    categoria_id: int
    precio_venta: Decimal = Field(ge=0)
    stock_minimo: int = Field(default=0, ge=0)
    unidad_medida: str = Field(default="UND")

    @field_validator("codigo_barras")
    @classmethod
    def limpiar_codigo(cls, valor: str | None) -> str | None:
        limpio = (valor or "").strip()
        return limpio or None


class CompraItemCrear(BaseModel):
    # Uno de los dos: un producto que ya existe o uno nuevo.
    producto_id: int | None = None
    producto_nuevo: ProductoNuevoCompra | None = None
    # El stock de la base es entero, asi que las entradas tambien lo son.
    cantidad: int = Field(gt=0)
    costo_unitario: Decimal = Field(ge=0)
    # IVA de esta linea. Si no llega: el del producto, o el de Mi empresa si
    # el producto es nuevo. Queda guardado en el producto para las ventas.
    iva_pct: Decimal | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def un_solo_producto(self):
        if (self.producto_id is None) == (self.producto_nuevo is None):
            raise ValueError("Cada linea lleva producto_id o producto_nuevo, uno de los dos")
        return self


class CompraCrear(BaseModel):
    proveedor_id: int
    numero_factura: str | None = Field(
        default=None,
        max_length=40,
        description=(
            "Opcional. Si no se envia, el backend asigna el consecutivo "
            "FC-000001, FC-000002..."
        ),
    )
    costo_incluye_iva: bool | None = Field(
        default=None,
        description=(
            "Si no se envia, se usa lo configurado en Mi empresa. "

            "true: el costo que facturo el proveedor ya trae IVA. Se guarda "
            "la base sin impuesto, porque el IVA de compra es descontable y "
            "no hace parte del valor del inventario."
        ),
    )
    items: list[CompraItemCrear] = Field(min_length=1)

    @field_validator("numero_factura")
    @classmethod
    def limpiar_factura(cls, valor: str | None) -> str | None:
        """Mayusculas y sin espacios; vacio cuenta como no enviado."""
        limpio = (valor or "").strip().upper()
        return limpio or None


class CompraAnular(BaseModel):
    motivo: str | None = Field(default=None, max_length=200)


class CompraItemLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    producto_id: int
    cantidad: Decimal
    costo_unitario: Decimal
    subtotal_linea: Decimal
    # NULL en las compras registradas antes de guardar el IVA por linea.
    iva_pct: Decimal | None = None
    producto: ProductoResumen


class CompraLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    numero_factura: str
    fecha: datetime
    subtotal: Decimal
    total_iva: Decimal
    total: Decimal
    costo_incluye_iva: bool
    estado: str
    proveedor: ProveedorResumen
    items: list[CompraItemLeer]


class CompraListada(BaseModel):
    """Sin el detalle de items: es lo que se muestra en la tabla."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    numero_factura: str
    fecha: datetime
    subtotal: Decimal
    total_iva: Decimal
    total: Decimal
    costo_incluye_iva: bool
    estado: str
    proveedor: ProveedorResumen
