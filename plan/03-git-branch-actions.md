# 3. Thao tác nhánh

Mục tiêu: quản lý nhánh từ giao diện. Đây là giai đoạn đầu tiên có lệnh ghi, nên làm hạ tầng an toàn trước.

Hạ tầng (làm trước)
- [x] `server/git-actions.js` tách riêng, mỗi hành động là một hàm, kiểm tra tham số
- [x] Kiểm tra tên nhánh bằng `git check-ref-format --branch`, chặn tên bắt đầu bằng `-`
- [x] `POST /api/git/action` nhận `{ action, path, ...params, dryRun }`, chỉ nhận `application/json` — dryRun chỉ có cho xóa nhánh (local, remote); hành động khác từ chối dryRun
- [x] `data/audit.log`: ghi mọi hành động ghi — không ghi confirmName; dry-run không ghi
- [x] `ConfirmDialog`: hộp xác nhận, hành động phá hủy bắt gõ lại tên nhánh — `src/components/ConfirmDialog.tsx`, server kiểm lại `confirmName`

Hành động (mỗi mục làm và thử riêng)
- [x] Tạo nhánh (từ HEAD hoặc từ một nhánh/commit chọn trước) — chọn "từ HEAD / từ nhánh khác" trong tab Nhánh
- [x] Checkout nhánh: từ chối nếu working tree có thay đổi, nói rõ lý do — chặn khi có tệp đã theo dõi bị sửa / stage; tệp chưa theo dõi không chặn; nút Chuyển bị khóa kèm lý do
- [x] Xóa nhánh local: `git branch -d` (an toàn) trước; `-D` chỉ khi người dùng xác nhận nhánh chưa merge — dry-run hiện số commit chưa merge; chưa merge phải tick "vẫn xóa" mới dùng `-D`
- [x] Không cho xóa nhánh đang mở và nhánh mặc định — server chặn, menu không có mục xóa cho nhánh đang mở
- [x] Xóa nhánh remote (`push --delete`): có cảnh báo riêng, mặc định tắt — menu "⋯" của nhánh remote; cảnh báo riêng, gõ lại tên; không xóa nhánh mặc định
- [x] Đổi tên nhánh — chỉ đổi local, nhắc nhánh remote giữ tên cũ

Xong khi: dry-run hiển thị đúng điều sẽ làm; thử trên repo thử nghiệm, không động tới repo thật.

Rủi ro: xóa nhánh chưa merge mất commit (dùng `-d` mặc định, hiện SHA để khôi phục bằng reflog); checkout ghi đè thay đổi (chặn khi dirty).
