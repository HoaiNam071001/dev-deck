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
| [desktop/Jobs.html](desktop/Jobs.html) | Job (tiến trình đang chạy) | File độc lập, mở thẳng bằng trình duyệt. Thẻ job gọn với thanh tiến độ, chi tiết chia tab Tiến trình / Test, modal danh sách file |

Các file `.dc.html` là mã nguồn của canvas, cần runtime của canvas để hiển thị; mở trực tiếp bằng trình duyệt sẽ không chạy. Dùng chúng làm tham chiếu bố cục, khoảng cách và nội dung khi viết lại component React.

Mọi số liệu trong design là dữ liệu mẫu.

## Bộ màu

[tokens.css](tokens.css): tông tối, nền than chì, điểm nhấn xanh lá `#30CF43`. Quy ước màu số liệu:

- ↑ cần push: xanh dương `#5AA9F5`
- ↓ cần pull, tệp đã sửa: cam `#F2A65A`
- Xung đột, lỗi: đỏ `#F78C8C`
- Sạch, đã stage, nút chính: xanh lá `#30CF43`

## Nguyên tắc

- Cửa sổ cố định (thiết kế ở 1280×800, tối thiểu 1100×700); trang không cuộn, từng vùng tự cuộn.
- Thanh tiêu đề riêng (nút cửa sổ Windows bên phải, 3 nút tròn macOS bên trái) và thanh trạng thái 24px.
- Số liệu dùng font mono, căn phải trong bảng; nhãn phụ màu `--fg-mute`.
- Mọi thao tác hay dùng có phím tắt, hiện ngay cạnh nhãn (Ctrl / ⌘ theo hệ điều hành).

## Bản v2 (2026-11-28): mở thẳng bằng trình duyệt

Thư mục [desktop/v2/](desktop/v2/): 6 trang dùng chung một khung app ([shell.css](desktop/v2/shell.css) + [shell.js](desktop/v2/shell.js)). Bấm qua lại giữa các trang bằng thanh icon trái hoặc `⌘1…6`, `⌘K` mở bảng lệnh. Mọi số liệu là dữ liệu mẫu.

| File | Màn | Điểm chính |
|---|---|---|
| [v2/Home.html](desktop/v2/Home.html) | Tổng quan | Hàng chỉ số 5 trang; "Cần xử lý" gom việc từ mọi trang (lọc theo nguồn, đánh dấu xong); thẻ gọn: repo ghim, MR của tôi, AI hôm nay + hạn mức, job đang chạy, ticket của tôi, thao tác gần đây; thiết lập (thư mục, thông báo, phím tắt) thu gọn ở cuối |
| [v2/AI.html](desktop/v2/AI.html) | AI | Hạn mức 5 giờ / tuần, 5 chỉ số, biểu đồ cột chồng có tooltip (theo loại token / nhà cung cấp), tab Chi tiết (nhà cung cấp, model, dự án, nhánh, phiên), modal thông báo khi AI xong |
| [v2/Git.html](desktop/v2/Git.html) | Git | Lọc Tất cả / Thay đổi / Lệch / Sạch, repo ghim lên đầu, khung chi tiết: Fetch / Pull / Push, stage từng file + xem diff, commit; tab Nhánh, Commit, Stash, Worktree, Remote, Scripts |
| [v2/Jobs.html](desktop/v2/Jobs.html) | Job | Chỉ số, thẻ job theo repo (tiến độ test, cổng dev server, RAM), dừng có xác nhận, chi tiết tab Test / Tiến trình; tiến độ test tự chạy để xem hiệu ứng |
| [v2/Remotes.html](desktop/v2/Remotes.html) | Remotes | Account bật / tắt ghi, project ghim / chấm CI lỗi / thread; ô chỉ số bấm để lọc; tab MR / PR, Hàng đợi review (theo thời gian chờ), Branches, Pipelines; chi tiết: thread + resolve / trả lời, pipeline, thông tin |
| [v2/Jira.html](desktop/v2/Jira.html) | Jira | Xem Có gì mới / Việc của tôi / Đã ghim / Tất cả, nhóm theo dõi; tìm + dán link để ghim; chuông thông báo, toast khi ticket đổi; chi tiết tab Thay đổi / Chi tiết / Làm tiếp / Cập nhật |

Dùng chung cho mọi trang:

- Panel trái và khung chi tiết **kéo đổi độ rộng** được (tay kéo ở mép, nhấp đúp để về mặc định, phím ←/→ khi đang focus), độ rộng nhớ theo từng trang (`localStorage`, khóa `devdeck.w.*`).
- Khung chi tiết của Git, Jira, Job, Remotes **chuyển được panel bên phải ↔ cửa sổ nổi** bằng nút ở góc, nhớ lựa chọn (`devdeck.mode.*`). Mặc định: Git, Jira là panel; Job, Remotes là cửa sổ nổi.
- **Màu chính** tách khỏi xanh lá trạng thái: mặc định chàm `#8B93FF`; thanh ghi chú trên đầu mỗi trang có 4 ô màu để thử (chàm, ngọc, hổ phách, xanh lá cũ), nhớ lựa chọn (`devdeck.theme`).
- Trang AI có thêm chế độ biểu đồ đường **Theo repo** (plan: [07-ai-usage.md](../plan/07-ai-usage.md)); kế hoạch chuyển design sang code: [15-ui-v2.md](../plan/15-ui-v2.md).
