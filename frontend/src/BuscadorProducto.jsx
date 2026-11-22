import { useState } from 'react'
import { pesos } from './api.js'
import { buscarProductos, pareceCodigo } from './texto.js'

/**
 * Campo para elegir un producto escribiendo su nombre o SKU (compras).
 *
 * Teclado: flechas para moverse, Enter elige, Escape cierra. Si lo escrito no
 * coincide con ningún producto, la última opción (y la única) es crearlo:
 * llama a onCrear con el texto para abrir el alta rápida.
 */
export default function BuscadorProducto({
  productos,
  productoId,
  etiquetaNuevo = '',
  onElegir,
  onCrear,
}) {
  const [texto, setTexto] = useState('')
  const [editando, setEditando] = useState(false)
  const [activo, setActivo] = useState(0)

  const elegido = productos.find((p) => String(p.id) === String(productoId))
  // etiquetaNuevo: producto que todavía no existe y se crea con la compra.
  const etiqueta = elegido ? `${elegido.nombre} · ${elegido.sku}` : etiquetaNuevo

  const coincidencias = editando ? buscarProductos(productos, texto) : []
  const ofrecerCrear = editando && texto.trim() !== '' && coincidencias.length === 0
  const opciones = coincidencias.length + (ofrecerCrear ? 1 : 0)

  function cerrar() {
    setEditando(false)
    setTexto('')
    setActivo(0)
  }

  function elegir(indice) {
    if (indice < coincidencias.length) {
      onElegir(coincidencias[indice])
    } else if (ofrecerCrear) {
      onCrear(texto)
    }
    cerrar()
  }

  function tecla(evento) {
    if (evento.key === 'ArrowDown' && opciones > 0) {
      evento.preventDefault()
      setActivo((i) => (i + 1) % opciones)
    } else if (evento.key === 'ArrowUp' && opciones > 0) {
      evento.preventDefault()
      setActivo((i) => (i - 1 + opciones) % opciones)
    } else if (evento.key === 'Enter') {
      // Nunca envía el formulario de la compra desde aquí.
      evento.preventDefault()
      if (opciones > 0) elegir(Math.min(activo, opciones - 1))
    } else if (evento.key === 'Escape' && editando) {
      evento.stopPropagation()
      cerrar()
    }
  }

  return (
    <div className="buscador-producto">
      <input
        type="search"
        role="combobox"
        aria-expanded={opciones > 0}
        placeholder={etiqueta || 'Escribe nombre o SKU…'}
        value={editando ? texto : etiqueta}
        onFocus={() => setEditando(true)}
        onBlur={cerrar}
        onChange={(e) => {
          setTexto(e.target.value)
          setActivo(0)
        }}
        onKeyDown={tecla}
      />

      {opciones > 0 && (
        // preventDefault en mousedown: si no, el input pierde el foco y se
        // cierra la lista antes de que llegue el clic.
        <ul className="sugerencias" role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {coincidencias.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === activo}>
              <button
                type="button"
                tabIndex={-1}
                className={i === activo ? 'sugerencia activa' : 'sugerencia'}
                onMouseEnter={() => setActivo(i)}
                onClick={() => elegir(i)}
              >
                <span className="mono">{p.sku}</span>
                <span className="sug-nombre">{p.nombre}</span>
                <span className="sug-stock">
                  {p.stock_actual} {p.unidad_medida}
                </span>
                <strong>{pesos.format(Number(p.costo))}</strong>
              </button>
            </li>
          ))}

          {ofrecerCrear && (
            <li role="option" aria-selected={activo === coincidencias.length}>
              <button
                type="button"
                tabIndex={-1}
                className={
                  activo === coincidencias.length
                    ? 'sugerencia sugerencia-crear activa'
                    : 'sugerencia sugerencia-crear'
                }
                onMouseEnter={() => setActivo(coincidencias.length)}
                onClick={() => elegir(coincidencias.length)}
              >
                {pareceCodigo(texto)
                  ? `+ Crear producto con el código ${texto.trim()}`
                  : `+ Crear producto “${texto.trim()}”`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
