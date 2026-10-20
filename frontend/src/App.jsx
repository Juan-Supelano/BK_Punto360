import { useEffect, useState } from 'react'
import { urlFoto } from './api.js'
import { useAuth } from './auth.jsx'
import Login from './pages/Login.jsx'

// rol: null = todos; 'ADMIN' o 'CAJERO' = solo ese rol.
// El backend valida lo mismo: esconder el menú es comodidad, no seguridad.
const VISTAS = [
]

function iniciales(nombre = '') {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export default function App() {
  const { usuario, verificando, salir } = useAuth()
  const [vista, setVista] = useState(null)

  const rol = usuario?.rol
  const esAdmin = rol === 'ADMIN'
  const visibles = VISTAS.filter((v) => v.rol === null || v.rol === rol)
  const preferida = esAdmin ? 'ventas' : 'vender'
  // Mientras se migran las HU puede que la vista preferida aún no exista.
  const inicial = visibles.some((v) => v.clave === preferida)
    ? preferida
    : visibles[0]?.clave ?? null

  // Al entrar, y si el rol deja sin acceso a la vista actual, cae en la inicial.
  useEffect(() => {
    if (!rol) return
    const actual = VISTAS.find((v) => v.clave === vista)
    if (!actual || (actual.rol !== null && actual.rol !== rol)) {
      setVista(inicial)
    }
  }, [rol, vista, inicial])

  if (verificando) {
    return <div className="pantalla-carga">Cargando…</div>
  }

  if (!usuario) {
    return <Login />
  }

  const comercio = usuario.comercio
  const foto = urlFoto(usuario.foto_url)
  const activa = vista ?? inicial

  return (
    <div className="disposicion">
      <aside className="lateral">
        <div className="lateral-marca">
          {comercio?.logo_url ? (
            <img className="marca-logo" src={comercio.logo_url} alt="" />
          ) : (
            <div className="marca-logo marca-logo-texto">
              {iniciales(comercio?.nombre_visible) || 'CP'}
            </div>
          )}
          <div className="marca-texto">
            <strong>{comercio?.nombre_visible || 'Cuadre POS'}</strong>
            <span className="sutil">NIT {comercio?.nit}</span>
          </div>
        </div>

        <nav className="lateral-nav">
          {visibles.map((v) => (
            <button
              key={v.clave}
              className={activa === v.clave ? 'nav-item activo' : 'nav-item'}
              onClick={() => setVista(v.clave)}
            >
              <span className="nav-icono" aria-hidden="true">
                {v.icono}
              </span>
              {v.titulo === 'Ventas' && !esAdmin ? 'Mis ventas' : v.titulo}
            </button>
          ))}
        </nav>

        <div className="lateral-pie">
          <div className="usuario-chip">
            {foto ? (
              <img className="avatar" src={foto} alt="" />
            ) : (
              <div className="avatar">{iniciales(usuario.nombre)}</div>
            )}
            <div className="usuario-texto">
              <strong>{usuario.nombre}</strong>
              <span className="sutil">{usuario.rol}</span>
            </div>
          </div>
          <button className="btn btn-suave btn-ancho" onClick={salir}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="contenido">
      </main>
    </div>
  )
}
