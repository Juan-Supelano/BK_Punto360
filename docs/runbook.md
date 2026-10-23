# Runbook de operación

Cómo levantar, desplegar, verificar y revertir Punto360. La configuración inicial de GCP (Cloud SQL, Secret Manager, Artifact Registry) está en [despliegue-gcp.md](despliegue-gcp.md).

| Componente | Dónde vive |
| --- | --- |
| Frontend | Cloud Run `cuadre-pos-web` (nginx) |
| API | Cloud Run `cuadre-pos-api` (FastAPI) |
| Base de datos | Cloud SQL PostgreSQL 16, base `proyecto_nube` |
| Secretos | Secret Manager: `DATABASE_URL`, `JWT_SECRETO` |
| Imágenes | Artifact Registry `us-central1-docker.pkg.dev/<PROYECTO>/cuadre-pos` |

## 1. Entorno local

```bash
docker compose up --build      # frontend :8080, API :8000, PostgreSQL :5433
docker compose down            # detener
docker compose down -v         # detener y borrar la base (se recrea con schema.sql y seed.sql)
```

## 2. Desplegar

El despliegue es automático: cada push a `main` ejecuta `.github/workflows/deploy.yml`, que llama a `cloudbuild.yaml` y publica las dos imágenes con la etiqueta del commit (los 7 primeros caracteres).

1. Fusionar los cambios en `desarrollo` y probarlos.
2. Abrir un PR de `desarrollo` a `main`, revisarlo y fusionarlo.
3. Seguir la ejecución en GitHub → Actions → Deploy.

Requisitos: secretos del repositorio `GCP_PROJECT_ID` y `GCP_SA_KEY`.

Despliegue manual, desde la raíz del repositorio:

```bash
gcloud builds submit --config cloudbuild.yaml --substitutions _TAG=manual .
```

## 3. Verificar

```bash
API=$(gcloud run services describe cuadre-pos-api --region us-central1 --format="value(status.url)")
curl "$API/salud"    # {"estado":"ok"}: el contenedor responde
curl "$API/health"   # {"estado":"ok","base_datos":"ok"}: además llega a Cloud SQL
```

Luego iniciar sesión en el frontend y abrir Productos. Si `/health` da 503, el problema es la conexión a Cloud SQL o el secreto `DATABASE_URL`.

## 4. Rollback

Cloud Run guarda cada versión desplegada como una revisión. Volver a la anterior no requiere reconstruir nada:

```bash
gcloud run revisions list --service cuadre-pos-api --region us-central1
gcloud run services update-traffic cuadre-pos-api --region us-central1 --to-revisions=<REVISION_ANTERIOR>=100
```

Lo mismo con `cuadre-pos-web`. Después, revertir el commit en `main` con `git revert` y un PR, para que el siguiente despliegue no vuelva a publicar el error. No usar `push --force` sobre `main`.

## 5. Base de datos

| Tarea | Comando |
| --- | --- |
| Respaldo manual | `gcloud sql backups create --instance=<INSTANCIA>` |
| Ver respaldos | `gcloud sql backups list --instance=<INSTANCIA>` |
| Restaurar | `gcloud sql backups restore <ID_RESPALDO> --restore-instance=<INSTANCIA>` |

Restaurar sobrescribe la base: hacer un respaldo manual antes.

## 6. Secretos

Rotar el secreto JWT cierra todas las sesiones abiertas:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))" > jwt.txt
gcloud secrets versions add JWT_SECRETO --data-file=jwt.txt
gcloud run services update cuadre-pos-api --region us-central1 --update-secrets JWT_SECRETO=JWT_SECRETO:latest
```

Borrar `jwt.txt` después.

## 7. Registros

```bash
gcloud run services logs read cuadre-pos-api --region us-central1 --limit 50
```

| Síntoma | Causa probable |
| --- | --- |
| El navegador muestra error de CORS | `CORS_ORIGENES` de la API no incluye la URL del frontend |
| `/salud` responde y `/health` da 503 | Conexión a Cloud SQL, usuario o contraseña |
| Todo responde 401 después de desplegar | Cambió `JWT_SECRETO`: hay que volver a iniciar sesión |
| El frontend llama a una API vieja | `frontend/.env.production` tiene otra URL: corregirla y redesplegar |
