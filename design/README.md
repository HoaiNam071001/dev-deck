# Design: DevDeck desktop

Bản thiết kế mới cho DevDeck, hướng tới chuyển thành desktop app. Kế hoạch làm: [plan/06-redesign-desktop.md](../plan/06-redesign-desktop.md).

Xem và bấm thử (canvas trên claude.ai, cần quyền truy cập): https://claude.ai/artifact/LadpGC9558GeJqDZyXni2z

## Các màn

| File | Màn | Ghi chú |
|---|---|---|
| [desktop/Main.dc.html](desktop/Main.dc.html) | Tổng quan | Trang khởi động nhẹ, không quét git: lối tắt sang Git/Claude, repo ghim (chỉ tên + mở VS Code/Terminal), thao tác gần đây, thư mục làm việc, phím tắt |
| [desktop/Claude.dc.html](desktop/Claude.dc.html) | Claude token | Chọn khoảng thời gian, 5 chỉ số, biểu đồ cột chồng 4 loại token, bảng theo model / dự án |
| [desktop/Git.dc.html](desktop/Git.dc.html) | Git, chia 3 cột (chọn) | Menu trái có thư mục quét, danh sách repo, khung chi tiết cố định bên phải, menu "⋯", thông báo sau Push |
| [desktop/Git-Modal.dc.html](desktop/Git-Modal.dc.html) | Git, chi tiết dạng modal | Phương án thay thế, để so sánh |

Các file `.dc.html` là mã nguồn của canvas, cần runtime của canvas để hiển thị; mở trực tiếp bằng trình duyệt sẽ không chạy. Dùng chúng làm tham chiếu bố cục, khoảng cách và nội dung khi viết lại component React.

Mọi số liệu trong design là dữ liệu mẫu.

## Bộ màu

[tokens.css](tokens.css): tông tối, nền than chì, điểm nhấn xanh lá `#30CF43`. Quy ước màu số liệu:

- ↑ cần push: xanh dương `#5AA9F5`
- ↓ cần pull, tệp đã sửa: cam `#F2A65A`
- Xung đột, lỗi: đỏ `#F26B6B`
- Sạch, đã stage, nút chính: xanh lá `#30CF43`

## Nguyên tắc

- Cửa sổ cố định (thiết kế ở 1280×800, tối thiểu 1100×700); trang không cuộn, từng vùng tự cuộn.
- Thanh tiêu đề riêng (nút cửa sổ Windows bên phải, 3 nút tròn macOS bên trái) và thanh trạng thái 24px.
- Số liệu dùng font mono, căn phải trong bảng; nhãn phụ màu `--fg-mute`.
- Mọi thao tác hay dùng có phím tắt, hiện ngay cạnh nhãn (Ctrl / ⌘ theo hệ điều hành).
