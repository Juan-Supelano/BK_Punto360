import { useEffect, useState } from 'react'
import { api } from './api.js'
import { mayusculaInicial } from './texto.js'

const UNIDADES = ['UND', 'KG', 'LT', 'MT', 'CAJA', 'PAQ']

/**
 * Datos de un producto nuevo, sin salir de la compra.
 *
 * No guarda nada todavía: entrega los datos con onListo y el producto se crea
 * en el backend junto con la compra, en la misma transacción. Si la compra se
 * cancela o falla, el producto no queda registrado.
 *
 * No pide costo, stock ni IVA: salen de la línea de la compra.
 */
export default function ProductoRapido({ nombreInicial = '', onCerrar, onListo }) {
  const [categorias, setCategorias] = useState([])
  const [formulario, setFormulario] = useState({
    categoria_id: '',
    nombre: mayusculaInicial(nombreInicial.trim()),
    precio_venta: '',
    stock_minimo: '',
    unidad_medida: 'UND',
  })
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .listarCategorias()
      .then((lista) => {
        setCategorias(lista)
        if (lista.length > 0) {
          setFormulario((f) => (f.categoria_id ? f : { ...f, categoria_id: String(lista[0].id) }))
        } else {
          setError('Primero crea una categoría en la pantalla de Categorías.')
        }
      })
      .catch((e) => setError(e.message))
  }, [])

  const campo = (nombre, transformar = (v) => v) => ({
    value: formulario[nombre],
    onChange: (e) => setFormulario({ ...formulario, [nombre]: transformar(e.target.value) }),
  })

  function listo(evento) {
    evento.preventDefault()
    onListo({
      nombre: formulario.nombre.trim(),
      categoria_id: Number(formulario.categoria_id),
      precio_venta: Number(formulario.precio_venta),
      stock_minimo: Number(formulario.stock_minimo || 0),
      unidad_medida: formulario.unidad_medida,
    })
  }

  return (
    <div className="fondo-modal fondo-encima" onClick={onCerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={listo}>
        <h3>Nuevo producto</h3>

        {error && <p className="aviso aviso-error">{error}</p>}

        <div className="rejilla-form">
          <label className="campo campo-ancho">
            <span>Categoría</span>
            <select required {...campo('categoria_id')}>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.prefijo_sku})
                </option>
              ))}
            </select>
          </label>

          <label className="campo">
            <span>Unidad</span>
            <select {...campo('unidad_medida')}>
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>

          <label className="campo campo-completo">
            <span>Nombre</span>
            <input required autoFocus maxLength={150} {...campo('nombre', mayusculaInicial)} />
          </label>

          <label className="campo">
            <span>Precio de venta</span>
            <input type="number" min="0" step="0.01" required {...campo('precio_venta')} />
          </label>

          <label className="campo">
            <span>Stock mínimo</span>
            <input type="number" min="0" {...campo('stock_minimo')} />
          </label>
        </div>

        <p className="nota">
          Se crea cuando registres la compra, con el costo y la cantidad de esa línea. Si cancelas
          la compra, no se guarda.
        </p>

        <div className="modal-pie">
          <button type="button" className="btn btn-suave" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primario" disabled={categorias.length === 0}>
            Agregar a la compra
          </button>
        </div>
      </form>
    </div>
  )
}
