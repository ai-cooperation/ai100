#!/bin/bash
# 監控 ac-mac 生圖進度，完成後自動 scp 回來
# 用法: bash pull-cinematic.sh

IMG_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🎬 監控 ac-mac 生圖進度..."
echo "   圖片將拉回: $IMG_DIR/"
echo ""

while true; do
    LOG=$(ssh ac-mac "tail -3 /tmp/gen-cinematic.log" 2>/dev/null)
    COUNT=$(ssh ac-mac "find /tmp/cinematic-slides -name '*.png' -size +1k 2>/dev/null | wc -l" 2>/dev/null)
    echo "[$(date +%H:%M:%S)] 已完成: ${COUNT:-0}/27 — $LOG"

    if echo "$LOG" | grep -q "^Done:"; then
        echo ""
        echo "✅ 排隊完成！開始拉圖..."
        scp -r ac-mac:/tmp/cinematic-slides/* "$IMG_DIR/"
        echo ""
        echo "📊 結果:"
        find "$IMG_DIR" -name "*.png" -size +1k | sort | while read f; do
            SIZE=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null)
            echo "  ✅ $(echo $f | sed "s|$IMG_DIR/||") ($(echo $SIZE/1024 | bc)KB)"
        done
        break
    fi

    sleep 30
done
