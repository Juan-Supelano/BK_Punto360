// Comportamientos generales de la interfaz (HU-33).

/**
 * Escape cierra la ventana emergente que esté encima.
 *
 * Todas las ventanas de la app se cierran al hacer clic en el fondo oscuro
 * (.fondo-modal), así que Escape simula ese clic en la última abierta. Las
 * ventanas que no deben cerrarse así simplemente no tienen ese clic.
 * Devuelve true si cerró algo.
 */
export function cerrarVentanaDeArriba() {
  const fondos = document.querySelectorAll('.fondo-modal')
  const ultimo = fondos[fondos.length - 1]
  if (!ultimo) return false
  ultimo.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return true
}

/**
 * Copia el título de cada columna a sus celdas (data-label), para que en el
 * celular cada fila se vea como una tarjeta con "Etiqueta: valor" sin tener
 * que tocar cada tabla. En el computador el atributo no se ve.
 */
export function etiquetarTablas(raiz) {
  for (const tabla of raiz.querySelectorAll('table')) {
    const titulos = [...tabla.querySelectorAll('thead th')].map((th) => th.textContent.trim())
    if (!titulos.length) continue
    for (const fila of tabla.querySelectorAll('tbody tr, tfoot tr')) {
      let columna = 0
      for (const celda of fila.children) {
        const titulo = celda.colSpan > 1 ? '' : titulos[columna] || ''
        if (celda.dataset.label !== titulo) celda.dataset.label = titulo
        columna += celda.colSpan || 1
      }
    }
  }
}
