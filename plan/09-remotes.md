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
- Mặc định **chỉ đọc** (`read_api` / quyền đọc PR). Thao tác ghi tắt theo từng account, bật bằng nút ✎ (bấm hai lần), cần token có `api` / quyền ghi; server chặn mọi `act` khi account chưa bật.
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
- [x] Tab Pipelines (`RemotePipelines.tsx`, `/api/remotes/pipelines`, `/api/remotes/pipeline-jobs`): 30 pipeline (GitLab) / workflow run (GitHub Actions) gần nhất của project, lọc "chỉ lỗi", bấm một dòng để xem job theo stage, job lỗi GitLab kèm 40 dòng log cuối; GitHub chưa có log (mở link); dùng chung lựa chọn project với tab Branches; kiểm bằng fetch giả, chưa thử token thật
- [x] Phạm vi "Tất cả" ở tab MR / PR: MR / PR của cả người khác trong project / repo tôi là thành viên (GitLab: 15 project hoạt động gần nhất × 15 MR; GitHub: 15 repo pushed gần nhất, tối đa 40 PR); chưa thử token thật
- [x] Liên kết MR ↔ repo local qua URL remote (`server/remotes/match.js`); hiện MR của branch hiện tại trong chi tiết repo (`RepoMr.tsx`; chưa thử token thật)
- [x] Đối chiếu test chạy local (tab Job) với CI cùng branch: card "Chạy ở máy này" trong chi tiết MR / PR (job trên clone local, đúng nhánh nguồn, tiến độ test) kèm cảnh báo khi local và CI lệch nhau (`/api/remotes/local-jobs`)

## Giai đoạn 9c — Thông báo

- [x] Thông báo hệ thống + toast khi MR của tôi có thread/comment mới, pipeline lỗi, conflict, hoặc có MR mới cần tôi review (`src/lib/remoteWatch.ts`, poll 2 phút ở App, theo công tắc thông báo; chưa thử token thật)
- [x] Nhớ trạng thái đã xem trong localStorage (`remote.seen`) để không báo lặp; lần đầu chỉ ghi mốc, không báo; account lỗi thì bỏ qua lượt đó

## Giai đoạn 9d — Thao tác ghi (cần bật riêng trong cài đặt)

- [x] Resolve / mở lại thread, trả lời thread, approve, bỏ approve (chỉ GitLab), merge, chạy lại job lỗi của pipeline, tạo MR / PR từ nhánh chưa có (tab Branches); GitLab dùng scope `api`, GitHub dùng GraphQL mutation + REST rerun-failed-jobs; kiểm bằng fetch giả, chưa thử token thật
- [x] Xác nhận hai bước cho thao tác khó hoàn tác (bật ghi, merge, chạy lại pipeline; trả lời có bước soạn rồi Gửi); mọi thao tác kể cả lỗi ghi `data/audit.log` (không ghi nội dung comment, chỉ độ dài); server kiểm tham số (khóa, mã thread, tên nhánh, độ dài)
- [ ] Bỏ approve trên GitHub (dismiss review cần lý do và quyền riêng), Bitbucket / Gitea: chưa làm, làm khi có nhu cầu

## Giai đoạn 9e — Hàng đợi review

Mục tiêu: không để MR / PR người khác chờ mình quá lâu; biết nên review cái nào trước.

- [x] Chế độ xem "Hàng đợi review" (`RemoteQueue.tsx`, tab riêng ở trang Remotes): MR / PR mở của người khác mà tôi được yêu cầu review, chờ lâu nhất trước, draft xuống cuối (`lib/reviewQueue.ts`); chưa thử token thật
- [x] Thời gian chờ: GitHub lấy `ReviewRequestedEvent` gần nhất của tôi; GitLab chưa đọc system note nên dùng `created_at`, hiện dấu `*` và tooltip ghi rõ cách tính (đọc system note GitLab: làm sau)
- [x] Mức chờ có màu: <4 giờ xanh, 4–24 giờ vàng, >24 giờ đỏ (hằng số trong `reviewQueue.ts`). Còn lại: ngưỡng sửa được trong cài đặt, chỉ tính giờ làm việc
- [x] Cột độ lớn (GitHub: +/− dòng, số tệp; GitLab chỉ có số tệp) và chip CI / approve / thread. Còn lại: sắp xếp theo độ lớn / CI
- [x] Trạng thái riêng của tôi (`reviewState` trong `reviewQueue.ts`): "chưa xem" / "đang xem" (nút đánh dấu, lưu `remotes.reviewing`) / "chờ tác giả sửa" / "cần xem lại" khi commit mới hơn review cuối của tôi. Chỉ GitHub có mốc review + commit; GitLab chỉ có chưa xem / đang xem (chưa thử token thật)
- [ ] Nhắc: thông báo hệ thống một lần khi MR vượt ngưỡng vàng / đỏ (dùng `remoteWatch.ts`, nhớ đã báo trong `remote.seen`)
- [ ] Số MR đang chờ hiện ở Tổng quan, sidebar và biểu tượng khay
- [ ] Phía tác giả: "MR của tôi đang chờ ai" — reviewer chưa phản hồi và đã chờ bao lâu
- [x] Test: thời gian chờ, thứ tự hàng đợi, chuyển trạng thái "cần xem lại" (`lib.test.ts`)

## Rủi ro

- Rate limit: GitLab mỗi MR tốn 3 request (MR, approvals, discussions); đã giới hạn 40 MR, song song 6, cache 60 giây. GitHub dùng 1 truy vấn GraphQL cho cả danh sách.
- GitLab bản Free không có API approvals → ẩn chip approve.
- Thread GitHub chỉ lấy 100 thread / 50 comment mỗi thread đầu tiên.
- Token base64 khi chạy `npm start` ngoài app desktop không phải mã hóa thật; app đóng gói dùng safeStorage.
