# Retrospectiva del proyecto

Equipo: @paulatatian, @pipereinaa, @Juan-Supelano · Fecha: `______`

Los hechos de esta página salen del historial del repositorio. Las opiniones de cada integrante van en su sección.

## Qué pasó

| Momento | Hecho | Consecuencia |
| --- | --- | --- |
| Inicio | Se subió el proyecto completo a `main` en un solo commit y luego se vaciaron las cuatro ramas. | El historial anterior se conservó y cada HU se reconstruyó desde el commit `a78efb5`. |
| Backlog | Las primeras HU describían un módulo de cuadre de caja que no existía en el código. | Se reescribieron HU-08, 09, 10, 13 y 15 para que describieran los módulos reales. |
| Sprint 1 | Los comandos largos se partían al pegarlos en CMD de Windows. | Se pasó a comandos cortos, ejecutados uno por uno. |
| Sprint 2 | Un commit de HU-08 se hizo en `desarrollo` local en vez de en su rama. | Se respaldó en otra rama, se reinició `desarrollo` y se rehízo en orden. |
| Sprint 2 | Los PR #44, #46 y #47 se fusionaron en la rama de la HU anterior y no en `desarrollo`. | HU-09 y HU-10 no llegaron a `desarrollo` y hubo que abrir PR nuevos. |
| Todo el proyecto | Las tarjetas se movían a mano. | Se agregó la automatización de GitHub Actions para mover tarjetas. |

## Qué funcionó

- Una rama y un PR por HU: cada cambio queda ligado a su historia y a su autor.
- `Co-authored-by` en los commits: conserva el crédito de quien escribió el código original.
- CI en cada PR: lint y build detectan errores antes de fusionar.
- 

## Qué mejorar

- Fusionar cada PR antes de crear la rama de la HU siguiente, o cambiar la base del PR a `desarrollo` antes de fusionar.
- Activar "Automatically delete head branches" desde el inicio.
- Mover las tarjetas el mismo día del cambio, no al final.
- 

## Acciones para el próximo proyecto

| Acción | Responsable |
| --- | --- |
| Proteger `desarrollo` y `main` con revisión obligatoria desde el primer día | |
| Definir el backlog a partir del código real antes de crear issues | |
| | |

## Opiniones del equipo

### @paulatatian

### @pipereinaa

### @Juan-Supelano
