#!/bin/bash
# ═══════════════════════════════════════
# convert-deck.sh — PPTX → WebP 圖片 → push 到 repo
#
# 用法:
#   ./scripts/convert-deck.sh ~/Desktop/碳足跡.pptx
#   ./scripts/convert-deck.sh ~/Desktop/碳足跡.pptx my-deck-name
#
# 流程:
#   PPTX → LibreOffice → PDF → pdftoppm → PNG → cwebp → WebP
#   → slides/{deckName}/ → git push → presenter 可用
# ═══════════════════════════════════════

set -e

SOFFICE="/Applications/LibreOffice.app/Contents/MacOS/soffice"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLIDES_DIR="$REPO_ROOT/slides"

# ── 參數 ──
PPTX_PATH="$1"
DECK_NAME="$2"

if [ -z "$PPTX_PATH" ]; then
  echo "用法: $0 <PPTX路徑> [deck名稱]"
  echo "範例: $0 ~/Desktop/碳足跡.pptx"
  echo "範例: $0 ~/Desktop/碳足跡.pptx carbon-footprint"
  exit 1
fi

if [ ! -f "$PPTX_PATH" ]; then
  echo "❌ 找不到檔案: $PPTX_PATH"
  exit 1
fi

# 自動取 deck 名稱（檔名去副檔名，空格換底線）
if [ -z "$DECK_NAME" ]; then
  DECK_NAME=$(basename "$PPTX_PATH" .pptx | basename "$(cat /dev/stdin)" .PPTX 2>/dev/null || basename "$PPTX_PATH" .pptx)
  DECK_NAME=$(echo "$DECK_NAME" | tr ' ' '_' | tr '[:upper:]' '[:lower:]')
fi

OUT_DIR="$SLIDES_DIR/$DECK_NAME"
TMP_DIR=$(mktemp -d)

echo "🎯 PPTX → WebP 轉檔"
echo "   輸入: $PPTX_PATH"
echo "   Deck: $DECK_NAME"
echo "   輸出: $OUT_DIR/"
echo ""

# ── Step 1: PPTX → PDF ──
echo "① PPTX → PDF..."
"$SOFFICE" --headless --convert-to pdf --outdir "$TMP_DIR" "$PPTX_PATH" 2>/dev/null
PDF_FILE=$(ls "$TMP_DIR"/*.pdf 2>/dev/null | head -1)
if [ -z "$PDF_FILE" ]; then
  echo "❌ LibreOffice 轉換失敗"
  rm -rf "$TMP_DIR"
  exit 1
fi
echo "   ✅ $(basename "$PDF_FILE")"

# ── Step 2: PDF → PNG ──
echo "② PDF → PNG (200 DPI)..."
pdftoppm -png -r 200 "$PDF_FILE" "$TMP_DIR/slide"
PNG_COUNT=$(ls "$TMP_DIR"/slide-*.png 2>/dev/null | wc -l | tr -d ' ')
echo "   ✅ $PNG_COUNT 頁"

if [ "$PNG_COUNT" -eq 0 ]; then
  echo "❌ PDF 轉 PNG 失敗"
  rm -rf "$TMP_DIR"
  exit 1
fi

# ── Step 3: PNG → WebP ──
echo "③ PNG → WebP..."
mkdir -p "$OUT_DIR"

# 檢查 cwebp 是否存在
if command -v cwebp &>/dev/null; then
  USE_CWEBP=1
else
  echo "   (cwebp 不存在，直接用 PNG)"
  USE_CWEBP=0
fi

IDX=0
for PNG in "$TMP_DIR"/slide-*.png; do
  PADDED=$(printf "%03d" $IDX)
  if [ "$USE_CWEBP" -eq 1 ]; then
    cwebp -q 85 "$PNG" -o "$OUT_DIR/$PADDED.webp" 2>/dev/null
  else
    cp "$PNG" "$OUT_DIR/$PADDED.png"
  fi
  IDX=$((IDX + 1))
done

EXT="webp"
[ "$USE_CWEBP" -eq 0 ] && EXT="png"
echo "   ✅ $IDX 張 .$EXT"

# ── Step 4: 清理 ──
rm -rf "$TMP_DIR"

# ── Step 5: Git push ──
echo "④ Git push..."
cd "$REPO_ROOT"
git add "slides/$DECK_NAME/"
CHANGED=$(git diff --cached --name-only | wc -l | tr -d ' ')
if [ "$CHANGED" -gt 0 ]; then
  git commit -m "feat: add deck $DECK_NAME ($IDX slides from PPTX)"
  git pull --rebase 2>/dev/null || true
  git push
  echo "   ✅ 已推送到 GitHub"
else
  echo "   ⚠️ 沒有變更（可能已存在）"
fi

echo ""
echo "🎉 完成！"
echo "   Presenter URL: https://ai100.cooperation.tw/classroom/presenter?deck=$DECK_NAME"
echo "   共 $IDX 頁"
echo ""
echo "   在 host.html 選教材時使用 deck=$DECK_NAME"
