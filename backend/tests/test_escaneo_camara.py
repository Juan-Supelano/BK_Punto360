"""Interruptor de escaneo con camara en Mi empresa (HU-31). Requiere
TEST_DATABASE_URL."""


def test_comercio_trae_el_interruptor(client, cajero):
    r = client.get("/auth/comercio", headers=cajero)
    assert r.status_code == 200, r.text
    assert isinstance(r.json()["escaneo_camara"], bool)


def test_admin_activa_y_desactiva_el_escaneo(client, admin):
    r = client.put("/auth/comercio", json={"escaneo_camara": True}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["escaneo_camara"] is True

    r = client.put("/auth/comercio", json={"escaneo_camara": False}, headers=admin)
    assert r.json()["escaneo_camara"] is False


def test_null_no_borra_el_interruptor(client, admin):
    antes = client.get("/auth/comercio", headers=admin).json()["escaneo_camara"]
    r = client.put("/auth/comercio", json={"escaneo_camara": None}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["escaneo_camara"] is antes


def test_cajero_no_cambia_el_interruptor(client, cajero):
    r = client.put("/auth/comercio", json={"escaneo_camara": True}, headers=cajero)
    assert r.status_code == 403
