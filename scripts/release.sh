#!/usr/bin/env bash
# Phát hành: tăng số phiên bản, đẩy main + tag vX.Y.Z; tag kích hoạt workflow "Release Windows".
# Dùng: scripts/release.sh [x|y|z|1.3.0]   (bỏ trống = z: 1.2.2 → 1.2.3)
set -euo pipefail
cd "$(dirname "$0")/.."

[ -z "$(git status --porcelain)" ] || { echo "Còn thay đổi chưa commit, commit trước đã." >&2; exit 1; }
[ "$(git branch --show-current)" = main ] || { echo "Chỉ phát hành từ nhánh main." >&2; exit 1; }

last=$(git tag --list 'v*.*.*' --sort=-v:refname | head -1)
last=${last#v}; last=${last:-0.0.0}
IFS=. read -r X Y Z <<<"$last"
case "${1:-z}" in
  x) next="$((X+1)).0.0" ;;
  y) next="$X.$((Y+1)).0" ;;
  z) next="$X.$Y.$((Z+1))" ;;
  *.*.*) next="$1" ;;
  *) echo "Đối số: x | y | z | X.Y.Z" >&2; exit 1 ;;
esac

echo "Phát hành v$next (bản trước: v$last)"
npm run typecheck
git push origin main
git tag "v$next"
git push origin "v$next"
echo "Xong. Theo dõi build: gh run watch"
