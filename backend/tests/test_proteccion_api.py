"""Protección de la API (HU-22).

Toda operación que crea, cambia o borra datos exige un token válido.
Estas pruebas no necesitan base de datos: la petición se rechaza en la
dependencia de seguridad, antes de la primera consulta.
"""

import base64
import json
import re
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

ESCRITURA = {"POST", "PUT", "PATCH", "DELETE"}

# Las únicas escrituras que se permiten sin token.
PUBLICAS = {("POST", "/auth/login")}


def _rutas_de_escritura() -> list[tuple[str, str]]:
    rutas = []
    for ruta in app.routes:
        if isinstance(ruta, APIRoute):
            for metodo in sorted(ruta.methods & ESCRITURA):
                if (metodo, ruta.path) not in PUBLICAS:
                    rutas.append((metodo, ruta.path))
    return rutas


def _url(path: str) -> str:
    """/productos/{producto_id} -> /productos/1"""
    return re.sub(r"\{[^}]+\}", "1", path)


def _b64(datos: dict) -> str:
    crudo = json.dumps(datos).encode()
    return base64.urlsafe_b64encode(crudo).rstrip(b"=").decode()


@pytest.fixture(scope="module")
def cliente():
    with TestClient(app) as c:
        yield c


def test_la_api_tiene_rutas_de_escritura():
    # Si esta lista quedara vacía, la prueba siguiente no probaría nada.
    assert len(_rutas_de_escritura()) > 20


@pytest.mark.parametrize("metodo,ruta", _rutas_de_escritura())
def test_escritura_sin_token_da_401(cliente, metodo, ruta):
    r = cliente.request(metodo, _url(ruta))
    assert r.status_code == 401, f"{metodo} {ruta} respondió {r.status_code}"


def test_token_firmado_con_otra_llave_da_401(cliente):
    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
    token = jwt.encode({"sub": "1", "exp": exp}, "otra-llave-" * 4, algorithm="HS256")
    r = cliente.post("/categorias", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_token_sin_vencimiento_da_401(cliente):
    token = jwt.encode({"sub": "1"}, settings.jwt_secreto, algorithm=settings.jwt_algoritmo)
    r = cliente.post("/categorias", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_token_vencido_da_401(cliente):
    exp = datetime.now(timezone.utc) - timedelta(minutes=1)
    token = jwt.encode({"sub": "1", "exp": exp}, settings.jwt_secreto, algorithm=settings.jwt_algoritmo)
    r = cliente.post("/categorias", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
    assert "expiro" in r.json()["detail"]


def test_token_sin_firma_alg_none_da_401(cliente):
    exp = int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp())
    token = f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{_b64({'sub': '1', 'exp': exp})}."
    r = cliente.post("/categorias", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_sub_que_no_es_un_id_da_401(cliente):
    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
    token = jwt.encode({"sub": "admin", "exp": exp}, settings.jwt_secreto, algorithm=settings.jwt_algoritmo)
    r = cliente.post("/categorias", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
