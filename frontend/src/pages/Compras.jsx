import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, desglosarIva, ivaDelComercio, pesos } from '../api.js'
import { useAuth } from '../auth.jsx'
import BuscadorProducto from '../BuscadorProducto.jsx'
import CabeceraFija from '../CabeceraFija.jsx'
import Paginacion, { usePaginacion } from '../Paginacion.jsx'
import ProductoRapido from '../ProductoRapido.jsx'
import { pareceCodigo } from '../texto.js'

const fechaCorta = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function formatearFecha(valor) {
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? '—' : fechaCorta.format(d)
}

const lineaVacia = () => ({
  producto_id: '',
  nuevo: null,
  cantidad: '1',
  costo_unitario: '',
  iva_pct: '',
})

export default function Compras() {
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'ADMIN'
  // IVA único del comercio y valor por defecto de la casilla (Mi empresa).
  const iva = ivaDelComercio(usuario?.comercio)

  const [compras, setCompras] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [productos, setProductos] = useState([])

  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const [panelAbierto, setPanelAbierto] = useState(false)
  const [proveedorId, setProveedorId] = useState('')
  // El número de factura lo asigna el backend (FC-000001, FC-000002...).
  // numeroPrevio es solo la vista previa del que le va a tocar.
  const [numeroPrevio, setNumeroPrevio] = useState('')
  const [lineas, setLineas] = useState([])
  // Arranca como lo dejó el ADMIN en Mi empresa; se puede cambiar solo para
  // esta compra.
  const [costoIncluyeIva, setCostoIncluyeIva] = useState(iva.incluyeIva)

  // IVA de una línea: el escrito; si está vacío, el IVA por defecto de Mi empresa.
  const ivaDeLinea = (linea) =>
    linea.iva_pct === '' || linea.iva_pct == null ? iva.ivaPct : Number(linea.iva_pct)

  // Alta rápida de producto desde una línea: { indice, texto } o null.
  const [altaProducto, setAltaProducto] = useState(null)

  const [detalle, setDetalle] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [listaCompras, listaProv, listaProd] = await Promise.all([
        api.listarCompras({
          proveedorId: filtroProveedor || undefined,
          estado: filtroEstado || undefined,
          desde: desde || undefined,
          hasta: hasta || undefined,
        }),
        api.listarProveedores(),
        api.listarProductos(),
      ])
      setCompras(listaCompras)
      setProveedores(listaProv)
      setProductos(listaProd)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [filtroProveedor, filtroEstado, desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  const pag = usePaginacion(compras, `${filtroProveedor}|${filtroEstado}|${desde}|${hasta}`)

  const resumen = useMemo(() => {
    const recibidas = compras.filter((c) => c.estado === 'RECIBIDA')
    return {
      cantidad: recibidas.length,
      total: recibidas.reduce((s, c) => s + Number(c.total), 0),
      anuladas: compras.length - recibidas.length,
    }
  }, [compras])

  // --- Formulario de compra ---------------------------------------------------
  function abrirNueva() {
    if (proveedores.length === 0) {
      setError('Primero registra un proveedor.')
      return
    }
    setProveedorId(String(proveedores[0].id))
    setNumeroPrevio('')
    api
      .siguienteNumeroCompra()
      .then((r) => setNumeroPrevio(r.numero))
      .catch(() => setNumeroPrevio(''))
    setCostoIncluyeIva(iva.incluyeIva)
    setLineas([lineaVacia()])
    setPanelAbierto(true)
    setError('')
  }

  function cerrarPanel() {
    setPanelAbierto(false)
    setLineas([])
  }

  function agregarLinea() {
    setLineas((l) => [...l, lineaVacia()])
  }

  function quitarLinea(indice) {
    setLineas((l) => l.filter((_, i) => i !== indice))
  }

  function cambiarLinea(indice, campo, valor) {
    setLineas((l) =>
      l.map((linea, i) => {
        if (i !== indice) return linea
        const actualizada = { ...linea, [campo]: valor }
        // Al elegir producto: toma su IVA y propone su último costo como punto
        // de partida (con el IVA sumado si los costos de la factura lo traen).
        if (campo === 'producto_id') {
          actualizada.nuevo = null
          const p = productos.find((x) => String(x.id) === String(valor))
          if (p) {
            actualizada.iva_pct = String(Number(p.iva_pct))
            if (!linea.costo_unitario) {
              const costo = Number(p.costo)
              const conIva = costoIncluyeIva ? costo * (1 + Number(p.iva_pct) / 100) : costo
              actualizada.costo_unitario = String(Math.round(conIva * 100) / 100)
            }
          }
        }
        return actualizada
      }),
    )
  }

  // El producto nuevo queda en su línea, pendiente: el backend lo crea junto
  // con la compra. Si la compra no se registra, no queda guardado.
  function productoListo(datosNuevo) {
    const { indice } = altaProducto
    setLineas((l) =>
      l.map((linea, i) =>
        i === indice
          ? {
              ...linea,
              producto_id: '',
              nuevo: datosNuevo,
              iva_pct: linea.iva_pct || String(iva.ivaPct),
            }
          : linea,
      ),
    )
    setAltaProducto(null)
  }

  const totales = useMemo(() => {
    let subtotal = 0
    let totalIva = 0
    let total = 0
    for (const linea of lineas) {
      if (!linea.producto_id && !linea.nuevo) continue
      const d = desglosarIva(
        linea.costo_unitario || 0,
        linea.cantidad || 0,
        ivaDeLinea(linea),
        costoIncluyeIva,
      )
      subtotal += d.subtotal
      totalIva += d.iva
      total += d.total
    }
    return { subtotal, iva: totalIva, total }
  }, [lineas, costoIncluyeIva, iva.ivaPct])

  async function guardar(evento) {
    evento.preventDefault()
    const items = lineas
      .filter((l) => (l.producto_id || l.nuevo) && Number(l.cantidad) > 0)
      .map((l) => ({
        ...(l.nuevo ? { producto_nuevo: l.nuevo } : { producto_id: Number(l.producto_id) }),
        cantidad: Number(l.cantidad),
        costo_unitario: Number(l.costo_unitario || 0),
        iva_pct: ivaDeLinea(l),
      }))

    if (items.length === 0) {
      setError('Agrega al menos un producto con cantidad mayor a cero.')
      return
    }

    setGuardando(true)
    try {
      await api.crearCompra({
        proveedor_id: Number(proveedorId),
        costo_incluye_iva: costoIncluyeIva,
        items,
      })
      cerrarPanel()
      cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  // --- Detalle y anulación ----------------------------------------------------
  async function verDetalle(id) {
    try {
      setDetalle(await api.verCompra(id))
    } catch (e) {
      setError(e.message)
    }
  }

  async function anular(compra) {
    const motivo = window.prompt(
      `Anular la compra ${compra.numero_factura}. El stock que entró se devuelve.\n\n¿Motivo?`,
      '',
    )
    if (motivo === null) return
    try {
      await api.anularCompra(compra.id, motivo || null)
      setDetalle(null)
      cargar()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <section>
      {/* El título, el resumen y los filtros se quedan fijos arriba mientras
          baja la tabla. */}
      <CabeceraFija>
        <div className="titulo-vista">
          <div>
            <h2>Compras</h2>
            <p className="sutil">
              {esAdmin
                ? 'Registrar una compra suma el stock y deja el movimiento en el kardex'
                : 'Consulta de las compras registradas por administración'}
            </p>
          </div>
          {esAdmin && (
            <button className="btn btn-primario" onClick={abrirNueva}>
              + Registrar compra
            </button>
          )}
        </div>

        <div className="tarjetas-resumen">
          <div className="tarjeta-dato">
            <span className="dato-etiqueta">Compras recibidas</span>
            <strong className="dato-valor">{resumen.cantidad}</strong>
          </div>
          <div className="tarjeta-dato">
            <span className="dato-etiqueta">Total comprado</span>
            <strong className="dato-valor">{pesos.format(resumen.total)}</strong>
          </div>
          <div className={`tarjeta-dato ${resumen.anuladas ? 'alerta' : ''}`}>
            <span className="dato-etiqueta">Anuladas</span>
            <strong className="dato-valor">{resumen.anuladas}</strong>
          </div>
        </div>

        {error && <p className="aviso aviso-error">{error}</p>}

        <div className="barra-filtros">
          <label className="campo-inline">
            <span className="sutil">Desde</span>
            <input
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
            />
          </label>
          <label className="campo-inline">
            <span className="sutil">Hasta</span>
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
            />
          </label>
          <select
            value={filtroProveedor}
            onChange={(e) => setFiltroProveedor(e.target.value)}
          >
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="RECIBIDA">Recibidas</option>
            <option value="ANULADA">Anuladas</option>
          </select>

          <Paginacion {...pag} enBarra />
        </div>
      </CabeceraFija>

      <div className="tabla-envoltura">
        <table>
          <thead>
            <tr>
              <th>Factura</th>
              <th>Proveedor</th>
              <th>Fecha</th>
              <th className="derecha">Subtotal</th>
              <th className="derecha">IVA</th>
              <th className="derecha">Total</th>
              <th className="centro">Estado</th>
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
              pag.visibles.map((c) => (
                <tr key={c.id} className={c.estado === 'ANULADA' ? 'fila-inactiva' : ''}>
                  <td className="mono">{c.numero_factura}</td>
                  <td>{c.proveedor.nombre}</td>
                  <td className="sutil">{formatearFecha(c.fecha)}</td>
                  <td className="derecha sutil">{pesos.format(Number(c.subtotal))}</td>
                  <td className="derecha sutil">{pesos.format(Number(c.total_iva))}</td>
                  <td className="derecha">
                    <strong>{pesos.format(Number(c.total))}</strong>
                  </td>
                  <td className="centro">
                    <span
                      className={
                        c.estado === 'ANULADA' ? 'etiqueta gris' : 'etiqueta verde'
                      }
                    >
                      {c.estado}
                    </span>
                  </td>
                  <td className="derecha acciones">
                    <button className="btn btn-suave" onClick={() => verDetalle(c.id)}>
                      Ver
                    </button>
                    {esAdmin && c.estado === 'RECIBIDA' && (
                      <button className="btn btn-peligro" onClick={() => anular(c)}>
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              ))}

            {!cargando && compras.length === 0 && (
              <tr>
                <td colSpan="8" className="celda-vacia">
                  Todavía no hay compras registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- Registrar compra ---------- */}
      {panelAbierto && (
        <div className="fondo-modal" onClick={cerrarPanel}>
          <form
            className="modal modal-ancho"
            onClick={(e) => e.stopPropagation()}
            onSubmit={guardar}
          >
            <h3>Registrar compra</h3>

            <div className="rejilla-form">
              <label className="campo campo-ancho">
                <span>Proveedor</span>
                <select
                  required
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                >
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.nit})
                    </option>
                  ))}
                </select>
              </label>

              <label className="campo">
                <span>Número de factura</span>
                <input
                  className="mono-entrada"
                  readOnly
                  tabIndex={-1}
                  value={numeroPrevio || '—'}
                />
                <small className="sutil">Se asigna solo, en orden consecutivo.</small>
              </label>
            </div>

            <div className="caja-iva">
              <label className="check">
                <input
                  type="checkbox"
                  checked={costoIncluyeIva}
                  onChange={(e) => setCostoIncluyeIva(e.target.checked)}
                />
                Los costos de esta factura ya incluyen IVA
              </label>
              <p className="sutil">
                {costoIncluyeIva
                  ? 'Se guardará la base sin impuesto: el IVA de compra es descontable y no hace parte del valor del inventario.'
                  : 'El costo es la base y el IVA se calcula encima.'}
              </p>
            </div>

            <div className="lineas-compra">
              <div className="lineas-titulo">
                <strong>Productos</strong>
                <button type="button" className="btn btn-suave" onClick={agregarLinea}>
                  + Agregar línea
                </button>
              </div>

              <table className="tabla-lineas">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="centro">Cantidad</th>
                    <th className="derecha">Costo unitario</th>
                    <th className="centro">IVA %</th>
                    <th className="derecha">Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((linea, i) => {
                    const producto = productos.find(
                      (p) => String(p.id) === String(linea.producto_id),
                    )
                    const sub =
                      producto || linea.nuevo
                        ? desglosarIva(
                            linea.costo_unitario || 0,
                            linea.cantidad || 0,
                            ivaDeLinea(linea),
                            costoIncluyeIva,
                          ).total
                        : 0
                    return (
                      <tr key={i}>
                        <td>
                          <BuscadorProducto
                            productos={productos}
                            productoId={linea.producto_id}
                            etiquetaNuevo={linea.nuevo ? `${linea.nuevo.nombre} · nuevo` : ''}
                            onElegir={(p) => cambiarLinea(i, 'producto_id', String(p.id))}
                            onCrear={(texto) => setAltaProducto({ indice: i, texto })}
                          />
                          {producto && (
                            <small className="sutil">
                              Stock actual: {producto.stock_actual} {producto.unidad_medida}
                            </small>
                          )}
                          {linea.nuevo && (
                            <small className="sutil">
                              Producto nuevo: se crea al registrar la compra.
                            </small>
                          )}
                        </td>
                        <td className="centro">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={linea.cantidad}
                            onChange={(e) => cambiarLinea(i, 'cantidad', e.target.value)}
                          />
                        </td>
                        <td className="derecha">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={linea.costo_unitario}
                            onChange={(e) =>
                              cambiarLinea(i, 'costo_unitario', e.target.value)
                            }
                          />
                        </td>
                        <td className="centro">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            className="entrada-corta"
                            title="IVA de este producto. Queda guardado en el producto para las ventas."
                            placeholder={String(iva.ivaPct)}
                            value={linea.iva_pct}
                            onChange={(e) => cambiarLinea(i, 'iva_pct', e.target.value)}
                          />
                        </td>
                        <td className="derecha">{pesos.format(sub)}</td>
                        <td className="derecha">
                          {lineas.length > 1 && (
                            <button
                              type="button"
                              className="btn-mini"
                              title="Quitar línea"
                              onClick={() => quitarLinea(i)}
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <div className="totales">
                <div>
                  <span className="sutil">Subtotal</span>
                  <strong>{pesos.format(totales.subtotal)}</strong>
                </div>
                <div>
                  <span className="sutil">IVA</span>
                  <strong>{pesos.format(totales.iva)}</strong>
                </div>
                <div className="total-grande">
                  <span className="sutil">Total</span>
                  <strong>{pesos.format(totales.total)}</strong>
                </div>
              </div>
            </div>

            <div className="modal-pie">
              <button type="button" className="btn btn-suave" onClick={cerrarPanel}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primario" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Registrar compra'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fuera del formulario de la compra: un <form> no puede ir dentro de otro. */}
      {altaProducto && (
        <ProductoRapido
          // Si lo escrito es un código escaneado, va al campo del código, no al nombre.
          nombreInicial={pareceCodigo(altaProducto.texto) ? '' : altaProducto.texto}
          codigoInicial={pareceCodigo(altaProducto.texto) ? altaProducto.texto : ''}
          onCerrar={() => setAltaProducto(null)}
          onListo={productoListo}
        />
      )}

      {/* ---------- Detalle ---------- */}
      {detalle && (
        <div className="fondo-modal" onClick={() => setDetalle(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Compra {detalle.numero_factura}</h3>
            <p className="sutil">
              {detalle.proveedor.nombre} · NIT {detalle.proveedor.nit} ·{' '}
              {formatearFecha(detalle.fecha)} ·{' '}
              <span
                className={
                  detalle.estado === 'ANULADA' ? 'etiqueta gris' : 'etiqueta verde'
                }
              >
                {detalle.estado}
              </span>
            </p>

            <div className="tabla-envoltura" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th className="centro">Cantidad</th>
                    <th className="derecha">Costo</th>
                    <th className="centro">IVA</th>
                    <th className="derecha">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.items.map((it) => (
                    <tr key={it.id}>
                      <td className="mono">{it.producto.sku}</td>
                      <td>{it.producto.nombre}</td>
                      <td className="centro">
                        {Number(it.cantidad)} {it.producto.unidad_medida}
                      </td>
                      <td className="derecha">{pesos.format(Number(it.costo_unitario))}</td>
                      <td className="centro">
                        {it.iva_pct != null ? `${Number(it.iva_pct)}%` : '—'}
                      </td>
                      <td className="derecha">{pesos.format(Number(it.subtotal_linea))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="totales">
              <div>
                <span className="sutil">Subtotal</span>
                <strong>{pesos.format(Number(detalle.subtotal))}</strong>
              </div>
              <div>
                <span className="sutil">IVA</span>
                <strong>{pesos.format(Number(detalle.total_iva))}</strong>
              </div>
              <div className="total-grande">
                <span className="sutil">Total</span>
                <strong>{pesos.format(Number(detalle.total))}</strong>
              </div>
            </div>

            <div className="modal-pie">
              {esAdmin && detalle.estado === 'RECIBIDA' && (
                <button className="btn btn-peligro" onClick={() => anular(detalle)}>
                  Anular compra
                </button>
              )}
              <button className="btn btn-suave" onClick={() => setDetalle(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
