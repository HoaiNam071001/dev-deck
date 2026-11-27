# 4. Thao tác repo

Mục tiêu: tạo, clone, xóa, đồng bộ repo.

- [x] Tạo repo mới: chọn thư mục cha (nằm trong thư mục gốc đã cấu hình) + tên, chạy `git init`, tùy chọn tạo README và `.gitignore` — nút "+" ở thanh công cụ trang Git; tạo `main`, chưa commit
- [x] Clone từ URL vào thư mục cha, hiện tiến trình, hủy được; chỉ nhận URL `https://`, `ssh`, `git@` — nút tải xuống ở thanh công cụ; tiến độ theo %, hủy dọn bản dở; tắt giao thức ext/file; chưa thử clone thật qua mạng (test dùng URL lỗi)
- [x] Fetch một repo / tất cả repo — đã có từ trước
- [x] Pull `--ff-only`, từ chối nếu dirty hoặc không fast-forward — git tự từ chối khi không fast-forward hoặc thay đổi chồng lên; KHÔNG chặn thêm khi dirty (tránh chặn pull hợp lệ)
- [x] Xóa repo khỏi máy: dry-run liệt kê thay đổi chưa commit, nhánh chưa push, stash; xác nhận bằng gõ tên repo; chuyển vào Thùng rác thay vì xóa hẳn nếu làm được — menu "⋯" và nút thùng rác ở khung chi tiết; Thùng rác qua PowerShell / Finder / gio; không có Thùng rác thì từ chối, không xóa vĩnh viễn; chặn repo chứa repo con
- [x] Từ chối xóa khi đường dẫn không nằm trong thư mục gốc đã cấu hình hoặc là chính thư mục gốc
- [x] Mở thư mục trong VS Code / Explorer (tùy chọn) — đã có từ trước (bản desktop)

Xong khi: vòng đời đủ: tạo → có trong danh sách → thêm nhánh → xóa nhánh → xóa repo, đều ghi audit.

Rủi ro lớn nhất: xóa nhầm. Biện pháp: whitelist đường dẫn, dry-run bắt buộc trước khi xóa, xác nhận gõ tên, ghi audit.
