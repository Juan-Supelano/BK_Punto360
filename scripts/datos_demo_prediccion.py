"""Genera un historial de ventas sintetico para probar el informe predictivo.

Solo para una base LOCAL de desarrollo o demo: consume numeros de factura y
llena la base con ventas que no ocurrieron. Nunca contra la base de la nube.

Crea ventas PAGADA (con sus items) en los ultimos N dias, con mas ventas el
fin de semana, una tendencia leve al alza y productos que se venden mucho,
poco o nada, para que salgan alertas, compras sugeridas y baja rotacion.

No toca el stock ni escribe kardex: el modelo solo lee venta y venta_item, y
asi el inventario actual de la base queda igual. Todas las ventas llevan la
marca "DATOS DEMO" en observaciones y se borran con --borrar.

Uso (desde la carpeta backend, con el .venv activo):

    python ../scripts/datos_demo_prediccion.py --dias 120 --confirmar
    python ../scripts/datos_demo_prediccion.py --borrar --confirmar
"""

import argparse
import random
import sys
from datetime import datetime, time, timedelta
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import delete, select  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.impuestos import desglosar  # noqa: E402
from app.models import Producto, Usuario, Venta, VentaItem  # noqa: E402
from app.prediccion import ZONA, hoy_local  # noqa: E402

MARCA = "DATOS DEMO (prediccion)"
# Lunes a domingo.
FACTOR_DIA = [0.8, 0.75, 0.8, 0.9, 1.2, 1.6, 1.3]
METODOS = ["EFECTIVO"] * 6 + ["TARJETA"] * 3 + ["TRANSFERENCIA"]


def borrar(db) -> int:
    ids = select(Venta.id).where(Venta.observaciones == MARCA)
    db.execute(delete(VentaItem).where(VentaItem.venta_id.in_(ids)))
    borradas = db.execute(delete(Venta).where(Venta.observaciones == MARCA)).rowcount
    db.commit()
    return borradas


def generar(db, dias: int, ventas_por_dia: float, semilla: int) -> int:
    rng = random.Random(semilla)
    productos = db.scalars(
        select(Producto).where(Producto.activo.is_(True)).order_by(Producto.id)
    ).all()
    cajeros = db.scalars(
        select(Usuario).where(Usuario.rol == "CAJERO", Usuario.activo.is_(True))
    ).all()
    if not productos or not cajeros:
        sys.exit("Hace falta al menos un producto activo y un cajero activo.")

    # Popularidad: unos pocos muy vendidos, la mayoria normales y ~20 % quietos.
    pesos = []
    for _ in productos:
        r = rng.random()
        pesos.append(0 if r < 0.2 else 0.05 if r < 0.3 else rng.lognormvariate(0, 0.9))
    if not any(pesos):
        pesos[0] = 1

    hoy = hoy_local()
    creadas = 0
    for i in range(dias, 0, -1):
        dia = hoy - timedelta(days=i)
        tendencia = 1 + 0.002 * (dias - i)
        media = ventas_por_dia * FACTOR_DIA[dia.weekday()] * tendencia
        # Aproximacion normal de una Poisson, sin numpy.
        cantidad_ventas = max(0, round(rng.gauss(media, media**0.5)))

        for _ in range(cantidad_ventas):
            hora = time(rng.randint(8, 20), rng.randint(0, 59), rng.randint(0, 59))
            fecha = datetime.combine(dia, hora, tzinfo=ZONA)
            elegidos = set()
            for _ in range(rng.choice([1, 1, 2, 2, 3, 4])):
                elegidos.add(rng.choices(range(len(productos)), weights=pesos)[0])

            venta = Venta(
                fecha=fecha,
                creado_en=fecha,
                subtotal=Decimal("0"),
                total_iva=Decimal("0"),
                total=Decimal("0"),
                metodo_pago=rng.choice(METODOS),
                precio_incluye_iva=True,
                estado="PAGADA",
                observaciones=MARCA,
                usuario_id=rng.choice(cajeros).id,
            )
            subtotal = iva = Decimal("0")
            for indice in elegidos:
                p = productos[indice]
                unidades = rng.choice([1, 1, 1, 2, 2, 3])
                sub, iva_l, tot = desglosar(p.precio_venta, unidades, p.iva_pct, True)
                venta.items.append(
                    VentaItem(
                        producto_id=p.id,
                        cantidad=Decimal(unidades),
                        precio_unitario=p.precio_venta,
                        iva_pct=p.iva_pct,
                        subtotal_linea=sub,
                        iva_linea=iva_l,
                        total_linea=tot,
                    )
                )
                subtotal += sub
                iva += iva_l
            venta.subtotal, venta.total_iva, venta.total = subtotal, iva, subtotal + iva
            db.add(venta)
            creadas += 1

        db.commit()  # un commit por dia
    return creadas


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dias", type=int, default=120)
    parser.add_argument("--ventas-por-dia", type=float, default=25)
    parser.add_argument("--semilla", type=int, default=360)
    parser.add_argument("--borrar", action="store_true", help="Quita las ventas demo")
    parser.add_argument(
        "--confirmar", action="store_true", help="Obligatorio: modifica la base"
    )
    args = parser.parse_args()

    if not args.confirmar:
        sys.exit("Agrega --confirmar. Este script escribe en la base del .env.")

    with SessionLocal() as db:
        if args.borrar:
            print(f"Ventas demo borradas: {borrar(db)}")
        else:
            total = generar(db, args.dias, args.ventas_por_dia, args.semilla)
            print(f"Ventas demo creadas: {total} en {args.dias} dias")


if __name__ == "__main__":
    main()
