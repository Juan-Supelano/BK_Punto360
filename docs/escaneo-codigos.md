# Escaneo de códigos de barras

Punto360 lee códigos de barras de dos formas. Las dos llegan al mismo campo de
búsqueda de Vender y siguen la misma regla: Enter busca primero el código de
barras exacto, después el SKU, y agrega el producto.

## Lector USB o Bluetooth

Funciona siempre, sin configurar nada. El lector se comporta como un teclado:
escribe el código y presiona Enter. Basta con que el cursor esté en el buscador
de Vender (queda ahí después de cada producto agregado).

## Cámara del celular o del PC

Para los puntos de venta sin lector. El ADMIN la activa en **Mi empresa →
Escaneo → Permitir escanear códigos con la cámara**. Con eso aparece un botón 📷
en el buscador de Vender y junto al campo "Código de barras" del producto.

- Lee EAN-13, EAN-8, UPC-A, UPC-E y Code 128, con la cámara trasera.
- En Vender la cámara queda abierta: cada lectura agrega el producto, con
  vibración y un pitido. Mientras el mismo código siga frente a la cámara no se
  vuelve a contar; cuenta otra vez si se retira por 2 s. Para sumar unidades
  están los botones + del carrito.
- En el formulario de producto se cierra con la primera lectura.
- Usa el lector del navegador si existe (Chrome en Android y macOS). Si no
  (Chrome en Windows, iPhone), descarga la librería ZXing al abrir el escáner;
  si el escaneo está apagado, la librería nunca se carga.

### Requisitos y límites

- **HTTPS o localhost.** El navegador solo deja usar la cámara en páginas
  seguras. Funciona en Cloud Run y en `http://localhost:5173`; desde otro equipo
  de la red local (`http://192.168.x.x`) la cámara no abre sin un certificado.
- La primera vez el navegador pide permiso. Si se niega, se vuelve a activar en
  el candado de la barra de direcciones.
- La cámara de un portátil suele tener enfoque fijo: lee mal códigos pequeños.
  Sirve como respaldo; la de un celular funciona mucho mejor.
- Si otra aplicación (Teams, Zoom) tiene la cámara, no abre.
