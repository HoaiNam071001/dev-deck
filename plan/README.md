# Kế hoạch

Làm tuần tự từng giai đoạn. Mỗi giai đoạn là một file riêng, gồm checklist nhỏ, tiêu chí xong, và rủi ro.
Đánh dấu `[x]` khi xong. Cập nhật trạng thái ở bảng dưới.

Việc phát sinh: thêm vào [00-backlog.md](00-backlog.md) bất cứ lúc nào, dạng `- [ ] ...`.

| # | Giai đoạn | File | Trạng thái |
|---|-----------|------|-----------|
| 0 | Backlog: việc nợ và việc thêm sau | [00-backlog.md](00-backlog.md) | luôn mở |
| 1 | Nền tảng: Vite + React + TS, server tách module | [01-foundation.md](01-foundation.md) | xong (chưa test UI trên trình duyệt) |
| 2 | Trang Git chỉ-đọc: repo, nhánh, trạng thái | [02-git-readonly.md](02-git-readonly.md) | xong (chưa test UI trên trình duyệt) |
| 3 | Thao tác nhánh: tạo, checkout, xóa, đổi tên | [03-git-branch-actions.md](03-git-branch-actions.md) | xong (chưa test UI trên trình duyệt) |
| 4 | Thao tác repo: tạo mới, clone, xóa, fetch/pull | [04-git-repo-actions.md](04-git-repo-actions.md) | xong (chưa test UI trên trình duyệt) |
| 5 | Hoàn thiện: test, a11y, hiệu năng, đóng gói | [05-polish.md](05-polish.md) | xong (chưa kiểm bằng mắt trên trình duyệt: ảo hóa danh sách, biểu đồ so sánh dự án) |
| 6 | Giao diện mới + chuyển thành desktop app | [06-redesign-desktop.md](06-redesign-desktop.md) | xong |
| 7 | Mục "AI" đa nhà cung cấp (Claude, Codex, Gemini) | [07-ai-usage.md](07-ai-usage.md) | xong (Codex/Gemini chưa thử trên log thật) |
| 8 | Đọc log token từ Antigravity (đa model: Gemini, Claude…) | [08-antigravity-usage.md](08-antigravity-usage.md) | xong |
| 9 | Tab Remotes: MR / PR trên GitLab, GitHub | [09-remotes.md](09-remotes.md) | 9a xong code (chưa thử token thật); 9b-9d chưa |

## Nguyên tắc xuyên suốt

- **Chỉ nghe 127.0.0.1**, kiểm tra header Host (chống DNS rebinding).
- **Đọc và ghi tách bạch**: `server/git.js` chỉ có lệnh đọc. Lệnh ghi nằm ở `server/git-actions.js` (giai đoạn 3-4), mỗi lệnh là một hàm có tên rõ, không nhận chuỗi lệnh tự do.
- **Không dùng shell**: luôn `execFile('git', [args])`, không nối chuỗi.
- **Whitelist đường dẫn**: mọi thao tác chỉ áp dụng cho repo nằm trong danh sách đã quét.
- **Thao tác phá hủy** (xóa nhánh, xóa repo) cần xác nhận hai bước trong UI (gõ lại tên) và có chế độ `dry-run` trả về điều sẽ xảy ra.
- **Ghi nhật ký** mọi thao tác ghi vào `data/audit.log` (thời gian, repo, lệnh, kết quả).

## Cấu trúc thư mục đích

```
server/        index.js (HTTP) · usage.js · git.js (đọc) · git-actions.js (ghi, giai đoạn 3+)
src/           main.tsx · App.tsx · api.ts · types.ts · styles.css
  pages/       TokenPage.tsx · GitPage.tsx
  components/  StackedChart · KpiCards · RepoTable · RepoDetail · ConfirmDialog (gđ 3)
  lib/         format.ts · usage.ts
plan/          các file kế hoạch này
data/          config.json · audit.log (không commit)
```
