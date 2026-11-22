"""Codigo de barras en los productos (HU-30). Requiere TEST_DATABASE_URL."""

import uuid


def _categoria(client, headers):
    r = client.get("/categorias", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()[0]["id"]


def _codigo():
    # 13 digitos, como un EAN-13, distinto en cada corrida.
    return "77" + str(uuid.uuid4().int)[:11]


def _crear(client, headers, **extra):
    datos = {
        "nombre": f"Producto codigo {uuid.uuid4().hex[:6]}",
        "precio_venta": "1000",
        "categoria_id": _categoria(client, headers),
        **extra,
    }
    return client.post("/productos", json=datos, headers=headers)


def test_crear_con_codigo_y_buscarlo(client, admin):
    codigo = _codigo()
    r = _crear(client, admin, codigo_barras=f"  {codigo} ")
    assert r.status_code == 201, r.text
    assert r.json()["codigo_barras"] == codigo  # sin espacios

    encontrados = client.get("/productos", params={"buscar": codigo}, headers=admin).json()
    assert [p["id"] for p in encontrados] == [r.json()["id"]]


def test_codigo_repetido_dice_quien_lo_tiene(client, admin):
    codigo = _codigo()
    primero = _crear(client, admin, codigo_barras=codigo).json()

    r = _crear(client, admin, codigo_barras=codigo)
    assert r.status_code == 409
    assert primero["nombre"] in r.json()["detail"]


def test_vacio_cuenta_como_sin_codigo(client, admin):
    # Varios productos sin codigo no chocan con el indice unico.
    a = _crear(client, admin, codigo_barras="")
    b = _crear(client, admin)
    assert a.status_code == 201 and b.status_code == 201
    assert a.json()["codigo_barras"] is None and b.json()["codigo_barras"] is None


def test_editar_codigo_y_quitarlo(client, admin):
    producto = _crear(client, admin).json()
    codigo = _codigo()

    r = client.put(f"/productos/{producto['id']}", json={"codigo_barras": codigo}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["codigo_barras"] == codigo

    # Guardar el mismo codigo otra vez no choca consigo mismo.
    r = client.put(f"/productos/{producto['id']}", json={"codigo_barras": codigo}, headers=admin)
    assert r.status_code == 200, r.text

    r = client.put(f"/productos/{producto['id']}", json={"codigo_barras": ""}, headers=admin)
    assert r.json()["codigo_barras"] is None


def test_cajero_puede_asignar_codigo(client, cajero):
    r = _crear(client, cajero, codigo_barras=_codigo())
    assert r.status_code == 201, r.text


def test_producto_nuevo_en_compra_con_codigo_repetido(client, admin):
    codigo = _codigo()
    existente = _crear(client, admin, codigo_barras=codigo).json()
    compra = {
        "proveedor_id": 1,
        "items": [
            {
                "producto_nuevo": {
                    "nombre": f"Duplicado {uuid.uuid4().hex[:6]}",
                    "categoria_id": _categoria(client, admin),
                    "precio_venta": "100",
                    "codigo_barras": codigo,
                },
                "cantidad": 1,
                "costo_unitario": "50",
            }
        ],
    }
    r = client.post("/compras", json=compra, headers=admin)
    assert r.status_code == 409
    assert existente["nombre"] in r.json()["detail"]
