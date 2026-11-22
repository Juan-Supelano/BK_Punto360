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

// Busca productos por SKU o nombre, sin importar tildes ni mayúsculas.
// conStockPrimero: los agotados van al final, para que Enter caiga en uno que
// sí se puede vender.
export function buscarProductos(productos, texto, { limite = 8, conStockPrimero = false } = {}) {
  const q = sinTildes(texto.trim())
  if (!q) return []
  const hallados = productos.filter(
    (p) => sinTildes(p.sku).includes(q) || sinTildes(p.nombre).includes(q),
  )
  if (conStockPrimero) {
    // sort es estable: dentro de cada grupo se respeta el orden original.
    hallados.sort((a, b) => (b.stock_actual > 0) - (a.stock_actual > 0))
  }
  return hallados.slice(0, limite)
}
