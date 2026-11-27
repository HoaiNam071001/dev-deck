---
name: release
description: Phát hành bản DevDeck mới (vd "release", "phát hành", "ra bản mới", "lên version"). Soạn ghi chú phát hành trong src/releaseNotes.ts, kiểm tra, commit, rồi chạy npm run release (đẩy main + tag kích hoạt build Windows trên GitHub).
---

# Phát hành bản mới

Tag `vX.Y.Z` kích hoạt workflow *Release Windows* và app của mọi người dùng sẽ tự tải bản đó – đây là thao tác ra ngoài, **luôn hỏi xác nhận số phiên bản trước khi chạy `npm run release`**.

## 1. Chọn số phiên bản

- Bản trước: `git tag --list 'v*.*.*' --sort=-v:refname | head -1`.
- Thay đổi từ bản trước: `git log v<bản trước>..HEAD --oneline`.
- `z` chỉ sửa lỗi / chỉnh nhỏ; `y` có tính năng mới; `x` đổi lớn (giao diện / dữ liệu không tương thích). Đề xuất một số kèm lý do, người dùng chốt.

## 2. Ghi chú phát hành

- Thêm mục **ở đầu** mảng `RELEASE_NOTES` trong `src/releaseNotes.ts`: `version` đúng số sắp phát hành (không có `v`), `date` ngày tuyệt đối hôm nay, `title` ngắn, `items` mỗi ý một `{ tag: 'new' | 'improve' | 'fix', text }`.
- Đã có mục soạn sẵn (từ `wrap-up`) cho số khác → đổi `version` cho khớp, gộp ý trùng.
- Viết cho người dùng: lợi ích thấy được, tiếng Việt, không tên file / hàm; lệnh cho người dùng thì bọc `` `…` ``. Đối chiếu với `git log` để không sót / không bịa.
- Không sửa `version` trong `package.json`: workflow tự đặt từ tag (`npm version "${GITHUB_REF_NAME#v}"` trong `.github/workflows/release-windows.yml`).

## 3. Kiểm tra + commit

```bash
npm run typecheck
npx vitest run --reporter=default --reporter=devdeck-reporter
npm run test:server
npm run build
```

Commit `Phát hành v<X.Y.Z>: <title>` (kèm các thay đổi còn dở nếu người dùng đồng ý). `scripts/release.sh` từ chối khi còn thay đổi chưa commit hoặc không ở `main`.

## 4. Phát hành (sau khi người dùng xác nhận)

```bash
npm run release -- <x|y|z|X.Y.Z>
```

Script: kiểm tra sạch + `main`, kiểm `releaseNotes.ts` có `version: '<next>'`, typecheck, `git push origin main`, tạo + đẩy tag. Theo dõi build: `gh run watch` (hoặc `gh run list --workflow "Release Windows" -L 1`). Build lỗi → đọc `gh run view --log-failed`, sửa, phát hành bản `z` mới (không đẩy lại tag cũ).

## 5. Báo

Số phiên bản, link Release trên GitHub, trạng thái build. Nhắc: app đã cài sẽ hỏi cập nhật sau 5 giây khi mở; bản chưa ký nên SmartScreen cảnh báo.
