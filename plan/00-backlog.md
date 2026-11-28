# 0. Backlog (thêm việc bất cứ lúc nào)

Cách dùng: thêm một dòng `- [ ] ...` vào mục "Chưa phân loại". Khi bắt đầu một giai đoạn, chuyển các dòng liên quan vào file giai đoạn đó. Xong thì đổi thành `[x]`.

## Nợ từ giai đoạn trước
- [ ] Test UI trên trình duyệt: trang Token (số liệu khớp bản cũ)
- [ ] Test UI trên trình duyệt: trang Git (đối chiếu 3 repo với `git status` / `git branch -a`)

## Chưa phân loại
- [ ] 

## Đã làm thêm
- [x] Trang Git: 3 chế độ xem repo (phẳng / cây thư mục / lưới), nhớ lựa chọn trong localStorage (chưa test trên trình duyệt)
- [x] Jobs trên macOS / Linux: đọc tiến trình bằng ps + lsof (`server/jobs/procs-unix.js`); đã thử quét thật, chưa thử nút dừng job
- [ ] Jobs trên macOS: bước tự đặt NODE_OPTIONS cho reporter vitest (hiện chỉ Windows; cần quyết định có ghi vào ~/.zshrc không)
- [x] Sửa: panel Project của Remotes thiếu repo – danh sách chỉ dựng từ MR; nay lấy thêm danh sách repo của account (chưa kiểm bằng mắt với token thật)
