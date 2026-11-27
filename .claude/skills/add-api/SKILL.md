---
name: add-api
description: Thêm hoặc sửa một endpoint /api/* của DevDeck (đọc hoặc ghi: git, jobs, remotes, usage, jira…). Danh sách đủ mọi chỗ phải sửa từ server → types → api.ts → UI, kèm các quy tắc an toàn bắt buộc cho thao tác ghi.
---

# Thêm endpoint API

Lấy một endpoint gần giống nhất làm mẫu và `grep` đường dẫn của nó (vd `'/api/git/action'`, `cloneStart`) để thấy đủ chỗ đang dùng – danh sách dưới là tối thiểu.

## Server

- [ ] Hàm xử lý trong đúng module, không viết logic trong `server/index.js`:
  - đọc git → `server/git.js`; ghi trên một repo → `server/git-actions.js` (thêm nhánh vào `perform`); tạo / clone / xóa repo → `server/git-repos.js`
  - tiến trình → `server/jobs/`; MR / PR / pipeline → `server/remotes/` (cả `gitlab.js` và `github.js` nếu là tính năng chung); log AI → `server/usage/`
  - tích hợp mới (vd Jira) → thư mục riêng `server/<tên>/` theo mẫu `remotes/` (`store.js` giữ token, `http.js` gọi mạng)
- [ ] Route trong `server/index.js` `api()`: GET đọc `url.searchParams`; POST / PUT đọc body JSON như route sẵn có (chỉ nhận `application/json`). Trả `json(res, 200, …)`; lỗi người dùng → mã 4xx + `{ error: '<tiếng Việt, nói cách khắc phục>' }`.
- [ ] **Thao tác ghi** (bắt buộc):
  - Lệnh qua `execFile` / `spawn` mảng tham số, không shell. Tham số từ client kiểm từng cái (tên nhánh `check-ref-format`, chặn `-` đầu, whitelist ký tự).
  - `path` phải là repo đã quét / nằm trong thư mục quét (dùng hàm kiểm sẵn có, không tự viết lại).
  - Phá hủy → `dryRun: true` trả điều sẽ xảy ra; thật sự làm cần `confirmName` khớp; không xóa vĩnh viễn.
  - `audit({...})` cả khi lỗi, bỏ `confirmName` / token khỏi params.
- [ ] Gọi mạng ngoài: chỉ cho Remotes / tích hợp người dùng đã thêm tài khoản; timeout, phân trang, báo rõ 401 / 403 / rate limit; token không bao giờ vào response / log.
- [ ] Việc lâu (clone, chạy script) → trả `id` ngay, endpoint hỏi tiến độ + hủy (mẫu `/api/git/clone`).
- [ ] Test: `server/git-test.js` (repo tạm) hoặc file test cạnh module, đăng ký vào `test:server` trong `package.json` nếu là file mới.

## Client

- [ ] Kiểu request / response trong `src/types.ts`.
- [ ] Hàm trong `api` (`src/api.ts`) dùng `request<T>`; POST kèm header `content-type: application/json`; query qua `encodeURIComponent` / `URLSearchParams`.
- [ ] Đọc dữ liệu trong component → `useLoad(fn, deps, every, key)` (key cache ổn định, theo mẫu trang khác); ghi → `runAction` (`lib/actions.ts`) cho git, hoặc gọi `api.*` + toast, rồi `dropCache(<prefix>)` / tăng `rev` trong store để nơi khác tải lại.
- [ ] UI: trạng thái đang tải (`Spinner`), lỗi (`ErrorBanner` có `onRetry`), rỗng; thao tác phá hủy qua `ConfirmDialog` gõ lại tên.
- [ ] Lệnh hay dùng → thêm vào `CommandPalette.tsx`.

## Xong

- `npm run typecheck`, `npx vitest run --reporter=default --reporter=devdeck-reporter`, `npm run test:server`.
- `README.md` bảng *API* thêm / sửa dòng; quy tắc an toàn mới → mục *An toàn*.
- Rồi `senior-review` (mục An toàn) và `wrap-up`.
