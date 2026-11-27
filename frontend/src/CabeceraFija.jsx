import { useEffect, useRef, useState } from 'react'

/**
 * Deja fijo arriba lo que envuelve (título, resumen y filtros) mientras la
 * tabla se desplaza por debajo. Solo cuando de verdad hay contenido pasando
 * por debajo, un degradado suave del color del fondo lo desvanece, en vez de
 * cortarlo con una línea. Al volver arriba el degradado desaparece.
 *
 * Se mide en cada scroll: si el elemento que sigue a la cabecera empieza por
 * encima de su borde inferior, está pasando por debajo. En el celular no
 * queda fija (styles.css).
 */
export default function CabeceraFija({ activa = true, children }) {
  const cabecera = useRef(null)
  const [pegada, setPegada] = useState(false)

  useEffect(() => {
    if (!activa) return
    const actualizar = () => {
      const caja = cabecera.current
      const siguiente = caja?.nextElementSibling
      if (!caja || !siguiente) {
        setPegada(false)
        return
      }
      const borde = caja.getBoundingClientRect().bottom
      setPegada(siguiente.getBoundingClientRect().top < borde - 1)
    }
    actualizar()
    // capture: también se entera si el scroll es de otro contenedor.
    window.addEventListener('scroll', actualizar, { passive: true, capture: true })
    window.addEventListener('resize', actualizar)
    return () => {
      window.removeEventListener('scroll', actualizar, { capture: true })
      window.removeEventListener('resize', actualizar)
    }
  }, [activa])

  if (!activa) return children

  return (
    <div ref={cabecera} className={pegada ? 'cabecera-fija pegada' : 'cabecera-fija'}>
      {children}
    </div>
  )
}
