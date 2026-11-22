"""Consulta del registro de auditoria (HU-32). Solo ADMIN y solo lectura:
no hay endpoints para editar ni borrar cambios."""

from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import AuditoriaCambio
from app.schemas.auditoria import PaginaAuditoria
from app.seguridad import requerir_password_actualizada, solo_admin
from app.texto import columna_plana, patron

router = APIRouter(
    prefix="/auditoria",
    tags=["Auditoria"],
    dependencies=[Depends(requerir_password_actualizada), Depends(solo_admin)],
)


@router.get("", response_model=PaginaAuditoria)
def listar(
    desde: date | None = None,
    hasta: date | None = None,
    usuario_id: int | None = None,
    entidad: str | None = Query(default=None, description="producto, usuario o comercio"),
    campo: str | None = None,
    buscar: str | None = Query(default=None, description="Texto en el nombre del registro"),
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Cambios del mas reciente al mas antiguo, con filtros y paginacion."""
    filtros = []
    if desde:
        filtros.append(AuditoriaCambio.fecha >= datetime.combine(desde, time.min))
    if hasta:
        filtros.append(AuditoriaCambio.fecha <= datetime.combine(hasta, time.max))
    if usuario_id:
        filtros.append(AuditoriaCambio.usuario_id == usuario_id)
    if entidad:
        filtros.append(AuditoriaCambio.entidad == entidad)
    if campo:
        filtros.append(AuditoriaCambio.campo == campo)
    if buscar and buscar.strip():
        filtros.append(columna_plana(AuditoriaCambio.descripcion).like(patron(buscar)))

    total = db.scalar(select(func.count(AuditoriaCambio.id)).where(*filtros))
    items = db.scalars(
        select(AuditoriaCambio)
        .options(selectinload(AuditoriaCambio.usuario))
        .where(*filtros)
        .order_by(AuditoriaCambio.fecha.desc(), AuditoriaCambio.id.desc())
        .offset((pagina - 1) * por_pagina)
        .limit(por_pagina)
    ).all()
    return {"total": total, "pagina": pagina, "por_pagina": por_pagina, "items": items}
