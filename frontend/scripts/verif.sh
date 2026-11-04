#!/usr/bin/env bash
# Vérification complète : couleurs + types + build (pnpm uniquement).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

status=0
echo "### Audit des couleurs"; bash scripts/audit-couleurs.sh || status=1
echo; echo "### pnpm check"; pnpm check || status=1
echo; echo "### pnpm build"; pnpm build || status=1
echo
if [ "$status" -eq 0 ]; then echo "VÉRIFICATION : OK"; else echo "VÉRIFICATION : ÉCHEC"; fi
exit "$status"
