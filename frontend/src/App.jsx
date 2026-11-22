import { useEffect, useRef, useState } from 'react'
import { urlFoto } from './api.js'
import { useAuth } from './auth.jsx'
import { cerrarVentanaDeArriba, etiquetarTablas } from './interfaz.js'
import Auditoria from './pages/Auditoria.jsx'
import CambiarPasswordObligatorio from './pages/CambiarPasswordObligatorio.jsx'
import Categorias from './pages/Categorias.jsx'
import Clientes from './pages/Clientes.jsx'
import Compras from './pages/Compras.jsx'
import Empresa from './pages/Empresa.jsx'
import InformePredictivo from './pages/InformePredictivo.jsx'
import Login from './pages/Login.jsx'
import Perfil from './pages/Perfil.jsx'
import Productos from './pages/Productos.jsx'
import Proveedores from './pages/Proveedores.jsx'
import Usuarios from './pages/Usuarios.jsx'
import Vender from './pages/Vender.jsx'
import Ventas from './pages/Ventas.jsx'

// rol: null = todos; 'ADMIN' o 'CAJERO' = solo ese rol.
// El backend valida lo mismo: esconder el menú es comodidad, no seguridad.
const VISTAS = [
  { clave: 'vender', titulo: 'Vender', icono: '⊕', rol: 'CAJERO' },
  { clave: 'ventas', titulo: 'Ventas', icono: '≡', rol: null },
  { clave: 'prediccion', titulo: 'Informe predictivo', icono: '↗', rol: 'ADMIN' },
  { clave: 'productos', titulo: 'Productos', icono: '▦', rol: null },
  { clave: 'categorias', titulo: 'Categorías', icono: '☰', rol: null },
  { clave: 'proveedores', titulo: 'Proveedores', icono: '⇄', rol: 'ADMIN' },
  { clave: 'compras', titulo: 'Compras', icono: '↧', rol: 'ADMIN' },
  { clave: 'clientes', titulo: 'Clientes', icono: '☻', rol: null },
  { clave: 'usuarios', titulo: 'Usuarios', icono: '⨁', rol: 'ADMIN' },
  { clave: 'auditoria', titulo: 'Auditoría', icono: '◷', rol: 'ADMIN' },
  { clave: 'perfil', titulo: 'Mi perfil', icono: '☺', rol: null },
  { clave: 'empresa', titulo: 'Mi empresa', icono: '⌂', rol: null },
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
  // Menú lateral en el celular: se abre con ☰ y se cierra al elegir una vista.
  const [menuAbierto, setMenuAbierto] = useState(false)
  const contenido = useRef(null)

  const rol = usuario?.rol
  const esAdmin = rol === 'ADMIN'
  const visibles = VISTAS.filter((v) => v.rol === null || v.rol === rol)
  const inicial = esAdmin ? 'ventas' : 'vender'

  // Al entrar, y si el rol deja sin acceso a la vista actual, cae en la inicial.
  useEffect(() => {
    if (!rol) return
    const actual = VISTAS.find((v) => v.clave === vista)
    if (!actual || (actual.rol !== null && actual.rol !== rol)) {
      setVista(esAdmin ? 'ventas' : 'vender')
    }
  }, [rol, vista, esAdmin])

  // Escape: cierra el menú del celular o la ventana emergente de arriba.
  useEffect(() => {
    const tecla = (e) => {
      if (e.key !== 'Escape') return
      if (menuAbierto) {
        setMenuAbierto(false)
      } else {
        cerrarVentanaDeArriba()
      }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [menuAbierto])

  // Etiquetas de las tablas para verlas como tarjetas en el celular. Se
  // recalculan cuando cambia el contenido (filtros, paginación, otra vista).
  useEffect(() => {
    const raiz = contenido.current
    if (!raiz) return
    let pendiente = 0
    const recalcular = () => {
      cancelAnimationFrame(pendiente)
      pendiente = requestAnimationFrame(() => etiquetarTablas(raiz))
    }
    recalcular()
    const observador = new MutationObserver(recalcular)
    observador.observe(raiz, { childList: true, subtree: true })
    return () => {
      observador.disconnect()
      cancelAnimationFrame(pendiente)
    }
  })

  if (verificando) {
    return <div className="pantalla-carga">Cargando…</div>
  }

  if (!usuario) {
    return <Login />
  }

  // Contraseña temporal (recien creada o reseteada por un ADMIN): se bloquea
  // el resto de la app hasta que la cambie. El backend hace cumplir lo mismo
  // en cada endpoint de negocio; esto solo evita que el usuario se quede
  // "atascado" viendo pantallas que igual le van a rechazar las peticiones.
  if (usuario.debe_cambiar_password) {
    return <CambiarPasswordObligatorio />
  }

  const comercio = usuario.comercio
  const foto = urlFoto(usuario.foto_url)
  const activa = vista ?? inicial

  const titulo = VISTAS.find((v) => v.clave === activa)?.titulo

  function irA(clave) {
    setVista(clave)
    setMenuAbierto(false)
    window.scrollTo(0, 0)
  }

  return (
    <div className="disposicion">
      {/* Solo en el celular: barra de arriba con el botón del menú. */}
      <header className="barra-movil">
        <button
          className="btn btn-suave btn-menu"
          aria-label="Abrir menú"
          aria-expanded={menuAbierto}
          onClick={() => setMenuAbierto(true)}
        >
          ☰
        </button>
        <img className="producto-logo" src="/img/marca-punto360.png" alt="" />
        <strong className="barra-movil-titulo">
          {titulo === 'Ventas' && !esAdmin ? 'Mis ventas' : titulo}
        </strong>
      </header>
      {menuAbierto && <div className="velo-menu" onClick={() => setMenuAbierto(false)} />}

      <aside className={menuAbierto ? 'lateral abierto' : 'lateral'}>
        {/* Marca del producto arriba; debajo, la empresa que usa el sistema. */}
        <div className="lateral-producto">
          <img className="producto-logo" src="/img/marca-punto360.png" alt="" />
          <div className="producto-texto">
            <span className="producto-nombre" aria-label="Punto360 marca registrada">
              PUNTO<b>360</b>
              <sup>®</sup>
            </span>
            <span className="producto-lema">Sistema POS</span>
          </div>
        </div>

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
              onClick={() => irA(v.clave)}
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

      <main className="contenido" ref={contenido}>
        {activa === 'vender' && !esAdmin && <Vender />}
        {activa === 'ventas' && <Ventas />}
        {activa === 'prediccion' && esAdmin && <InformePredictivo />}
        {activa === 'productos' && <Productos />}
        {activa === 'categorias' && <Categorias />}
        {activa === 'proveedores' && esAdmin && <Proveedores />}
        {activa === 'compras' && esAdmin && <Compras />}
        {activa === 'clientes' && <Clientes />}
        {activa === 'usuarios' && esAdmin && <Usuarios />}
        {activa === 'auditoria' && esAdmin && <Auditoria />}
        {activa === 'perfil' && <Perfil />}
        {activa === 'empresa' && <Empresa />}
      </main>
    </div>
  )
}
