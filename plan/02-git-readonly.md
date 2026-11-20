# 2. Trang Git chỉ-đọc

Mục tiêu: thấy mọi repo trên máy, nhánh của từng repo, nhánh đang mở, trạng thái thay đổi.

Server
- [x] Quét repo trong các thư mục gốc (mặc định `~/Desktop`, độ sâu 4, bỏ `node_modules`...)
- [x] Cấu hình thư mục gốc + độ sâu: `GET/PUT /api/git/config`, lưu `data/config.json`
- [x] `GET /api/git/repos`: mỗi repo có nhánh hiện tại, upstream, ahead/behind, số staged/modified/untracked/conflict, danh sách nhánh local, commit cuối
- [x] `GET /api/git/repo?path=`: chi tiết nhánh (local + remote), file thay đổi, 20 commit gần nhất, remote, số stash
- [x] Chỉ chạy lệnh đọc, `GIT_OPTIONAL_LOCKS=0` để không khóa repo

Giao diện
- [x] Bảng repo: tên + đường dẫn, nhánh (HEAD detached được đánh dấu), chip trạng thái, ↑↓, số nhánh, commit cuối
- [x] Tìm kiếm, lọc (tất cả / có thay đổi / lệch remote / sạch), sắp xếp
- [x] Bấm dòng để mở chi tiết: tab Nhánh, Thay đổi, Commit, Remote
- [x] Nút Quét lại, tự làm mới mỗi 30 giây (tắt được)
- [x] Hộp cài đặt thư mục gốc

Xong khi: đối chiếu 3 repo bất kỳ với `git status` / `git branch -a` trong terminal thấy khớp.

Rủi ro: repo lớn chạy `status` chậm (timeout 20s, hiện lỗi từng repo, không làm hỏng cả danh sách); lỗi `safe.directory` với repo của user khác.
