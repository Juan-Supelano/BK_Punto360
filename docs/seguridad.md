# Seguridad de la API

Criterios de seguridad de Punto360 y dónde se cumple cada uno. Parte de los requisitos del Proyecto 3 (autenticación, credenciales fuera del repositorio y monitoreo).

## Autenticación (HU-22)

Mecanismo elegido: **JWT** con el esquema `Authorization: Bearer <token>`.

| Criterio | Cómo se cumple | Dónde |
|---|---|---|
| Crear, actualizar y eliminar exige token | Toda ruta `POST`, `PUT`, `PATCH` y `DELETE` depende de `usuario_actual` (directamente o por `solo_admin`, `solo_cajero` o `requerir_password_actualizada`). La única excepción es `POST /auth/login`. | `app/seguridad.py`, routers |
| Permisos por rol en el backend | `solo_admin` y `solo_cajero` responden 403; ocultar un botón en el frontend no cuenta como control. | `app/seguridad.py` |
| Token firmado y con vencimiento | HS256 con `JWT_SECRETO`. El algoritmo es fijo (se rechaza `alg: none` y cualquier otro), y `exp` y `sub` son obligatorios. Vida: `JWT_MINUTOS` (480 por defecto). | `crear_token`, `usuario_actual` |
| Usuario desactivado pierde el acceso | Cada petición vuelve a leer el usuario; si `activo = false`, responde 401 aunque el token siga vigente. | `usuario_actual` |
| Contraseñas | bcrypt con sal; nunca se guardan ni se devuelven en texto plano. | `hashear`, `verificar` |
| No revelar qué correos existen | Mismo mensaje y mismo costo de bcrypt si el correo no existe o la contraseña está mal. | `routers/auth.py` → `login` |
| Contraseña temporal | Un usuario creado o restablecido por el ADMIN no puede usar la API de negocio hasta cambiarla. | `requerir_password_actualizada` |

Rutas públicas (sin token): `GET /`, `GET /salud`, `GET /docs`, `GET /openapi.json`, `POST /auth/login` y `/static`.

La prueba `backend/tests/test_proteccion_api.py` recorre todas las rutas de escritura de la aplicación y exige 401 sin token, de modo que un endpoint nuevo sin protección hace fallar el CI. No necesita base de datos.
