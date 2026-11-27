# 13 — Tích hợp Jira

Mục tiêu: nối nhánh git và MR / PR với ticket Jira, để thấy trạng thái ticket ngay chỗ đang làm, tạo nhánh từ ticket, và cập nhật ticket khi MR merge mà không phải mở Jira.

## Kiến trúc

```
server/jira/
  index.js   account, gom lỗi, cache 60 giây
  client.js  REST: Cloud dùng /rest/api/3 (email + API token, Basic); Server / Data Center dùng /rest/api/2 (PAT, Bearer)
src/components/JiraChip.tsx      chip mã ticket + trạng thái, dùng chung
src/components/JiraPanel.tsx     chi tiết ticket trong RepoDetail / RemoteDetail
```

Lưu account giống Remotes (`server/remotes/store.js`): token mã hóa bằng safeStorage, không bao giờ gửi xuống giao diện, chỉ gọi tới chính base URL của account; ghi tắt mặc định, bật riêng từng account.

## Giai đoạn 13a — Chỉ đọc

- [ ] Thêm account Jira (base URL + email + API token / PAT), kiểm bằng `/myself`; thêm mục Jira vào modal Accounts
- [ ] Nhận mã ticket từ tên nhánh, tiêu đề và mô tả MR / PR: regex `[A-Z][A-Z0-9]+-\d+`, chỉ giữ project key có thật (lấy danh sách key từ `/project` một lần, cache)
- [ ] Lấy nhiều ticket trong một lần gọi: JQL `key in (...)`, chỉ lấy `summary, status, assignee, priority, issuetype, sprint`
- [ ] Chip ticket (màu theo nhóm trạng thái: To Do / In Progress / Done) ở: danh sách repo (nhánh hiện tại), tab Nhánh, danh sách MR, chi tiết MR
- [ ] Panel chi tiết: tiêu đề, trạng thái, người nhận, ưu tiên, sprint, link mở Jira (chỉ `http(s)`), mô tả hiển thị chữ thuần
- [ ] "Việc của tôi": JQL `assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC` — mục mới ở Tổng quan hoặc sidebar Remotes, kèm nhánh local / MR đã nối với từng ticket
- [ ] Test bằng fetch giả (Cloud + Data Center): chuẩn hóa dữ liệu, giấu token, regex mã ticket

## Giai đoạn 13b — Từ ticket sang nhánh

- [ ] Nút "Tạo nhánh" trên ticket: chọn repo (gợi ý repo đã có nhánh cùng project key), tên mặc định `<loại>/<KEY>-<tóm-tắt-không-dấu>` (mẫu sửa được trong cài đặt), dùng lại hành động tạo nhánh hiện có (qua `check-ref-format`)
- [ ] Tạo MR / PR từ tab Branches tự điền tiêu đề `KEY: summary` và link ticket vào mô tả

## Giai đoạn 13c — Ghi (bật riêng từng account)

- [ ] Chuyển trạng thái: lấy `/issue/{key}/transitions`, chọn một bước; gợi ý "chuyển sang In Review" khi tạo MR, "Done" khi MR merge (chỉ gợi ý, người dùng bấm mới làm)
- [ ] Comment lên ticket (soạn rồi Gửi, giống trả lời thread ở 9d)
- [ ] Ghi worklog: thời gian + ghi chú; (tùy chọn) gợi ý thời gian từ khoảng commit / phiên AI trên nhánh đó ([11](11-token-by-branch.md))
- [ ] Mọi thao tác ghi vào `data/audit.log` (không ghi nội dung comment, chỉ độ dài); xác nhận hai bước khi bật ghi

## Tiêu chí xong

- Nhánh `feature/ABC-123-...` hiện chip ABC-123 đúng trạng thái trên Jira.
- Tạo được nhánh từ ticket và MR mang mã ticket.
- Chuyển trạng thái / worklog chỉ chạy được khi đã bật ghi cho account.

## Rủi ro

- **Rate limit Jira Cloud**: gom ticket bằng JQL `key in (...)`, cache 60 giây, giới hạn 50 key mỗi lần gọi.
- **Regex bắt nhầm** (`UTF-8`, `ISO-8601`) → chỉ nhận project key có thật.
- **Workflow mỗi project khác nhau**: không cứng tên trạng thái, luôn lấy transitions từ API.
- **Cloud và Data Center khác API** (v3 dùng ADF cho mô tả / comment, v2 dùng chữ thuần) → chuyển ADF sang chữ thuần khi hiển thị, gửi comment đúng định dạng từng bản.
