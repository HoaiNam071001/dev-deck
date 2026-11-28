# 11 — Token theo nhánh git / theo MR

Mục tiêu: trả lời được câu "nhánh này / MR này đã tốn bao nhiêu token AI", ngay trong trang AI, chi tiết repo và chi tiết MR.

## Dữ liệu sẵn có

- Log Claude Code (`~/.claude/projects/**/*.jsonl`): mỗi dòng có `gitBranch`, `sessionId`, `cwd`. Adapter [server/usage/claude.js](../server/usage/claude.js) hiện chỉ lấy `cwd` **đầu tiên** của phiên và bỏ qua `gitBranch`, `sessionId`.
- Codex: `session_meta` có thông tin git (cần kiểm lại trên log thật: tên trường nhánh).
- Gemini CLI, Antigravity: chưa thấy trường nhánh → để trống, giao diện ghi "không rõ nhánh".
- MR ↔ repo local đã nối được qua URL remote ([server/remotes/match.js](../server/remotes/match.js)).

## Việc cần làm

### Server
- [x] `UsageRow` thêm `branch?: string`, `session?: string`; Claude lấy `gitBranch` **theo từng dòng** (một phiên có thể đổi nhánh giữa chừng), `cwd` cũng theo từng dòng
- [x] Bỏ giá trị rỗng / `HEAD` (detached) → `branch` để trống
- [x] Codex: đọc nhánh từ `session_meta` nếu có; thêm fixture vào `server/usage/__fixtures__`
- [x] Chuẩn hóa `projectPath` về repo gốc: `cwd` là thư mục con hoặc worktree (xem [10b](10-git-workflow.md)) → map về repo chính trong danh sách đã quét, để khóa `repo + nhánh` ổn định
- [ ] Giữ cache theo mtime hiện có; kiểm kích thước phản hồi `/api/usage` (thêm 2 trường mỗi dòng)

### Trang AI
- [x] Tab Chi tiết: thêm bảng "Theo nhánh" (repo · nhánh · token · số phiên · lần cuối dùng), lọc theo dự án đang chọn
- [x] Bảng "Theo phiên": mỗi `sessionId` một dòng (bắt đầu, thời lượng, nhánh, model, token) — giúp thấy phiên nào ngốn nhiều
- [x] Bộ lọc nhánh trong sidebar khi đã chọn một dự án
- [x] CSV xuất thêm cột `branch`, `session` (làm dưới dạng thêm nhóm "Nhánh" và "Phiên" vào CSV tab Chi tiết, không thêm cột)

### Chi tiết repo (trang Git)
- [x] Tab Nhánh: cột "Token AI" cạnh từng nhánh local (tổng mọi provider có nhánh)
- [x] Thẻ nhỏ ở đầu `RepoDetail`: token của nhánh hiện tại (hôm nay / tổng)

### Chi tiết MR (Remotes)
- [x] `RemoteDetail`: thẻ "Token AI" = token của nhánh nguồn trên clone local đã nối, tách theo model; không có clone local thì ẩn
- [ ] (Tùy chọn) Cột token trong danh sách MR của tôi

### Test
- [x] Fixture Claude có 2 nhánh trong cùng một phiên → tổng theo nhánh đúng
- [x] Hàm gom theo nhánh / phiên là hàm thuần trong `src/lib/usage.ts`, có test vitest
- [ ] Đối chiếu tổng token trang AI trước / sau thay đổi (không được lệch)

Ghi chú (đã làm): `cwd` theo dòng chỉ ghi khi khác `projectPath` (giữ nhỏ phản hồi); `repoOfRow` / `byBranch` / `bySession` / `repoBranchTokens` trong `src/lib/usage.ts`, hook `useBranchTokens`. Bảng "Theo phiên" lấy 20 phiên lớn nhất. Bộ lọc nhánh ở sidebar hiện khi đã chọn dự án và có hơn một nhánh; nhánh không còn trong repo ghi "(không còn)" ở bảng Theo nhánh. Còn lại: cột token trong danh sách MR (tùy chọn), đối chiếu tổng token trên log thật. Chưa kiểm bằng mắt.

## Tiêu chí xong

- Chọn một nhánh bất kỳ đã làm với Claude Code → thấy số token khớp với cộng tay từ log.
- Mở một MR có clone local → thấy token của nhánh nguồn.
- Tổng token toàn trang không đổi so với trước.

## Rủi ro

- **Tên nhánh trùng giữa các repo** (`main`, `develop`) → luôn khóa theo `repo + nhánh`, không theo tên nhánh trần.
- **Nhánh đổi tên / đã xóa**: token gắn với tên cũ; hiện nhánh không còn tồn tại bằng chữ mờ.
- **Làm việc ngoài repo** (`cwd` không phải repo đã quét) → gom vào "ngoài repo".
- Provider không có nhánh → số liệu theo nhánh chỉ là một phần tổng; ghi chú rõ trên giao diện.
