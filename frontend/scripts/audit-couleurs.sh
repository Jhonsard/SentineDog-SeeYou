#!/usr/bin/env bash
# Audit des couleurs : signale tout ce qui sort de la charte. Lancer depuis n'importe où.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

SRC="client/src client/index.html"
CHARTE='fff|ffffff|000|000000|e0e0e0|222526|353a3e'
SEVERITE='b02323|3b0d0d|fcd6cc|ebc1ae|ccebd2|8fcc9b'
INC="--include=*.ts --include=*.tsx --include=*.css --include=*.html"
fail=0

echo "== 1. Hex hors charte (teintes de sévérité exclues) =="
out=$(grep -rnEio $INC '#[0-9a-f]{3,8}\b' $SRC 2>/dev/null \
  | grep -viE "#(${CHARTE})$" | grep -viE "#(${SEVERITE})$" || true)
if [ -n "$out" ]; then echo "$out"; fail=1; else echo "OK"; fi

echo "== 2. Teintes de sévérité utilisées hors logs / index.css =="
out=$(grep -rniE $INC "#(${SEVERITE})\b" $SRC 2>/dev/null \
  | grep -viE 'log|index\.css|threatintel' || true)
if [ -n "$out" ]; then echo "$out"; fail=1; else echo "OK"; fi

echo "== 3. Classes Tailwind de palette =="
out=$(grep -rnEo $INC '\b(bg|text|border|ring|fill|stroke|from|via|to|shadow|outline|divide|accent|caret|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b' $SRC 2>/dev/null || true)
if [ -n "$out" ]; then echo "$out"; fail=1; else echo "OK"; fi

echo "== 4. Fonctions de couleur hors index.css (oklch, hsl, rgb) =="
out=$(grep -rnE $INC '(oklch|hsla?|rgba?)\(' $SRC 2>/dev/null | grep -v 'index\.css' || true)
if [ -n "$out" ]; then echo "$out"; fail=1; else echo "OK"; fi

echo "== 5. oklch/hsl/rgb restant dans index.css =="
out=$(grep -nE '(oklch|hsla?|rgba?)\(' client/src/index.css 2>/dev/null || true)
if [ -n "$out" ]; then echo "$out"; fail=1; else echo "OK"; fi

echo
echo "Note : faux positifs possibles (ancres du type #add-user)."
if [ "$fail" -eq 0 ]; then echo "RÉSULTAT : charte respectée"; else echo "RÉSULTAT : écarts à corriger"; fi
exit "$fail"
