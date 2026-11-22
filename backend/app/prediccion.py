"""Motor predictivo de ventas e inventario (HU-25).

Todo se calcula con los datos de la propia base (venta, venta_item,
movimiento_inventario y producto). No llama a ninguna API externa ni usa
modelos generativos, asi que funciona igual en la nube que en un equipo del
cliente sin internet.

Hay dos partes:

1. Proyeccion de ventas: serie de tiempo con el total vendido por dia
   (solo ventas PAGADA; los dias sin ventas cuentan como 0). Se ajusta un
   modelo Holt-Winters (suavizamiento exponencial) de statsmodels. El modelo
   se "entrena" en cada consulta: con unos cientos de dias tarda milisegundos
   y asi siempre usa las ventas mas recientes, sin archivos de modelo que
   guardar ni versionar.

2. Inventario: reglas y un modelo de Poisson sobre la demanda de cada
   producto (dias de stock restantes, compra sugerida y baja rotacion).

Las funciones puras (sin base de datos) estan separadas de las consultas para
poder probarlas con datos sinteticos.
"""

from __future__ import annotations

import math
import warnings
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import numpy as np
from sqlalchemy import func, literal_column, select
from sqlalchemy.orm import Session

from app.models import MovimientoInventario, Producto, Venta, VentaItem

# Colombia no tiene horario de verano: UTC-5 fijo. Se usa un offset y no
# ZoneInfo para no depender del paquete tzdata en Windows. En SQL si se usa
# el nombre de la zona, que PostgreSQL trae en su propia base de datos.
# Va como literal y no como parametro: si la misma expresion aparece en el
# SELECT y en el GROUP BY con parametros distintos ($1, $2), PostgreSQL no las
# reconoce como iguales y rechaza la consulta.
ZONA_SQL = literal_column("'America/Bogota'")
ZONA = timezone(timedelta(hours=-5))

# --- Parametros de la proyeccion -------------------------------------------
HORIZONTES = (7, 15, 30)
MIN_DIAS_CON_VENTAS = 14  # por debajo no se proyecta: no se inventan valores
DIAS_ESTACIONALIDAD = 28  # 4 semanas: desde ahi se modela el patron semanal
DIAS_BACKTEST = 7
MAX_DIAS_HISTORIA = 365
DIAS_GRAFICO = 30
Z_95 = 1.96

# --- Parametros de inventario ----------------------------------------------
VENTANA_DEMANDA = 30
VENTANA_POISSON = 90
HORIZONTE_PROBABILIDAD = 30
UMBRAL_PROBABILIDAD = 0.20
MAX_DIAS_SIN_VENTA = 60
DIAS_COMPRA_RECIENTE = 15
DIAS_CRITICO = 3
DIAS_ADVERTENCIA = 7
COBERTURA_DEFECTO = 15
TIEMPO_ENTREGA_DEFECTO = 3


def hoy_local() -> date:
    return datetime.now(ZONA).date()


def _fecha_local(columna):
    """Fecha calendario en Bogota de una columna timestamptz."""
    return func.date(func.timezone(ZONA_SQL, columna))


# ===========================================================================
# Funciones puras: proyeccion de ventas
# ===========================================================================
def completar_serie(
    totales: dict[date, float], desde: date, hasta: date
) -> list[tuple[date, float]]:
    """Un valor por dia entre desde y hasta (incluidos); los dias sin ventas
    quedan en 0 para que el modelo vea tambien los dias flojos."""
    dias = (hasta - desde).days + 1
    return [
        (desde + timedelta(days=i), float(totales.get(desde + timedelta(days=i), 0)))
        for i in range(max(dias, 0))
    ]


def descripcion_modelo(n: int) -> str:
    if n >= DIAS_ESTACIONALIDAD:
        return (
            "Holt-Winters aditivo con tendencia amortiguada y estacionalidad "
            "semanal (7 dias)"
        )
    return "Holt-Winters con tendencia amortiguada, sin estacionalidad"


def _ajustar(valores: np.ndarray):
    """Entrena el modelo con la serie diaria y devuelve el resultado ajustado.

    - Tendencia aditiva amortiguada: sigue si las ventas suben o bajan, pero
      sin proyectar una recta infinita.
    - Estacionalidad semanal aditiva solo con 4 semanas o mas: con menos no
      hay suficientes repeticiones de cada dia de la semana. Es aditiva (no
      multiplicativa) porque la serie puede tener dias en 0.
    - Los parametros (alfa, beta, gamma, phi) los estima statsmodels
      minimizando el error cuadratico sobre la historia.
    """
    # Import tardio: statsmodels tarda en cargar y solo se necesita aqui.
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    estacional = len(valores) >= DIAS_ESTACIONALIDAD
    configuraciones = [
        {
            "trend": "add",
            "damped_trend": True,
            "seasonal": "add" if estacional else None,
            "seasonal_periods": 7 if estacional else None,
        },
        # Respaldo si la optimizacion falla con series muy cortas o planas.
        {"trend": None, "seasonal": None},
    ]
    ultimo_error = None
    for config in configuraciones:
        try:
            with warnings.catch_warnings():
                # Avisos de convergencia del optimizador: no son errores.
                warnings.simplefilter("ignore")
                modelo = ExponentialSmoothing(
                    valores, initialization_method="estimated", **config
                )
                return modelo.fit()
        except (ValueError, np.linalg.LinAlgError) as e:
            ultimo_error = e
    raise ultimo_error


def medir_error(reales: np.ndarray, estimados: np.ndarray) -> dict:
    """MAE en pesos y MAPE en porcentaje. El MAPE ignora los dias con venta
    real 0 (dividiria por cero); si todos son 0 queda en None."""
    diferencia = np.abs(reales - estimados)
    mae = float(diferencia.mean())
    con_ventas = reales > 0
    mape = (
        float((diferencia[con_ventas] / reales[con_ventas]).mean() * 100)
        if con_ventas.any()
        else None
    )
    return {
        "mae": round(mae, 2),
        "mape": None if mape is None else round(mape, 2),
        "dias_evaluados": len(reales),
    }


def backtest(valores: np.ndarray, dias: int = DIAS_BACKTEST) -> dict | None:
    """Entrena sin los ultimos `dias`, los pronostica y compara con lo que
    realmente se vendio. Es la forma honesta de medir el error: el modelo no
    vio esos dias al entrenar."""
    if len(valores) - dias < 10:
        return None
    entrenamiento, prueba = valores[:-dias], valores[-dias:]
    ajuste = _ajustar(entrenamiento)
    estimados = np.clip(np.asarray(ajuste.forecast(dias), dtype=float), 0, None)
    return medir_error(prueba, estimados)


def proyectar_ventas(serie: list[tuple[date, float]], dias: int) -> dict:
    """Proyeccion diaria para los `dias` siguientes al ultimo dia de la serie.

    El intervalo es aproximado al 95 %: estimado +/- 1.96 * sigma, donde sigma
    es la desviacion de los residuos del ajuste. Se abre con el horizonte
    (factor sqrt(1 + (h-1) * alfa^2) del suavizamiento exponencial): mientras
    mas lejos el dia, mas incertidumbre. Nada baja de 0.
    """
    valores = np.array([v for _, v in serie], dtype=float)
    dias_con_ventas = int((valores > 0).sum())
    resultado = {
        "datos_suficientes": False,
        "dias_historia": len(valores),
        "dias_con_ventas": dias_con_ventas,
        "modelo": None,
        "proyeccion": [],
        "error": None,
    }
    if dias_con_ventas < MIN_DIAS_CON_VENTAS:
        return resultado

    ajuste = _ajustar(valores)
    estimados = np.asarray(ajuste.forecast(dias), dtype=float)
    residuos = valores - np.asarray(ajuste.fittedvalues, dtype=float)
    sigma = float(np.sqrt(np.mean(residuos**2)))
    alfa = float(ajuste.params.get("smoothing_level") or 0)

    ultimo = serie[-1][0]
    proyeccion = []
    for h, estimado in enumerate(estimados, start=1):
        ancho = Z_95 * sigma * math.sqrt(1 + (h - 1) * alfa**2)
        valor = max(float(estimado), 0.0)
        proyeccion.append(
            {
                "fecha": ultimo + timedelta(days=h),
                "estimado": round(valor, 2),
                "inferior": round(max(valor - ancho, 0.0), 2),
                "superior": round(valor + ancho, 2),
            }
        )

    resultado.update(
        datos_suficientes=True,
        modelo=descripcion_modelo(len(valores)),
        proyeccion=proyeccion,
        error=backtest(valores),
    )
    return resultado


# ===========================================================================
# Funciones puras: inventario
# ===========================================================================
def demanda_diaria(unidades: float, ventana: int = VENTANA_DEMANDA) -> float:
    return float(unidades) / ventana


def dias_restantes(stock: float, demanda: float) -> float | None:
    """Cuantos dias alcanza el stock al ritmo actual. None si no se vende."""
    if demanda <= 0:
        return None
    return round(max(float(stock), 0.0) / demanda, 1)


def nivel_alerta(dias: float | None) -> str:
    if dias is None:
        return "normal"
    if dias <= DIAS_CRITICO:
        return "critico"
    if dias <= DIAS_ADVERTENCIA:
        return "advertencia"
    return "normal"


def cantidad_sugerida(
    demanda: float,
    stock_actual: float,
    stock_minimo: float,
    cobertura: int = COBERTURA_DEFECTO,
    tiempo_entrega: int = TIEMPO_ENTREGA_DEFECTO,
) -> int:
    """ceil(demanda * (cobertura + tiempo_entrega)) + stock_minimo - stock_actual.

    Lo que se vendera mientras llega el pedido y durante los dias que se
    quieren cubrir, mas el colchon del stock minimo, menos lo que ya hay.
    Se redondea antes del ceil para que 7.000000001 no se vuelva 8.
    """
    necesidad = math.ceil(round(demanda * (cobertura + tiempo_entrega), 6))
    cantidad = necesidad + int(stock_minimo) - int(stock_actual)
    return max(cantidad, 0)


def probabilidad_venta(
    unidades_90: float, horizonte: int = HORIZONTE_PROBABILIDAD
) -> float:
    """Probabilidad de vender al menos una unidad en `horizonte` dias.

    Modelo de Poisson: si en 90 dias se vendieron k unidades, la tasa diaria
    es lambda = k / 90 y en el horizonte se esperan lambda * horizonte ventas.
    P(al menos una) = 1 - P(cero) = 1 - e^(-lambda * horizonte).
    """
    tasa = float(unidades_90) / VENTANA_POISSON
    return 1 - math.exp(-tasa * horizonte)


def es_baja_rotacion(
    stock: float,
    probabilidad: float,
    dias_sin_venta: int | None,
    compra_reciente: bool,
) -> bool:
    """Tiene stock y (probabilidad < 20 % o mas de 60 dias sin venderse),
    salvo que haya entrado por compra hace poco: a esa mercancia todavia no
    le ha dado tiempo de venderse."""
    if stock <= 0 or compra_reciente:
        return False
    sin_movimiento = dias_sin_venta is not None and dias_sin_venta > MAX_DIAS_SIN_VENTA
    return probabilidad < UMBRAL_PROBABILIDAD or sin_movimiento


@dataclass
class DatosProducto:
    """Lo que la base sabe de un producto, ya agregado."""

    producto_id: int
    sku: str
    nombre: str
    unidad_medida: str
    stock_actual: int
    stock_minimo: int
    costo: float
    creado: date
    unidades_30: float = 0
    unidades_90: float = 0
    ultima_venta: date | None = None
    ultima_compra: date | None = None


def evaluar_producto(
    p: DatosProducto, hoy: date, cobertura: int, tiempo_entrega: int
) -> dict:
    demanda = demanda_diaria(p.unidades_30)
    dias = dias_restantes(p.stock_actual, demanda)
    probabilidad = probabilidad_venta(p.unidades_90)

    nunca_vendido = p.ultima_venta is None
    # Si nunca se ha vendido, cuenta desde que se creo el producto.
    referencia = p.creado if nunca_vendido else p.ultima_venta
    dias_sin_venta = max((hoy - referencia).days, 0) if referencia else None
    compra_reciente = (
        p.ultima_compra is not None
        and (hoy - p.ultima_compra).days <= DIAS_COMPRA_RECIENTE
    )

    return {
        "producto_id": p.producto_id,
        "sku": p.sku,
        "nombre": p.nombre,
        "unidad_medida": p.unidad_medida,
        "stock_actual": p.stock_actual,
        "stock_minimo": p.stock_minimo,
        "costo": round(p.costo, 2),
        "unidades_30d": round(float(p.unidades_30), 3),
        "demanda_diaria": round(demanda, 3),
        "dias_restantes": dias,
        "nivel_alerta": nivel_alerta(dias),
        "cantidad_sugerida": cantidad_sugerida(
            demanda, p.stock_actual, p.stock_minimo, cobertura, tiempo_entrega
        ),
        "probabilidad_venta_30d": round(probabilidad, 3),
        "dias_sin_venta": dias_sin_venta,
        "nunca_vendido": nunca_vendido,
        "compra_reciente": compra_reciente,
        "baja_rotacion": es_baja_rotacion(
            p.stock_actual, probabilidad, dias_sin_venta, compra_reciente
        ),
        "valor_inmovilizado": round(max(p.stock_actual, 0) * p.costo, 2),
    }


# ===========================================================================
# Consultas a la base
# ===========================================================================
def totales_diarios(db: Session, desde: date, hasta: date) -> dict[date, float]:
    """Total vendido por dia (hora de Bogota), solo ventas PAGADA."""
    dia = _fecha_local(Venta.fecha)
    filas = db.execute(
        select(dia, func.sum(Venta.total))
        .where(Venta.estado == "PAGADA", dia >= desde, dia <= hasta)
        .group_by(dia)
    ).all()
    return {f[0]: float(f[1]) for f in filas}


def serie_ventas(db: Session, hoy: date | None = None) -> list[tuple[date, float]]:
    """Serie diaria desde la primera venta (maximo un ano) hasta ayer.

    Hoy no entra: el dia todavia no termina y su total parcial haria creer al
    modelo que las ventas cayeron.
    """
    hoy = hoy or hoy_local()
    hasta = hoy - timedelta(days=1)
    primera = db.scalar(
        select(func.min(_fecha_local(Venta.fecha))).where(Venta.estado == "PAGADA")
    )
    if primera is None or primera > hasta:
        return []
    desde = max(primera, hasta - timedelta(days=MAX_DIAS_HISTORIA - 1))
    return completar_serie(totales_diarios(db, desde, hasta), desde, hasta)


def calcular_proyeccion(db: Session, dias: int) -> dict:
    serie = serie_ventas(db)
    resultado = proyectar_ventas(serie, dias)
    resultado["horizonte"] = dias
    resultado["minimo_dias_con_ventas"] = MIN_DIAS_CON_VENTAS
    resultado["historico"] = [
        {"fecha": f, "total": round(v, 2)} for f, v in serie[-DIAS_GRAFICO:]
    ]
    if not resultado["datos_suficientes"]:
        resultado["mensaje"] = (
            f"Hay {resultado['dias_con_ventas']} dia(s) con ventas y se "
            f"necesitan al menos {MIN_DIAS_CON_VENTAS} para proyectar."
        )
    else:
        resultado["mensaje"] = None
    return resultado


def datos_productos(db: Session, hoy: date) -> list[DatosProducto]:
    productos = db.scalars(
        select(Producto).where(Producto.activo.is_(True)).order_by(Producto.nombre)
    ).all()
    datos = {
        p.id: DatosProducto(
            producto_id=p.id,
            sku=p.sku,
            nombre=p.nombre,
            unidad_medida=p.unidad_medida,
            stock_actual=p.stock_actual,
            stock_minimo=p.stock_minimo,
            costo=float(p.costo or 0),
            creado=p.creado_en.date() if p.creado_en else hoy,
        )
        for p in productos
    }
    if not datos:
        return []

    dia = _fecha_local(Venta.fecha)
    pagadas = (
        select(VentaItem.producto_id)
        .join(Venta, Venta.id == VentaItem.venta_id)
        .where(Venta.estado == "PAGADA", VentaItem.producto_id.in_(list(datos)))
        .group_by(VentaItem.producto_id)
    )

    # Unidades en las ventanas de 30 y 90 dias (contando hoy) y ultima venta.
    inicio_30 = hoy - timedelta(days=VENTANA_DEMANDA - 1)
    inicio_90 = hoy - timedelta(days=VENTANA_POISSON - 1)

    def unidades_desde(inicio: date):
        return func.coalesce(func.sum(VentaItem.cantidad).filter(dia >= inicio), 0)

    filas = db.execute(
        pagadas.add_columns(
            unidades_desde(inicio_30), unidades_desde(inicio_90), func.max(dia)
        )
    ).all()
    for producto_id, u30, u90, ultima in filas:
        d = datos[producto_id]
        d.unidades_30, d.unidades_90, d.ultima_venta = float(u30), float(u90), ultima

    # Ultima entrada por compra, segun el kardex.
    compras = db.execute(
        select(
            MovimientoInventario.producto_id,
            func.max(_fecha_local(MovimientoInventario.fecha)),
        )
        .where(
            MovimientoInventario.tipo == "COMPRA",
            MovimientoInventario.producto_id.in_(list(datos)),
        )
        .group_by(MovimientoInventario.producto_id)
    ).all()
    for producto_id, ultima in compras:
        datos[producto_id].ultima_compra = ultima

    return list(datos.values())


def calcular_inventario(db: Session, cobertura: int, tiempo_entrega: int) -> dict:
    hoy = hoy_local()
    productos = [
        evaluar_producto(p, hoy, cobertura, tiempo_entrega)
        for p in datos_productos(db, hoy)
    ]
    baja = [p for p in productos if p["baja_rotacion"]]
    return {
        "generado_en": hoy,
        "cobertura": cobertura,
        "tiempo_entrega": tiempo_entrega,
        "resumen": {
            "productos": len(productos),
            "criticos": sum(p["nivel_alerta"] == "critico" for p in productos),
            "advertencias": sum(p["nivel_alerta"] == "advertencia" for p in productos),
            "por_comprar": sum(p["cantidad_sugerida"] > 0 for p in productos),
            "baja_rotacion": len(baja),
            "valor_inmovilizado": round(sum(p["valor_inmovilizado"] for p in baja), 2),
        },
        "productos": productos,
    }


def ventas_mensuales(db: Session, meses: int) -> list[dict]:
    """Total y numero de ventas PAGADA por mes, del mas antiguo al actual.
    Los meses sin ventas salen en 0 para que el grafico no tenga huecos."""
    hoy = hoy_local()
    anio, mes = hoy.year, hoy.month
    claves = []
    for _ in range(meses):
        claves.append(f"{anio:04d}-{mes:02d}")
        mes -= 1
        if mes == 0:
            anio, mes = anio - 1, 12
    claves.reverse()

    primer_dia = date(int(claves[0][:4]), int(claves[0][5:]), 1)
    clave = func.to_char(
        func.timezone(ZONA_SQL, Venta.fecha), literal_column("'YYYY-MM'")
    )
    filas = db.execute(
        select(clave, func.count(Venta.id), func.sum(Venta.total))
        .where(Venta.estado == "PAGADA", _fecha_local(Venta.fecha) >= primer_dia)
        .group_by(clave)
    ).all()
    por_mes = {f[0]: (int(f[1]), float(f[2])) for f in filas}
    resultado = []
    for c in claves:
        ventas, total = por_mes.get(c, (0, 0.0))
        resultado.append({"mes": c, "ventas": ventas, "total": round(total, 2)})
    return resultado
