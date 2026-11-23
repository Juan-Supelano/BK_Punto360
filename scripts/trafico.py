"""Genera tráfico de prueba contra la API para ver las métricas en Grafana (HU-24).

Solo usa la biblioteca estándar de Python. Uso, con el port-forward de la API
abierto (README, sección Kubernetes):

    python scripts/trafico.py
    python scripts/trafico.py --segundos 120 --hilos 10

Sin credenciales recorre rutas públicas y rutas protegidas sin token (que
responden 401: sirve para mostrar que la autenticación funciona). Para medir
también las consultas autenticadas, se pasan las credenciales por variables de
entorno, nunca escritas en el script:

    PUNTO360_EMAIL=admin@cuadrepos.co PUNTO360_PASSWORD=... python scripts/trafico.py

    # PowerShell
    $env:PUNTO360_EMAIL="admin@cuadrepos.co"; $env:PUNTO360_PASSWORD="..."
    python scripts/trafico.py

--prediccion agrega los cálculos del módulo predictivo (solo ADMIN), que
gastan CPU: útil para ver escalar el HorizontalPodAutoscaler.
"""

import argparse
import json
import os
import random
import threading
import time
import urllib.error
import urllib.request
from collections import Counter

# (método, ruta, necesita token, peso)
PUBLICAS = [
    ("GET", "/", False, 3),
    ("GET", "/no-existe", False, 1),  # 404
    ("GET", "/auth/yo", False, 2),  # 401 sin token
    ("POST", "/categorias", False, 2),  # 401 sin token
    ("DELETE", "/productos/1", False, 1),  # 401 sin token
]
AUTENTICADAS = [
    ("GET", "/auth/yo", True, 2),
    ("GET", "/categorias", True, 4),
    ("GET", "/productos", True, 6),
    ("GET", "/productos?buscar=a", True, 4),
    ("GET", "/clientes", True, 3),
    ("GET", "/ventas/resumen", True, 2),
]
PREDICCION = [
    ("GET", "/prediccion/ventas-mensuales", True, 2),
    ("GET", "/prediccion/inventario", True, 1),
    ("GET", "/prediccion/ventas", True, 1),
]


def pedir(base: str, metodo: str, ruta: str, token: str | None = None, cuerpo=None) -> int:
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    peticion = urllib.request.Request(base + ruta, data=datos, method=metodo)
    peticion.add_header("Content-Type", "application/json")
    if token:
        peticion.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(peticion, timeout=15) as r:
            r.read()
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        return 0  # sin conexión


def iniciar_sesion(base: str, email: str, password: str) -> str:
    peticion = urllib.request.Request(
        base + "/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(peticion, timeout=15) as r:
        return json.load(r)["access_token"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--url", default=os.environ.get("PUNTO360_API", "http://localhost:8000"))
    parser.add_argument("--segundos", type=int, default=60)
    parser.add_argument("--hilos", type=int, default=5)
    parser.add_argument("--pausa", type=float, default=0.05, help="segundos entre peticiones de cada hilo")
    parser.add_argument("--prediccion", action="store_true")
    args = parser.parse_args()
    base = args.url.rstrip("/")

    if pedir(base, "GET", "/salud") != 200:
        raise SystemExit(f"La API no responde en {base}/salud. ¿Está abierto el port-forward?")

    rutas = list(PUBLICAS)
    token = None
    email, password = os.environ.get("PUNTO360_EMAIL"), os.environ.get("PUNTO360_PASSWORD")
    if email and password:
        try:
            token = iniciar_sesion(base, email, password)
        except urllib.error.HTTPError as e:
            raise SystemExit(f"No se pudo iniciar sesión con {email} (HTTP {e.code}).")
        rutas += AUTENTICADAS + (PREDICCION if args.prediccion else [])
        print(f"Sesión iniciada como {email}.")
    else:
        print("Sin PUNTO360_EMAIL/PUNTO360_PASSWORD: solo rutas públicas y 401.")

    pesos = [r[3] for r in rutas]
    resultados: Counter = Counter()
    candado = threading.Lock()
    fin = time.monotonic() + args.segundos

    def trabajar():
        while time.monotonic() < fin:
            metodo, ruta, con_token, _ = random.choices(rutas, weights=pesos)[0]
            cuerpo = {} if metodo in ("POST", "PUT") else None
            codigo = pedir(base, metodo, ruta, token if con_token else None, cuerpo)
            with candado:
                resultados[codigo] += 1
            time.sleep(args.pausa)

    print(f"Enviando tráfico a {base} durante {args.segundos} s con {args.hilos} hilos...")
    hilos = [threading.Thread(target=trabajar, daemon=True) for _ in range(args.hilos)]
    for h in hilos:
        h.start()
    while any(h.is_alive() for h in hilos):
        time.sleep(max(0.5, min(10, fin - time.monotonic())))
        if time.monotonic() < fin:
            with candado:
                total = sum(resultados.values())
            print(f"  {total} peticiones")
    for h in hilos:
        h.join()

    total = sum(resultados.values())
    print(f"\nTotal: {total} peticiones ({total / args.segundos:.1f} por segundo)")
    for codigo, n in sorted(resultados.items()):
        print(f"  HTTP {codigo or 'sin conexión'}: {n}")


if __name__ == "__main__":
    main()
