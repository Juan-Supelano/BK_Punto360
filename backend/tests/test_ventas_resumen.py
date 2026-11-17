"""Resumen de ventas por rango de fechas. Requiere TEST_DATABASE_URL."""


def test_resumen_cuenta_anuladas_solo_del_rango(client, admin):
    # Los datos semilla tienen ventas anuladas en 2026; en el 2000 no hay nada.
    r = client.get("/ventas/resumen?desde=2000-01-01&hasta=2000-01-31", headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["ventas"] == 0
    assert r.json()["anuladas"] == 0
