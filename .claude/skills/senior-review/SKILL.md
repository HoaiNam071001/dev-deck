---
name: senior-review
description: Tự review diff hiện tại của DevDeck theo chuẩn senior trước khi commit (hoặc khi người dùng nói "review", "rà code", "kiểm tra chất lượng"). An toàn (lệnh, đường dẫn, token) trước, rồi đúng, kiến trúc, đơn giản, test, UI. Sửa luôn chỗ rõ ràng, hỏi chỗ cần người dùng chọn.
---

# Review kiểu senior

Phạm vi: `git diff` + `git diff --cached` + file mới chưa track. Đọc diff trước, chỉ mở file đầy đủ khi cần ngữ cảnh. Báo theo mức **phải sửa** → **nên sửa** → **gợi ý**; mỗi ý có `file:dòng` + tình huống cụ thể gây lỗi. Không báo ý "có thể" không có kịch bản lỗi.

## 1. An toàn (phải sửa)

Đây là app cục bộ chạy lệnh git / PowerShell / taskkill trên máy người dùng – lỗ hổng ở đây là thật.

- **Lệnh**: chỉ `execFile` / `spawn` với mảng tham số, không `exec`, không `shell: true`, không nối chuỗi. Gọi qua `cmd.exe` / PowerShell bắt buộc → tham số qua whitelist ký tự.
- **Tham số từ client**: tên nhánh qua `git check-ref-format` + chặn `-` đầu; đường dẫn phải nằm trong repo / thư mục quét đã cấu hình (không tin `path` client gửi); URL clone chỉ `https://`, `ssh://`, `git@`.
- **Thao tác phá hủy**: có dry-run, xác nhận hai bước (UI gõ lại tên, server kiểm `confirmName`), ghi `audit` (không ghi `confirmName` / token). Xóa → Thùng rác, không xóa vĩnh viễn.
- **Server**: chỉ nghe `127.0.0.1`, kiểm Host; endpoint POST mới chỉ nhận `application/json`; lỗi trả `{ error }` không lộ stack / token.
- **Bí mật**: token GitLab / GitHub / Jira không trả về client, không vào log / audit / CSV / thông báo lỗi.
- **Electron**: `preload.cjs` chỉ lộ hàm cụ thể, không lộ `ipcRenderer` / `shell.openExternal` với URL tùy ý.

## 2. Đúng (phải sửa)

- Nhánh lỗi: lỗi bị nuốt, promise không `catch`, spinner không tắt khi lỗi, `ErrorBanner` có `onRetry`.
- Dữ liệu biên: repo detached / không upstream / chưa commit; log AI dòng hỏng, bản ghi lặp; danh sách rỗng; API phân trang.
- Cache: thao tác ghi xong có `dropCache` / tăng `rev`; key `useLoad` không đụng trang khác; poll không chồng nhau, effect có dọn dẹp (interval, listener, `AbortController`).
- Server ↔ client: kiểu trong `src/types.ts` khớp JSON server trả; trường tùy chọn xử lý `undefined`.
- Windows + macOS: đường dẫn qua `path`, không giả định `\`; code chỉ Windows (Jobs, `taskkill`, `.ps1`) có nhánh / thông báo cho nền khác.

## 3. Kiến trúc (nên sửa)

- Đúng chỗ: đọc git ở `server/git.js`, ghi ở `git-actions.js` / `git-repos.js`; logic thuần ở `src/lib/` (không import React); fetch chỉ qua `src/api.ts`.
- Một file một việc: diff đưa file vượt ~300 dòng (vd `RemotesPage.tsx`, `JobDetail.tsx` đã gần / quá) hoặc thêm tính năng thứ hai vào một component → tách component hiển thị + hàm thuần có test. Hàm > ~60 dòng nhiều nhánh → tách có tên.
- Dùng lại trước khi viết mới: `ui.tsx`, `Modal`, `ConfirmDialog`, `ContextMenu`, `Toasts`, `runAction`, `usePersisted`, `useLoad`, `format.ts` (`relTime`, số gọn `ShortNum`), `csv.ts`. Hai chỗ giống nhau → gom.
- Server không thêm phụ thuộc npm (README: "Server Node không phụ thuộc").
- Không code chết, không TODO vô chủ (việc để sau → `plan/00-backlog.md`).

## 4. Đơn giản & hiệu năng (nên sửa)

- State trùng lặp suy ra được; `useSyncExternalStore` selector trả object mới mỗi lần → re-render.
- Quét / gọi git cho mọi repo: chạy song song có giới hạn, không gọi lại khi cache còn mới; danh sách dài dùng lại cơ chế ảo hóa của `RepoList`.
- Đọc log AI: dùng `parseCached` (theo mtime), không đọc lại cả thư mục mỗi request.

## 5. Test (phải có cho logic mới)

- Logic thuần TS → `src/lib/lib.test.ts`; git server → `server/git-test.js`; parser → `server/usage/test.js` + fixture. Có ca biên: rỗng, lỗi, giá trị lạ.
- Sửa bug → có test đỏ trước khi sửa.

## 6. UI & văn bản (gợi ý / nên sửa)

- Token màu (`src/tokens.css`, quy ước `design/README.md`: ↑ xanh dương, ↓ cam, lỗi đỏ, sạch xanh lá), không màu cứng; tương phản ≥ 4.5:1; số liệu `font-mono` căn phải.
- Trạng thái rỗng / đang tải / lỗi; phím tắt không đụng nhau và có trong `CommandPalette`; tiêu điểm bàn phím, `aria-label` cho nút chỉ có icon.
- Chữ giao diện + comment tiếng Việt, ngắn, comment nói *vì sao*; tên biến / hàm tiếng Anh.

## 7. Kết thúc

Chạy `npm run typecheck`, `npx vitest run --reporter=default --reporter=devdeck-reporter`, `npm run test:server` (nếu đụng server). Sửa các ý *phải sửa* / *nên sửa* rõ ràng; ý cần đánh đổi → liệt kê cho người dùng chọn. Báo tóm tắt: đã sửa gì, còn gì.
