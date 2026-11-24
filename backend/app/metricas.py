"""Métricas HTTP de la API para Prometheus (HU-24).

Un middleware ASGI mide cada petición y deja tres métricas en el registro por
defecto de prometheus-client, el mismo que publica GET /metrics:

- punto360_http_peticiones_total{metodo, ruta, estado}   (Counter)
- punto360_http_duracion_segundos{metodo, ruta}          (Histogram)
- punto360_http_peticiones_en_curso                      (Gauge)

"ruta" es la plantilla de FastAPI (/productos/{producto_id}), no la URL real:
así una métrica no crece con cada id distinto. Lo que no corresponde a ninguna
ruta se agrupa en "sin_ruta".

Las etiquetas no llevan datos del usuario ni del token: /metrics puede quedar
sin autenticación para que Prometheus lo lea.
"""

import time

from prometheus_client import Counter, Gauge, Histogram

PETICIONES = Counter(
    "punto360_http_peticiones_total",
    "Peticiones HTTP atendidas por la API",
    ["metodo", "ruta", "estado"],
)
DURACION = Histogram(
    "punto360_http_duracion_segundos",
    "Tiempo de respuesta de la API",
    ["metodo", "ruta"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)
EN_CURSO = Gauge(
    "punto360_http_peticiones_en_curso",
    "Peticiones que la API está atendiendo en este momento",
)

# No se miden: Prometheus lee /metrics cada 15 s y Kubernetes llama a las
# probes cada pocos segundos; contarlas taparía el tráfico real.
NO_MEDIDAS = {"/metrics", "/salud", "/listo"}


def _plantilla(scope: dict) -> str:
    ruta = scope.get("route")
    return getattr(ruta, "path", None) or "sin_ruta"


class MetricasHTTP:
    """Middleware ASGI puro (sin BaseHTTPMiddleware, que bufferiza respuestas)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] in NO_MEDIDAS:
            await self.app(scope, receive, send)
            return

        # Si la app lanza una excepción sin responder, queda como 500.
        estado = {"codigo": 500}

        async def enviar(mensaje):
            if mensaje["type"] == "http.response.start":
                estado["codigo"] = mensaje["status"]
            await send(mensaje)

        EN_CURSO.inc()
        inicio = time.perf_counter()
        try:
            await self.app(scope, receive, enviar)
        finally:
            EN_CURSO.dec()
            # El router de FastAPI escribe scope["route"] al resolver la ruta.
            metodo = scope["method"]
            ruta = _plantilla(scope)
            DURACION.labels(metodo, ruta).observe(time.perf_counter() - inicio)
            PETICIONES.labels(metodo, ruta, str(estado["codigo"])).inc()
