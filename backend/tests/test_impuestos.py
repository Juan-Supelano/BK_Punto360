"""Desglose de IVA (app/impuestos.py). No necesita base de datos."""

from decimal import Decimal as D

import pytest

from app.impuestos import _redondear, base_sin_iva, desglosar


def test_iva_incluido_saca_el_impuesto_del_precio():
    assert desglosar(D("1190"), 1, D("19"), True) == (D("1000.00"), D("190.00"), D("1190.00"))


def test_iva_excluido_suma_el_impuesto():
    assert desglosar(D("1000"), 2, D("19"), False) == (D("2000.00"), D("380.00"), D("2380.00"))


def test_tasa_cero_no_genera_impuesto():
    assert desglosar(D("2500"), 3, D("0"), True) == (D("7500.00"), D("0.00"), D("7500.00"))


@pytest.mark.parametrize(
    "precio, cantidad, tasa, incluye",
    [
        (D("1200"), 1, D("19"), True),
        (D("999.99"), 7, D("19"), True),
        (D("0.33"), 3, D("5"), False),
        (D("4350"), 13, D("5"), True),
        (D("1.01"), 999, D("19"), False),
    ],
)
def test_subtotal_mas_iva_siempre_da_el_total(precio, cantidad, tasa, incluye):
    subtotal, iva, total = desglosar(precio, cantidad, tasa, incluye)
    assert subtotal + iva == total
    for valor in (subtotal, iva, total):
        assert valor == valor.quantize(D("0.01"))


def test_iva_incluido_con_redondeo():
    # 1200 / 1.19 = 1008.403... -> 1008.40; el IVA es la diferencia.
    assert desglosar(D("1200"), 1, D("19"), True) == (D("1008.40"), D("191.60"), D("1200.00"))


def test_redondeo_comercial_sube_en_la_mitad():
    assert _redondear(D("0.005")) == D("0.01")
    assert _redondear(D("2.675")) == D("2.68")


def test_costo_sin_iva():
    assert base_sin_iva(D("1190"), D("19"), True) == D("1000.00")
    assert base_sin_iva(D("1000"), D("19"), False) == D("1000.00")
