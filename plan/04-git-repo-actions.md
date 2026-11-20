# 4. Thao tác repo

Mục tiêu: tạo, clone, xóa, đồng bộ repo.

- [ ] Tạo repo mới: chọn thư mục cha (nằm trong thư mục gốc đã cấu hình) + tên, chạy `git init`, tùy chọn tạo README và `.gitignore`
- [ ] Clone từ URL vào thư mục cha, hiện tiến trình, hủy được; chỉ nhận URL `https://`, `ssh`, `git@`
- [ ] Fetch một repo / tất cả repo
- [ ] Pull `--ff-only`, từ chối nếu dirty hoặc không fast-forward
- [ ] Xóa repo khỏi máy: dry-run liệt kê thay đổi chưa commit, nhánh chưa push, stash; xác nhận bằng gõ tên repo; chuyển vào Thùng rác thay vì xóa hẳn nếu làm được
- [ ] Từ chối xóa khi đường dẫn không nằm trong thư mục gốc đã cấu hình hoặc là chính thư mục gốc
- [ ] Mở thư mục trong VS Code / Explorer (tùy chọn)

Xong khi: vòng đời đủ: tạo → có trong danh sách → thêm nhánh → xóa nhánh → xóa repo, đều ghi audit.

Rủi ro lớn nhất: xóa nhầm. Biện pháp: whitelist đường dẫn, dry-run bắt buộc trước khi xóa, xác nhận gõ tên, ghi audit.
