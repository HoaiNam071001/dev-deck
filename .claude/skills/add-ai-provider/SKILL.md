---
name: add-ai-provider
description: Thêm nguồn log token AI mới vào trang AI (vd Cursor, Copilot CLI, Aider, OpenCode) hoặc sửa parser của nguồn có sẵn (claude, codex, gemini, antigravity) khi định dạng log đổi / số liệu sai. Adapter đọc log cục bộ, fixture, test, nhãn UI, README.
---

# Thêm / sửa nguồn log AI

Đọc mẫu gần nhất trước: `server/usage/codex.js` (JSONL nhiều loại dòng), `gemini.js` (một file JSON), `antigravity.js` (project suy từ file khác), `claude.js` (project suy từ tên thư mục). Hàm dùng chung ở `server/usage/util.js` (`walk`, `jsonLines`, `num`, `base`, `parseCached`).

## 1. Tìm hiểu log thật (không đoán)

- Thư mục mặc định trên Windows + macOS, biến môi trường đổi thư mục (theo kiểu `CODEX_HOME`).
- Mở vài file log thật: dòng nào có token, trường nào là input / output / cache ghi / cache đọc / reasoning, model, thời điểm, cwd / project. Input đã gồm cache đọc chưa? Có phát lại cùng bản ghi nhiều lần không? Dòng đang stream?
- Không có log thật trên máy → nói rõ với người dùng, làm theo tài liệu định dạng và ghi "chưa kiểm chứng trên log thật" trong README như Codex / Gemini.

## 2. Adapter `server/usage/<id>.js`

- [ ] Export đúng hình dạng các adapter khác: `id`, `label`, `root`, `files()`, `parse(text, file)`.
- [ ] `parse` trả mảng `{ id, t, project, model, input, output, cacheWrite, cacheRead, reasoning }` – `id` ổn định theo file + vị trí / uuid để `index.js` khử trùng; `input` **không** gồm cache đọc; số qua `num()`; dòng hỏng bỏ qua, không ném lỗi.
- [ ] Không gọi mạng, không đọc ngoài `root`; file lớn đọc qua `parseCached` (theo mtime) – không tự cache riêng.
- [ ] Đăng ký vào `ADAPTERS` trong `server/usage/index.js`.

## 3. Test

- [ ] Fixture nhỏ `server/usage/__fixtures__/<id>.jsonl|json` cắt từ log thật, **xóa nội dung hội thoại / đường dẫn / tên riêng tư**, giữ đủ ca: bản ghi thường, bản ghi lặp, dòng hỏng, dòng không phải model, có cache.
- [ ] Assert trong `server/usage/test.js` theo mẫu sẵn có (số dòng, token từng loại, model, project). Chạy `node server/usage/test.js`.

## 4. Giao diện

- [ ] `grep -rn "antigravity" src/` để thấy đủ chỗ liệt kê nhà cung cấp (hiện: kiểu `provider` trong `src/types.ts`, nhãn / màu ở `src/lib/usage.ts`, giới hạn gói ở `src/lib/limits.ts`, `components/UsageWindows.tsx`). Màu mới lấy từ token `src/tokens.css`.
- [ ] Nguồn không có thư mục → trang AI hiện "chưa có" (qua `/api/usage/sources`), không lỗi.

## 5. Xong

- `npm run test:server`, `npm run typecheck`, `npx vitest run --reporter=default --reporter=devdeck-reporter`.
- `README.md` bảng *Nguồn log AI* (thư mục, biến môi trường, đã / chưa kiểm chứng log thật); `plan/` mục con tương ứng; ghi chú phát hành `new`.
- Rồi `wrap-up`.
