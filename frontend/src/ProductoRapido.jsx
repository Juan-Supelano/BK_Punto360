import { useEffect, useState } from 'react'
import { api } from './api.js'
import { mayusculaInicial } from './texto.js'

const UNIDADES = ['UND', 'KG', 'LT', 'MT', 'CAJA', 'PAQ']

/**
 * Alta rápida de un producto sin salir de la compra.
 *
 * Mismos datos que la pantalla de Productos, menos el stock: arranca en 0
 * porque lo que entra es justo esta compra. Al guardar entrega el producto
 * creado con onCreado, para que la línea de la compra lo deje elegido.
 */
export default function ProductoRapido({ nombreInicial = '', onCerrar, onCreado }) {
  const [categorias, setCategorias] = useState([])
  const [formulario, setFormulario] = useState({
    categoria_id: '',
    nombre: mayusculaInicial(nombreInicial.trim()),
    precio_venta: '',
    costo: '',
    iva_pct: '19',
    stock_minimo: '',
    unidad_medida: 'UND',
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

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

  async function guardar(evento) {
    evento.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const producto = await api.crearProducto({
        nombre: formulario.nombre.trim(),
        descripcion: null,
        precio_venta: Number(formulario.precio_venta),
        costo: Number(formulario.costo || 0),
        iva_pct: Number(formulario.iva_pct || 0),
        stock_actual: 0,
        stock_minimo: Number(formulario.stock_minimo || 0),
        unidad_medida: formulario.unidad_medida,
        categoria_id: Number(formulario.categoria_id),
      })
      onCreado(producto)
    } catch (e) {
      setError(e.message)
      setGuardando(false)
    }
  }

  return (
    <div className="fondo-modal fondo-encima" onClick={onCerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
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
            <span>Costo</span>
            <input type="number" min="0" step="0.01" {...campo('costo')} />
          </label>

          <label className="campo">
            <span>IVA %</span>
            <input type="number" min="0" max="100" step="0.01" {...campo('iva_pct')} />
          </label>

          <label className="campo">
            <span>Stock mínimo</span>
            <input type="number" min="0" {...campo('stock_minimo')} />
          </label>
        </div>

        <p className="nota">
          El SKU se asigna solo con el prefijo de la categoría. El stock arranca en 0 y sube con
          esta compra.
        </p>

        <div className="modal-pie">
          <button type="button" className="btn btn-suave" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primario"
            disabled={guardando || categorias.length === 0}
          >
            {guardando ? 'Guardando…' : 'Crear y agregar a la compra'}
          </button>
        </div>
      </form>
    </div>
  )
}
