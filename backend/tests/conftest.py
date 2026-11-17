"""Configuración compartida de las pruebas (HU-11).

Las pruebas de impuestos no necesitan base de datos.

Las pruebas de API corren contra una base PostgreSQL de PRUEBA, cargada con
database/schema.sql y database/seed.sql. Se activan definiendo la variable
TEST_DATABASE_URL; si no existe, se omiten. Así nadie corre las pruebas por
error contra su base de desarrollo, porque crean usuarios y compras.
"""

import os
import uuid

import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

# La configuración se lee al importar app, así que hay que fijar la URL antes.
if TEST_DATABASE_URL:
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL

PASSWORD = "PruebaSegura123"


def _requiere_bd():
    if not TEST_DATABASE_URL:
        pytest.skip("Define TEST_DATABASE_URL para correr las pruebas de API")


@pytest.fixture(scope="session")
def client():
    _requiere_bd()
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


def _crear_usuario(rol: str, debe_cambiar_password: bool = False) -> str:
    """Inserta un usuario de prueba con contraseña conocida y devuelve su correo."""
    from app.database import SessionLocal
    from app.models import Usuario
    from app.seguridad import hashear

    email = f"test-{rol.lower()}-{uuid.uuid4().hex[:8]}@pruebas.co"
    with SessionLocal() as db:
        db.add(
            Usuario(
                email=email,
                nombre=f"Prueba {rol}",
                password_hash=hashear(PASSWORD),
                rol=rol,
                activo=True,
                comercio_id=1,
                debe_cambiar_password=debe_cambiar_password,
            )
        )
        db.commit()
    return email


def _token(client, email: str) -> dict:
    r = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin_email(client):
    return _crear_usuario("ADMIN")


@pytest.fixture(scope="session")
def cajero_email(client):
    return _crear_usuario("CAJERO")


@pytest.fixture(scope="session")
def admin(client, admin_email):
    return _token(client, admin_email)


@pytest.fixture(scope="session")
def cajero(client, cajero_email):
    return _token(client, cajero_email)


@pytest.fixture(scope="session")
def temporal(client):
    """Usuario con contraseña temporal: solo puede iniciar sesión y cambiarla."""
    return _token(client, _crear_usuario("CAJERO", debe_cambiar_password=True))
