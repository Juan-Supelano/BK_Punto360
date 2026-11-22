"""Registro de auditoria (HU-32). Requiere TEST_DATABASE_URL."""

import uuid

from conftest import _crear_usuario


def _categoria(client, headers):
    return client.get("/categorias", headers=headers).json()[0]["id"]


def _producto(client, headers):
    r = client.post(
        "/productos",
        json={
            "nombre": f"Auditado {uuid.uuid4().hex[:6]}",
            "precio_venta": "1000",
            "categoria_id": _categoria(client, headers),
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


def _cambios(client, admin, **filtros):
    r = client.get("/auditoria", params={"por_pagina": 200, **filtros}, headers=admin)
    assert r.status_code == 200, r.text
    return r.json()["items"]


def test_sin_token_401_y_cajero_403(client, cajero):
    assert client.get("/auditoria").status_code == 401
    assert client.get("/auditoria", headers=cajero).status_code == 403


def test_cambio_de_precio_y_codigo_queda_registrado_con_quien(client, admin, cajero):
    producto = _producto(client, admin)
    codigo = "77" + str(uuid.uuid4().int)[:11]

    # Lo cambia el cajero: tiene que quedar a su nombre.
    r = client.put(
        f"/productos/{producto['id']}",
        json={"precio_venta": "800", "codigo_barras": codigo},
        headers=cajero,
    )
    assert r.status_code == 200, r.text

    cambios = {c["campo"]: c for c in _cambios(client, admin, entidad="producto", buscar=producto["nombre"])}
    assert cambios["precio_venta"]["valor_antes"] == "1000"
    assert cambios["precio_venta"]["valor_despues"] == "800"
    assert cambios["codigo_barras"]["valor_antes"] is None
    assert cambios["codigo_barras"]["valor_despues"] == codigo
    assert cambios["precio_venta"]["usuario"]["rol"] == "CAJERO"


def test_guardar_sin_cambios_no_registra_nada(client, admin):
    producto = _producto(client, admin)
    client.put(f"/productos/{producto['id']}", json={"precio_venta": "1000.00"}, headers=admin)
    assert _cambios(client, admin, entidad="producto", buscar=producto["nombre"]) == []


def test_desactivar_y_reactivar_producto(client, admin):
    producto = _producto(client, admin)
    client.delete(f"/productos/{producto['id']}", headers=admin)
    client.post(f"/productos/{producto['id']}/reactivar", headers=admin)

    cambios = _cambios(client, admin, entidad="producto", campo="activo", buscar=producto["nombre"])
    # Del mas reciente al mas antiguo.
    assert [(c["valor_antes"], c["valor_despues"]) for c in cambios] == [("No", "Sí"), ("Sí", "No")]


def test_cambio_de_iva_en_mi_empresa(client, admin):
    actual = client.get("/auth/comercio", headers=admin).json()["iva_pct"]
    nuevo = "18" if float(actual) != 18 else "17"
    client.put("/auth/comercio", json={"iva_pct": nuevo}, headers=admin)
    client.put("/auth/comercio", json={"iva_pct": actual}, headers=admin)  # se deja como estaba

    cambios = _cambios(client, admin, entidad="comercio", campo="iva_pct")
    assert cambios[0]["valor_antes"] == nuevo
    assert cambios[1]["valor_despues"] == nuevo


def test_contrasena_reiniciada_queda_registrada(client, admin):
    # Un usuario propio: reiniciarle la clave a otro dejaria su token bloqueado.
    email = _crear_usuario("CAJERO")
    usuarios = client.get("/usuarios", headers=admin).json()
    cajero = next(u for u in usuarios if u["email"] == email)
    r = client.post(f"/usuarios/{cajero['id']}/resetear-password", headers=admin)
    assert r.status_code == 200, r.text

    cambios = _cambios(client, admin, entidad="usuario", campo="contrasena")
    assert cambios[0]["entidad_id"] == cajero["id"]
    assert cambios[0]["valor_despues"] == "Reiniciada"
