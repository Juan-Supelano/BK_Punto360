"""IA predictiva (HU-25).

Las pruebas de calculo usan datos sinteticos y no necesitan base de datos.
Las de la API (permisos y respuesta con los datos semilla) requieren
TEST_DATABASE_URL, como el resto de pruebas de endpoints.
"""

import math
from datetime import date, timedelta

import numpy as np
import pytest

from app import prediccion as p

# Lunes a domingo: fin de semana fuerte, como una tienda de barrio.
PATRON_SEMANAL = [100_000, 90_000, 95_000, 110_000, 160_000, 220_000, 180_000]


def serie_sintetica(dias: int, inicio: date = date(2026, 6, 1), ruido: float = 0.0):
    rng = np.random.default_rng(42)
    totales = {}
    for i in range(dias):
        base = PATRON_SEMANAL[(inicio + timedelta(days=i)).weekday()]
        totales[inicio + timedelta(days=i)] = base * (1 + rng.normal(0, ruido))
    return p.completar_serie(totales, inicio, inicio + timedelta(days=dias - 1))


# --- Serie diaria -------------------------------------------------------------
def test_completar_serie_rellena_dias_sin_ventas_con_cero():
    serie = p.completar_serie(
        {date(2026, 1, 1): 500.0, date(2026, 1, 4): 300.0},
        date(2026, 1, 1),
        date(2026, 1, 5),
    )
    assert [v for _, v in serie] == [500.0, 0, 0, 300.0, 0]
    assert serie[-1][0] == date(2026, 1, 5)


def test_medir_error_mae_y_mape():
    error = p.medir_error(np.array([100.0, 200.0, 0.0]), np.array([110.0, 180.0, 5.0]))
    assert error["mae"] == pytest.approx((10 + 20 + 5) / 3, abs=0.01)
    # El dia con venta real 0 no entra al MAPE.
    assert error["mape"] == pytest.approx((0.10 + 0.10) / 2 * 100, abs=0.01)
    assert error["dias_evaluados"] == 3


def test_con_menos_de_14_dias_con_ventas_no_proyecta():
    # 30 dias de historia, pero solo 10 con ventas.
    totales = {date(2026, 3, 1) + timedelta(days=i * 3): 50_000.0 for i in range(10)}
    serie = p.completar_serie(totales, date(2026, 3, 1), date(2026, 3, 30))
    resultado = p.proyectar_ventas(serie, 7)
    assert resultado["datos_suficientes"] is False
    assert resultado["dias_con_ventas"] == 10
    assert resultado["proyeccion"] == []
    assert resultado["error"] is None


# --- Holt-Winters (necesita statsmodels) --------------------------------------
@pytest.mark.parametrize("dias", p.HORIZONTES)
def test_proyeccion_con_patron_semanal(dias):
    pytest.importorskip("statsmodels")
    serie = serie_sintetica(84, ruido=0.03)
    resultado = p.proyectar_ventas(serie, dias)

    assert resultado["datos_suficientes"] is True
    assert "semanal" in resultado["modelo"]
    assert len(resultado["proyeccion"]) == dias
    assert resultado["proyeccion"][0]["fecha"] == serie[-1][0] + timedelta(days=1)
    for punto in resultado["proyeccion"]:
        assert 0 <= punto["inferior"] <= punto["estimado"] <= punto["superior"]

    # Con un patron tan claro el backtesting debe acertar bastante.
    assert resultado["error"]["dias_evaluados"] == 7
    assert resultado["error"]["mape"] < 15

    # El sabado (mas alto) debe quedar por encima del lunes (mas bajo).
    por_dia = {pt["fecha"].weekday(): pt["estimado"] for pt in resultado["proyeccion"][:7]}
    assert por_dia[5] > por_dia[0]


def test_proyeccion_corta_sin_estacionalidad():
    pytest.importorskip("statsmodels")
    serie = serie_sintetica(20, ruido=0.05)
    resultado = p.proyectar_ventas(serie, 7)
    assert resultado["datos_suficientes"] is True
    assert "sin estacionalidad" in resultado["modelo"]
    assert len(resultado["proyeccion"]) == 7


def test_el_intervalo_se_abre_con_el_horizonte():
    pytest.importorskip("statsmodels")
    resultado = p.proyectar_ventas(serie_sintetica(84, ruido=0.08), 30)
    anchos = [pt["superior"] - pt["inferior"] for pt in resultado["proyeccion"]]
    assert anchos[-1] >= anchos[0]


# --- Inventario ---------------------------------------------------------------
def test_dias_restantes_y_nivel_de_alerta():
    assert p.dias_restantes(30, 10) == 3.0
    assert p.nivel_alerta(3.0) == "critico"
    assert p.nivel_alerta(p.dias_restantes(60, 10)) == "advertencia"
    assert p.nivel_alerta(p.dias_restantes(100, 10)) == "normal"
    # Sin ventas no se puede calcular: null y sin alerta.
    assert p.dias_restantes(30, 0) is None
    assert p.nivel_alerta(None) == "normal"
    # Agotado y con demanda: critico.
    assert p.nivel_alerta(p.dias_restantes(0, 2)) == "critico"


def test_demanda_diaria_es_unidades_de_30_dias_entre_30():
    assert p.demanda_diaria(60) == 2.0


def test_cantidad_sugerida():
    # ceil(2 * (15 + 3)) + 5 - 10 = 31
    assert p.cantidad_sugerida(2.0, stock_actual=10, stock_minimo=5) == 31
    # Parametros propios: ceil(0.5 * (7 + 2)) + 0 - 1 = 4
    assert p.cantidad_sugerida(0.5, 1, 0, cobertura=7, tiempo_entrega=2) == 4
    # Con stock de sobra no se sugiere nada (nunca negativo).
    assert p.cantidad_sugerida(1.0, stock_actual=500, stock_minimo=5) == 0
    # 7/30 * 30 da 7.000000000000001 en coma flotante: debe ser 7, no 8.
    assert p.cantidad_sugerida(7 / 30, 0, 0, cobertura=27, tiempo_entrega=3) == 7


def test_probabilidad_de_venta_poisson():
    # 90 unidades en 90 dias -> lambda = 1/dia -> P = 1 - e^-30
    assert p.probabilidad_venta(90) == pytest.approx(1 - math.exp(-30))
    # 3 unidades en 90 dias -> lambda*30 = 1 -> P = 1 - e^-1 ~ 63 %
    assert p.probabilidad_venta(3) == pytest.approx(1 - math.exp(-1))
    # Sin ventas, probabilidad 0.
    assert p.probabilidad_venta(0) == 0
    # 0.5 unidades en 90 dias -> ~15 %, por debajo del umbral del 20 %.
    assert p.probabilidad_venta(0.5) < p.UMBRAL_PROBABILIDAD


def test_reglas_de_baja_rotacion():
    assert p.es_baja_rotacion(10, 0.05, 20, compra_reciente=False) is True
    assert p.es_baja_rotacion(10, 0.90, 61, compra_reciente=False) is True
    assert p.es_baja_rotacion(10, 0.90, 10, compra_reciente=False) is False
    # Sin stock no hay nada inmovilizado.
    assert p.es_baja_rotacion(0, 0.0, 200, compra_reciente=False) is False
    # Recien comprado: todavia no ha tenido tiempo de venderse.
    assert p.es_baja_rotacion(10, 0.0, 200, compra_reciente=True) is False


def test_evaluar_producto_completo():
    hoy = date(2026, 11, 21)
    datos = p.DatosProducto(
        producto_id=1,
        sku="BEB-0001",
        nombre="Gaseosa",
        unidad_medida="UND",
        stock_actual=8,
        stock_minimo=4,
        costo=1500.0,
        creado=date(2026, 1, 1),
        unidades_30=60,
        unidades_90=180,
        ultima_venta=hoy - timedelta(days=1),
        ultima_compra=hoy - timedelta(days=40),
    )
    r = p.evaluar_producto(datos, hoy, cobertura=15, tiempo_entrega=3)
    assert r["demanda_diaria"] == 2.0
    assert r["dias_restantes"] == 4.0
    assert r["nivel_alerta"] == "advertencia"
    assert r["cantidad_sugerida"] == 36 + 4 - 8
    assert r["baja_rotacion"] is False
    assert r["dias_sin_venta"] == 1
    assert r["valor_inmovilizado"] == 12_000.0


def test_producto_quieto_es_baja_rotacion():
    hoy = date(2026, 11, 21)
    datos = p.DatosProducto(
        producto_id=2,
        sku="ASE-0003",
        nombre="Cera para pisos",
        unidad_medida="UND",
        stock_actual=12,
        stock_minimo=2,
        costo=9000.0,
        creado=date(2026, 1, 1),
        unidades_30=0,
        unidades_90=0,
        ultima_venta=hoy - timedelta(days=75),
    )
    r = p.evaluar_producto(datos, hoy, cobertura=15, tiempo_entrega=3)
    assert r["dias_restantes"] is None
    assert r["probabilidad_venta_30d"] == 0
    assert r["dias_sin_venta"] == 75
    assert r["baja_rotacion"] is True
    assert r["valor_inmovilizado"] == 108_000.0
    assert r["cantidad_sugerida"] == 0


# --- API (requiere TEST_DATABASE_URL) ------------------------------------------
@pytest.mark.parametrize(
    "ruta", ["/prediccion/ventas?dias=7", "/prediccion/inventario", "/prediccion/ventas-mensuales"]
)
def test_sin_token_responde_401(client, ruta):
    assert client.get(ruta).status_code == 401


@pytest.mark.parametrize(
    "ruta", ["/prediccion/ventas?dias=7", "/prediccion/inventario", "/prediccion/ventas-mensuales"]
)
def test_cajero_responde_403(client, cajero, ruta):
    assert client.get(ruta, headers=cajero).status_code == 403


def test_horizonte_invalido_responde_422(client, admin):
    assert client.get("/prediccion/ventas?dias=10", headers=admin).status_code == 422


def test_semilla_no_alcanza_para_proyectar(client, admin):
    # Los datos semilla solo tienen ventas en dos dias.
    r = client.get("/prediccion/ventas?dias=15", headers=admin)
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["datos_suficientes"] is False
    assert cuerpo["proyeccion"] == []
    assert cuerpo["horizonte"] == 15
    assert cuerpo["mensaje"]


def test_inventario_trae_los_productos_activos(client, admin):
    r = client.get("/prediccion/inventario?cobertura=10&tiempo_entrega=2", headers=admin)
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["cobertura"] == 10 and cuerpo["tiempo_entrega"] == 2
    assert cuerpo["productos"], "la semilla tiene productos activos"
    for prod in cuerpo["productos"]:
        assert prod["nivel_alerta"] in ("critico", "advertencia", "normal")
        assert prod["cantidad_sugerida"] >= 0
        assert 0 <= prod["probabilidad_venta_30d"] <= 1


def test_metricas_del_modulo_en_metrics(client, admin):
    client.get("/prediccion/inventario", headers=admin)
    texto = client.get("/metrics").text
    assert "punto360_prediccion_calculos_total" in texto
    assert "punto360_prediccion_duracion_segundos_bucket" in texto
