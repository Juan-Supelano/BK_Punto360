"""IVA editable al crear y editar productos (HU-33). Requiere TEST_DATABASE_URL."""

import uuid
from decimal import Decimal


def _crear(client, headers, **extra):
    categoria = client.get("/categorias", headers=headers).json()[0]["id"]
    datos = {
        "nombre": f"Con IVA {uuid.uuid4().hex[:6]}",
        "precio_venta": "1190",
        "categoria_id": categoria,
        **extra,
    }
    r = client.post("/productos", json=datos, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_sin_iva_toma_el_de_mi_empresa(client, admin):
    defecto = Decimal(client.get("/auth/comercio", headers=admin).json()["iva_pct"])
    assert Decimal(_crear(client, admin)["iva_pct"]) == defecto


def test_iva_propio_al_crear(client, admin):
    assert Decimal(_crear(client, admin, iva_pct="5")["iva_pct"]) == 5


def test_cambiar_iva_al_editar_queda_en_auditoria(client, admin):
    producto = _crear(client, admin, iva_pct="19")
    r = client.put(f"/productos/{producto['id']}", json={"iva_pct": "0"}, headers=admin)
    assert r.status_code == 200, r.text
    assert Decimal(r.json()["iva_pct"]) == 0

    items = client.get(
        "/auditoria",
        params={"entidad": "producto", "buscar": producto["nombre"]},
        headers=admin,
    ).json()["items"]
    cambio = next(c for c in items if c["campo"] == "iva_pct")
    assert cambio["valor_antes"] == "19"
    assert cambio["valor_despues"] == "0"


def test_iva_fuera_de_rango_responde_422(client, admin):
    categoria = client.get("/categorias", headers=admin).json()[0]["id"]
    r = client.post(
        "/productos",
        json={"nombre": "X", "precio_venta": "1", "categoria_id": categoria, "iva_pct": "150"},
        headers=admin,
    )
    assert r.status_code == 422
