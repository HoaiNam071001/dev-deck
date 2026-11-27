# 5. Hoàn thiện

- [x] Test đơn vị cho `parseStatus`, kiểm tra tên nhánh, bucket thời gian (vitest) — vitest `src/lib/lib.test.ts` (relTime, rootOf, nameFromUrl…) + `server/git-test.js` (parseStatus, tên); chạy `npm test`, `npm run test:server`
- [x] Test tích hợp tạo repo tạm, chạy các hành động, kiểm tra kết quả — `server/git-test.js`: repo tạm, remote bare cục bộ, clone lỗi / hủy, xóa vào Thùng rác, audit
- [x] Trạng thái tải / rỗng / lỗi nhất quán cho mọi trang — `Spinner`, `.empty`, `ErrorBanner` (có nút "Thử lại") dùng chung ở Token, Git, Tổng quan, Job, Remotes
- [x] Bàn phím và a11y: focus, nhãn, tương phản — `:focus-visible` toàn cục, nút icon có `aria-label`, biểu đồ có nhãn tóm tắt; `--fg-mute` / `--danger` chỉnh để ≥ 4.5:1 trên mọi nền khối (đã tính bằng công thức WCAG). Chế độ sáng đã bỏ ở 6a nên chỉ còn tối
- [x] Hiệu năng: `/api/usage` cache 5 giây ở server (file chỉ đọc lại khi đổi mtime) và cache có TTL ở client (`useLoad`); quét repo bất đồng bộ (`pool` 8 luồng); danh sách repo > 200 dòng được ảo hóa (`RepoList`, hàng cao cố định 56px)
- [x] Biểu đồ token: so sánh theo dự án (chia biểu đồ "So sánh dự án"), xuất CSV (theo thời gian + cột dự án; tab Chi tiết xuất bảng nhóm) — `src/lib/csv.ts`, có test
- [x] README cập nhật; script `npm run dev` / `build` / `start` đã ghi — thêm API, an toàn, cách chạy test
- [x] Đóng gói chạy nền (tùy chọn): `scripts/autostart.ps1` (Task Scheduler, `npm run service:install|status|uninstall`) và hướng dẫn `pm2` trong README — chưa chạy thử đăng ký task thật
