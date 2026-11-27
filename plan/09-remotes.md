# 09 — Tab Remotes: MR / PR trên GitLab, GitHub

Mục tiêu: một tab chung để xem Merge Request / Pull Request của mình và người khác, trạng thái CI, approve, thread review; mở rộng được sang provider khác mà không đổi giao diện.

Bản thiết kế UI (5 màn hình) đã duyệt: canvas "DevDeck Remotes UI" (Danh sách MR, Chi tiết + thread, Branches, Pipelines, Accounts).

## Kiến trúc

```
server/remotes/
  index.js    gom nhiều account, chuẩn hóa về ChangeRequest, lọc scope/state, lỗi một account không làm hỏng account khác
  gitlab.js   REST v4: /merge_requests, /approvals, /discussions, pipeline jobs
  github.js   GraphQL: search PR, reviewThreads, statusCheckRollup (REST không có trạng thái resolved)
  store.js    data/remotes.json; token mã hóa bằng safeStorage (Electron), chạy server riêng thì chỉ base64
  http.js     fetch có timeout, giới hạn song song, cache 60 giây, kiểm tra base URL
src/pages/RemotesPage.tsx           danh sách, KPI, lọc, panel trái chọn account
src/components/RemoteDetail.tsx     modal chi tiết: thread, CI, reviewer, mô tả
src/components/RemoteAccountModal.tsx  thêm account bằng PAT
src/components/RemoteBits.tsx       chip CI / approve / thread dùng chung
```

Thêm provider mới = thêm một file cùng 3 hàm `whoami`, `list`, `detail` + `parseKey`, đăng ký trong `PROVIDERS` ở `server/remotes/index.js`.

## Nguyên tắc an toàn (bổ sung cho README)

- Token **không bao giờ** gửi xuống giao diện (chỉ trả 4 ký tự cuối); chỉ gọi tới chính base URL của account.
- Giai đoạn này **chỉ đọc**: scope `read_api` (GitLab) hoặc quyền đọc PR (GitHub).
- Khóa MR/PR từ giao diện được kiểm tra chặt (`parseKey`) trước khi ghép vào URL.
- Nội dung comment/mô tả hiển thị dạng chữ thuần, không render markdown/HTML.
- Link mở ra chỉ nhận `http(s)`.

## Giai đoạn 9a — Chỉ đọc (xong code, chưa thử với token thật)

- [x] Account GitLab (kể cả tự host) và GitHub (kể cả Enterprise) bằng PAT, kiểm tra token khi thêm, xóa account
- [x] Danh sách MR/PR: Của tôi / Cần tôi review / Gán cho tôi; Open / Merged / Closed; tìm theo chữ
- [x] Chip: CI, approve (có/cần), thread resolved/tổng, conflict, draft
- [x] Chi tiết: thread review (lọc chưa/đã resolve, file:dòng, comment), reviewer, danh sách stage/check, mô tả
- [x] Tự làm mới 60 giây; phím tắt Ctrl+5; lệnh trong Command Palette
- [x] Kiểm thử server bằng mock GitLab + GitHub (chuẩn hóa dữ liệu, chặn khóa lạ, giấu token)
- [ ] **Thử với token thật** (GitLab công ty + GitHub) và chỉnh các trường còn lệch (detailed_merge_status, approvals bản Free)
- [ ] Test UI trên màn hình thật: bố cục danh sách và modal ở cửa sổ hẹp

## Giai đoạn 9b — Branches và Pipelines

- [x] Tab Branches theo project trên remote (`RemoteBranches.tsx`, `/api/remotes/branches`): nhánh từ API GitLab/GitHub, commit cuối, mặc định/bảo vệ, MR/PR theo nhánh, cột "có ở local" (ghép clone qua URL remote), gợi ý nhánh đã merge để dọn (chỉ chép lệnh `git push origin --delete`, không tự xóa); chưa thử token thật
- [ ] Tab Pipelines: danh sách pipeline, stage (đã có: job lỗi + 40 dòng log cuối trong chi tiết MR GitLab, `failedJobs`; GitHub chưa có log; chưa có tab riêng)
- [x] Liên kết MR ↔ repo local qua URL remote (`server/remotes/match.js`); hiện MR của branch hiện tại trong chi tiết repo (`RepoMr.tsx`; chưa thử token thật)
- [ ] Đối chiếu test chạy local (tab Job) với CI cùng branch

## Giai đoạn 9c — Thông báo

- [ ] Thông báo hệ thống khi MR của tôi có thread/comment mới, pipeline lỗi, hoặc được gán review (dùng `systemNotify`)
- [ ] Nhớ trạng thái đã xem trong `data/` để không báo lặp

## Giai đoạn 9d — Thao tác ghi (cần bật riêng trong cài đặt)

- [ ] Resolve thread, trả lời, approve, retry pipeline, tạo MR; cần scope `api` / quyền ghi
- [ ] Xác nhận hai bước cho thao tác khó hoàn tác; ghi `data/audit.log` như thao tác git
- [ ] Bitbucket / Gitea nếu cần

## Rủi ro

- Rate limit: GitLab mỗi MR tốn 3 request (MR, approvals, discussions); đã giới hạn 40 MR, song song 6, cache 60 giây. GitHub dùng 1 truy vấn GraphQL cho cả danh sách.
- GitLab bản Free không có API approvals → ẩn chip approve.
- Thread GitHub chỉ lấy 100 thread / 50 comment mỗi thread đầu tiên.
- Token base64 khi chạy `npm start` ngoài app desktop không phải mã hóa thật; app đóng gói dùng safeStorage.
