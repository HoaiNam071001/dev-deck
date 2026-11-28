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

- [x] Thêm account Jira (base URL + email + API token / PAT), kiểm bằng `/myself` — xong (trang riêng Jira ở sidebar, `Ctrl/Cmd+6`, `src/pages/JiraPage.tsx`; tách khỏi Remotes theo yêu cầu 2026-11-28)
- [~] Nhận mã ticket từ tên nhánh, tiêu đề và mô tả MR / PR: regex `[A-Z][A-Z0-9]+-\d+`, chỉ giữ project key có thật (lấy danh sách key từ `/project` một lần, cache) — server xong (`/api/jira/extract`), đã gắn chip
- [x] Lấy nhiều ticket trong một lần gọi: JQL `key in (...)`, chỉ lấy `summary, status, assignee, priority, issuetype, sprint` (`/api/jira/issues`)
- [x] Chip ticket — đầu chi tiết repo, tab Nhánh, danh sách MR, chi tiết MR (gom một lần gọi, cache 60 giây); danh sách repo hiện chip gọn chỉ có mã (màu theo nhóm trạng thái: To Do / In Progress / Done) ở: danh sách repo (nhánh hiện tại), tab Nhánh, danh sách MR, chi tiết MR
- [x] Panel chi tiết: tiêu đề, trạng thái, người nhận, ưu tiên, sprint, link mở Jira (chỉ `http(s)`), mô tả hiển thị chữ thuần
- [~] "Việc của tôi" (đã có ở trang Jira; "Làm tiếp" nối nhánh / MR trong panel ticket): JQL `assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC` — trang Jira riêng, kèm nhánh local / MR đã nối với từng ticket
- [x] Test `server/jira/test.js`: regex, ADF, chuẩn hóa, giấu token, fetch giả Cloud (v3 Basic) + Data Center (v2 Bearer)

## Giai đoạn 13b — Từ ticket sang nhánh

- [x] Nút "Tạo nhánh" trên ticket (mẫu cố định `feature|fix/KEY-slug`, sửa tay được khi tạo; chưa có mẫu trong cài đặt): chọn repo (gợi ý repo đã có nhánh cùng project key), tên mặc định `<loại>/<KEY>-<tóm-tắt-không-dấu>` (mẫu sửa được trong cài đặt), dùng lại hành động tạo nhánh hiện có (qua `check-ref-format`)
- [x] Tạo MR / PR từ tab Branches tự điền tiêu đề `KEY: summary` và link ticket vào mô tả

## Giai đoạn 13c — Ghi (bật riêng từng account)

- [x] Chuyển trạng thái (gợi ý "In Review" khi có MR đang mở, "Done" khi MR đã merge, so theo từ khóa tên trạng thái đích; chỉ MR của tôi): lấy `/issue/{key}/transitions`, chọn một bước; gợi ý "chuyển sang In Review" khi tạo MR, "Done" khi MR merge (chỉ gợi ý, người dùng bấm mới làm)
- [x] Comment lên ticket (soạn rồi Gửi, giống trả lời thread ở 9d)
- [~] Ghi worklog (xong thời gian `1h30m`; chưa gợi ý từ commit / phiên AI): thời gian + ghi chú; (tùy chọn) gợi ý thời gian từ khoảng commit / phiên AI trên nhánh đó ([11](11-token-by-branch.md))
- [x] Mọi thao tác ghi vào `data/audit.log` (không ghi nội dung comment, chỉ độ dài); xác nhận hai bước khi bật ghi

## Giai đoạn 13d — Theo dõi thay đổi ticket (chỉ đọc, làm ngay sau 13a) *(người dùng yêu cầu 2026-11-27)*

Mục tiêu: thấy ticket của mình, ghim thêm ticket cần để mắt, và biết khi chúng đổi để làm tiếp, không cần mở Jira.

- [x] Phạm vi theo dõi = ticket "Việc của tôi" (13a, chưa Done) + ticket đã ghim. Ghim lưu cục bộ (`jira.pinned` trong cấu hình, không ghi gì lên Jira); nút ghim trên chip / panel, ô nhập mã để ghim ticket của người khác
- [x] (làm khác: so sánh ảnh chụp trạng thái / người nhận / ưu tiên / sprint / comment cuối ở `server/jira/watch.js`, không gọi changelog; mốc lưu ở `data/jira-watch.json`, không phải cấu hình) Server: một lần gọi JQL `key in (...)` lấy `status, assignee, priority, sprint, summary, updated, comment` (giới hạn 50 key, dùng chung cache 60 giây của 13a); với ticket có `updated` mới hơn mốc đã xem mới gọi `/issue/{key}?fields=comment&expand=changelog` để biết cái gì đổi
- [x] Sự kiện báo: **trạng thái đổi**, **comment mới** (tên người viết + vài dòng đầu, bỏ comment của chính mình), **đổi người nhận / ưu tiên / sprint**. Không báo sửa mô tả / tiêu đề (đã loại khỏi phạm vi)
- [x] Mốc "đã xem" theo từng ticket (`jira.seen[key] = {updated, commentId}`), lưu cục bộ; mở panel ticket hoặc bấm "đánh dấu đã xem" thì cập nhật mốc
- [x] Poll 2 phút khi app đang mở và hiện (`src/lib/jiraWatch.ts`, cùng kiểu `remoteWatch.ts`) (công tắc thông báo, toast + thông báo hệ thống, gộp nhiều thay đổi một lần); lần đầu ghim chỉ lấy mốc, không báo dồn
- [x] Hộp tin "Có gì mới": mỗi ticket một khối, các dòng thay đổi kể từ lần xem cuối (vd `In Progress → In Review`, `Anh B: "đã sửa xong, xem lại"`); badge số ticket chưa xem trên sidebar (giống badge thread ở 9)
- [x] "Làm tiếp" (panel ticket: nhánh local từ `/api/jira/links`, MR / PR của tôi / cần review có mã trong tiêu đề hoặc nhánh): từ ticket mở nhánh local đã nối (mã trong tên nhánh) hoặc MR / PR đã nối; chưa có nhánh thì nút "Tạo nhánh" (13b)
- [x] Test: so sánh trước / sau ra đúng sự kiện, bỏ comment của mình, lần đầu không báo dồn, ADF → chữ thuần cho comment Cloud

## Giai đoạn 13e — Theo dõi việc của người khác *(người dùng yêu cầu 2026-11-28)*

- [x] Theo dõi theo người (tìm user trong Jira, lấy ticket giao cho họ chưa Done) hoặc theo JQL tự viết; tối đa 10 nhóm, mỗi nhóm 30 ticket; lưu cục bộ ở `data/jira-watch.json`, người kia không biết
- [x] Ticket của nhóm theo dõi vào chung "Có gì mới" và dùng chung cơ chế báo thay đổi / thông báo; dòng ticket ghi "Theo dõi: tên"
- [ ] Phạm vi báo riêng từng nhóm (vd chỉ báo đổi trạng thái), hiện báo mọi sự kiện như ticket của tôi
- [ ] Kiểm bằng mắt, thử trên Jira thật (tìm user Cloud `/user/search?query=`, DC `?username=`)

## Tiêu chí xong

- Nhánh `feature/ABC-123-...` hiện chip ABC-123 đúng trạng thái trên Jira.
- Ticket đã ghim hoặc được giao cho tôi đổi trạng thái / có comment / đổi người nhận trong lúc app mở thì có thông báo, và hộp "Có gì mới" cho biết đổi gì, từ nhánh / MR nào để làm tiếp.
- Tạo được nhánh từ ticket và MR mang mã ticket.
- Chuyển trạng thái / worklog chỉ chạy được khi đã bật ghi cho account.

## Rủi ro

- **Rate limit Jira Cloud**: gom ticket bằng JQL `key in (...)`, cache 60 giây, giới hạn 50 key mỗi lần gọi.
- **Regex bắt nhầm** (`UTF-8`, `ISO-8601`) → chỉ nhận project key có thật.
- **Workflow mỗi project khác nhau**: không cứng tên trạng thái, luôn lấy transitions từ API.
- **Poll nhiều ticket tốn quota** (13d): chỉ gọi changelog / comment cho ticket có `updated` đổi; dừng poll khi app ẩn.
- **Cloud và Data Center khác API** (v3 dùng ADF cho mô tả / comment, v2 dùng chữ thuần) → chuyển ADF sang chữ thuần khi hiển thị, gửi comment đúng định dạng từng bản.
