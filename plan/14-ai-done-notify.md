# 14. Thông báo khi AI chạy xong một câu hỏi

*(người dùng yêu cầu 2026-11-28)*

## Mục tiêu
Khi một phiên AI (Claude, Codex, Gemini, Antigravity) trả lời xong một câu hỏi, DevDeck bắn thông báo hệ thống "<nguồn> xong · <repo/phiên> · <thời gian chạy>". Bấm vào thông báo thì mở cửa sổ ở trang AI.

## Quyết định đã chốt
- Cả 4 nguồn dùng **phát hiện qua log**: có tin nhắn assistant mới, rồi log ngừng đổi N giây (debounce) thì coi là xong.
- Riêng Claude có **tuỳ chọn hook `Stop`** để báo chính xác, không đoán.
- Dùng kênh sẵn có `devdeck:notify` (`electron/main.cjs`): chỉ báo khi cửa sổ không được focus; giao diện quyết định bật/tắt.
- **Đặt ở tab AI** (`src/pages/TokenPage.tsx`): thông báo thuộc về dữ liệu phiên AI, và log đã có sẵn `projectPath` của từng phiên nên không cần dựng trang Cài đặt riêng. Thêm nút chuông ở đầu trang AI mở panel "Thông báo". Trang Git chỉ thêm chuông nhỏ trên từng repo (nhảy tới cùng cấu hình) nếu còn thời gian.
- **Bật/tắt theo repo / thư mục** *(người dùng yêu cầu 2026-11-28)*: mặc định **bật tất cả**. Quy tắc lưu dạng danh sách `{path, enabled}`; đường dẫn khớp theo tiền tố thư mục, quy tắc **dài nhất thắng** (tắt cả `~/work` nhưng bật riêng `~/work/app`). Phiên không có `projectPath` đi theo công tắc chung. Lưu ở `data/ai-notify.json` (server), không dùng localStorage vì server cần lọc cả sự kiện hook.
- Công tắc chung bật/tắt (mặc định **bật** theo yêu cầu bật tất cả; cần bấm "Cài hook" riêng cho Claude); thêm ngưỡng "chỉ báo nếu chạy lâu hơn N giây" (mặc định 30s, tránh spam câu trả lời ngắn).

## Việc cần làm

### Server
- [x] `server/usage/done.js`: theo dõi mtime file log từng nguồn (tái dùng đường dẫn trong adapter), phát hiện "tin nhắn assistant mới + ngừng đổi N giây" → sự kiện `{id, source, session, project, startedAt, finishedAt}`
- [x] Phân biệt "dừng chờ tool / chờ duyệt" với "xong" cho từng nguồn (xem Rủi ro); fixture + test cho từng adapter
- [x] Hàng đợi sự kiện trong bộ nhớ (giới hạn ~50, có `id` tăng dần) + `GET /api/ai/done?since=<id>` (chỉ đọc)
- [x] Hook Claude: `POST /api/ai/hook/stop` nhận payload hook Stop (`session_id`, `cwd`, `transcript_path`); kiểm tra Host + token ngẫu nhiên lưu trong `data/`; `transcript_path` phải nằm dưới thư mục log Claude; bỏ trùng với sự kiện từ log cùng phiên
- [x] Nút "Cài hook Stop": ghi một entry vào `~/.claude/settings.json` (đọc trước, giữ nguyên phần khác, xác nhận 2 bước, ghi `data/audit.log`) + nút gỡ; không tự sửa khi chưa bấm

### Giao diện
- [x] Tab AI › panel "Thông báo": công tắc chung, ngưỡng giây, chọn nguồn nào được báo, trạng thái hook Claude (đã cài / chưa)
- [x] Danh sách repo / thư mục đã thấy trong log AI (gộp theo `projectPath`), mỗi dòng có công tắc; thêm quy tắc cho thư mục cha; hiển thị rõ dòng nào đang thừa hưởng từ thư mục cha
- [x] Server: `GET/PUT /api/ai/notify` (validate: đường dẫn tuyệt đối, tối đa ~200 quy tắc, ghi `data/audit.log`); bộ lọc theo quy tắc áp ở server trước khi đưa sự kiện vào hàng đợi
- [x] Poll `/api/ai/done` (4 giây/lần; server đã lọc theo công tắc, nguồn, thư mục, ngưỡng), gọi `devdeck:notify` với target `ai:<id>`; xử lý `open:ai:...` → chuyển sang trang AI
- [x] Ghi chú phát hành (gộp vào mục 2.8.0 trong `src/releaseNotes.ts`)
- [ ] Kiểm bằng mắt panel Thông báo trong app; thử trên log thật của Codex / Gemini / Antigravity (isDone mới dựa trên fixture + suy đoán định dạng)
- [x] Lệnh "Thông báo AI" trong CommandPalette (mở trang AI và bật panel Thông báo)

## Tiêu chí xong
- Chạy một câu hỏi dài > ngưỡng trên từng nguồn → đúng 1 thông báo khi xong, không báo giữa chừng khi AI đang gọi tool
- Cửa sổ đang focus → không báo; tắt công tắc chung hoặc tắt repo / thư mục chứa phiên → không báo; mặc định mới cài thì mọi repo đều báo
- Cài hook Claude → báo ngay khi Stop, không báo trùng với phát hiện qua log
- Gỡ hook trả `~/.claude/settings.json` về như cũ

## Rủi ro
- Log Codex / Gemini / Antigravity chưa kiểm trên log thật (gđ 7); không có dấu hiệu "xong" rõ → debounce có thể báo sớm hoặc trễ; cần ngưỡng debounce sửa được
- Sửa `~/.claude/settings.json` là ghi ra ngoài dự án: phải backup + giữ nguyên hook người dùng đã có
- Endpoint hook nhận dữ liệu từ ngoài: chỉ 127.0.0.1, có token, không tin `transcript_path` nếu nằm ngoài thư mục log
- Đường dẫn khác hoa/thường, dấu `\\` vs `/` giữa Windows và macOS: chuẩn hoá trước khi so tiền tố (không khớp nhầm `/a/app` với `/a/app2`)
- Phiên chạy nền / subagent có thể sinh nhiều sự kiện: gộp theo `session`

## Ghi chú kỹ thuật (đã làm)
- Phát hiện chạy ở server mỗi 3 giây (`done.js`), không cần UI mở trang AI. Lần chạy đầu chỉ ghi mtime, không báo việc cũ. Chỉ stat các file đổi trong 15 phút gần đây mỗi nhịp, liệt kê lại toàn bộ mỗi 15 giây.
- `isDone` của từng adapter trả về dòng cuối làm chữ ký: Claude còn ghi thêm dòng `system` sau lời đáp, nếu chỉ so "log vừa đổi" thì báo lặp.
- Thư mục Claude đã cài hook thì log của nó không bị đoán nữa (tránh báo hai lần).
- Cổng trong lệnh hook là cổng server lúc cài; app đổi cổng (dự phòng `start(0)`) thì panel báo "lệch cổng, cần cài lại".
- `server/git-test.js` ca `worktreeAdd` đang đỏ trên máy này, không liên quan giai đoạn 14 (đã có trước khi làm).
