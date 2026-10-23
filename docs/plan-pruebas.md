# Plan de pruebas E2E

Pruebas manuales de punta a punta sobre la aplicación desplegada (o con `docker compose up`). Cada caso se marca con el resultado, la fecha, quién lo ejecutó y la captura de evidencia en `docs/screenshots/`.

Las pruebas automáticas del backend (IVA, login, roles e inventario) corren en GitHub Actions en cada PR (HU-11).

**Entorno:** URL frontend: `______` · URL API: `______` · Fecha: `______`

## Usuarios de prueba

| Rol | Correo | Origen |
| --- | --- | --- |
| ADMIN | `______` | Creado con `POST /usuarios` o `seed.sql` |
| CAJERO | `______` | Creado por el ADMIN en la pantalla Usuarios |

## Casos

| ID | HU | Rol | Pasos | Resultado esperado | Resultado | Ejecutó | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E2E-01 | HU-04 | — | Abrir el login y enviar el formulario vacío | Mensaje de error, no se envía | Pendiente | | |
| E2E-02 | HU-04, HU-07 | ADMIN | Iniciar sesión con datos correctos | Entra y ve el menú de ADMIN | Pendiente | | |
| E2E-03 | HU-07 | — | Iniciar sesión con contraseña incorrecta | Mensaje "Correo o contraseña incorrectos" | Pendiente | | |
| E2E-04 | HU-09 | ADMIN | Crear una categoría y un producto con stock 0 | El producto aparece en el listado con SKU sugerido | Pendiente | | |
| E2E-05 | HU-09, HU-08 | ADMIN | Crear un proveedor y registrar una compra de 10 unidades del producto | El stock del producto pasa a 10 | Pendiente | | |
| E2E-06 | HU-08 | ADMIN | Anular la compra anterior | El stock vuelve a 0 y la compra queda ANULADA | Pendiente | | |
| E2E-07 | HU-14 | ADMIN | Crear un usuario CAJERO | El cajero aparece en Usuarios | Pendiente | | |
| E2E-08 | HU-10 | CAJERO | Entrar con la contraseña temporal | Solo puede cambiar la contraseña; luego entra normal | Pendiente | | |
| E2E-09 | HU-10 | CAJERO | Registrar un cliente | El cliente aparece en el listado | Pendiente | | |
| E2E-10 | HU-15, HU-13 | CAJERO | Vender 2 unidades al cliente, pago en efectivo | Se muestra el recibo con IVA desglosado; el stock baja en 2 | Pendiente | | |
| E2E-11 | HU-15 | CAJERO | Imprimir el recibo | Abre la vista de impresión | Pendiente | | |
| E2E-12 | HU-13 | CAJERO | Intentar vender más unidades de las que hay | La venta se rechaza con mensaje de stock | Pendiente | | |
| E2E-13 | HU-15, HU-13 | ADMIN | Anular la venta con motivo | La venta queda ANULADA y el stock se devuelve | Pendiente | | |
| E2E-14 | HU-07 | CAJERO | Intentar abrir Usuarios o registrar una compra | No aparece en el menú; la API responde 403 | Pendiente | | |
| E2E-15 | HU-10 | ADMIN | Editar los datos de la empresa | El nombre nuevo se ve en la barra lateral | Pendiente | | |
| E2E-16 | HU-16 | CAJERO | Usar Vender en una pantalla de 360 px | Se puede vender sin scroll horizontal | Pendiente | | |
| E2E-17 | HU-02 | — | Abrir `/health` de la API | `{"estado": "ok", "base_datos": "ok"}` | Pendiente | | |

## Bugs encontrados

Cada fallo se registra como issue con la etiqueta `bug`, se enlaza aquí y lo corrige HU-16.

| Caso | Issue | Descripción | Estado |
| --- | --- | --- | --- |
| | | | |
