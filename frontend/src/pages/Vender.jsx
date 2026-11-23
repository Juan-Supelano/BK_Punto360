import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, desglosarIva, ivaDelComercio, pesos } from '../api.js'
import { useAuth } from '../auth.jsx'
import ClienteRapido from '../ClienteRapido.jsx'
import Recibo, { imprimir } from '../Recibo.jsx'
import { buscarProductos, pareceCodigo, productoExacto } from '../texto.js'

const METODOS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'MIXTO']

// Valor de la última opción del listado de clientes: no es un cliente, abre
// el formulario de alta rápida.
const NUEVO_CLIENTE = 'nuevo'

// La venta en curso se guarda en sessionStorage: si el cajero va a otro
// módulo (o recarga la página) y vuelve, los productos siguen ahí. Se borra al
// cobrar, al vaciar la venta o al cerrar la pestaña. Va por usuario para que
// otro cajero en el mismo equipo no herede la venta.
const llaveBorrador = (usuarioId) => `punto360_venta_en_curso_${usuarioId}`

function leerBorrador(usuarioId) {
  try {
    return JSON.parse(sessionStorage.getItem(llaveBorrador(usuarioId))) || null
  } catch {
    return null
  }
}

// Al volver, el stock y el precio pueden haber cambiado: el carrito toma los
// datos frescos y suelta lo que ya no existe o se agotó.
function reconciliar(carrito, productos) {
  return carrito.flatMap((linea) => {
    const fresco = productos.find((p) => p.id === linea.producto.id)
    if (!fresco || fresco.stock_actual <= 0) return []
    return [{ producto: fresco, cantidad: Math.min(linea.cantidad, fresco.stock_actual) }]
  })
}

export default function Vender() {
  const { usuario } = useAuth()
  const comercio = usuario?.comercio
  // Valor por defecto de la casilla de IVA (Mi empresa). El porcentaje es el
  // de cada producto.
  const iva = ivaDelComercio(comercio)

  const [productos, setProductos] = useState([])
  const [clientes, setClientes] = useState([])

  // Se lee una sola vez, al montar la pantalla.
  const [borrador] = useState(() => leerBorrador(usuario?.id))

  const [texto, setTexto] = useState('')
  // Resultado del buscador marcado con las flechas; Enter agrega ese.
  const [activo, setActivo] = useState(0)
  const [carrito, setCarrito] = useState(borrador?.carrito ?? [])
  const [clienteId, setClienteId] = useState(borrador?.clienteId ?? '')
  const [metodoPago, setMetodoPago] = useState(borrador?.metodoPago ?? 'EFECTIVO')
  const [observaciones, setObservaciones] = useState(borrador?.observaciones ?? '')
  const [recibido, setRecibido] = useState(borrador?.recibido ?? '')
  // Arranca como lo dejó el ADMIN en Mi empresa; se puede cambiar solo para
  // esta venta.
  const [incluyeIva, setIncluyeIva] = useState(borrador?.incluyeIva ?? iva.incluyeIva)
  const [recuperada, setRecuperada] = useState(borrador?.carrito?.length > 0)

  const [error, setError] = useState('')
  const [cobrando, setCobrando] = useState(false)
  const [comprobante, setComprobante] = useState(null)
  const [altaCliente, setAltaCliente] = useState(false)

  const buscador = useRef(null)

  const cargar = useCallback(async () => {
    try {
      const [prods, clis] = await Promise.all([
        api.listarProductos(),
        api.listarClientes(),
      ])
      setProductos(prods)
      setClientes(clis)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (productos.length > 0) setCarrito((c) => reconciliar(c, productos))
  }, [productos])

  // Guarda la venta en curso cada vez que cambia.
  useEffect(() => {
    if (!usuario) return
    const llave = llaveBorrador(usuario.id)
    const vacia =
      carrito.length === 0 &&
      !clienteId &&
      !observaciones &&
      !recibido &&
      metodoPago === 'EFECTIVO' &&
      incluyeIva === iva.incluyeIva
    try {
      if (vacia) {
        sessionStorage.removeItem(llave)
      } else {
        sessionStorage.setItem(
          llave,
          JSON.stringify({ carrito, clienteId, metodoPago, observaciones, recibido, incluyeIva }),
        )
      }
    } catch {
      // Almacenamiento lleno o bloqueado: la venta sigue funcionando sin borrador.
    }
  }, [usuario, carrito, clienteId, metodoPago, observaciones, recibido, incluyeIva, iva.incluyeIva])

  // --- Búsqueda de productos --------------------------------------------------
  // Se normalizan los dos lados: lo escrito y lo guardado.
  // Los agotados van al final: Enter siempre cae primero en uno con stock.
  const coincidencias = useMemo(
    () => buscarProductos(productos, texto, { conStockPrimero: true }),
    [texto, productos],
  )

  function agregar(producto) {
    if (producto.stock_actual <= 0) {
      setError(`${producto.nombre} está sin stock.`)
      return
    }
    setError('')
    setCarrito((c) => {
      const existente = c.find((l) => l.producto.id === producto.id)
      if (existente) {
        if (existente.cantidad >= producto.stock_actual) {
          setError(
            `Solo hay ${producto.stock_actual} de ${producto.nombre} en stock.`,
          )
          return c
        }
        return c.map((l) =>
          l.producto.id === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l,
        )
      }
      return [...c, { producto, cantidad: 1 }]
    })
    setTexto('')
    setActivo(0)
    buscador.current?.focus()
  }

  function cambiarCantidad(productoId, cantidad) {
    setCarrito((c) =>
      c.map((l) => {
        if (l.producto.id !== productoId) return l
        const n = Math.max(1, Math.min(Number(cantidad) || 1, l.producto.stock_actual))
        return { ...l, cantidad: n }
      }),
    )
  }

  function quitar(productoId) {
    setCarrito((c) => c.filter((l) => l.producto.id !== productoId))
  }

  function elegirCliente(valor) {
    if (valor === NUEVO_CLIENTE) {
      setAltaCliente(true) // el select se queda con el cliente que tenía
    } else {
      setClienteId(valor)
    }
  }

  // El cliente recién creado entra al listado (en orden) y queda elegido.
  function clienteCreado(cliente) {
    setClientes((lista) =>
      [...lista, cliente].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    )
    setClienteId(String(cliente.id))
    setAltaCliente(false)
  }

  function limpiar() {
    setCarrito([])
    setClienteId('')
    setMetodoPago('EFECTIVO')
    setObservaciones('')
    setRecibido('')
    setIncluyeIva(iva.incluyeIva)
    setError('')
    setRecuperada(false)
  }

  // Teclado del buscador, para vender sin soltar el teclado:
  // flechas para moverse por los resultados, Enter agrega el marcado y Escape
  // borra la búsqueda.
  function teclaBuscador(evento) {
    const total = coincidencias.length
    if (evento.key === 'ArrowDown' && total > 0) {
      evento.preventDefault()
      setActivo((i) => (i + 1) % total)
    } else if (evento.key === 'ArrowUp' && total > 0) {
      evento.preventDefault()
      setActivo((i) => (i - 1 + total) % total)
    } else if (evento.key === 'Enter') {
      evento.preventDefault()
      // Primero el código de barras o SKU exacto (lo que manda un lector).
      const exacto = productoExacto(productos, texto)
      if (exacto) {
        agregar(exacto)
      } else if (pareceCodigo(texto)) {
        setError(`Código no registrado: ${texto.trim()}`)
        setTexto('')
        setActivo(0)
      } else if (total > 0) {
        agregar(coincidencias[Math.min(activo, total - 1)])
      }
    } else if (evento.key === 'Escape') {
      setTexto('')
      setActivo(0)
    }
  }

  // --- Totales ----------------------------------------------------------------
  const totales = useMemo(() => {
    let subtotal = 0
    let totalIva = 0
    let total = 0
    for (const l of carrito) {
      const d = desglosarIva(l.producto.precio_venta, l.cantidad, l.producto.iva_pct, incluyeIva)
      subtotal += d.subtotal
      totalIva += d.iva
      total += d.total
    }
    return { subtotal, iva: totalIva, total }
  }, [carrito, incluyeIva])

  const cambio =
    metodoPago === 'EFECTIVO' && recibido !== ''
      ? Number(recibido) - totales.total
      : null

  // --- Cobrar -----------------------------------------------------------------
  async function cobrar() {
    if (carrito.length === 0) return
    setCobrando(true)
    setError('')
    try {
      const venta = await api.crearVenta({
        cliente_id: clienteId ? Number(clienteId) : null,
        metodo_pago: metodoPago,
        precio_incluye_iva: incluyeIva,
        observaciones: observaciones.trim() || null,
        items: carrito.map((l) => ({
          producto_id: l.producto.id,
          cantidad: l.cantidad,
        })),
      })
      setComprobante({ venta, recibido: recibido ? Number(recibido) : null })
      limpiar()
      cargar() // el stock cambió
    } catch (e) {
      setError(e.message)
    } finally {
      setCobrando(false)
    }
  }

  return (
    <section>
      <div className="titulo-vista">
        <div>
          <h2>Vender</h2>
          <p className="sutil">
            Escanea el código o busca por nombre o SKU; muévete con ↑ ↓ y presiona Enter para agregar
          </p>
        </div>
        {carrito.length > 0 && (
          <button className="btn btn-suave" onClick={limpiar}>
            Vaciar venta
          </button>
        )}
      </div>

      {error && <p className="aviso aviso-error">{error}</p>}
      {recuperada && carrito.length > 0 && (
        <p className="aviso">
          Se recuperó la venta que tenías en curso. Cóbrala o usa “Vaciar venta” para empezar
          otra.
        </p>
      )}

      <div className="pos">
        {/* ---------- Izquierda: buscador y carrito ---------- */}
        <div className="pos-principal">
          <div className="pos-buscador">
            <input
              ref={buscador}
              type="search"
              autoFocus
              placeholder="Escanea o escribe nombre / SKU…"
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value)
                setActivo(0)
              }}
              onKeyDown={teclaBuscador}
              role="combobox"
              aria-expanded={coincidencias.length > 0}
              aria-controls="sugerencias-venta"
            />
            {coincidencias.length > 0 && (
              <ul className="sugerencias" id="sugerencias-venta" role="listbox">
                {coincidencias.map((p, i) => (
                  <li key={p.id} role="option" aria-selected={i === activo}>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={i === activo ? 'sugerencia activa' : 'sugerencia'}
                      onMouseEnter={() => setActivo(i)}
                      onClick={() => agregar(p)}
                      disabled={p.stock_actual <= 0}
                    >
                      <span className="mono">{p.sku}</span>
                      <span className="sug-nombre">
                        {p.nombre}
                        {p.codigo_barras && <small className="codigo-barras">{p.codigo_barras}</small>}
                      </span>
                      <span className="sug-stock">
                        {p.stock_actual > 0 ? `${p.stock_actual} disp.` : 'sin stock'}
                      </span>
                      <strong>{pesos.format(Number(p.precio_venta))}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="derecha">Precio</th>
                  <th className="centro">Cantidad</th>
                  <th className="derecha">Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {carrito.map((l) => (
                  <tr key={l.producto.id}>
                    <td>
                      <strong>{l.producto.nombre}</strong>
                      <div className="sutil mono">
                        {l.producto.sku}
                        {l.producto.codigo_barras && (
                          <span className="codigo-barras"> · {l.producto.codigo_barras}</span>
                        )}
                      </div>
                    </td>
                    <td className="derecha">
                      {pesos.format(Number(l.producto.precio_venta))}
                    </td>
                    <td className="centro">
                      <div className="control-stock">
                        <button
                          className="btn-mini"
                          onClick={() => cambiarCantidad(l.producto.id, l.cantidad - 1)}
                        >
                          −
                        </button>
                        <input
                          className="cantidad-pos"
                          type="number"
                          min="1"
                          max={l.producto.stock_actual}
                          value={l.cantidad}
                          onChange={(e) =>
                            cambiarCantidad(l.producto.id, e.target.value)
                          }
                        />
                        <button
                          className="btn-mini"
                          onClick={() => cambiarCantidad(l.producto.id, l.cantidad + 1)}
                        >
                          +
                        </button>
                      </div>
                      <div className="sutil">de {l.producto.stock_actual}</div>
                    </td>
                    <td className="derecha">
                      <strong>
                        {pesos.format(
                          desglosarIva(
                            l.producto.precio_venta,
                            l.cantidad,
                            l.producto.iva_pct,
                            incluyeIva,
                          ).total,
                        )}
                      </strong>
                    </td>
                    <td className="derecha">
                      <button
                        className="btn-mini"
                        title="Quitar"
                        onClick={() => quitar(l.producto.id)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}

                {carrito.length === 0 && (
                  <tr>
                    <td colSpan="5" className="celda-vacia">
                      La venta está vacía. Busca un producto arriba.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------- Derecha: cobro ---------- */}
        <aside className="pos-cobro">
          <div className="tarjeta">
            <label className="campo">
              <span>Cliente (opcional)</span>
              <select value={clienteId} onChange={(e) => elegirCliente(e.target.value)}>
                <option value="">Consumidor final</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · {c.num_doc}
                  </option>
                ))}
                <option value={NUEVO_CLIENTE}>+ Añadir cliente…</option>
              </select>
            </label>

            <label className="campo">
              <span>Método de pago</span>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
              >
                {METODOS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            {metodoPago === 'EFECTIVO' && (
              <label className="campo">
                <span>Recibe</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  placeholder="0"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value)}
                />
              </label>
            )}

            <label className="campo">
              <span>Observaciones</span>
              <input
                placeholder="Opcional"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </label>

            <div className="caja-iva">
              <label className="check">
                <input
                  type="checkbox"
                  checked={incluyeIva}
                  onChange={(e) => setIncluyeIva(e.target.checked)}
                />
                Los precios ya incluyen IVA
              </label>
              <p className="sutil">
                {incluyeIva
                  ? 'El cliente paga el precio de la etiqueta y la factura desglosa el impuesto por dentro.'
                  : 'El precio es la base y el IVA se suma encima: el cliente paga más que la etiqueta.'}
              </p>
            </div>

            <div className="cobro-totales">
              <div>
                <span className="sutil">Subtotal</span>
                <strong>{pesos.format(totales.subtotal)}</strong>
              </div>
              <div>
                <span className="sutil">IVA</span>
                <strong>{pesos.format(totales.iva)}</strong>
              </div>
              <div className="cobro-total">
                <span>Total</span>
                <strong>{pesos.format(totales.total)}</strong>
              </div>
              {cambio !== null && (
                <div className={cambio < 0 ? 'cobro-cambio falta' : 'cobro-cambio'}>
                  <span className="sutil">{cambio < 0 ? 'Faltan' : 'Cambio'}</span>
                  <strong>{pesos.format(Math.abs(cambio))}</strong>
                </div>
              )}
            </div>

            <button
              className="btn btn-primario btn-ancho btn-cobrar"
              disabled={carrito.length === 0 || cobrando}
              onClick={cobrar}
            >
              {cobrando ? 'Registrando…' : 'Cobrar'}
            </button>

            <p className="nota">
              Los totales definitivos los calcula el backend con el precio y el IVA
              que tenga cada producto al momento de guardar.
            </p>
          </div>
        </aside>
      </div>

      {/* ---------- Comprobante ---------- */}
      {comprobante && (
        <div className="fondo-modal" onClick={() => setComprobante(null)}>
          <div className="modal modal-angosto" onClick={(e) => e.stopPropagation()}>
            <div className="recibo-cabeza">
              <span className="etiqueta verde">Venta registrada</span>
              <h3>{comprobante.venta.numero}</h3>
              <p className="sutil">
                {comprobante.venta.cliente?.nombre || 'Consumidor final'} ·{' '}
                {comprobante.venta.metodo_pago}
              </p>
            </div>

            <table className="tabla-lineas">
              <tbody>
                {comprobante.venta.items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      {Number(it.cantidad)} × {it.producto.nombre}
                    </td>
                    <td className="derecha">
                      {pesos.format(Number(it.total_linea))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="cobro-totales">
              <div>
                <span className="sutil">Subtotal</span>
                <strong>{pesos.format(Number(comprobante.venta.subtotal))}</strong>
              </div>
              <div>
                <span className="sutil">IVA</span>
                <strong>{pesos.format(Number(comprobante.venta.total_iva))}</strong>
              </div>
              <div className="cobro-total">
                <span>Total</span>
                <strong>{pesos.format(Number(comprobante.venta.total))}</strong>
              </div>
              {comprobante.recibido !== null && (
                <div className="cobro-cambio">
                  <span className="sutil">Cambio</span>
                  <strong>
                    {pesos.format(
                      comprobante.recibido - Number(comprobante.venta.total),
                    )}
                  </strong>
                </div>
              )}
            </div>

            <div className="modal-pie">
              <button className="btn btn-suave" onClick={imprimir}>
                Imprimir
              </button>
              <button
                className="btn btn-primario"
                onClick={() => {
                  setComprobante(null)
                  buscador.current?.focus()
                }}
              >
                Nueva venta
              </button>
            </div>
          </div>

          {/* Oculto en pantalla: es lo único que sale al imprimir. */}
          <Recibo
            venta={comprobante.venta}
            comercio={comercio}
            recibido={comprobante.recibido}
          />
        </div>
      )}

      {altaCliente && (
        <ClienteRapido onCerrar={() => setAltaCliente(false)} onCreado={clienteCreado} />
      )}
    </section>
  )
}
