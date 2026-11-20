# 6. Đổi giao diện và chuyển thành desktop app

Thiết kế: [design/README.md](../design/README.md) · bộ màu: [design/tokens.css](../design/tokens.css).

Mục tiêu: DevDeck chạy như một app desktop (Windows trước, macOS sau), giao diện tối gọn kiểu app công cụ,
số liệu dễ đọc, thao tác Git nhanh bằng chuột và bàn phím. Server Node hiện có giữ nguyên vai trò backend.

## 6a. Giao diện mới trên bản web hiện tại

Làm trước, chạy được ngay trong trình duyệt, chưa cần vỏ desktop.

- [ ] Thay `:root` trong `src/styles.css` bằng `design/tokens.css`; bỏ chế độ sáng tạm thời (ghi vào backlog)
- [ ] Nạp Inter và JetBrains Mono cục bộ (đóng gói font, không gọi Google Fonts)
- [ ] Khung app: `TitleBar` · `Sidebar` (nav + phím tắt) · `StatusBar`; nội dung cố định, từng vùng tự cuộn
- [ ] Component dùng chung: `Kpi`/`KpiStrip`, `Chip` trạng thái, `SegmentedControl`, `ShareBar`, `Kbd`, `Toast`, `ContextMenu`
- [ ] Trang Tổng quan: không tự quét, không hiện số liệu Claude; lưu kết quả quét lần trước để hiện ngay khi mở app; 5 ô tình trạng repo, repo ghim kèm thao tác nhanh, việc cần xử lý (có nút hành động), hoạt động gần đây, thư mục làm việc
- [ ] Trang Claude: nút phân đoạn khoảng thời gian, 5 chỉ số, biểu đồ 4 series + tooltip, bảng có cột tổng kèm thanh tỉ lệ; danh sách dự án ở menu trái để lọc
- [ ] Trang Git dạng 3 cột:
  - [ ] Thư mục quét + độ sâu + "Quét lại" chuyển vào menu trái, bấm thư mục để lọc
  - [ ] Danh sách repo 2 hàng mỗi dòng, bộ lọc phân đoạn có số đếm, menu "⋯"
  - [ ] Khung chi tiết cố định bên phải, kéo đổi độ rộng (lưu vào `persist`), bỏ `Modal` cũ
  - [ ] Tab Thay đổi: ô tick stage/bỏ stage từng tệp, số dòng +/−, ô commit cố định ở cuối
- [ ] Bảng lệnh Ctrl+K: chuyển trang, mở repo, Quét lại, Fetch tất cả
- [ ] Phím tắt: Ctrl+1/2/3, Ctrl+R, Ctrl+K, ↑↓ chọn repo, Ctrl+Enter commit, Esc đóng
- [ ] Toast cho kết quả Fetch/Pull/Push/Commit thay cho khối `notice`

API cần thêm cho design:
- [ ] `numstat` cho tệp thay đổi (số dòng +/−): `git diff --numstat` và `--cached`
- [ ] Nhật ký hoạt động gần đây: đọc từ `data/audit.log`
- [ ] So sánh token với hôm qua (tính ở client từ `/api/usage`)

## 6b. Vỏ desktop

- [ ] Chọn vỏ: Electron (dễ chạy server Node sẵn có) hay Tauri (nhẹ hơn, server chạy dạng sidecar). Ghi lý do chọn vào file này
- [ ] Cửa sổ không viền với thanh tiêu đề riêng, vùng kéo cửa sổ, nút thu nhỏ/phóng to/đóng; macOS dùng nút tròn hệ thống
- [ ] Kích thước tối thiểu 1100×700, nhớ vị trí và kích thước cửa sổ
- [ ] Khởi động server nội bộ khi mở app, chọn cổng trống, tắt cùng app
- [ ] Thao tác hệ thống qua IPC, không qua HTTP: mở VS Code, mở Terminal, hiện trong Explorer/Finder, sao chép đường dẫn, chọn thư mục bằng hộp thoại hệ thống (thay `FolderPicker`)
- [ ] Biểu tượng khay hệ thống: số repo cần chú ý, "Quét lại", "Mở DevDeck"
- [ ] Thông báo hệ thống khi Push/Pull lỗi hoặc có repo mới bị lệch remote (tùy chọn, tắt được)
- [ ] Đóng gói: bản cài Windows (`.exe`/`.msi`), sau đó macOS (`.dmg`); tự cập nhật để sau

## Tiêu chí xong

- Ba trang khớp design ở 1280×800 và không vỡ ở 1100×700.
- Mọi thao tác trong design làm được bằng bàn phím; focus luôn nhìn thấy.
- Chữ phụ đạt tương phản ≥ 4.5:1 trên nền khối.
- App desktop mở lên dùng được ngay, không cần chạy `npm start` riêng.

## Rủi ro

- **Bảo mật khi có IPC**: lệnh mở VS Code/Terminal chỉ nhận đường dẫn trong danh sách repo đã quét, giữ nguyên quy tắc whitelist và `execFile` không qua shell.
- **Cổng cục bộ**: vẫn chỉ nghe `127.0.0.1` và kiểm tra Host; với Electron cân nhắc thêm token phiên giữa app và server.
- **Hiệu năng danh sách**: nếu hơn 200 repo, cần ảo hóa danh sách (đã có trong giai đoạn 5).
- **Font**: đóng gói font để chạy offline; kiểm tra hiển thị tiếng Việt có dấu.
