"""Métricas del proyecto a partir de los issues y PRs de GitHub.

Escribe docs/metricas.md y actualiza el bloque de métricas del README (entre
<!-- metricas:inicio --> y <!-- metricas:fin -->).

Definiciones:
  - Una HU es un issue cuyo título empieza por "HU-NN". Sus datos (puntos,
    sprint, tipo y responsable) salen de la línea de metadata del issue:
    "Estimación: 5 · Sprint: Sprint 1 · Prioridad: Alta · Tipo: Feature · Responsable: @usuario".
  - Una HU está entregada cuando tiene al menos un PR fusionado en `desarrollo`
    cuyo cuerpo dice "Refs #N" (o Closes/Fixes) con el número de su issue.
  - Velocity: puntos entregados por sprint, y su promedio.
  - Lead time: desde que se creó el issue hasta el último PR fusionado.
  - Cycle time: desde que se abrió el primer PR de la HU hasta que se fusionó el último.
  - Bugs: HU de tipo Bug más issues con la etiqueta "bug".

Uso, desde la raíz del repositorio y con `gh` autenticado:
    python scripts/metricas.py
"""

import json
import re
import subprocess
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

REPO = "Juan-Supelano/BK_Punto360"
RAMA_INTEGRACION = "desarrollo"
SALIDA = Path("docs/metricas.md")
README = Path("README.md")
EQUIPO = ["Juan-Supelano", "paulatatian", "pipereinaa"]

sys.stdout.reconfigure(encoding="utf-8")


def gh_json(*args):
    r = subprocess.run(
        ["gh", *args], capture_output=True, text=True, encoding="utf-8", stdin=subprocess.DEVNULL
    )
    if r.returncode != 0:
        sys.exit(f"[error] gh {' '.join(args)}\n{r.stderr.strip()}")
    return json.loads(r.stdout or "[]")


def fecha(texto):
    return datetime.fromisoformat(texto.replace("Z", "+00:00")) if texto else None


def horas(delta):
    return delta.total_seconds() / 3600


def formato(h):
    if h is None:
        return "—"
    return f"{h:.1f} h" if h < 48 else f"{h / 24:.1f} días"


def promedio(valores):
    valores = [v for v in valores if v is not None]
    return sum(valores) / len(valores) if valores else None


def metadata(cuerpo):
    """Lee la línea "Estimación: … · Sprint: … · Responsable: @…" del issue."""
    linea = next((l for l in (cuerpo or "").splitlines() if "Estimación" in l and "·" in l), "")
    campos = {}
    for parte in linea.split("·"):
        if ":" in parte:
            k, v = parte.split(":", 1)
            campos[k.strip(" *-•")] = v.strip(" *")
    puntos = int(re.sub(r"\D", "", campos.get("Estimación", "")) or 0)
    m = re.search(r"@([\w-]+)", campos.get("Responsable", ""))
    responsable = m.group(1) if m else ""
    return {
        "puntos": puntos,
        "sprint": campos.get("Sprint", "?"),
        "tipo": campos.get("Tipo", ""),
        "responsable": responsable,
    }


def numero_sprint(nombre):
    m = re.search(r"\d+", nombre)
    return int(m.group()) if m else 99


def main():
    issues = gh_json(
        "issue", "list", "--repo", REPO, "--state", "all", "--limit", "500",
        "--json", "number,title,body,createdAt,closedAt,state,labels",
    )
    prs = gh_json(
        "pr", "list", "--repo", REPO, "--state", "merged", "--limit", "500",
        "--json", "number,author,createdAt,mergedAt,baseRefName,body,reviews",
    )
    prs = [p for p in prs if p["baseRefName"] == RAMA_INTEGRACION]

    # PRs fusionados que referencian cada issue.
    prs_issue = defaultdict(list)
    for pr in prs:
        for n in set(re.findall(r"(?i)(?:refs|closes|fixes|resuelve)\s+#(\d+)", pr.get("body") or "")):
            prs_issue[int(n)].append(pr)

    # Un issue por HU. Si hay repetidos, gana el que tiene PR y, si no, el más nuevo.
    por_hu = {}
    for i in issues:
        m = re.match(r"\s*HU-(\d+)", i["title"])
        if not m:
            continue
        hu = f"HU-{int(m.group(1)):02d}"
        actual = por_hu.get(hu)
        clave = (bool(prs_issue.get(i["number"])), i["number"])
        if actual is None or clave > (bool(prs_issue.get(actual["number"])), actual["number"]):
            por_hu[hu] = i

    filas = []
    for hu in sorted(por_hu, key=lambda h: int(h[3:])):
        issue = por_hu[hu]
        meta = metadata(issue.get("body"))
        lista = prs_issue.get(issue["number"], [])
        fin = max((fecha(p["mergedAt"]) for p in lista), default=None)
        inicio = min((fecha(p["createdAt"]) for p in lista), default=None)
        creado = fecha(issue["createdAt"])
        titulo = re.sub(r"^\s*HU-\d+\s*[-–:]?\s*", "", issue["title"])
        filas.append({
            "hu": hu, "issue": issue["number"], "titulo": titulo, **meta,
            "prs": sorted(p["number"] for p in lista), "fin": fin,
            "lead": horas(fin - creado) if fin and creado else None,
            "cycle": horas(fin - inicio) if fin and inicio else None,
            "estado": issue["state"].lower(),
        })

    entregadas = [f for f in filas if f["fin"]]

    velocity = defaultdict(lambda: [0, 0, 0, 0])  # pts plan, pts hechos, HU plan, HU hechas
    for f in filas:
        v = velocity[f["sprint"]]
        v[0] += f["puntos"]
        v[2] += 1
        if f["fin"]:
            v[1] += f["puntos"]
            v[3] += 1
    sprints = sorted(velocity, key=numero_sprint)
    vel_prom = promedio([velocity[s][1] for s in sprints])
    lead_prom = promedio([f["lead"] for f in entregadas])
    cycle_prom = promedio([f["cycle"] for f in entregadas])

    numeros_hu = {f["issue"] for f in filas}
    bugs = [f for f in filas if f["tipo"].lower() == "bug"]
    bugs += [
        i for i in issues
        if i["number"] not in numeros_hu and any(l["name"].lower() == "bug" for l in i.get("labels", []))
    ]

    part = {u: defaultdict(int) for u in EQUIPO}
    for f in filas:
        if f["responsable"] in part:
            part[f["responsable"]]["asignadas"] += 1
            part[f["responsable"]]["entregadas"] += bool(f["fin"])
            part[f["responsable"]]["puntos"] += f["puntos"] if f["fin"] else 0
    for pr in prs:
        autor = (pr.get("author") or {}).get("login")
        if autor in part:
            part[autor]["prs"] += 1
        for r in pr.get("reviews", []):
            login = (r.get("author") or {}).get("login")
            if login in part and login != autor:
                part[login]["reviews"] += 1

    # --- docs/metricas.md ----------------------------------------------------
    resumen = [
        f"- **Velocity promedio:** {vel_prom:.1f} puntos por sprint" if vel_prom is not None else "- **Velocity promedio:** —",
        f"- **Historias completadas:** {len(entregadas)}/{len(filas)}",
        f"- **Bugs encontrados:** {len(bugs)}",
        f"- **Tiempo promedio de resolución (lead time):** {formato(lead_prom)}",
    ]
    md = [
        "# Métricas del proyecto", "",
        f"Generado el {date.today().isoformat()} con `scripts/metricas.py` a partir de los issues y PRs de GitHub.", "",
        "## Resumen", "", *resumen,
        f"- **Puntos entregados:** {sum(f['puntos'] for f in entregadas)}/{sum(f['puntos'] for f in filas)}",
        f"- **Cycle time promedio:** {formato(cycle_prom)}", "",
        "## Velocity por sprint", "",
        "| Sprint | Puntos planeados | Puntos entregados | HU entregadas |", "| --- | --- | --- | --- |",
        *[f"| {s} | {velocity[s][0]} | {velocity[s][1]} | {velocity[s][3]}/{velocity[s][2]} |" for s in sprints],
        "", "## Detalle por historia", "",
        "| HU | Título | Sprint | Pts | Responsable | PRs | Lead time | Cycle time | Issue |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for f in filas:
        prs_txt = ", ".join(f"#{n}" for n in f["prs"]) or "—"
        resp = f"@{f['responsable']}" if f["responsable"] else "—"
        md.append(
            f"| {f['hu']} | {f['titulo']} | {f['sprint']} | {f['puntos']} | {resp} | {prs_txt} | "
            f"{formato(f['lead'])} | {formato(f['cycle'])} | #{f['issue']} ({f['estado']}) |"
        )
    md += [
        "", "## Participación", "",
        "| Integrante | HU asignadas | HU entregadas | Puntos entregados | PRs fusionados | Revisiones a otros |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for u in EQUIPO:
        p = part[u]
        md.append(f"| @{u} | {p['asignadas']} | {p['entregadas']} | {p['puntos']} | {p['prs']} | {p['reviews']} |")

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text("\n".join(md) + "\n", encoding="utf-8")

    # --- Bloque del README --------------------------------------------------
    texto = README.read_text(encoding="utf-8")
    nuevo = "<!-- metricas:inicio -->\n" + "\n".join(resumen) + "\n<!-- metricas:fin -->"
    texto, cambios = re.subn(r"<!-- metricas:inicio -->.*?<!-- metricas:fin -->", nuevo, texto, flags=re.S)
    if cambios:
        README.write_text(texto, encoding="utf-8")

    print(f"Escrito {SALIDA}" + (" y actualizado el README" if cambios else " (el README no tiene el bloque de métricas)"))
    print("\n".join(resumen))
    sin_pr = [f["hu"] for f in filas if not f["fin"]]
    if sin_pr:
        print("Sin PR fusionado en desarrollo:", ", ".join(sin_pr))
    sin_meta = [f["hu"] for f in filas if not f["puntos"]]
    if sin_meta:
        print("Sin estimación en el issue:", ", ".join(sin_meta))


if __name__ == "__main__":
    main()
