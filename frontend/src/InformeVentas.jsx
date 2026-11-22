import { createPortal } from 'react-dom'
import { pesos } from './api.js'

const fechaHora = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const METODOS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'MIXTO']

function formatear(valor) {
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? '' : fechaHora.format(d)
}

// "2026-11-16" -> "16/11/2026". No pasa por Date, que lo correría un día
// por la zona horaria.
function dia(iso) {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

const sumar = (lista, campo) => lista.reduce((s, v) => s + Number(v[campo]), 0)

function agrupar(lista, clave) {
  const grupos = {}
  for (const v of lista) {
    const nombre = clave(v)
    if (!grupos[nombre]) grupos[nombre] = { nombre, ventas: 0, total: 0 }
    grupos[nombre].ventas += 1
    grupos[nombre].total += Number(v.total)
  }
  return Object.values(grupos)
}

/**
 * Informe de ventas para hoja carta o A4.
 *
 * Igual que el recibo, se monta con un portal en <body> y solo se ve al
 * imprimir. Recibe las ventas que ya filtró la pantalla de Ventas, así que se
 * imprime lo mismo que se está viendo. Las anuladas se listan tachadas y no
 * suman en los totales.
 */
export default function InformeVentas({
  ventas,
  desde,
  hasta,
  cajero,
  estado,
  comercio,
  usuario,
}) {
  const ordenadas = [...ventas].sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
  const pagadas = ordenadas.filter((v) => v.estado === 'PAGADA')
  const anuladas = ordenadas.filter((v) => v.estado === 'ANULADA')
  const subtotal = sumar(pagadas, 'subtotal')
  const iva = sumar(pagadas, 'total_iva')
  const total = sumar(pagadas, 'total')

  const porMetodo = agrupar(pagadas, (v) => v.metodo_pago).sort(
    (a, b) => METODOS.indexOf(a.nombre) - METODOS.indexOf(b.nombre),
  )
  const porCajero = agrupar(pagadas, (v) => v.usuario?.nombre || 'Sin cajero').sort(
    (a, b) => b.total - a.total,
  )

  return createPortal(
    <div className="informe-print">
      <header className="inf-cabeza">
        <div className="inf-empresa">
          {comercio?.logo_url && <img className="inf-logo" src={comercio.logo_url} alt="" />}
          <div>
            <div className="inf-comercio">
              {comercio?.nombre_visible || comercio?.razon_social || 'Punto360®'}
            </div>
            <div>NIT {comercio?.nit}</div>
          </div>
        </div>
        <div className="inf-titulo">
          <h1>Informe de ventas</h1>
          <div>
            Del {dia(desde)} al {dia(hasta)}
          </div>
        </div>
      </header>

      <p className="inf-filtros">
        Cajero: {cajero} · Estado: {estado} · Generado el {formatear(new Date())} por{' '}
        {usuario?.nombre}
      </p>

      <div className="inf-resumen">
        <div>
          <span>Ventas pagadas</span>
          <strong>{pagadas.length}</strong>
        </div>
        <div>
          <span>Subtotal</span>
          <strong>{pesos.format(subtotal)}</strong>
        </div>
        <div>
          <span>IVA</span>
          <strong>{pesos.format(iva)}</strong>
        </div>
        <div>
          <span>Total vendido</span>
          <strong>{pesos.format(total)}</strong>
        </div>
        <div>
          <span>Ticket promedio</span>
          <strong>{pesos.format(pagadas.length ? total / pagadas.length : 0)}</strong>
        </div>
        <div>
          <span>Anuladas</span>
          <strong>
            {anuladas.length} · {pesos.format(sumar(anuladas, 'total'))}
          </strong>
        </div>
      </div>

      {pagadas.length > 0 && (
        <div className="inf-grupos">
          {[
            ['Forma de pago', porMetodo],
            ['Cajero', porCajero],
          ].map(([titulo, filas]) => (
            <table key={titulo} className="inf-tabla">
              <thead>
                <tr>
                  <th>{titulo}</th>
                  <th className="inf-num">Ventas</th>
                  <th className="inf-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.nombre}>
                    <td>{f.nombre}</td>
                    <td className="inf-num">{f.ventas}</td>
                    <td className="inf-num">{pesos.format(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      )}

      <table className="inf-tabla inf-detalle">
        <thead>
          <tr>
            <th>Número</th>
            <th>Fecha</th>
            <th>Cajero</th>
            <th>Cliente</th>
            <th>Pago</th>
            <th className="inf-num">Subtotal</th>
            <th className="inf-num">IVA</th>
            <th className="inf-num">Total</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((v) => (
            <tr key={v.id} className={v.estado === 'ANULADA' ? 'inf-anulada' : ''}>
              <td className="sin-salto">{v.numero}</td>
              <td className="sin-salto">{formatear(v.fecha)}</td>
              <td>{v.usuario?.nombre || '—'}</td>
              <td>{v.cliente?.nombre || 'Consumidor final'}</td>
              <td>{v.metodo_pago}</td>
              <td className="inf-num">{pesos.format(Number(v.subtotal))}</td>
              <td className="inf-num">{pesos.format(Number(v.total_iva))}</td>
              <td className="inf-num">{pesos.format(Number(v.total))}</td>
              <td>{v.estado}</td>
            </tr>
          ))}

          {ordenadas.length === 0 && (
            <tr>
              <td colSpan="9">No hay ventas en ese rango de fechas.</td>
            </tr>
          )}

          {/* Fila normal y no <tfoot>: el navegador repite el tfoot en cada
              hoja y parecería un total por página. */}
          <tr className="inf-total">
            <td colSpan="5">Total ventas pagadas</td>
            <td className="inf-num">{pesos.format(subtotal)}</td>
            <td className="inf-num">{pesos.format(iva)}</td>
            <td className="inf-num">{pesos.format(total)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <p className="inf-pie">
        Las ventas anuladas aparecen tachadas y no suman en los totales.
        <span className="inf-software">Generado con Punto360® · Sistema POS</span>
      </p>
    </div>,
    document.body,
  )
}
