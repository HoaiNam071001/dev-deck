---
name: implement-phase
description: Làm một giai đoạn / mục con theo plan trong plan/ (vd "làm tiếp", "làm giai đoạn 10", "làm 9b", "tiếp tục plan", "làm mục stash"). Đọc trạng thái, lập kế hoạch nhỏ, code theo lớp server → api → UI, kiểm tra, cập nhật plan, commit.
---

# Làm giai đoạn theo plan

## 1. Nạp ngữ cảnh (đọc ít, đúng chỗ)

1. Bảng trạng thái ở `plan/README.md` đã có sẵn đầu phiên nhờ hook (`scripts/session-status.mjs`) – không mở lại. Người dùng nêu giai đoạn khác thì theo người dùng.
2. Chỉ mở file của giai đoạn đó `plan/<số>-<tên>.md`. File dài (vd 09) → chỉ đọc phần mục con đang làm + *Mục tiêu* / *Rủi ro*.
3. `plan/README.md` › *Nguyên tắc xuyên suốt* khi đụng thao tác ghi / đường dẫn / lệnh hệ thống.
4. `README.md` › *API* / *An toàn* khi thêm endpoint. Chỉ mở code những file liên quan (`grep` tên hàm / route trước).
5. Việc trong `plan/00-backlog.md` liên quan giai đoạn này → chuyển vào file giai đoạn trước khi làm.

## 2. Lập kế hoạch trước khi code

- Liệt kê mục con `[ ]` sẽ làm trong lượt này (mỗi mục làm xong được, kiểm tra được). Mục mơ hồ / thiếu → thêm mục con mới vào file giai đoạn trước.
- Lựa chọn ảnh hưởng người dùng (UI, hành vi, thao tác phá hủy, định dạng `data/config.json`) mà plan chưa nói → hỏi (AskUserQuestion, có khuyến nghị), không tự chốt. Chi tiết kỹ thuật thì tự chọn, ghi lý do ngắn trong file giai đoạn.
- Thêm endpoint → skill `add-api`. Thêm nguồn log AI → skill `add-ai-provider`.

## 3. Code theo thứ tự lớp

1. **Server** (`server/`, CommonJS, không thêm phụ thuộc): lệnh đọc ở `git.js`, lệnh ghi ở `git-actions.js` / `git-repos.js` (mỗi thao tác một hàm có tên, `execFile` mảng tham số, đường dẫn phải nằm trong repo đã quét, có `audit`). Remotes ở `server/remotes/` (token không bao giờ trả về client). Jobs ở `server/jobs/` (Windows trước).
2. **Route** trong `server/index.js` → **kiểu** ở `src/types.ts` → **client** ở `src/api.ts` (`request<T>`; POST luôn `content-type: application/json`).
3. **Logic thuần TS** ở `src/lib/` (không import React) + test trong `src/lib/lib.test.ts` (hoặc file `*.test.ts` cạnh bên).
4. **State** dùng chung giữa trang → `src/lib/store.ts`; lựa chọn người dùng cần nhớ → `usePersisted` (`lib/persist.ts`); tải dữ liệu → `useLoad` (cache + làm mới ngầm, `dropCache` sau thao tác ghi).
5. **Component / trang** (`src/components/`, `src/pages/`): dùng lại `ui.tsx` (`Icon`, `Spinner`, `ErrorBanner`, `Chip`, `Segmented`, `Select`, `Kpi`…), `Modal`, `ConfirmDialog`, `Toasts`, `runAction` (`lib/actions.ts`). Màu qua token `src/tokens.css` (không màu cứng), số liệu `font-mono`. Đối chiếu bố cục với `design/`.
6. Route mới → `lib/router.tsx` (`Route`, `ROUTES`) + `Shell.tsx` + `CommandPalette.tsx`.

Trong lúc làm: mục con xong là tick `[x]` ngay; việc phát sinh thành mục con.

## 4. Kiểm tra (bắt buộc, báo kết quả thật)

```bash
npm run typecheck
npx vitest run --reporter=default --reporter=devdeck-reporter
npm run test:server     # khi đụng server/
```

Lỗi thì sửa đến khi qua; không qua được thì nói rõ kèm output. Thay đổi giao diện → chạy `npm run dev` (UI ở http://localhost:5183) và xem bằng skill `run` nếu xem được; không thì ghi "chưa kiểm bằng mắt" vào cột trạng thái của `plan/README.md` như các giai đoạn trước.

Sau đó chạy skill `senior-review` trên diff của mình và sửa những gì nó tìm thấy.

## 5. Chốt

Dùng skill `wrap-up` (tick plan, README, ghi chú phát hành, commit).
