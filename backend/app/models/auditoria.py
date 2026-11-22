from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.usuario import Usuario

# La base tiene un CHECK con estos valores.
ENTIDADES = ("producto", "usuario", "comercio")


class AuditoriaCambio(Base):
    """Un cambio de un campo: quien, cuando, valor antes y despues (HU-32).

    Solo se inserta. La base rechaza UPDATE y DELETE con un trigger, asi que
    nadie puede borrar el rastro desde la aplicacion.
    """

    __tablename__ = "auditoria_cambio"

    id: Mapped[int] = mapped_column(primary_key=True)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    entidad: Mapped[str] = mapped_column(String(20), nullable=False)
    entidad_id: Mapped[int] = mapped_column(Integer, nullable=False)
    # Como se llamaba el registro al momento del cambio ("Agua 600 ml (BEB-0002)").
    descripcion: Mapped[str] = mapped_column(String(200), nullable=False)
    campo: Mapped[str] = mapped_column(String(40), nullable=False)
    valor_antes: Mapped[str | None] = mapped_column(Text)
    valor_despues: Mapped[str | None] = mapped_column(Text)

    usuario: Mapped["Usuario | None"] = relationship()
