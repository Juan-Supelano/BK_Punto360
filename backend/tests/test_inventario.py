"""Movimientos de stock por compras (HU-08). Requiere TEST_DATABASE_URL.

Las pruebas de descuento de stock al vender se agregan cuando llegue HU-13.
"""

import uuid

PRODUCTO = 1
PROVEEDOR = 1


def _stock(client, headers):
    r = client.get(f"/productos/{PRODUCTO}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["stock_actual"]


def _compra(cantidad):
    return {
        "proveedor_id": PROVEEDOR,
        "numero_factura": f"TEST-{uuid.uuid4().hex[:10]}",
        "items": [{"producto_id": PRODUCTO, "cantidad": cantidad, "costo_unitario": "1000"}],
    }


def test_compra_suma_stock_y_anularla_lo_devuelve(client, admin):
    antes = _stock(client, admin)

    r = client.post("/compras", json=_compra(5), headers=admin)
    assert r.status_code == 201, r.text
    compra = r.json()
    assert compra["estado"] == "RECIBIDA"
    assert _stock(client, admin) == antes + 5

    r = client.post(f"/compras/{compra['id']}/anular", json={"motivo": "prueba"}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "ANULADA"
    assert _stock(client, admin) == antes


def test_no_se_anula_dos_veces(client, admin):
    r = client.post("/compras", json=_compra(1), headers=admin)
    assert r.status_code == 201, r.text
    compra_id = r.json()["id"]

    assert client.post(f"/compras/{compra_id}/anular", json={}, headers=admin).status_code == 200
    assert client.post(f"/compras/{compra_id}/anular", json={}, headers=admin).status_code == 409


def test_factura_repetida_da_409(client, admin):
    compra = _compra(1)
    assert client.post("/compras", json=compra, headers=admin).status_code == 201
    assert client.post("/compras", json=compra, headers=admin).status_code == 409


def test_compra_rechaza_cantidad_cero(client, admin):
    r = client.post("/compras", json=_compra(0), headers=admin)
    assert r.status_code == 422
