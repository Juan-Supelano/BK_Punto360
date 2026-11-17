import { useState } from 'react'
import { api } from './api.js'

const TIPOS_DOC = ['CC', 'NIT', 'CE', 'TI', 'PAS']

const VACIO = {
  tipo_doc: 'CC',
  num_doc: '',
  nombre: '',
  email: '',
  telefono: '',
  direccion: '',
}

/**
 * Alta rápida de un cliente sin salir de la pantalla de venta.
 *
 * Pide los mismos datos que la pantalla de Clientes. Al guardar entrega el
 * cliente creado con onCreado, para que la venta lo deje seleccionado.
 */
export default function ClienteRapido({ onCerrar, onCreado }) {
  const [formulario, setFormulario] = useState(VACIO)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const campo = (nombre) => ({
    value: formulario[nombre],
    onChange: (e) => setFormulario({ ...formulario, [nombre]: e.target.value }),
  })

  async function guardar(evento) {
    evento.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const cliente = await api.crearCliente({
        tipo_doc: formulario.tipo_doc,
        num_doc: formulario.num_doc.trim(),
        nombre: formulario.nombre.trim(),
        email: formulario.email.trim() || null,
        telefono: formulario.telefono.trim() || null,
        direccion: formulario.direccion.trim() || null,
      })
      onCreado(cliente)
    } catch (e) {
      setError(e.message)
      setGuardando(false)
    }
  }

  return (
    <div className="fondo-modal" onClick={onCerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h3>Nuevo cliente</h3>

        {error && <p className="aviso aviso-error">{error}</p>}

        <div className="rejilla-form">
          <label className="campo">
            <span>Tipo de documento</span>
            <select required {...campo('tipo_doc')}>
              {TIPOS_DOC.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="campo">
            <span>Número de documento</span>
            <input
              required
              autoFocus
              maxLength={20}
              className="mono-entrada"
              {...campo('num_doc')}
            />
          </label>

          <label className="campo campo-ancho">
            <span>Nombre</span>
            <input required maxLength={150} {...campo('nombre')} />
          </label>

          <label className="campo">
            <span>Teléfono</span>
            <input maxLength={30} {...campo('telefono')} />
          </label>

          <label className="campo">
            <span>Correo</span>
            <input type="email" maxLength={120} {...campo('email')} />
          </label>

          <label className="campo campo-ancho">
            <span>Dirección</span>
            <input maxLength={200} {...campo('direccion')} />
          </label>
        </div>

        <div className="modal-pie">
          <button type="button" className="btn btn-suave" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Crear y seleccionar'}
          </button>
        </div>
      </form>
    </div>
  )
}
