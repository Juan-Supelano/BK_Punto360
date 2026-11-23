import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, pesos } from '../api.js'
import { useAuth } from '../auth.jsx'
import EscanerCamara from '../EscanerCamara.jsx'
import { mayusculaInicial, sinEnviarConEnter } from '../texto.js'

const UNIDADES = ['UND', 'KG', 'LT', 'MT', 'CAJA', 'PAQ']

const VACIO = {
  sku: '',
  codigo_barras: '',
  nombre: '',
  descripcion: '',
  precio_venta: '',
  costo: '',
  stock_actual: '',
  stock_minimo: '',
  unidad_medida: 'UND',
  categoria_id: '',
}

// Cuántos movimientos trae el historial de un producto (los más recientes).
const LIMITE_HISTORIAL = 200

const fechaHora = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatearFecha(valor) {
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? '—' : fechaHora.format(d)
}

const TIPOS_MOVIMIENTO = {
  COMPRA: 'Compra',
  VENTA: 'Venta',
  AJUSTE: 'Ajuste manual',
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
}

// Cómo se lee en pantalla cada fila del kardex.
function nombreMovimiento(m) {
  if (m.tipo === 'ANULACION') {
    if (m.origen === 'VENTA') return 'Anulación de venta'
    if (m.origen === 'COMPRA') return 'Anulación de compra'
    return 'Anulación'
  }
  return TIPOS_MOVIMIENTO[m.tipo] || m.tipo
}

export default function Productos() {
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'ADMIN'
  // Botón de cámara junto al código de barras, si el ADMIN lo activó.
  const camara = Boolean(usuario?.comercio?.escaneo_camara)
  const [escaneando, setEscaneando] = useState(false)
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [soloStockBajo, setSoloStockBajo] = useState(false)
  const [incluirInactivos, setIncluirInactivos] = useState(false)

  const [formulario, setFormulario] = useState(VACIO)
  const [editandoId, setEditandoId] = useState(null)
  const [panelAbierto, setPanelAbierto] = useState(false)

  // El SKU lo arma siempre el backend con el prefijo de la categoría.
  // skuPrevio es solo la vista previa de lo que se va a asignar.
  const [skuPrevio, setSkuPrevio] = useState('')

  // Historial (kardex) del producto al que se le dio clic.
  // movimientos queda en null mientras carga.
  const [historial, setHistorial] = useState(null)

  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)

  // Espera 300 ms después de la última tecla antes de consultar la API.
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto), 300)
    return () => clearTimeout(t)
  }, [texto])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [lista, cats] = await Promise.all([
        api.listarProductos({
          categoriaId: filtroCategoria || undefined,
          buscar: busqueda || undefined,
          soloStockBajo,
          incluirInactivos,
        }),
        api.listarCategorias(true),
      ])
      setProductos(lista)
      setCategorias(cats)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [filtroCategoria, busqueda, soloStockBajo, incluirInactivos])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Al elegir categoría en el formulario de creación, pide la vista previa
  // del SKU que se va a asignar.
  useEffect(() => {
    if (!panelAbierto || editandoId || !formulario.categoria_id) {
      return
    }
    let vigente = true
    api
      .siguienteSku(formulario.categoria_id)
      .then((r) => {
        if (vigente) setSkuPrevio(r.sku)
      })
      .catch(() => {
        if (vigente) setSkuPrevio('')
      })
    return () => {
      vigente = false
    }
  }, [panelAbierto, editandoId, formulario.categoria_id])

  const resumen = useMemo(() => {
    const activos = productos.filter((p) => p.activo)
    return {
      total: productos.length,
      bajos: productos.filter((p) => p.stock_bajo && p.activo).length,
      valorInventario: activos.reduce(
        (suma, p) => suma + Number(p.costo) * p.stock_actual,
        0,
      ),
    }
  }, [productos])

  const categoriasActivas = categorias.filter((c) => c.activo)

  function abrirNuevo() {
    if (categoriasActivas.length === 0) {
      setError('Primero crea una categoría: de ahí sale el prefijo del SKU.')
      return
    }
    setFormulario({ ...VACIO, categoria_id: String(categoriasActivas[0].id) })
    setEditandoId(null)
    setSkuPrevio('')
    setPanelAbierto(true)
    setError('')
  }

  function abrirEdicion(p) {
    setFormulario({
      sku: p.sku,
      codigo_barras: p.codigo_barras ?? '',
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precio_venta: String(p.precio_venta),
      costo: String(p.costo),
      stock_actual: String(p.stock_actual),
      stock_minimo: String(p.stock_minimo),
      unidad_medida: p.unidad_medida,
      categoria_id: String(p.categoria.id),
    })
    setEditandoId(p.id)
    setSkuPrevio('')
    setPanelAbierto(true)
    setError('')
  }

  function cerrarPanel() {
    setPanelAbierto(false)
    setEditandoId(null)
    setFormulario(VACIO)
    setSkuPrevio('')
  }

  async function guardar(evento) {
    evento.preventDefault()
    const datos = {
      nombre: formulario.nombre.trim(),
      // Vacío se manda como "" para que, al editar, se pueda quitar el código.
      codigo_barras: formulario.codigo_barras.trim(),
      descripcion: formulario.descripcion.trim() || null,
      precio_venta: Number(formulario.precio_venta),
      costo: Number(formulario.costo || 0),
      stock_actual: Number(formulario.stock_actual || 0),
      stock_minimo: Number(formulario.stock_minimo || 0),
      unidad_medida: formulario.unidad_medida,
      categoria_id: Number(formulario.categoria_id),
    }

    // El SKU nunca se manda: lo genera el backend con el prefijo de la categoría.

    try {
      if (editandoId) {
        await api.actualizarProducto(editandoId, datos)
      } else {
        await api.crearProducto(datos)
      }
      cerrarPanel()
      cargar()
    } catch (e) {
      setError(e.message)
    }
  }

  async function ajustar(producto, cantidad) {
    try {
      await api.ajustarStock(producto.id, cantidad)
      cargar()
    } catch (e) {
      setError(e.message)
    }
  }

  async function verHistorial(producto) {
    setHistorial({ producto, movimientos: null })
    try {
      const movimientos = await api.movimientosProducto(producto.id, LIMITE_HISTORIAL)
      // Si mientras cargaba se cerró o se abrió otro producto, no se pisa.
      setHistorial((h) =>
        h?.producto.id === producto.id ? { ...h, movimientos } : h,
      )
    } catch (e) {
      setHistorial(null)
      setError(e.message)
    }
  }

  async function alternarActivo(producto) {
    try {
      if (producto.activo) {
        await api.desactivarProducto(producto.id)
      } else {
        await api.reactivarProducto(producto.id)
      }
      cargar()
    } catch (e) {
      setError(e.message)
    }
  }

  // transformar: por ejemplo mayusculaInicial para los nombres.
  const campo = (nombre, transformar = (v) => v) => ({
    value: formulario[nombre],
    onChange: (e) => setFormulario({ ...formulario, [nombre]: transformar(e.target.value) }),
  })

  const categoriaElegida = categorias.find(
    (c) => String(c.id) === String(formulario.categoria_id),
  )

  return (
    <section>
      <div className="titulo-vista">
        <div>
          <h2>Productos</h2>
          <p className="sutil">
            Catálogo e inventario del punto de venta. Haz clic en un producto para
            ver su historial de movimientos.
          </p>
        </div>
        <button className="btn btn-primario" onClick={abrirNuevo}>
          + Nuevo producto
        </button>
      </div>

      <div className="tarjetas-resumen">
        <div className="tarjeta-dato">
          <span className="dato-etiqueta">Productos listados</span>
          <strong className="dato-valor">{resumen.total}</strong>
        </div>
        <div className={`tarjeta-dato ${resumen.bajos ? 'alerta' : ''}`}>
          <span className="dato-etiqueta">Con stock bajo</span>
          <strong className="dato-valor">{resumen.bajos}</strong>
        </div>
        <div className="tarjeta-dato">
          <span className="dato-etiqueta">Valor del inventario (al costo)</span>
          <strong className="dato-valor">{pesos.format(resumen.valorInventario)}</strong>
        </div>
      </div>

      {error && <p className="aviso aviso-error">{error}</p>}

      <div className="barra-filtros">
        <input
          className="buscador"
          type="search"
          placeholder="Buscar por nombre o SKU…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({c.prefijo_sku})
            </option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={soloStockBajo}
            onChange={(e) => setSoloStockBajo(e.target.checked)}
          />
          Solo stock bajo
        </label>
        {/* Los inactivos solo le sirven al ADMIN, que es quien puede reactivarlos. */}
        {esAdmin && (
          <label className="check">
            <input
              type="checkbox"
              checked={incluirInactivos}
              onChange={(e) => setIncluirInactivos(e.target.checked)}
            />
            Ver inactivos
          </label>
        )}
      </div>

      <div className="tabla-envoltura">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Producto</th>
              <th>Categoría</th>
              <th className="derecha">Precio</th>
              <th className="derecha">Costo</th>
              <th className="derecha">Margen</th>
              <th className="centro">Stock</th>
              <th className="derecha">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan="8" className="celda-vacia">
                  Cargando…
                </td>
              </tr>
            )}

            {!cargando &&
              productos.map((p) => (
                <tr
                  key={p.id}
                  className={p.activo ? 'fila-clicable' : 'fila-clicable fila-inactiva'}
                  onClick={(e) => {
                    // Los botones de la fila (stock, editar, desactivar) hacen lo suyo.
                    if (!e.target.closest('button')) verHistorial(p)
                  }}
                >
                  <td className="mono">{p.sku}</td>
                  <td>
                    <strong>{p.nombre}</strong>
                    {!p.activo && <span className="etiqueta gris">inactivo</span>}
                    {p.descripcion && <div className="sutil">{p.descripcion}</div>}
                  </td>
                  <td>
                    <span className="etiqueta">{p.categoria.nombre}</span>
                  </td>
                  <td className="derecha">{pesos.format(Number(p.precio_venta))}</td>
                  <td className="derecha sutil">{pesos.format(Number(p.costo))}</td>
                  <td className="derecha">
                    {p.margen_pct === null ? '—' : `${Number(p.margen_pct).toFixed(0)}%`}
                  </td>
                  <td className="centro">
                    <div className="control-stock">
                      <button
                        className="btn-mini"
                        title="Restar una unidad"
                        onClick={() => ajustar(p, -1)}
                      >
                        −
                      </button>
                      <span className={p.stock_bajo ? 'stock stock-bajo' : 'stock'}>
                        {p.stock_actual} {p.unidad_medida}
                      </span>
                      <button
                        className="btn-mini"
                        title="Sumar una unidad"
                        onClick={() => ajustar(p, 1)}
                      >
                        +
                      </button>
                    </div>
                    {p.stock_bajo && (
                      <div className="sutil">mínimo {p.stock_minimo}</div>
                    )}
                  </td>
                  <td className="derecha acciones">
                    <button className="btn btn-suave" onClick={() => abrirEdicion(p)}>
                      Editar
                    </button>
                    {/* Desactivar y reactivar: solo ADMIN (el backend también lo exige). */}
                    {esAdmin && (
                      <button
                        className={p.activo ? 'btn btn-peligro' : 'btn btn-suave'}
                        onClick={() => alternarActivo(p)}
                      >
                        {p.activo ? 'Desactivar' : 'Reactivar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}

            {!cargando && productos.length === 0 && (
              <tr>
                <td colSpan="8" className="celda-vacia">
                  No hay productos que coincidan con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {panelAbierto && (
        <div className="fondo-modal" onClick={cerrarPanel}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={guardar}
            onKeyDown={sinEnviarConEnter}
          >
            <h3>{editandoId ? 'Editar producto' : 'Nuevo producto'}</h3>

            <div className="rejilla-form">
              <label className="campo campo-ancho">
                <span>Categoría</span>
                <select required {...campo('categoria_id')}>
                  <option value="">Elige una categoría…</option>
                  {categoriasActivas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.prefijo_sku})
                    </option>
                  ))}
                </select>
              </label>

              <label className="campo">
                <span>SKU</span>
                <input
                  className="mono-entrada"
                  readOnly
                  tabIndex={-1}
                  value={editandoId ? formulario.sku : skuPrevio || '—'}
                  onChange={() => {}}
                />
                <small className="sutil">
                  {editandoId
                    ? 'Asignado al crearlo. No cambia al mover de categoría.'
                    : `Se asigna solo${
                        categoriaElegida ? ` con el prefijo ${categoriaElegida.prefijo_sku}` : ''
                      }.`}
                </small>
              </label>

              <label className="campo campo-completo">
                <span>Código de barras (opcional)</span>
                <div className="campo-con-boton">
                  <input
                    className="mono-entrada"
                    maxLength={50}
                    placeholder="Escanéalo con el lector o escríbelo"
                    {...campo('codigo_barras')}
                  />
                  {camara && (
                    <button
                      type="button"
                      className="btn btn-suave btn-camara"
                      title="Escanear con la cámara"
                      aria-label="Escanear con la cámara"
                      onClick={() => setEscaneando(true)}
                    >
                      📷
                    </button>
                  )}
                </div>
              </label>

              <label className="campo campo-completo">
                <span>Nombre</span>
                <input required maxLength={150} {...campo('nombre', mayusculaInicial)} />
              </label>

              <label className="campo campo-completo">
                <span>Descripción (opcional)</span>
                <input {...campo('descripcion')} />
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
                <span>Stock actual</span>
                <input type="number" min="0" {...campo('stock_actual')} />
              </label>

              <label className="campo">
                <span>Stock mínimo</span>
                <input type="number" min="0" {...campo('stock_minimo')} />
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
            </div>

            <div className="modal-pie">
              <button type="button" className="btn btn-suave" onClick={cerrarPanel}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primario">
                {editandoId ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {historial && (
        <div className="fondo-modal" onClick={() => setHistorial(null)}>
          <div className="modal modal-ancho" onClick={(e) => e.stopPropagation()}>
            <h3>Historial de {historial.producto.nombre}</h3>
            <p className="sutil">
              <span className="mono">{historial.producto.sku}</span> · Stock actual:{' '}
              {historial.producto.stock_actual} {historial.producto.unidad_medida}
            </p>

            <div className="tabla-envoltura" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Movimiento</th>
                    <th>Documento</th>
                    <th className="derecha">Cantidad</th>
                    <th className="centro">Stock</th>
                    <th>Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.movimientos === null && (
                    <tr>
                      <td colSpan="6" className="celda-vacia">
                        Cargando…
                      </td>
                    </tr>
                  )}

                  {historial.movimientos?.map((m) => {
                    const cambio = m.stock_resultante - m.stock_anterior
                    return (
                      <tr key={m.id}>
                        <td className="sutil sin-salto">{formatearFecha(m.fecha)}</td>
                        <td>
                          {nombreMovimiento(m)}
                          {/* En compras y ventas el motivo repite el documento;
                              en anulaciones y ajustes dice el porqué. */}
                          {m.motivo && (m.tipo === 'ANULACION' || m.tipo === 'AJUSTE') && (
                            <div className="sutil">{m.motivo}</div>
                          )}
                        </td>
                        <td className="mono sin-salto">{m.documento || '—'}</td>
                        <td
                          className={cambio < 0 ? 'derecha mov-salida' : 'derecha mov-entrada'}
                        >
                          <strong>
                            {cambio < 0 ? '−' : '+'}
                            {Math.abs(cambio)}
                          </strong>
                        </td>
                        <td className="centro sutil sin-salto">
                          {m.stock_anterior} → {m.stock_resultante}
                        </td>
                        <td className="sutil">{m.usuario || '—'}</td>
                      </tr>
                    )
                  })}

                  {historial.movimientos?.length === 0 && (
                    <tr>
                      <td colSpan="6" className="celda-vacia">
                        Este producto todavía no tiene movimientos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {historial.movimientos?.length >= LIMITE_HISTORIAL && (
              <p className="nota">
                Se muestran los {LIMITE_HISTORIAL} movimientos más recientes.
              </p>
            )}

            <div className="modal-pie">
              <button className="btn btn-suave" onClick={() => setHistorial(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {escaneando && (
        <EscanerCamara
          titulo="Escanear código del producto"
          onLeido={(codigo) => setFormulario((f) => ({ ...f, codigo_barras: codigo }))}
          onCerrar={() => setEscaneando(false)}
        />
      )}
    </section>
  )
}
