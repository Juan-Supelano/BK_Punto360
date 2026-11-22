import { createPortal } from 'react-dom'
import { pesos } from './api.js'

const fechaLarga = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatear(valor) {
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? '' : fechaLarga.format(d)
}

/**
 * Ticket para impresora térmica de 80 mm.
 *
 * Vive oculto en la página y solo aparece al imprimir. Se monta con un portal
 * directo en <body>, fuera de la app, para que el CSS de @media print saque
 * todo lo demás con display: none y salga una sola copia. Así el mismo
 * componente sirve para el comprobante que ve el cajero al cobrar y para
 * reimprimir una venta vieja desde el admin.
 *
 * No usa fondos: las térmicas son monocromáticas y cualquier gris sale como
 * una mancha. El único color es el sello rojo de las ventas anuladas, que es
 * semitransparente para que en blanco y negro quede gris y deje leer el ticket.
 */
export default function Recibo({ venta, comercio, recibido = null }) {
  if (!venta) return null

  const cambio =
    recibido !== null && recibido !== '' ? Number(recibido) - Number(venta.total) : null
  const anulada = venta.estado === 'ANULADA'

  return createPortal(
    <div className="recibo-print">
      {anulada && (
        <div className="rp-marca-agua" aria-hidden="true">
          <span>ANULADA</span>
        </div>
      )}

      <div className="rp-centro">
        {comercio?.logo_url && (
          <img className="rp-logo" src={comercio.logo_url} alt="" />
        )}
        <div className="rp-titulo">
          {comercio?.nombre_visible || comercio?.razon_social || 'Punto360®'}
        </div>
        {comercio?.razon_social &&
          comercio.razon_social !== comercio.nombre_visible && (
            <div>{comercio.razon_social}</div>
          )}
        <div>NIT {comercio?.nit}</div>
        {comercio?.direccion && <div>{comercio.direccion}</div>}
        {comercio?.ciudad && <div>{comercio.ciudad}</div>}
        {comercio?.telefono && <div>Tel. {comercio.telefono}</div>}
      </div>

      <div className="rp-linea" />

      <div className="rp-fila">
        <span>Factura</span>
        <strong>{venta.numero}</strong>
      </div>
      <div className="rp-fila">
        <span>Fecha</span>
        <span>{formatear(venta.fecha)}</span>
      </div>
      <div className="rp-fila">
        <span>Cajero</span>
        <span>{venta.usuario?.nombre || '—'}</span>
      </div>
      <div className="rp-fila">
        <span>Cliente</span>
        <span>{venta.cliente?.nombre || 'Consumidor final'}</span>
      </div>
      {venta.cliente?.num_doc && (
        <div className="rp-fila">
          <span>Documento</span>
          <span>
            {venta.cliente.tipo_doc} {venta.cliente.num_doc}
          </span>
        </div>
      )}

      {anulada && (
        <>
          <div className="rp-linea" />
          <div className="rp-centro rp-anulada">*** VENTA ANULADA ***</div>
          {venta.motivo_anula && (
            <div className="rp-centro rp-chico">{venta.motivo_anula}</div>
          )}
        </>
      )}

      <div className="rp-linea" />

      <table className="rp-tabla">
        <tbody>
          {venta.items.map((it) => (
            <tr key={it.id}>
              <td colSpan="2" className="rp-producto">
                {it.producto.nombre}
                <div className="rp-chico">
                  {Number(it.cantidad)} {it.producto.unidad_medida} ×{' '}
                  {pesos.format(Number(it.precio_unitario))}
                  {Number(it.iva_pct) > 0 && ` · IVA ${Number(it.iva_pct)}%`}
                </div>
              </td>
              <td className="rp-derecha rp-arriba">
                {pesos.format(Number(it.total_linea))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rp-linea" />

      <div className="rp-fila">
        <span>Subtotal</span>
        <span>{pesos.format(Number(venta.subtotal))}</span>
      </div>
      <div className="rp-fila">
        <span>IVA</span>
        <span>{pesos.format(Number(venta.total_iva))}</span>
      </div>
      <div className="rp-chico">
        {venta.precio_incluye_iva
          ? 'Valores con IVA incluido en el precio'
          : 'IVA calculado sobre el valor base'}
      </div>
      <div className="rp-fila rp-total">
        <strong>TOTAL</strong>
        <strong>{pesos.format(Number(venta.total))}</strong>
      </div>

      <div className="rp-linea" />

      <div className="rp-fila">
        <span>Forma de pago</span>
        <span>{venta.metodo_pago}</span>
      </div>
      {cambio !== null && (
        <>
          <div className="rp-fila">
            <span>Recibido</span>
            <span>{pesos.format(Number(recibido))}</span>
          </div>
          <div className="rp-fila">
            <span>Cambio</span>
            <span>{pesos.format(cambio)}</span>
          </div>
        </>
      )}

      {venta.observaciones && (
        <>
          <div className="rp-linea" />
          <div className="rp-chico">{venta.observaciones}</div>
        </>
      )}

      <div className="rp-linea" />

      <div className="rp-centro rp-chico">
        <div>{venta.items.length} producto(s)</div>
        <div className="rp-pie">Documento no válido como factura electrónica</div>
        <div>¡Gracias por su compra!</div>
      </div>

      <div className="rp-centro rp-chico rp-software">Generado con Punto360® · Sistema POS</div>
    </div>,
    document.body,
  )
}

/**
 * Lanza el diálogo de impresión del navegador.
 *
 * Si el logo del comercio todavía se está descargando, espera a que termine
 * (máximo 3 s); si no, la hoja saldría sin la imagen.
 */
export function imprimir() {
  const pendientes = [
    ...document.querySelectorAll('.recibo-print img, .informe-print img'),
  ].filter((img) => !img.complete)
  if (pendientes.length === 0) {
    window.print()
    return
  }
  let lanzado = false
  const lanzar = () => {
    if (lanzado) return
    lanzado = true
    window.print()
  }
  let faltan = pendientes.length
  const terminar = () => {
    faltan -= 1
    if (faltan === 0) lanzar()
  }
  for (const img of pendientes) {
    img.addEventListener('load', terminar, { once: true })
    img.addEventListener('error', terminar, { once: true })
  }
  setTimeout(lanzar, 3000)
}
