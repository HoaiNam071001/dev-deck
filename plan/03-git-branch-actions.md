# 3. Thao tác nhánh

Mục tiêu: quản lý nhánh từ giao diện. Đây là giai đoạn đầu tiên có lệnh ghi, nên làm hạ tầng an toàn trước.

Hạ tầng (làm trước)
- [ ] `server/git-actions.js` tách riêng, mỗi hành động là một hàm, kiểm tra tham số
- [ ] Kiểm tra tên nhánh bằng `git check-ref-format --branch`, chặn tên bắt đầu bằng `-`
- [ ] `POST /api/git/action` nhận `{ action, path, ...params, dryRun }`, chỉ nhận `application/json`
- [ ] `data/audit.log`: ghi mọi hành động ghi
- [ ] `ConfirmDialog`: hộp xác nhận, hành động phá hủy bắt gõ lại tên nhánh

Hành động (mỗi mục làm và thử riêng)
- [ ] Tạo nhánh (từ HEAD hoặc từ một nhánh/commit chọn trước)
- [ ] Checkout nhánh: từ chối nếu working tree có thay đổi, nói rõ lý do
- [ ] Xóa nhánh local: `git branch -d` (an toàn) trước; `-D` chỉ khi người dùng xác nhận nhánh chưa merge
- [ ] Không cho xóa nhánh đang mở và nhánh mặc định
- [ ] Xóa nhánh remote (`push --delete`): có cảnh báo riêng, mặc định tắt
- [ ] Đổi tên nhánh

Xong khi: dry-run hiển thị đúng điều sẽ làm; thử trên repo thử nghiệm, không động tới repo thật.

Rủi ro: xóa nhánh chưa merge mất commit (dùng `-d` mặc định, hiện SHA để khôi phục bằng reflog); checkout ghi đè thay đổi (chặn khi dirty).
