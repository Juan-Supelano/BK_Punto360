"""Login y control de roles (HU-07). Requiere TEST_DATABASE_URL."""

import jwt

from conftest import PASSWORD


def test_login_valido_devuelve_token_con_rol(client, admin_email):
    r = client.post("/auth/login", json={"email": admin_email, "password": PASSWORD})
    assert r.status_code == 200
    datos = r.json()
    assert datos["usuario"]["rol"] == "ADMIN"
    assert datos["expira_en"] > 0

    from app.config import settings

    cuerpo = jwt.decode(datos["access_token"], settings.jwt_secreto, algorithms=[settings.jwt_algoritmo])
    assert cuerpo["rol"] == "ADMIN"
    assert "exp" in cuerpo


def test_login_con_correo_en_mayusculas(client, admin_email):
    r = client.post("/auth/login", json={"email": admin_email.upper(), "password": PASSWORD})
    assert r.status_code == 200


def test_password_incorrecta_da_401(client, admin_email):
    r = client.post("/auth/login", json={"email": admin_email, "password": "otra-clave"})
    assert r.status_code == 401


def test_correo_inexistente_da_401(client):
    r = client.post("/auth/login", json={"email": "nadie@pruebas.co", "password": PASSWORD})
    assert r.status_code == 401


def test_sin_token_da_401(client):
    assert client.get("/auth/yo").status_code == 401


def test_token_invalido_da_401(client):
    r = client.get("/auth/yo", headers={"Authorization": "Bearer no-es-un-token"})
    assert r.status_code == 401


def test_yo_devuelve_el_usuario_del_token(client, cajero, cajero_email):
    r = client.get("/auth/yo", headers=cajero)
    assert r.status_code == 200
    assert r.json()["email"] == cajero_email


def test_cajero_no_puede_registrar_compras(client, cajero):
    compra = {
        "proveedor_id": 1,
        "numero_factura": "NO-DEBE-GUARDARSE",
        "items": [{"producto_id": 1, "cantidad": 1, "costo_unitario": 100}],
    }
    r = client.post("/compras", json=compra, headers=cajero)
    assert r.status_code == 403


def test_contrasena_temporal_bloquea_el_negocio(client, temporal):
    assert client.get("/productos/1", headers=temporal).status_code == 403
