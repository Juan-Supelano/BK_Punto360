import { useEffect, useRef, useState } from 'react'

/**
 * Lee códigos de barras con la cámara (HU-31).
 *
 * Usa el lector que trae el navegador (BarcodeDetector, en Chrome Android y
 * macOS) y, si no lo hay (Windows, iPhone), la librería ZXing. La librería se
 * descarga solo cuando se abre el escáner: si el ADMIN no activa el escaneo
 * con cámara en Mi empresa, nunca se carga.
 *
 * continuo = true: la cámara sigue abierta después de cada lectura (Vender).
 * continuo = false: se cierra con la primera lectura (formulario de producto).
 * onLeido(codigo) puede devolver un texto corto que se muestra como
 * resultado de la lectura ("✓ Agua 600 ml", "Código no registrado").
 */

const FORMATOS_NATIVOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']
const ESPERA_REPETIDO = 2000 // ms sin ver un código para volver a contarlo

function mensajeDeError(error) {
  if (!window.isSecureContext) {
    return 'La cámara solo funciona en páginas HTTPS o en localhost.'
  }
  switch (error?.name) {
    case 'NotAllowedError':
      return 'No hay permiso para usar la cámara. Actívalo en el candado de la barra de direcciones y vuelve a intentar.'
    case 'NotReadableError':
      return 'La cámara está en uso por otra aplicación (Teams, Zoom…). Ciérrala y vuelve a intentar.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No se encontró una cámara en este equipo.'
    default:
      return error?.message || 'No se pudo abrir la cámara.'
  }
}

// Señal de lectura: vibración (Android) y un pitido corto.
function avisarLectura() {
  navigator.vibrate?.(60)
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext
    const ctx = new Contexto()
    const osc = ctx.createOscillator()
    const vol = ctx.createGain()
    osc.frequency.value = 1200
    vol.gain.value = 0.08
    osc.connect(vol).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.08)
    osc.onended = () => ctx.close()
  } catch {
    // Sin audio no pasa nada: la lectura igual se procesa.
  }
}

async function detectorNativo() {
  if (!('BarcodeDetector' in window)) return null
  try {
    const soportados = await window.BarcodeDetector.getSupportedFormats()
    const formatos = FORMATOS_NATIVOS.filter((f) => soportados.includes(f))
    return formatos.length ? new window.BarcodeDetector({ formats: formatos }) : null
  } catch {
    return null
  }
}

export default function EscanerCamara({ titulo = 'Escanear código', continuo = false, onLeido, onCerrar }) {
  const video = useRef(null)
  const [estado, setEstado] = useState('Abriendo la cámara…')
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null)

  // onLeido cambia en cada render del padre; se guarda en una ref para no
  // reiniciar la cámara cada vez.
  const alLeer = useRef(onLeido)
  alLeer.current = onLeido
  const alCerrar = useRef(onCerrar)
  alCerrar.current = onCerrar

  useEffect(() => {
    let activo = true
    let detener = () => {}
    let ultimo = { codigo: '', hora: 0 }

    function leido(codigo) {
      const ahora = Date.now()
      // Mientras el mismo código siga frente a la cámara no se vuelve a contar:
      // cuenta otra vez solo si se dejó de ver por 2 s (se retiró y se volvió
      // a mostrar). Para sumar unidades rápido están los botones + del carrito.
      if (codigo === ultimo.codigo && ahora - ultimo.hora < ESPERA_REPETIDO) {
        ultimo.hora = ahora
        return
      }
      ultimo = { codigo, hora: ahora }
      avisarLectura()
      const texto = alLeer.current?.(codigo)
      setResultado({ codigo, texto: typeof texto === 'string' ? texto : '' })
      if (!continuo) alCerrar.current?.()
    }

    // En desarrollo, React.StrictMode monta este efecto, lo desmonta y lo vuelve
    // a montar. Por eso, después de cada await se revisa `activo`: si la primera
    // instancia siguiera, al detenerse vaciaría el <video> que ya usa la segunda
    // y la imagen quedaría en negro.
    async function iniciar() {
      const restricciones = { video: { facingMode: { ideal: 'environment' } }, audio: false }
      const nativo = await detectorNativo()
      if (!activo) return

      if (nativo) {
        const flujo = await navigator.mediaDevices.getUserMedia(restricciones)
        if (!activo) {
          flujo.getTracks().forEach((t) => t.stop())
          return
        }
        video.current.srcObject = flujo
        await video.current.play()
        const intervalo = setInterval(async () => {
          try {
            const codigos = await nativo.detect(video.current)
            if (codigos.length) leido(codigos[0].rawValue)
          } catch {
            // Un cuadro que no se pudo analizar: se sigue con el siguiente.
          }
        }, 200)
        detener = () => {
          clearInterval(intervalo)
          flujo.getTracks().forEach((t) => t.stop())
        }
      } else {
        // Import tardío: la librería solo se descarga si hace falta.
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
          await Promise.all([import('@zxing/browser'), import('@zxing/library')])
        if (!activo) return
        const pistas = new Map([
          [
            DecodeHintType.POSSIBLE_FORMATS,
            [
              BarcodeFormat.EAN_13,
              BarcodeFormat.EAN_8,
              BarcodeFormat.UPC_A,
              BarcodeFormat.UPC_E,
              BarcodeFormat.CODE_128,
            ],
          ],
        ])
        const lector = new BrowserMultiFormatReader(pistas, { delayBetweenScanAttempts: 150 })
        const controles = await lector.decodeFromConstraints(restricciones, video.current, (lectura) => {
          if (lectura) leido(lectura.getText())
        })
        if (!activo) {
          controles.stop()
          return
        }
        detener = () => controles.stop()
      }
      setEstado('Apunta al código de barras')
    }

    iniciar().catch((e) => activo && setError(mensajeDeError(e)))

    return () => {
      activo = false
      detener()
    }
  }, [continuo])

  // Escape cierra el escáner (y solo el escáner, no la ventana de atrás).
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        alCerrar.current?.()
      }
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [])

  return (
    <div className="fondo-modal escaner-fondo" onClick={onCerrar}>
      <div className="modal escaner" onClick={(e) => e.stopPropagation()}>
        <h3>{titulo}</h3>

        {error ? (
          <p className="aviso aviso-error">{error}</p>
        ) : (
          <>
            <div className="escaner-video">
              <video ref={video} muted playsInline />
              <div className="escaner-guia" aria-hidden="true" />
            </div>
            <p className="sutil escaner-estado">{estado}</p>
          </>
        )}

        {resultado && (
          <p className="escaner-resultado">
            <span className="codigo-barras">{resultado.codigo}</span>
            {resultado.texto && <strong> {resultado.texto}</strong>}
          </p>
        )}

        <div className="modal-pie">
          <button type="button" className="btn btn-suave" onClick={onCerrar}>
            {continuo ? 'Listo' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  )
}
