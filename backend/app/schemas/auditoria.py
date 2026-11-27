from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UsuarioAuditoria(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    rol: str


class CambioLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fecha: datetime
    usuario: UsuarioAuditoria | None
    entidad: str
    entidad_id: int
    descripcion: str
    campo: str
    valor_antes: str | None
    valor_despues: str | None


class PaginaAuditoria(BaseModel):
    total: int
    pagina: int
    por_pagina: int
    items: list[CambioLeer]
