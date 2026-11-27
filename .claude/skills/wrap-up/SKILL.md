---
name: wrap-up
description: Chốt việc trước khi commit / kết thúc phiên DevDeck (vd "commit", "chốt", "xong rồi", "kết thúc"): chạy kiểm tra, đồng bộ plan/ + README + ghi chú phát hành, commit theo quy ước.
---

# Chốt việc

## 1. Kiểm tra code

```bash
npm run typecheck
npx vitest run --reporter=default --reporter=devdeck-reporter
npm run test:server     # khi đụng server/
```

Không xanh thì dừng, báo người dùng kèm output – không commit đỏ trừ khi người dùng bảo.

## 2. Đồng bộ tài liệu

- [ ] File giai đoạn `plan/<số>-*.md`: mục con xong đã `[x]`; việc phát sinh / để sau thành mục con `[ ]` (hoặc `plan/00-backlog.md`), không chỉ nằm trong chat.
- [ ] Bảng `plan/README.md`: cột trạng thái đúng (`chưa` / `9a xong code (chưa thử token thật)` / `xong (chưa kiểm bằng mắt: …)` / `xong`). Ghi rõ phần chưa thử thật.
- [ ] `README.md`: endpoint mới → bảng *API*; nguồn log mới → bảng *Nguồn log AI*; quy tắc an toàn mới → mục *An toàn*; lệnh npm mới → mục *Chạy* / *Kiểm thử*.
- [ ] Thay đổi người dùng thấy được → mục trong **bản chưa phát hành kế tiếp** ở đầu `src/releaseNotes.ts` (`new` / `improve` / `fix`, câu tiếng Việt nói lợi ích cho người dùng, không nói tên file). Chưa có bản kế tiếp → thêm mục mới với `version` dự kiến (hỏi người dùng x / y / z nếu không rõ, xem skill `release`).
- [ ] `design/README.md` nếu thêm màn mới có bản thiết kế.

## 3. Commit (khi người dùng yêu cầu / đã cho phép)

- `git status` + `git diff --stat`; không add `data/`, `dist/`, `release/`, `*.log`, file tạm.
- Message tiếng Việt theo lịch sử: `<Khu vực>: <việc chính>` – vd `Git: xóa/đổi tên nhánh, …`, `Remotes: badge …`, `Plan: thêm giai đoạn …`, `Sửa <triệu chứng> (<nguyên nhân>)`. Thân message (nếu cần) liệt kê ý chính.
- Đang ở `main` và thay đổi lớn → hỏi có muốn tạo nhánh không.
- Phát hành bản mới là việc riêng → skill `release`, không tự chạy.

## 4. Báo người dùng

Ngắn: đã xong gì, kiểm tra nào đã chạy (kết quả thật), phần chưa kiểm bằng mắt / chưa thử với dữ liệu thật, bước tiếp theo trong plan.
