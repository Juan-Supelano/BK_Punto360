import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'

const CAMPOS = [
  ['razon_social', 'Razón social', true],
  ['nombre_comercial', 'Nombre comercial', false],
  ['nit', 'NIT', true],
  ['direccion', 'Dirección', false],
  ['ciudad', 'Ciudad', false],
  ['telefono', 'Teléfono', false],
  ['email', 'Correo', false],
  ['logo_url', 'URL del logo', false],
]

export default function Empresa() {
  const { usuario, refrescarComercio } = useAuth()
  const esAdmin = usuario?.rol === 'ADMIN'

  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    api
      .verComercio()
      .then((c) => setDatos(c))
      .catch((e) => setError(e.message))
  }, [])

  async function guardar(evento) {
    evento.preventDefault()
    setError('')
    setGuardado(false)
    try {
      const cambios = Object.fromEntries(
        CAMPOS.map(([clave]) => [clave, datos[clave] || null]),
      )
      // Configuración del IVA (solo la ve y la guarda el ADMIN).
      if (datos.iva_pct !== undefined) {
        cambios.iva_pct = Number(datos.iva_pct)
        cambios.precio_incluye_iva = Boolean(datos.precio_incluye_iva)
      }
      if (datos.escaneo_camara !== undefined) {
        cambios.escaneo_camara = Boolean(datos.escaneo_camara)
      }
      const actualizado = await api.actualizarComercio(cambios)
      setDatos(actualizado)
      refrescarComercio(actualizado)
      setGuardado(true)
    } catch (e) {
      setError(e.message)
    }
  }

  if (error && !datos) return <p className="aviso aviso-error">{error}</p>
  if (!datos) return <p>Cargando…</p>

  return (
    <section>
      <div className="titulo-vista">
        <div>
          <h2>Mi empresa</h2>
          <p className="sutil">
            Estos datos salen en el encabezado y en las facturas del POS
          </p>
        </div>
      </div>

      {error && <p className="aviso aviso-error">{error}</p>}
      {guardado && <p className="aviso aviso-ok">Datos actualizados.</p>}
      {!esAdmin && (
        <p className="aviso">Solo un usuario con rol ADMIN puede editar esta información.</p>
      )}

      <div className="empresa-doble">
        <form className="tarjeta rejilla-form" onSubmit={guardar}>
          {CAMPOS.map(([clave, etiqueta, obligatorio]) => (
            <label key={clave} className="campo">
              <span>
                {etiqueta}
                {obligatorio && ' *'}
              </span>
              <input
                required={obligatorio}
                disabled={!esAdmin}
                value={datos[clave] ?? ''}
                onChange={(e) => setDatos({ ...datos, [clave]: e.target.value })}
              />
            </label>
          ))}

          {esAdmin && datos.iva_pct !== undefined && (
            <div className="campo-completo caja-iva">
              <strong>IVA</strong>
              <div className="iva-empresa">
                <label className="campo">
                  <span>IVA por defecto (%) *</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                    value={datos.iva_pct}
                    onChange={(e) => setDatos({ ...datos, iva_pct: e.target.value })}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(datos.precio_incluye_iva)}
                    onChange={(e) => setDatos({ ...datos, precio_incluye_iva: e.target.checked })}
                  />
                  Los precios y costos ya incluyen IVA
                </label>
              </div>
              <p className="sutil">
                Es el IVA que toman los productos nuevos. Cada producto guarda el suyo, que se
                ajusta en cada compra y es el que se cobra al vender. La casilla es la opción que
                viene marcada en Vender y en Compras; allí se puede cambiar solo para una venta o
                compra.
              </p>
            </div>
          )}

          {esAdmin && datos.escaneo_camara !== undefined && (
            <div className="campo-completo caja-iva">
              <strong>Escaneo</strong>
              <label className="check iva-empresa">
                <input
                  type="checkbox"
                  checked={Boolean(datos.escaneo_camara)}
                  onChange={(e) => setDatos({ ...datos, escaneo_camara: e.target.checked })}
                />
                Permitir escanear códigos con la cámara
              </label>
              <p className="sutil">
                Muestra un botón de cámara en Vender y en el formulario de productos, para los puntos
                de venta que no tienen lector de códigos.
              </p>
            </div>
          )}

          {esAdmin && (
            <div className="modal-pie campo-completo">
              <button type="submit" className="btn btn-primario">
                Guardar cambios
              </button>
            </div>
          )}
        </form>

        <aside className="tarjeta vista-previa">
          <span className="dato-etiqueta">Vista previa</span>
          <div className="previa-marca">
            {datos.logo_url ? (
              <img src={datos.logo_url} alt="Logo" />
            ) : (
              <div className="previa-sinlogo">sin logo</div>
            )}
            <div>
              <strong>{datos.nombre_comercial || datos.razon_social}</strong>
              <div className="sutil">NIT {datos.nit}</div>
            </div>
          </div>
          <p className="sutil">
            {[datos.direccion, datos.ciudad].filter(Boolean).join(' · ') || 'Sin dirección'}
          </p>
          <p className="sutil">
            {[datos.telefono, datos.email].filter(Boolean).join(' · ') || 'Sin contacto'}
          </p>
          <p className="nota">
            El logo se guarda como URL, no como archivo. Sube la imagen al bucket de
            Cloud Storage y pega aquí su dirección pública.
          </p>
        </aside>
      </div>
    </section>
  )
}
