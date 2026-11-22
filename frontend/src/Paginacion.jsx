import { useEffect, useMemo, useState } from 'react'

// Registros por página en las tablas largas. Con 25 o menos no se pagina.
export const POR_PAGINA = 25

/**
 * Pagina en el navegador una lista que ya llegó filtrada desde la API, así el
 * filtro siempre se aplica sobre todos los registros y no solo sobre la página
 * que se está viendo.
 *
 * `claveFiltros` cambia cuando cambia algún filtro: en ese caso se vuelve a la
 * página 1. Recargar la misma lista (por ejemplo, después de editar) conserva
 * la página.
 */
export function usePaginacion(lista, claveFiltros) {
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    setPagina(1)
  }, [claveFiltros])

  const total = lista.length
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const actual = Math.min(pagina, paginas)

  const visibles = useMemo(
    () => lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA),
    [lista, actual],
  )

  return { visibles, pagina: actual, paginas, total, setPagina }
}

/**
 * Controles de página. No se muestran si hay 25 registros o menos.
 *
 * Por defecto van debajo de la tabla y, al cambiar de página, suben la vista
 * para empezar a leer desde el primer registro. Con `enBarra` van dentro de la
 * barra de filtros de una cabecera fija (Ventas y Compras): siempre están a la
 * vista, así que solo se vuelve arriba de la tabla.
 */
export default function Paginacion({ pagina, paginas, total, setPagina, enBarra = false }) {
  if (total <= POR_PAGINA) return null

  const desde = (pagina - 1) * POR_PAGINA + 1
  const hasta = Math.min(pagina * POR_PAGINA, total)

  function ir(nueva) {
    setPagina(nueva)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // En la barra de filtros va compacta para caber en la misma fila.
  if (enBarra) {
    return (
      <nav className="paginacion paginacion-barra" title={`Página ${pagina} de ${paginas}`}>
        <button
          className="btn btn-suave"
          aria-label="Página anterior"
          disabled={pagina <= 1}
          onClick={() => ir(pagina - 1)}
        >
          ‹
        </button>
        <span className="sutil">
          {desde}–{hasta} de {total}
        </span>
        <button
          className="btn btn-suave"
          aria-label="Página siguiente"
          disabled={pagina >= paginas}
          onClick={() => ir(pagina + 1)}
        >
          ›
        </button>
      </nav>
    )
  }

  return (
    <nav className="paginacion paginacion-abajo">
      <button className="btn btn-suave" disabled={pagina <= 1} onClick={() => ir(pagina - 1)}>
        ← Anterior
      </button>
      <span className="sutil">
        {desde}–{hasta} de {total} · página {pagina} de {paginas}
      </span>
      <button
        className="btn btn-suave"
        disabled={pagina >= paginas}
        onClick={() => ir(pagina + 1)}
      >
        Siguiente →
      </button>
    </nav>
  )
}
