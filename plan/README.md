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
| 7 | Mục "AI" đa nhà cung cấp (Claude, Codex, Gemini) | [07-ai-usage.md](07-ai-usage.md) | xong (Codex đã thử trên log thật; Gemini chưa) |
| 8 | Đọc log token từ Antigravity (đa model: Gemini, Claude…) | [08-antigravity-usage.md](08-antigravity-usage.md) | xong |
| 9 | Tab Remotes: MR / PR trên GitLab, GitHub | [09-remotes.md](09-remotes.md) | 9a-9d xong code (chưa thử token thật); 9e đang làm: có hàng đợi review + thời gian chờ + độ lớn, còn phía tác giả, ngưỡng sửa được (chưa kiểm bằng mắt) |
| 10 | Git: stash, worktree, diff theo hunk, thao tác hàng loạt | [10-git-workflow.md](10-git-workflow.md) | một phần: 10a stash, 10b worktree, 10c diff + stage theo hunk xong (chưa kiểm bằng mắt); 10d hàng loạt (pull tất cả, dọn nhánh đã merge, phạm vi repo đã tick) xong code; chưa kiểm bằng mắt |
| 11 | Token AI theo nhánh git / theo MR | [11-token-by-branch.md](11-token-by-branch.md) | một phần: server + bảng theo nhánh / phiên (trang AI), cột token ở tab Nhánh, thẻ ở chi tiết repo và MR xong code; bộ lọc nhánh sidebar; chưa kiểm bằng mắt, chưa đối chiếu log thật |
| 12 | Chạy script npm ngay trong app | [12-npm-scripts.md](12-npm-scripts.md) | một phần: runner + tab Script (chạy, tham số, ghim, log màu / tìm / sao chép, cổng, dừng, thông báo, palette, tự dừng khi thoát); xong code (chưa kiểm bằng mắt; reporter vitest chưa thử trên repo thật; thoát app chưa hỏi, mặc định dừng) |
| 13 | Tích hợp Jira: chip ticket, tạo nhánh từ ticket, chuyển trạng thái, theo dõi thay đổi ticket | [13-jira.md](13-jira.md) | đang làm: 13a server + API xong (account, ticket hàng loạt, việc của tôi, nhận mã); UI: trang Jira riêng ở sidebar (account + việc của tôi + có gì mới), chip ở chi tiết repo / MR, panel ticket; chip cả tab Nhánh và danh sách MR; 13d: ghim, mốc đã xem, sự kiện, poll + thông báo, badge, hộp Có gì mới xong code "Làm tiếp" + 13b (tạo nhánh từ ticket, MR tự điền) xong code; 13c xong code (chuyển trạng thái, comment, ghi giờ; bật ghi riêng từng account, nhật ký audit); 13e theo dõi người / JQL xong code; gợi ý chuyển trạng thái theo MR xong; mẫu tên nhánh, gợi ý giờ, phạm vi báo riêng từng nhóm, dán link để ghim xong code; còn kiểm bằng mắt + thử Jira thật chưa kiểm bằng mắt, chưa thử Jira thật |
| 14 | Thông báo khi AI chạy xong một câu hỏi (4 nguồn qua log, Claude thêm hook Stop) | [14-ai-done-notify.md](14-ai-done-notify.md) | xong code (server + panel tab AI); chưa kiểm bằng mắt, chưa thử trên log thật của Codex / Gemini / Antigravity |
| 15 | Giao diện v2: làm lại 6 trang theo design mới, panel kéo đổi độ rộng, chi tiết dạng panel / cửa sổ nổi, màu chính mới | [15-ui-v2.md](15-ui-v2.md) | chưa (đã có design `design/desktop/v2/`) |

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
