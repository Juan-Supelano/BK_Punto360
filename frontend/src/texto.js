// Utilidades de texto compartidas por las pantallas.

// Quita tildes y pasa a minúscula: en el mostrador nadie escribe "Panadería"
// con tilde, y el cajero no tiene por qué adivinar cómo quedó guardado.
export function sinTildes(texto = '') {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento que deja NFD
    .toLowerCase()
}

// Primera letra en mayúscula mientras se escribe ("arroz" -> "Arroz").
// Solo toca la primera letra: "iPhone" o "café LA ROCA" quedan como se
// escribieron, salvo esa inicial.
export function mayusculaInicial(texto = '') {
  return texto.replace(/^(\s*)(\p{L})/u, (_, espacios, letra) => espacios + letra.toLocaleUpperCase('es'))
}

// Producto cuyo código de barras o SKU es exactamente lo escrito (lo que
// manda un lector de códigos). El código de barras gana sobre el SKU.
export function productoExacto(productos, texto) {
  const q = texto.trim()
  if (!q) return null
  return (
    productos.find((p) => p.codigo_barras && p.codigo_barras === q) ||
    productos.find((p) => p.sku.toLowerCase() === q.toLowerCase()) ||
    null
  )
}

// Parece un código de barras: solo dígitos y al menos 8 (EAN-8, UPC, EAN-13).
export const pareceCodigo = (texto) => /^\d{8,}$/.test(texto.trim())

// Busca productos por nombre, SKU o código de barras, sin importar tildes ni
// mayúsculas. Si alguno coincide exacto (código o SKU) va primero.
// conStockPrimero: los agotados van al final, para que Enter caiga en uno que
// sí se puede vender.
export function buscarProductos(productos, texto, { limite = 8, conStockPrimero = false } = {}) {
  const q = sinTildes(texto.trim())
  if (!q) return []
  const hallados = productos.filter(
    (p) =>
      sinTildes(p.sku).includes(q) ||
      sinTildes(p.nombre).includes(q) ||
      (p.codigo_barras || '').includes(texto.trim()),
  )
  if (conStockPrimero) {
    // sort es estable: dentro de cada grupo se respeta el orden original.
    hallados.sort((a, b) => (b.stock_actual > 0) - (a.stock_actual > 0))
  }
  const exacto = productoExacto(hallados, texto)
  const ordenados = exacto ? [exacto, ...hallados.filter((p) => p !== exacto)] : hallados
  return ordenados.slice(0, limite)
}

// Para formularios donde un lector de códigos podría escribir: Enter no envía
// el formulario (el lector siempre termina en Enter). Solo se guarda con el
// botón.
export function sinEnviarConEnter(evento) {
  if (evento.key === 'Enter' && evento.target.tagName === 'INPUT') {
    evento.preventDefault()
  }
}
