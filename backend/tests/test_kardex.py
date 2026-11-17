"""Historial de movimientos (kardex) por producto. Requiere TEST_DATABASE_URL."""

PRODUCTO = 1
PROVEEDOR = 1


def _ultimo_movimiento(client, headers):
    r = client.get(f"/productos/{PRODUCTO}/movimientos", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()[0]


def test_kardex_trae_el_numero_de_la_compra_y_de_la_venta(client, admin, cajero):
    compra = client.post(
        "/compras",
        json={
            "proveedor_id": PROVEEDOR,
            "items": [{"producto_id": PRODUCTO, "cantidad": 2, "costo_unitario": "1000"}],
        },
        headers=admin,
    )
    assert compra.status_code == 201, compra.text
    mov = _ultimo_movimiento(client, admin)
    assert (mov["tipo"], mov["origen"]) == ("COMPRA", "COMPRA")
    assert mov["documento"] == compra.json()["numero_factura"]
    assert mov["stock_resultante"] - mov["stock_anterior"] == 2

    venta = client.post(
        "/ventas",
        json={"items": [{"producto_id": PRODUCTO, "cantidad": 1}]},
        headers=cajero,
    )
    assert venta.status_code == 201, venta.text
    mov = _ultimo_movimiento(client, cajero)
    assert (mov["tipo"], mov["origen"]) == ("VENTA", "VENTA")
    assert mov["documento"] == venta.json()["numero"]
    assert mov["stock_resultante"] - mov["stock_anterior"] == -1


def test_kardex_de_producto_inexistente_da_404(client, admin):
    assert client.get("/productos/999999/movimientos", headers=admin).status_code == 404
