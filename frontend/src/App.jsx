// Esqueleto inicial (HU-03). HU-04 agrega el login y la navegación por rol.
export default function App() {
  return (
    <div className="disposicion">
      <aside className="lateral">
        <div className="lateral-marca">
          <img className="marca-logo" src="/img/logo-punto360.png" alt="" />
          <div className="marca-texto">
            <strong>Punto360</strong>
            <span className="sutil">Punto de venta</span>
          </div>
        </div>
        <nav className="lateral-nav" />
      </aside>
      <main className="contenido">
        <p className="sutil">Proyecto base listo. Las pantallas llegan con cada HU.</p>
      </main>
    </div>
  )
}
