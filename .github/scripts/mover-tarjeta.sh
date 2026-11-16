#!/usr/bin/env bash
# Mueve en el GitHub Project la tarjeta de uno o varios issues a un Status.
# Uso: mover-tarjeta.sh "<Status>" <numero_issue> [<numero_issue> ...]
# Variables: GH_TOKEN (PAT con scope project), PROJECT_ID, GITHUB_REPOSITORY.
set -euo pipefail

STATUS="$1"; shift
[ "$#" -eq 0 ] && { echo "No hay issues que mover."; exit 0; }

# Nombres aceptados por columna (el tablero puede usar cualquiera).
case "$STATUS" in
  "In Progress") CANDIDATOS="in progress" ;;
  "Review")      CANDIDATOS="in review|review" ;;
  "Done")        CANDIDATOS="done" ;;
  *) echo "Status desconocido: $STATUS"; exit 1 ;;
esac

CAMPO=$(gh api graphql -f query='
  query($p: ID!) { node(id: $p) { ... on ProjectV2 {
    field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } } } } }' \
  -F p="$PROJECT_ID")
FIELD_ID=$(jq -r '.data.node.field.id' <<<"$CAMPO")
OPTION_ID=$(jq -r --arg c "$CANDIDATOS" \
  '[.data.node.field.options[] | select(.name | ascii_downcase | test("^(" + $c + ")$"))][0].id // empty' <<<"$CAMPO")
[ -z "$OPTION_ID" ] && { echo "El tablero no tiene la columna $STATUS"; exit 1; }

for N in "$@"; do
  NODE=$(gh api "repos/$GITHUB_REPOSITORY/issues/$N" --jq 'select(.pull_request == null) | .node_id' 2>/dev/null || true)
  [ -z "$NODE" ] && { echo "#$N no es un issue, se omite."; continue; }

  ITEM=$(gh api graphql -f query='
    query($i: ID!) { node(id: $i) { ... on Issue { projectItems(first: 20) { nodes { id project { id } } } } } }' \
    -F i="$NODE" | jq -r --arg p "$PROJECT_ID" '[.data.node.projectItems.nodes[] | select(.project.id == $p)][0].id // empty')

  if [ -z "$ITEM" ]; then
    ITEM=$(gh api graphql -f query='
      mutation($p: ID!, $c: ID!) { addProjectV2ItemById(input: {projectId: $p, contentId: $c}) { item { id } } }' \
      -F p="$PROJECT_ID" -F c="$NODE" --jq '.data.addProjectV2ItemById.item.id')
  fi

  gh api graphql -f query='
    mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) {
      updateProjectV2ItemFieldValue(input: {projectId: $p, itemId: $i, fieldId: $f,
        value: {singleSelectOptionId: $o}}) { clientMutationId } }' \
    -F p="$PROJECT_ID" -F i="$ITEM" -F f="$FIELD_ID" -f o="$OPTION_ID" >/dev/null
  echo "Issue #$N -> $STATUS"
done
