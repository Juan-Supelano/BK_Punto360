import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api, pesos } from '../api.js'

const FILAS_COMPRA = 10

/**
 * Informe predictivo (HU-26). Solo ADMIN.
 *
 * Todo lo calcula el backend con los datos de la propia base (Holt-Winters
 * para la proyección y Poisson para la rotación): no hay APIs externas, así
 * que funciona igual sin internet. Los gráficos se dibujan con SVG a mano,
 * sin librerías.
 */

const HORIZONTES = [7, 15, 30]
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const compacto = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })

// "2026-11-20" -> "20/11". Sin pasar por Date, que lo correría un día.
const diaMes = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const etiquetaMes = (clave) => `${MESES[Number(clave.slice(5, 7)) - 1]} ${clave.slice(2, 4)}`

function fechaLocal(diasAtras = 0) {
  const d = new Date()
  d.setDate(d.getDate() - diasAtras)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// Tope "redondo" para el eje Y (1, 1.5, 2, 2.5... por una potencia de 10).
function topeEje(valor) {
  if (valor <= 0) return 1
  const potencia = 10 ** Math.floor(Math.log10(valor))
  const paso = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * potencia >= valor)
  return paso * potencia
}

const ETIQUETA_NIVEL = { critico: 'Crítico', advertencia: 'Advertencia', normal: 'Normal' }

function Nivel({ nivel, dias }) {
  if (dias === null || dias === undefined) return <span className="sutil">Sin ventas</span>
  if (dias === 0) return <span className="etiqueta nivel-critico">Agotado</span>
  return (
    <span className={`etiqueta nivel-${nivel}`}>
      {numero.format(dias)} días{nivel !== 'normal' && ` · ${ETIQUETA_NIVEL[nivel]}`}
    </span>
  )
}

// --- Gráfico de la proyección ----------------------------------------------
function GraficoProyeccion({ historico, proyeccion }) {
  const W = 760
  const H = 270
  const m = { izq: 64, der: 16, arr: 14, aba: 30 }

  const total = historico.length + proyeccion.length
  if (total < 2) return <p className="sutil">Todavía no hay ventas para graficar.</p>

  const maximo = Math.max(
    ...historico.map((h) => h.total),
    ...proyeccion.map((p) => p.superior),
    0,
  )
  const tope = topeEje(maximo)
  const x = (i) => m.izq + (i * (W - m.izq - m.der)) / (total - 1)
  const y = (v) => m.arr + (1 - v / tope) * (H - m.arr - m.aba)

  const puntosReales = historico.map((h, i) => `${x(i)},${y(h.total)}`).join(' ')

  // La proyección arranca en el último día real para que la línea no quede cortada.
  const ultimo = historico.length - 1
  const ultimoValor = historico[ultimo]?.total ?? 0
  const inicio = ultimo >= 0 ? [`${x(ultimo)},${y(ultimoValor)}`] : []
  const xp = (j) => x(historico.length + j)
  const puntosProy = [...inicio, ...proyeccion.map((p, j) => `${xp(j)},${y(p.estimado)}`)].join(' ')
  const banda = [
    ...inicio,
    ...proyeccion.map((p, j) => `${xp(j)},${y(p.superior)}`),
    ...[...proyeccion].reverse().map((p, k) => `${xp(proyeccion.length - 1 - k)},${y(p.inferior)}`),
    ...inicio,
  ].join(' ')

  const fechas = [...historico.map((h) => h.fecha), ...proyeccion.map((p) => p.fecha)]
  const saltoX = Math.ceil(total / 9)
  const lineasY = [0, 0.25, 0.5, 0.75, 1].map((f) => f * tope)

  return (
    <svg className="grafico" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ventas diarias reales y proyectadas">
      {lineasY.map((v) => (
        <g key={v}>
          <line className="grafico-rejilla" x1={m.izq} x2={W - m.der} y1={y(v)} y2={y(v)} />
          <text className="grafico-eje" x={m.izq - 8} y={y(v) + 4} textAnchor="end">
            {compacto.format(v)}
          </text>
        </g>
      ))}

      {fechas.map((f, i) =>
        // La última fecha solo si no queda encima de la anterior.
        i % saltoX === 0 || (i === total - 1 && i % saltoX >= saltoX / 2) ? (
          <text key={f} className="grafico-eje" x={x(i)} y={H - 8} textAnchor="middle">
            {diaMes(f)}
          </text>
        ) : null,
      )}

      {proyeccion.length > 0 && historico.length > 0 && (
        <line
          className="grafico-hoy"
          x1={x(ultimo) + (x(1) - x(0)) / 2}
          x2={x(ultimo) + (x(1) - x(0)) / 2}
          y1={m.arr}
          y2={H - m.aba}
        />
      )}

      {proyeccion.length > 0 && <polygon className="grafico-banda" points={banda} />}
      {historico.length > 1 && <polyline className="grafico-real" points={puntosReales} />}
      {proyeccion.length > 0 && <polyline className="grafico-proy" points={puntosProy} />}

      {historico.map((h, i) => (
        <circle key={h.fecha} className="grafico-punto-real" cx={x(i)} cy={y(h.total)} r="3">
          <title>{`${diaMes(h.fecha)}: ${pesos.format(h.total)} (real)`}</title>
        </circle>
      ))}
      {proyeccion.map((p, j) => (
        <circle key={p.fecha} className="grafico-punto-proy" cx={xp(j)} cy={y(p.estimado)} r="3">
          <title>
            {`${diaMes(p.fecha)}: ${pesos.format(p.estimado)} estimado (entre ${pesos.format(p.inferior)} y ${pesos.format(p.superior)})`}
          </title>
        </circle>
      ))}
    </svg>
  )
}

// --- Gráfico de barras (ventas por mes) ------------------------------------
function GraficoMensual({ meses }) {
  // Más angosto que el de la proyección: va en media columna.
  const W = 480
  const H = 240
  const m = { izq: 56, der: 6, arr: 14, aba: 26 }
  const tope = topeEje(Math.max(...meses.map((d) => d.total), 0))
  const ancho = (W - m.izq - m.der) / meses.length
  const y = (v) => m.arr + (1 - v / tope) * (H - m.arr - m.aba)

  return (
    <svg className="grafico" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ventas por mes">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line className="grafico-rejilla" x1={m.izq} x2={W - m.der} y1={y(f * tope)} y2={y(f * tope)} />
          <text className="grafico-eje" x={m.izq - 8} y={y(f * tope) + 4} textAnchor="end">
            {compacto.format(f * tope)}
          </text>
        </g>
      ))}
      {meses.map((d, i) => (
        <g key={d.mes}>
          <rect
            className={i === meses.length - 1 ? 'grafico-barra actual' : 'grafico-barra'}
            x={m.izq + i * ancho + ancho * 0.18}
            y={y(d.total)}
            width={ancho * 0.64}
            height={Math.max(y(0) - y(d.total), 0)}
            rx="3"
          >
            <title>{`${etiquetaMes(d.mes)}: ${pesos.format(d.total)} en ${d.ventas} venta(s)`}</title>
          </rect>
          {/* Solo el mes para que quepa; el año queda en el tooltip. */}
          <text className="grafico-eje" x={m.izq + i * ancho + ancho / 2} y={H - 8} textAnchor="middle">
            {MESES[Number(d.mes.slice(5, 7)) - 1]}
          </text>
        </g>
      ))}
    </svg>
  )
}

// --- Página ----------------------------------------------------------------
export default function InformePredictivo() {
  const [dias, setDias] = useState(7)
  const [proyeccion, setProyeccion] = useState(null)
  const [inventario, setInventario] = useState(null)
  const [mensual, setMensual] = useState([])
  const [cajeros, setCajeros] = useState([])

  const [cobertura, setCobertura] = useState(15)
  const [entrega, setEntrega] = useState(3)
  const [parametros, setParametros] = useState({ cobertura: 15, tiempoEntrega: 3 })

  const [cargandoProy, setCargandoProy] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    setCargandoProy(true)
    api
      .proyeccionVentas(dias)
      .then((r) => vigente && setProyeccion(r))
      .catch((e) => vigente && setError(e.message))
      .finally(() => vigente && setCargandoProy(false))
    return () => {
      vigente = false
    }
  }, [dias])

  const cargarInventario = useCallback(async () => {
    try {
      setInventario(await api.prediccionInventario(parametros))
    } catch (e) {
      setError(e.message)
    }
  }, [parametros])

  useEffect(() => {
    cargarInventario()
  }, [cargarInventario])

  useEffect(() => {
    Promise.all([
      api.ventasMensuales(12),
      api.ventasPorCajero({ desde: fechaLocal(29), hasta: fechaLocal(0) }),
    ])
      .then(([meses, porCajero]) => {
        setMensual(meses)
        setCajeros(porCajero)
      })
      .catch((e) => setError(e.message))
  }, [])

  function recalcular(e) {
    e.preventDefault()
    setParametros({
      cobertura: Math.max(1, Number(cobertura) || 15),
      tiempoEntrega: Math.max(0, Number(entrega) || 0),
    })
  }

  const productos = inventario?.productos || []
  const resumen = inventario?.resumen

  const porDias = (a, b) => (a.dias_restantes ?? Infinity) - (b.dias_restantes ?? Infinity)
  const compra = productos
    .filter((p) => p.cantidad_sugerida > 0)
    .sort((a, b) => porDias(a, b) || b.cantidad_sugerida - a.cantidad_sugerida)
  const costoCompra = compra.reduce((s, p) => s + p.cantidad_sugerida * p.costo, 0)

  // La compra sugerida muestra 10 filas; el resto se ve con el scroll de la
  // tabla. El alto se mide con las filas reales porque no todas miden igual.
  const tablaCompra = useRef(null)
  useLayoutEffect(() => {
    const caja = tablaCompra.current
    if (!caja) return
    const filas = caja.querySelectorAll('tbody tr')
    if (filas.length <= FILAS_COMPRA) {
      caja.style.removeProperty('--alto-max')
      return
    }
    let alto = caja.querySelector('thead').offsetHeight
    alto += caja.querySelector('tfoot')?.offsetHeight || 0
    for (let i = 0; i < FILAS_COMPRA; i++) alto += filas[i].offsetHeight
    caja.style.setProperty('--alto-max', `${alto + 2}px`)
  }, [compra])
  const baja = productos
    .filter((p) => p.baja_rotacion)
    .sort((a, b) => b.valor_inmovilizado - a.valor_inmovilizado)
  const alertas = productos.filter((p) => p.nivel_alerta !== 'normal').sort(porDias)
  const masVendidos = productos
    .filter((p) => p.unidades_30d > 0)
    .sort((a, b) => b.unidades_30d - a.unidades_30d)
    .slice(0, 10)

  const totalProyectado = (proyeccion?.proyeccion || []).reduce((s, p) => s + p.estimado, 0)
  const totalCajeros = cajeros.reduce((s, c) => s + Number(c.total), 0)
  const maxCajero = Math.max(...cajeros.map((c) => Number(c.total)), 1)
  const suficientes = proyeccion?.datos_suficientes

  return (
    <section>
      <div className="titulo-vista">
        <div>
          <h2>Informe predictivo</h2>
          <p className="sutil">
            Proyección de ventas, compras sugeridas y rotación de inventario, calculadas con el
            histórico de ventas de este sistema. No usa servicios externos.
          </p>
        </div>
      </div>

      {error && <p className="aviso aviso-error">{error}</p>}

      <div className="tarjetas-resumen">
        <div className="tarjeta-dato">
          <span className="dato-etiqueta">Ventas proyectadas · {dias} días</span>
          <strong className="dato-valor">{suficientes ? pesos.format(totalProyectado) : '—'}</strong>
        </div>
        <div className="tarjeta-dato">
          <span className="dato-etiqueta">Error del modelo (MAPE)</span>
          <strong className="dato-valor">
            {suficientes && proyeccion.error?.mape != null
              ? `${numero.format(proyeccion.error.mape)} %`
              : '—'}
          </strong>
          {suficientes && proyeccion.error && (
            <span className="sutil">MAE {pesos.format(proyeccion.error.mae)} por día</span>
          )}
        </div>
        <div className={`tarjeta-dato ${resumen?.criticos ? 'critica' : ''}`}>
          <span className="dato-etiqueta">Productos en riesgo</span>
          <strong className="dato-valor">{resumen ? resumen.criticos + resumen.advertencias : '—'}</strong>
          {resumen && (
            <span className="sutil">
              {resumen.criticos} crítico(s) · {resumen.advertencias} en advertencia
            </span>
          )}
        </div>
        <div className={`tarjeta-dato ${resumen?.baja_rotacion ? 'alerta' : ''}`}>
          <span className="dato-etiqueta">Capital inmovilizado</span>
          <strong className="dato-valor">
            {resumen ? pesos.format(resumen.valor_inmovilizado) : '—'}
          </strong>
          {resumen && <span className="sutil">{resumen.baja_rotacion} producto(s) de baja rotación</span>}
        </div>
      </div>

      {/* --- Proyección --- */}
      <div className="tarjeta">
        <div className="tarjeta-cabeza">
          <div>
            <h3>Proyección de ventas diarias</h3>
            <p className="sutil">
              Últimos 30 días reales y los próximos {dias} días estimados, con su rango probable.
            </p>
          </div>
          <div className="selector-horizonte" role="group" aria-label="Horizonte">
            {HORIZONTES.map((h) => (
              <button
                key={h}
                className={h === dias ? 'btn btn-primario' : 'btn btn-suave'}
                onClick={() => setDias(h)}
              >
                {h} días
              </button>
            ))}
          </div>
        </div>

        {cargandoProy && !proyeccion && <p className="sutil">Calculando…</p>}

        {proyeccion && (
          <>
            {!suficientes && (
              <p className="aviso">
                No hay datos suficientes para proyectar. {proyeccion.mensaje} Mientras tanto se
                muestran las ventas reales.
              </p>
            )}
            <GraficoProyeccion historico={proyeccion.historico} proyeccion={proyeccion.proyeccion} />
            <div className="grafico-leyenda">
              <span><i className="ley-real" /> Ventas reales</span>
              {suficientes && (
                <>
                  <span><i className="ley-proy" /> Proyección</span>
                  <span><i className="ley-banda" /> Rango probable (95 %)</span>
                </>
              )}
            </div>
            {suficientes && (
              <p className="nota">
                Modelo: {proyeccion.modelo}. Entrenado con {proyeccion.dias_historia} días de historia
                ({proyeccion.dias_con_ventas} con ventas).
                {proyeccion.error &&
                  ` Al pronosticar los últimos ${proyeccion.error.dias_evaluados} días sin haberlos visto, se equivocó en promedio ${pesos.format(proyeccion.error.mae)} por día` +
                    (proyeccion.error.mape != null ? ` (${numero.format(proyeccion.error.mape)} %).` : '.')}
              </p>
            )}
          </>
        )}
      </div>

      {/* --- Alertas --- */}
      {alertas.length > 0 && (
        <div className="tarjeta">
          <h3>Alertas de inventario</h3>
          <p className="sutil">Productos que se agotan en 7 días o menos al ritmo de venta actual.</p>
          <div className="lista-alertas">
            {alertas.map((p) => (
              <div key={p.producto_id} className={`alerta-item nivel-${p.nivel_alerta}`}>
                <strong>{p.nombre}</strong>
                <span>
                  {p.stock_actual <= 0
                    ? 'Agotado'
                    : `Stock ${p.stock_actual} · alcanza ${numero.format(p.dias_restantes)} días`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Compra sugerida --- */}
      <div className="tarjeta">
        <div className="tarjeta-cabeza">
          <div>
            <h3>Compra sugerida</h3>
            <p className="sutil">
              Lo que se venderá mientras llega el pedido y los días a cubrir, más el stock mínimo,
              menos lo que ya hay.
            </p>
          </div>
          <form className="barra-filtros sin-margen" onSubmit={recalcular}>
            <label className="campo-inline">
              <span className="sutil">Cubrir</span>
              <input
                type="number"
                min="1"
                max="180"
                className="entrada-corta"
                value={cobertura}
                onChange={(e) => setCobertura(e.target.value)}
              />
              <span className="sutil">días</span>
            </label>
            <label className="campo-inline">
              <span className="sutil">Entrega</span>
              <input
                type="number"
                min="0"
                max="90"
                className="entrada-corta"
                value={entrega}
                onChange={(e) => setEntrega(e.target.value)}
              />
              <span className="sutil">días</span>
            </label>
            <button className="btn btn-suave">Recalcular</button>
          </form>
        </div>

        <div className="tabla-envoltura tabla-limitada" ref={tablaCompra}>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th className="derecha">Stock</th>
                <th className="derecha">Demanda diaria</th>
                <th className="centro">Días restantes</th>
                <th className="derecha">Comprar</th>
                <th className="derecha">Costo estimado</th>
              </tr>
            </thead>
            <tbody>
              {compra.map((p) => (
                <tr key={p.producto_id}>
                  <td>
                    {p.nombre} <span className="sutil mono">{p.sku}</span>
                  </td>
                  <td className="derecha">{p.stock_actual}</td>
                  <td className="derecha">{numero.format(p.demanda_diaria)}</td>
                  <td className="centro">
                    <Nivel nivel={p.nivel_alerta} dias={p.dias_restantes} />
                  </td>
                  <td className="derecha">
                    <strong>
                      {p.cantidad_sugerida} {p.unidad_medida}
                    </strong>
                  </td>
                  <td className="derecha">{pesos.format(p.cantidad_sugerida * p.costo)}</td>
                </tr>
              ))}
              {inventario && compra.length === 0 && (
                <tr>
                  <td colSpan="6" className="celda-vacia">
                    Con el stock actual no hace falta comprar nada.
                  </td>
                </tr>
              )}
            </tbody>
            {compra.length > 0 && (
              <tfoot>
                <tr className="fila-total">
                  <td colSpan="5">Total estimado de la compra</td>
                  <td className="derecha">{pesos.format(costoCompra)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* --- Rotación --- */}
      <div className="rejilla-doble">
        <div className="tarjeta">
          <h3>Baja rotación</h3>
          <p className="sutil">
            Probabilidad de venta a 30 días menor al 20 % o más de 60 días sin venderse.
            Candidatos a promoción o a dejar de comprar.
          </p>
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="derecha">Stock</th>
                  <th className="derecha">Días sin venta</th>
                  <th className="derecha">Prob. venta 30 d</th>
                  <th className="derecha">Inmovilizado</th>
                </tr>
              </thead>
              <tbody>
                {baja.map((p) => (
                  <tr key={p.producto_id}>
                    <td>{p.nombre}</td>
                    <td className="derecha">{p.stock_actual}</td>
                    <td className="derecha">
                      {p.dias_sin_venta}
                      {p.nunca_vendido && <span className="sutil"> (nunca vendido)</span>}
                    </td>
                    <td className="derecha">{numero.format(p.probabilidad_venta_30d * 100)} %</td>
                    <td className="derecha">{pesos.format(p.valor_inmovilizado)}</td>
                  </tr>
                ))}
                {inventario && baja.length === 0 && (
                  <tr>
                    <td colSpan="5" className="celda-vacia">
                      No hay productos de baja rotación.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="tarjeta">
          <h3>Más vendidos (alta rotación)</h3>
          <p className="sutil">Los 10 productos con más unidades vendidas en los últimos 30 días.</p>
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="derecha">Unidades 30 d</th>
                  <th className="derecha">Por día</th>
                  <th className="centro">Días restantes</th>
                </tr>
              </thead>
              <tbody>
                {masVendidos.map((p) => (
                  <tr key={p.producto_id}>
                    <td>{p.nombre}</td>
                    <td className="derecha">{numero.format(p.unidades_30d)}</td>
                    <td className="derecha">{numero.format(p.demanda_diaria)}</td>
                    <td className="centro">
                      <Nivel nivel={p.nivel_alerta} dias={p.dias_restantes} />
                    </td>
                  </tr>
                ))}
                {inventario && masVendidos.length === 0 && (
                  <tr>
                    <td colSpan="4" className="celda-vacia">
                      No hubo ventas en los últimos 30 días.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- Histórico --- */}
      <div className="rejilla-doble">
        <div className="tarjeta">
          <h3>Ventas por mes</h3>
          <p className="sutil">Total de ventas pagadas de los últimos 12 meses.</p>
          {mensual.length > 0 && <GraficoMensual meses={mensual} />}
        </div>

        <div className="tarjeta">
          <h3>Productividad de cajeros</h3>
          <p className="sutil">Ventas pagadas de los últimos 30 días.</p>
          {cajeros.length === 0 && <p className="sutil">No hay ventas en los últimos 30 días.</p>}
          <div className="lista-cajeros">
            {cajeros.map((c) => {
              const totalC = Number(c.total)
              return (
                <div key={c.usuario_id} className="cajero-fila">
                  <div className="cajero-nombre">
                    <strong>{c.nombre}</strong>
                    <span className="sutil">
                      {c.ventas} venta(s) · ticket {pesos.format(c.ventas ? totalC / c.ventas : 0)} ·{' '}
                      {numero.format(totalCajeros ? (totalC / totalCajeros) * 100 : 0)} % del total
                    </span>
                  </div>
                  <div className="cajero-barra">
                    <div style={{ width: `${(totalC / maxCajero) * 100}%` }} />
                  </div>
                  <strong className="cajero-total">{pesos.format(totalC)}</strong>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <details className="tarjeta explicacion">
        <summary>¿Cómo se calcula este informe?</summary>
        <p>
          <strong>Proyección de ventas.</strong> Se arma una serie con el total vendido cada día
          (solo ventas pagadas; los días sin ventas cuentan como 0) y se ajusta un modelo
          Holt-Winters, que es suavizamiento exponencial: le da más peso a los días recientes,
          sigue la tendencia y, con 4 semanas de historia o más, aprende el patrón de cada día de
          la semana. Se entrena de nuevo en cada consulta con los datos actuales y tarda
          milisegundos. Con menos de 14 días con ventas no se proyecta.
        </p>
        <p>
          <strong>Error.</strong> El modelo se entrena sin los últimos 7 días y se le pide que los
          pronostique. El MAE es cuántos pesos se equivocó en promedio por día y el MAPE ese mismo
          error en porcentaje.
        </p>
        <p>
          <strong>Inventario.</strong> Demanda diaria = unidades vendidas en 30 días ÷ 30. Días
          restantes = stock ÷ demanda (crítico ≤ 3, advertencia ≤ 7). La probabilidad de venta usa
          un modelo de Poisson con la demanda de 90 días: 1 − e<sup>−30·λ</sup>.
        </p>
        <p className="sutil">
          Todo sale de la base de datos del sistema; no se envía información a servicios externos.
        </p>
      </details>
    </section>
  )
}
