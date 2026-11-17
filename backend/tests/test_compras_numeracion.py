"""Numero de factura consecutivo en las compras. Requiere TEST_DATABASE_URL."""

PRODUCTO = 1
PROVEEDOR = 1


def _compra_sin_numero():
    return {
        "proveedor_id": PROVEEDOR,
        "items": [{"producto_id": PRODUCTO, "cantidad": 1, "costo_unitario": "1000"}],
    }


def _consecutivo(numero):
    prefijo, cola = numero.rsplit("-", 1)
    assert prefijo == "FC"
    return int(cola)


def test_compra_sin_numero_recibe_el_consecutivo(client, admin):
    previa = client.get("/compras/siguiente-numero", headers=admin)
    assert previa.status_code == 200, previa.text

    primera = client.post("/compras", json=_compra_sin_numero(), headers=admin)
    assert primera.status_code == 201, primera.text
    segunda = client.post("/compras", json=_compra_sin_numero(), headers=admin)
    assert segunda.status_code == 201, segunda.text

    numero = primera.json()["numero_factura"]
    assert numero == previa.json()["numero"]
    assert _consecutivo(segunda.json()["numero_factura"]) == _consecutivo(numero) + 1


def test_numero_en_blanco_cuenta_como_no_enviado(client, admin):
    compra = {**_compra_sin_numero(), "numero_factura": "   "}
    r = client.post("/compras", json=compra, headers=admin)
    assert r.status_code == 201, r.text
    _consecutivo(r.json()["numero_factura"])
