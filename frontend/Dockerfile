# --- Etapa 1: compilar el bundle de Vite -------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite incrusta VITE_API_URL en el bundle EN TIEMPO DE BUILD, no de ejecucion.
# El valor sale de .env.production, que se crea con la URL real del backend
# despues de desplegar Cloud Run. Cambiar la URL obliga a reconstruir la imagen.
# Opcional: docker compose pasa API_URL_LOCAL para apuntar a la API local.
# Si no llega, se usa la URL de .env.production (despliegue en Cloud Run).
# El argumento NO se llama VITE_API_URL a proposito: Docker expone los ARG como
# variables de entorno y Vite les da prioridad sobre .env.production, asi que un
# VITE_API_URL vacio dejaba el frontend apuntando a localhost.
ARG API_URL_LOCAL=
RUN if [ -n "$API_URL_LOCAL" ]; then echo "VITE_API_URL=$API_URL_LOCAL" > .env.production.local; fi \
    && npm run build

# --- Etapa 2: servir los archivos estaticos ----------------------------------
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
