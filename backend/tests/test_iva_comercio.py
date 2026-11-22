"""IVA del comercio y por linea de compra, permisos del cajero y producto nuevo
dentro de una compra. Requiere TEST_DATABASE_URL."""

import uuid
from decimal import Decimal

import pytest

PROVEEDOR = 1


def _categoria(client, admin):
    r = client.get("/categorias", headers=admin)
    assert r.status_code == 200, r.text
    return r.json()[0]["id"]


@pytest.mark.parametrize("ruta", ["/compras", "/proveedores"])
def test_cajero_no_ve_compras_ni_proveedores(client, cajero, ruta):
    assert client.get(ruta, headers=cajero).status_code == 403


def test_cajero_no_puede_desactivar_productos(client, cajero):
    assert client.delete("/productos/1", headers=cajero).status_code == 403
    assert client.post("/productos/1/reactivar", headers=cajero).status_code == 403


def test_comercio_trae_la_configuracion_del_iva(client, cajero):
    r = client.get("/auth/comercio", headers=cajero)
    assert r.status_code == 200, r.text
    assert "iva_pct" in r.json() and "precio_incluye_iva" in r.json()


def test_producto_nuevo_toma_el_iva_del_comercio(client, admin):
    iva = Decimal(client.get("/auth/comercio", headers=admin).json()["iva_pct"])
    r = client.post(
        "/productos",
        json={
            "nombre": f"Prueba IVA {uuid.uuid4().hex[:6]}",
            "precio_venta": "1000",
            "categoria_id": _categoria(client, admin),
            "iva_pct": "5",  # se ignora: manda el del comercio
        },
        headers=admin,
    )
    assert r.status_code == 201, r.text
    assert Decimal(r.json()["iva_pct"]) == iva


def test_compra_con_producto_nuevo_lo_crea_con_el_stock_comprado(client, admin):
    nombre = f"Nuevo en compra {uuid.uuid4().hex[:6]}"
    compra = {
        "proveedor_id": PROVEEDOR,
        "costo_incluye_iva": False,
        "items": [
            {
                "producto_nuevo": {
                    "nombre": nombre,
                    "categoria_id": _categoria(client, admin),
                    "precio_venta": "5000",
                },
                "cantidad": 7,
                "costo_unitario": "3000",
            }
        ],
    }
    r = client.post("/compras", json=compra, headers=admin)
    assert r.status_code == 201, r.text

    encontrados = client.get("/productos", params={"buscar": nombre}, headers=admin).json()
    assert len(encontrados) == 1
    assert encontrados[0]["stock_actual"] == 7
    assert Decimal(encontrados[0]["costo"]) == Decimal("3000")


def test_si_la_compra_falla_el_producto_nuevo_no_queda(client, admin):
    nombre = f"No debe quedar {uuid.uuid4().hex[:6]}"
    compra = {
        "proveedor_id": PROVEEDOR,
        "items": [
            {
                "producto_nuevo": {
                    "nombre": nombre,
                    "categoria_id": _categoria(client, admin),
                    "precio_venta": "5000",
                },
                "cantidad": 1,
                "costo_unitario": "100",
            },
            # Esta linea falla despues de crear el producto de la primera.
            {"producto_id": 999_999, "cantidad": 1, "costo_unitario": "100"},
        ],
    }
    assert client.post("/compras", json=compra, headers=admin).status_code == 400
    assert client.get("/productos", params={"buscar": nombre}, headers=admin).json() == []


def test_linea_sin_producto_responde_422(client, admin):
    compra = {"proveedor_id": PROVEEDOR, "items": [{"cantidad": 1, "costo_unitario": "1"}]}
    assert client.post("/compras", json=compra, headers=admin).status_code == 422


def test_iva_de_la_linea_queda_en_el_producto_y_lo_usa_la_venta(client, admin, cajero):
    nombre = f"Exento {uuid.uuid4().hex[:6]}"
    compra = {
        "proveedor_id": PROVEEDOR,
        "costo_incluye_iva": True,
        "items": [
            {
                "producto_nuevo": {
                    "nombre": nombre,
                    "categoria_id": _categoria(client, admin),
                    "precio_venta": "2000",
                },
                "cantidad": 3,
                "costo_unitario": "1000",
                "iva_pct": "0",
            }
        ],
    }
    r = client.post("/compras", json=compra, headers=admin)
    assert r.status_code == 201, r.text
    assert Decimal(r.json()["items"][0]["iva_pct"]) == 0
    assert Decimal(r.json()["total_iva"]) == 0

    producto = client.get("/productos", params={"buscar": nombre}, headers=admin).json()[0]
    assert Decimal(producto["iva_pct"]) == 0

    venta = {"metodo_pago": "EFECTIVO", "items": [{"producto_id": producto["id"], "cantidad": 1}]}
    r = client.post("/ventas", json=venta, headers=cajero)
    assert r.status_code == 201, r.text
    assert Decimal(r.json()["total_iva"]) == 0
    assert Decimal(r.json()["total"]) == Decimal("2000")


def test_iva_de_la_linea_con_costo_final(client, admin):
    """Costo final 1190 con IVA 19 %: base 1000, IVA 190, y el producto queda
    con costo 1000 (el inventario se valora sin IVA)."""
    nombre = f"Con IVA {uuid.uuid4().hex[:6]}"
    compra = {
        "proveedor_id": PROVEEDOR,
        "costo_incluye_iva": True,
        "items": [
            {
                "producto_nuevo": {
                    "nombre": nombre,
                    "categoria_id": _categoria(client, admin),
                    "precio_venta": "1500",
                },
                "cantidad": 1,
                "costo_unitario": "1190",
                "iva_pct": "19",
            }
        ],
    }
    r = client.post("/compras", json=compra, headers=admin)
    assert r.status_code == 201, r.text
    assert Decimal(r.json()["subtotal"]) == Decimal("1000")
    assert Decimal(r.json()["total_iva"]) == Decimal("190")
    producto = client.get("/productos", params={"buscar": nombre}, headers=admin).json()[0]
    assert Decimal(producto["costo"]) == Decimal("1000")
