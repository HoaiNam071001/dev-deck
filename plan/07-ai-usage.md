# 07 — Mục "Claude" → "AI" (đa nhà cung cấp)

Mục tiêu: trang token hiện chỉ đọc `~/.claude/projects`. Đổi thành trang dùng chung cho Claude Code, Codex (GPT), Gemini CLI… và dễ thêm nguồn mới.

## 1. Đặt tên

| Hiện tại | Mới |
|---|---|
| Route `/claude` | `/ai` (giữ `#/claude`, `#/tokens` trong `LEGACY` → chuyển về `/ai`) |
| Nav "Claude" (phím `2`) | "AI" (giữ phím `2`) |
| Tiêu đề "Token Claude Code" | "Token AI" |
| `TokenPage`, icon `claude` | giữ file `TokenPage`; icon đổi thành `ai` (hình tia lửa/chip trung tính) |
| CSV `claude-token-…csv` | `ai-token-…csv` |
| Home card "Claude" | "AI" — chân thẻ liệt kê nguồn đã phát hiện |

## 2. Server: adapter theo nhà cung cấp

Tách `server/usage.js` thành thư mục `server/usage/`:

```
server/usage/
  index.js    # collect(): gộp mọi adapter, cache 5s, trả rows + sources
  claude.js   # logic hiện tại (~/.claude/projects/**/*.jsonl)
  codex.js    # ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
  gemini.js   # ~/.gemini/tmp/<hash>/chats/session-*.json
```

Mỗi adapter xuất `{ id, label, root, detect(), read() }`; `read()` trả về dòng chuẩn hoá:

```ts
UsageRow { provider: 'claude'|'codex'|'gemini', t, project, model,
           input, output, cacheWrite, cacheRead, reasoning? }
```

Cách map (cần xác nhận lại trên log thật, vì máy này chưa có Codex/Gemini):
- **Claude**: như cũ, thêm `provider: 'claude'`.
- **Codex**: sự kiện `event_msg` với `payload.type = "token_count"` → `info.last_token_usage` (`input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_output_tokens`). Model lấy từ `turn_context`, project từ `cwd` trong `session_meta`. Lưu ý Codex tính `input` đã gồm cache → trừ `cached_input_tokens` để khỏi đếm đôi.
- **Gemini CLI**: mỗi message `type: "gemini"` có `tokens {input, output, cached, thoughts, tool}` và `model`. Thư mục project là hash của cwd → hiển thị theo hash rút gọn, nếu tìm được `projects.json`/`.project_root` thì dịch ra tên.
- Khử trùng lặp theo `provider + id` (hiện chỉ theo `m.id`).
- Adapter lỗi hoặc thiếu thư mục → bỏ qua, không làm hỏng các nguồn còn lại.

API:
- `GET /api/usage` → `UsageRow[]` (mọi provider), giữ tương thích.
- `GET /api/usage/sources` → `[{ id, label, root, found, files, rows }]` để UI biết nguồn nào có.
- Cho phép đổi thư mục log qua config (ví dụ `CODEX_HOME`, `GEMINI_DIR`) — làm sau nếu cần.

## 3. Giao diện (`TokenPage`, `types.ts`, `lib/usage.ts`)

- Thêm `provider` vào `UsageRow`; `filterRows` nhận thêm provider.
- Thanh công cụ: thêm `Segmented` "Tất cả | Claude | Codex | Gemini" (chỉ hiện nguồn có dữ liệu; nguồn chưa có log hiển thị mờ + tooltip "Chưa thấy log").
- Thêm bảng "Theo nhà cung cấp" cạnh "Theo model"; cột model có chấm màu theo provider.
- Biểu đồ: giữ stack theo loại token (in/out/cache); thêm tuỳ chọn stack theo provider.
- Sidebar "Nguồn log": liệt kê từng đường dẫn đã dò thay vì cứng `~/.claude/projects`.
- KPI "Tỉ lệ cache đọc": gộp chung nhưng nếu một provider không có cache ghi thì không làm sai mẫu số.
- `projName`: bỏ regex đặc thù Claude (`c--Users-…`), để mỗi adapter tự trả tên project đã chuẩn hoá.
- Cập nhật `Shell`, `router`, `CommandPalette`, `HomePage`, `App` theo bảng ở mục 1; ghi nhớ provider đang chọn qua `persist`.
- [x] (làm: lựa chọn "Đường theo repo" ở ô chia biểu đồ; `StackedChart` có chế độ `line`; top 6 dự án + Khác, bấm chú thích để ẩn / hiện; chưa kiểm bằng mắt) Biểu đồ đường "Theo repo" *(người dùng yêu cầu 2026-11-28)*: mỗi repo / dự án một đường token theo thời gian để so xu hướng giữa các repo (bổ sung cho "So sánh dự án" dạng cột chồng). Mặc định 5 repo nhiều token nhất trong khoảng đang xem, còn lại gộp "Khác"; bấm chú thích để ẩn / hiện từng đường; tooltip theo mốc liệt kê token từng repo; đang lọc một dự án thì chỉ còn đường của dự án đó. Dùng lại `buckets(rows, g, (r) => r.project, …)` đã có, chỉ thêm cách vẽ đường trong `StackedChart` (hoặc component `LineChart` riêng), CSV giữ nguyên cột dự án. Bản vẽ: `design/desktop/v2/AI.html` (nút "Theo repo")

## 4. Thứ tự làm

1. Tách adapter Claude + thêm `provider`, thêm `/api/usage/sources` (hành vi UI chưa đổi).
2. Đổi tên route/nav/tiêu đề/icon/CSV, redirect legacy.
3. UI lọc provider + bảng theo provider + sidebar nguồn log.
4. Adapter Codex (viết parser dựa trên file log mẫu thật).
5. Adapter Gemini.
6. Cập nhật README, `design/`, `plan/README.md`; (tuỳ chọn) đổi tên package/thư mục `claude-token-usage`.

## 5. Kiểm thử

- Parser mỗi adapter: fixture `.jsonl`/`.json` nhỏ trong `server/usage/__fixtures__`, chạy bằng `node` (repo chưa có test runner).
- Máy chỉ có Claude: UI vẫn đúng, Codex/Gemini hiện "chưa thấy log".
- Mở `#/claude` cũ → vào `/ai`.
- Dùng skill `run` chạy app thật, kiểm tra tổng token khớp trước/sau khi refactor Claude.

## 6. Rủi ro / ngoài phạm vi

- Định dạng log Codex/Gemini không ổn định giữa các phiên bản → parser phòng thủ, bỏ dòng không hiểu.
- ChatGPT web, Gemini web, Copilot không có log cục bộ → không hỗ trợ (cần API/export riêng).
- Chưa tính chi phí tiền (mỗi hãng giá khác nhau) — để backlog.
- Log lớn: đọc toàn bộ file mỗi 5s đã chậm với Claude; thêm Codex/Gemini sẽ nặng hơn → cân nhắc cache theo `mtime` ở bước 1.

## Đã chốt

Tên "AI"; làm cả Codex và Gemini; đổi tên thư mục thành `dev-deck`.

## Câu hỏi ban đầu

1. Tên mục: **"AI"** (đề xuất) hay "Token" / "Usage"?
2. Có cần làm cả Codex và Gemini ngay, hay Claude + Codex trước?
3. Có đổi tên package/thư mục `claude-token-usage` không?
