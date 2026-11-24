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

## Credenciales y secretos (HU-23)

Ninguna credencial (contraseña de la base, llave de firma de los tokens, claves de API) está en el código, en los manifiestos ni en el historial del repositorio.

| Criterio | Cómo se cumple | Dónde |
|---|---|---|
| Sin valores por defecto en el código | `DATABASE_URL` y `JWT_SECRETO` son obligatorios: si faltan, la API no arranca. | `app/config.py` |
| Llave de firma robusta | `JWT_SECRETO` debe tener 32 caracteres o más y no puede ser el valor de las plantillas (empiezan por `CAMBIAR`). | `Settings._secreto_robusto` |
| Kubernetes | Las credenciales viven en el Secret `punto360-secret` y llegan a los pods con `secretKeyRef`. En el repositorio solo está la plantilla `k8s/secret.example.yaml`; el archivo real `k8s/secret.yaml` está en `.gitignore`. La configuración no sensible va en el ConfigMap. | `k8s/secret.example.yaml`, `k8s/02-postgres.yaml`, `k8s/03-api.yaml`, `k8s/01-configmap.yaml` |
| Cloud Run | `DATABASE_URL` y `JWT_SECRETO` se inyectan desde Secret Manager. | `docs/despliegue-gcp.md` |
| Desarrollo local | `backend/.env` (sin Docker) o `.env` en la raíz (docker compose), ambos en `.gitignore` y creados desde sus `.env.example`. Compose no arranca si falta alguno de los dos valores. | `.env.example`, `backend/.env.example`, `docker-compose.yml` |
| CI | El job usa una base temporal y una llave de prueba sin valor real; los secretos de despliegue (`GCP_SA_KEY`, `PROJECT_TOKEN`) están en *Settings → Secrets* de GitHub. | `.github/workflows/` |

Para rotar la llave de firma: generar un valor nuevo, actualizar el Secret (o la versión en Secret Manager) y reiniciar la API. Todas las sesiones abiertas se cierran y hay que volver a iniciar sesión.

```bash
python -c "import secrets; print(secrets.token_hex(32))"
kubectl apply -f k8s/secret.yaml
kubectl rollout restart deployment/punto360-api -n punto360
```
