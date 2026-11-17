import { createContext, useContext, useEffect, useState } from 'react'
import { api, cuandoExpireLaSesion, sesion } from './api.js'

const Contexto = createContext(null)

// Sin tocar la página este tiempo, la sesión se cierra sola.
const INACTIVIDAD_MS = 30 * 60 * 1000
// Momento de la última interacción. Vive en localStorage para que varias
// pestañas abiertas cuenten como una sola sesión.
const LLAVE_ACTIVIDAD = 'cuadre_pos_ultima_actividad'
const EVENTOS_ACTIVIDAD = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']
const AVISO_INACTIVIDAD = 'La sesión se cerró tras 30 minutos sin actividad. Vuelve a entrar.'

const actividad = {
  marcar: () => localStorage.setItem(LLAVE_ACTIVIDAD, String(Date.now())),
  borrar: () => localStorage.removeItem(LLAVE_ACTIVIDAD),
  // Sin registro (sesión abierta antes de este cambio) no cuenta como vencida.
  vencida: () => {
    const ultima = Number(localStorage.getItem(LLAVE_ACTIVIDAD))
    return ultima > 0 && Date.now() - ultima >= INACTIVIDAD_MS
  },
}

export function ProveedorAuth({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [verificando, setVerificando] = useState(true)
  // Mensaje para la pantalla de login (por ejemplo, cierre por inactividad).
  const [aviso, setAviso] = useState('')

  // Al recargar la página, si hay token guardado se valida contra la API.
  useEffect(() => {
    cuandoExpireLaSesion(() => setUsuario(null))

    if (sesion.leer() && actividad.vencida()) {
      // Se cerró el navegador o el equipo se suspendió con la sesión abierta.
      sesion.borrar()
      actividad.borrar()
      setAviso(AVISO_INACTIVIDAD)
    }

    if (!sesion.leer()) {
      setVerificando(false)
      return
    }
    api
      .yo()
      .then(setUsuario)
      .catch(() => sesion.borrar())
      .finally(() => setVerificando(false))
  }, [])

  // Mientras haya sesión: cada interacción renueva el plazo y cada 30 s se
  // revisa si ya pasaron 30 minutos sin actividad.
  const conectado = usuario !== null
  useEffect(() => {
    if (!conectado) return

    let ultimaEscritura = 0
    const registrar = () => {
      const ahora = Date.now()
      // pointermove se dispara muchas veces por segundo: se guarda cada 5 s.
      if (ahora - ultimaEscritura < 5000) return
      ultimaEscritura = ahora
      actividad.marcar()
    }
    const revisar = () => {
      if (!actividad.vencida()) return
      sesion.borrar()
      actividad.borrar()
      setAviso(AVISO_INACTIVIDAD)
      setUsuario(null)
    }

    registrar()
    const opciones = { passive: true, capture: true }
    EVENTOS_ACTIVIDAD.forEach((e) => window.addEventListener(e, registrar, opciones))
    // Al volver a la pestaña (o al despertar el equipo) se revisa enseguida.
    document.addEventListener('visibilitychange', revisar)
    const intervalo = setInterval(revisar, 30 * 1000)

    return () => {
      EVENTOS_ACTIVIDAD.forEach((e) => window.removeEventListener(e, registrar, opciones))
      document.removeEventListener('visibilitychange', revisar)
      clearInterval(intervalo)
    }
  }, [conectado])

  async function entrar(email, password) {
    const datos = await api.login(email, password)
    sesion.guardar(datos.access_token)
    actividad.marcar()
    setAviso('')
    setUsuario(datos.usuario)
  }

  function salir() {
    sesion.borrar()
    actividad.borrar()
    setUsuario(null)
  }

  function refrescarComercio(comercio) {
    setUsuario((u) => (u ? { ...u, comercio } : u))
  }

  // Tras editar el perfil o cambiar la contraseña, el backend devuelve el
  // usuario actualizado (incluido debe_cambiar_password); esto lo refleja
  // en la sesión sin tener que volver a llamar a /auth/yo.
  function refrescarUsuario(datos) {
    setUsuario((u) => (u ? { ...u, ...datos } : u))
  }

  return (
    <Contexto.Provider
      value={{
        usuario,
        verificando,
        aviso,
        entrar,
        salir,
        refrescarComercio,
        refrescarUsuario,
      }}
    >
      {children}
    </Contexto.Provider>
  )
}

export function useAuth() {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useAuth debe usarse dentro de ProveedorAuth')
  return valor
}
