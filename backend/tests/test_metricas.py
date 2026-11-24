"""Métricas HTTP y readiness (HU-24).

Las pruebas de métricas no necesitan base de datos: usan rutas públicas y
rutas protegidas que responden 401 antes de consultarla.
"""

import os

import pytest
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY

from app.main import app

PETICIONES = "punto360_http_peticiones_total"


def _contador(metodo: str, ruta: str, estado: str) -> float:
    valor = REGISTRY.get_sample_value(
        PETICIONES, {"metodo": metodo, "ruta": ruta, "estado": estado}
    )
    return valor or 0.0


@pytest.fixture(scope="module")
def cliente():
    with TestClient(app) as c:
        yield c


def test_cuenta_las_peticiones_por_ruta_y_estado(cliente):
    antes = _contador("GET", "/", "200")
    assert cliente.get("/").status_code == 200
    assert _contador("GET", "/", "200") == antes + 1


def test_usa_la_plantilla_de_la_ruta_y_no_el_id(cliente):
    plantilla = "/productos/{producto_id}/reactivar"
    antes = _contador("POST", plantilla, "401")
    assert cliente.post("/productos/123/reactivar").status_code == 401
    assert cliente.post("/productos/456/reactivar").status_code == 401
    assert _contador("POST", plantilla, "401") == antes + 2


def test_rutas_inexistentes_se_agrupan(cliente):
    antes = _contador("GET", "sin_ruta", "404")
    assert cliente.get("/no-existe/987").status_code == 404
    assert _contador("GET", "sin_ruta", "404") == antes + 1


def test_mide_la_latencia(cliente):
    filtro = {"metodo": "GET", "ruta": "/"}
    antes = REGISTRY.get_sample_value("punto360_http_duracion_segundos_count", filtro) or 0
    cliente.get("/")
    despues = REGISTRY.get_sample_value("punto360_http_duracion_segundos_count", filtro)
    assert despues == antes + 1


def test_metrics_publica_las_tres_metricas_sin_token(cliente):
    cliente.get("/")
    r = cliente.get("/metrics")
    assert r.status_code == 200
    assert "punto360_http_peticiones_total" in r.text
    assert "punto360_http_duracion_segundos_bucket" in r.text
    assert "punto360_http_peticiones_en_curso" in r.text
    # Siguen saliendo las del módulo predictivo (HU-26), mismo registro.
    assert "punto360_prediccion_calculos_total" in r.text


def test_metrics_y_probes_no_se_cuentan(cliente):
    cliente.get("/metrics")
    cliente.get("/salud")
    assert _contador("GET", "/metrics", "200") == 0
    assert _contador("GET", "/salud", "200") == 0


def test_no_hay_peticiones_en_curso_al_terminar(cliente):
    cliente.get("/")
    assert REGISTRY.get_sample_value("punto360_http_peticiones_en_curso") == 0


@pytest.mark.skipif(
    bool(os.environ.get("TEST_DATABASE_URL")),
    reason="con base de datos /listo responde 200 (test_listo_con_base)",
)
def test_listo_sin_base_responde_503(cliente):
    r = cliente.get("/listo")
    assert r.status_code == 503


def test_listo_con_base(client):
    # Fixture "client" de conftest: se omite si no hay TEST_DATABASE_URL.
    r = client.get("/listo")
    assert r.status_code == 200
    assert r.json() == {"estado": "ok"}
