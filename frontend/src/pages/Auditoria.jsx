import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import Paginacion, { POR_PAGINA } from '../Paginacion.jsx'

/**
 * Registro de auditoría (HU-32). Solo ADMIN.
 *
 * Muestra los cambios importantes de todo el sistema: qué cambió, el valor
 * antes y después, quién y cuándo. Es de solo lectura: ni la API ni la base
 * permiten editar o borrar el registro. Los movimientos de stock están en el
 * kardex de cada producto, no aquí.
 */

const ENTIDADES = {
  producto: 'Producto',
  usuario: 'Usuario',
  comercio: 'Mi empresa',
}

const CAMPOS = {
  nombre: 'Nombre',
  codigo_barras: 'Código de barras',
  precio_venta: 'Precio de venta',
  categoria_id: 'Categoría',
  activo: 'Activo',
  rol: 'Rol',
  contrasena: 'Contraseña',
  iva_pct: 'IVA por defecto',
  precio_incluye_iva: 'Precios con IVA',
  escaneo_camara: 'Escaneo con cámara',
}

// Los cambios con los que se podría robar se resaltan.
const SENSIBLES = new Set(['codigo_barras', 'precio_venta', 'rol', 'contrasena'])

const fechaHora = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function valor(campo, texto) {
  if (texto === null || texto === undefined) return <span className="sutil">(vacío)</span>
  if (campo === 'precio_venta') return `$ ${Number(texto).toLocaleString('es-CO')}`
  if (campo === 'iva_pct') return `${texto} %`
  return texto
}

export default function Auditoria() {
  const [filtros, setFiltros] = useState({
    desde: '',
    hasta: '',
    usuarioId: '',
    entidad: '',
    campo: '',
    buscar: '',
  })
  const [pagina, setPagina] = useState(1)
  const [datos, setDatos] = useState({ total: 0, items: [] })
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .listarUsuarios({ incluirInactivos: true })
      .then(setUsuarios)
      .catch(() => setUsuarios([]))
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setDatos(await api.auditoria({ ...filtros, pagina, porPagina: POR_PAGINA }))
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [filtros, pagina])

  useEffect(() => {
    cargar()
  }, [cargar])

  function cambiarFiltro(nombre, valorNuevo) {
    setFiltros((f) => ({ ...f, [nombre]: valorNuevo }))
    setPagina(1)
  }

  const paginas = Math.max(1, Math.ceil(datos.total / POR_PAGINA))

  return (
    <section>
      <div className="titulo-vista">
        <div>
          <h2>Auditoría</h2>
          <p className="sutil">
            Cambios de productos, usuarios y Mi empresa: qué cambió, antes y después, quién y
            cuándo. Los movimientos de stock están en el historial de cada producto.
          </p>
        </div>
      </div>

      {error && <p className="aviso aviso-error">{error}</p>}

      <div className="barra-filtros">
        <input
          className="buscador"
          type="search"
          placeholder="Buscar registro…"
          value={filtros.buscar}
          onChange={(e) => cambiarFiltro('buscar', e.target.value)}
        />
        <label className="campo-inline">
          <span className="sutil">Desde</span>
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => cambiarFiltro('desde', e.target.value)}
          />
        </label>
        <label className="campo-inline">
          <span className="sutil">Hasta</span>
          <input
            type="date"
            value={filtros.hasta}
            onChange={(e) => cambiarFiltro('hasta', e.target.value)}
          />
        </label>
        <select value={filtros.usuarioId} onChange={(e) => cambiarFiltro('usuarioId', e.target.value)}>
          <option value="">Todos los usuarios</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre} ({u.rol})
            </option>
          ))}
        </select>
        <select value={filtros.entidad} onChange={(e) => cambiarFiltro('entidad', e.target.value)}>
          <option value="">Todo</option>
          {Object.entries(ENTIDADES).map(([clave, nombre]) => (
            <option key={clave} value={clave}>
              {nombre}
            </option>
          ))}
        </select>
        <select value={filtros.campo} onChange={(e) => cambiarFiltro('campo', e.target.value)}>
          <option value="">Todos los campos</option>
          {Object.entries(CAMPOS).map(([clave, nombre]) => (
            <option key={clave} value={clave}>
              {nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="tabla-envoltura">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Registro</th>
              <th>Campo</th>
              <th>Antes</th>
              <th>Después</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan="6" className="celda-vacia">
                  Cargando…
                </td>
              </tr>
            )}

            {!cargando &&
              datos.items.map((c) => (
                <tr key={c.id}>
                  <td className="sutil sin-salto">{fechaHora.format(new Date(c.fecha))}</td>
                  <td>
                    {c.usuario ? (
                      <>
                        {c.usuario.nombre} <span className="sutil">· {c.usuario.rol}</span>
                      </>
                    ) : (
                      <span className="sutil">Sistema</span>
                    )}
                  </td>
                  <td>
                    <span className="etiqueta gris">{ENTIDADES[c.entidad] || c.entidad}</span>{' '}
                    {c.descripcion}
                  </td>
                  <td>
                    <span className={SENSIBLES.has(c.campo) ? 'etiqueta nivel-advertencia' : ''}>
                      {c.campo === 'iva_pct' && c.entidad === 'producto'
                        ? 'IVA'
                        : CAMPOS[c.campo] || c.campo}
                    </span>
                  </td>
                  <td className="auditoria-antes">{valor(c.campo, c.valor_antes)}</td>
                  <td className="auditoria-despues">{valor(c.campo, c.valor_despues)}</td>
                </tr>
              ))}

            {!cargando && datos.items.length === 0 && (
              <tr>
                <td colSpan="6" className="celda-vacia">
                  No hay cambios con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Paginacion pagina={pagina} paginas={paginas} total={datos.total} setPagina={setPagina} />
    </section>
  )
}
