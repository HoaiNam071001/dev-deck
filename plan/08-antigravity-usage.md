# 08 — Đọc log token từ Antigravity (đa model: Gemini, Claude…)

Mục tiêu: bổ sung adapter đọc log token cục bộ của **Antigravity** (`~/.gemini/antigravity/brain`) vào trang **AI**, hỗ trợ ghi nhận chính xác từng lượt phản hồi kể cả khi người dùng chuyển qua lại giữa các model (Gemini, Claude, v.v.) trong cùng một cuộc trò chuyện.

> Ghi chú cho người/agent triển khai: hãy đọc kỹ [server/usage/index.js](../server/usage/index.js), [server/usage/claude.js](../server/usage/claude.js), [server/usage/gemini.js](../server/usage/gemini.js), [src/types.ts](../src/types.ts), [src/lib/usage.ts](../src/lib/usage.ts), [src/components/StackedChart.tsx](../src/components/StackedChart.tsx) và [src/pages/TokenPage.tsx](../src/pages/TokenPage.tsx) trước khi sửa.

---

## 1. Vị trí & định dạng log của Antigravity

- **Thư mục gốc mặc định**:
  ```js
  const ROOT = path.join(
    process.env.ANTIGRAVITY_DIR || path.join(os.homedir(), '.gemini', 'antigravity'),
    'brain'
  )
  ```
- **Đường dẫn file log của mỗi hội thoại**:
  `<ROOT>/<conversation-id>/.system_generated/logs/transcript.jsonl`
  - **Lưu ý hiệu năng**: bên trong mỗi `<conversation-id>/` có thể chứa nhiều file lớn (`steps/*/output.txt`, `tasks/*.log`, ảnh, `transcript_full.jsonl`…). Không nên dùng `walk(ROOT, ['.jsonl'])` đệ quy sâu vì sẽ duyệt thừa rất nhiều thư mục con và dễ đọc nhầm `transcript_full.jsonl`.
  - Thay vào đó, chỉ đọc các thư mục con cấp 1 của `ROOT` (`fs.readdirSync(ROOT, { withFileTypes: true })`), với mỗi thư mục con `d` kiểm tra trực tiếp file `path.join(ROOT, d.name, '.system_generated', 'logs', 'transcript.jsonl')` bằng `fs.existsSync(...)`.

- **Cấu trúc các dòng trong `transcript.jsonl`** (đã kiểm chứng trên log thật):
  Mỗi dòng là một JSON object. Dòng phản hồi của model có dạng:
  ```json
  {
    "step_index": 3,
    "source": "MODEL",
    "type": "PLANNER_RESPONSE",
    "status": "DONE",
    "created_at": "2026-11-26T03:11:11Z",
    "model": "gemini-4-hydrogen-high",
    "input_tokens": 2176,
    "cache_read_tokens": 12883,
    "output_tokens": 283,
    "content": "..."
  }
  ```

- **Quy tắc map sang `UsageRow`**:
  - Chỉ nhận dòng có `o.type === 'PLANNER_RESPONSE'` và có `o.created_at` (và có ít nhất một trong `input_tokens`, `output_tokens`, `cache_read_tokens` là số).
  - Nếu có trường `status` và khác `'DONE'` (ví dụ đọc trúng lúc đang stream), có thể bỏ qua hoặc kiểm tra kỹ tránh trùng.
  - `id`: `` `${convId}#${o.step_index ?? fallbackIndex}` `` (khử trùng lặp theo `provider + id` trong `server/usage/index.js`).
  - `t`: `o.created_at`
  - `model`: `o.model || 'unknown'` (mỗi lượt ghi đúng model đang dùng, nên nếu một hội thoại đổi từ Gemini sang Claude hay ngược lại thì từng lượt vẫn tách đúng theo model).
  - `input`: `num(o.input_tokens)` — **quan trọng**: qua kiểm chứng log thật (`step_index: 1` có `input_tokens: 14932, cache_read_tokens: 0`; `step_index: 3` có `input_tokens: 2176, cache_read_tokens: 12883`), `input_tokens` của Antigravity là phần **chưa cache** (không gộp sẵn `cache_read_tokens` như Codex/Gemini CLI), nên **không** trừ `cache_read_tokens` khỏi `input_tokens`.
  - `output`: `num(o.output_tokens)`
  - `cacheRead`: `num(o.cache_read_tokens)`
  - `cacheWrite`: `0` (log không có trường cache write riêng)
  - `project`: `transcript.jsonl` không có trường `project` riêng.
    - Mặc định an toàn: rút gọn `convId.slice(0, 8)` (hoặc `agy-${convId.slice(0, 8)}`).
    - Cải tiến tuỳ chọn: quét nhẹ các dòng đầu hoặc `tool_calls` trong file xem có đường dẫn workspace không (loại trừ đường dẫn dưới `.gemini/antigravity` và thư mục tạm), nếu không xác định được thì fallback về `convId.slice(0, 8)`.

---

## 2. Phân chia token theo Model & Nhà cung cấp

- **Theo Model** (`TokenPage.tsx` → bảng **Theo model**):
  - `TokenPage.tsx` đang group theo `r.model`. Khi adapter trả đúng `model` từ từng dòng `PLANNER_RESPONSE`, các model khác nhau dùng trong Antigravity (ví dụ `gemini-4-hydrogen-high`, các model Claude trong Antigravity…) sẽ **tự động tách thành từng dòng riêng**.
- **Theo Nhà cung cấp** (`provider`):
  - Trong DevDeck, `provider` đại diện cho **nguồn log / công cụ** (`claude` = Claude Code, `codex` = Codex, `gemini` = Gemini CLI).
  - Thêm `'antigravity'` làm `provider` thứ 4 để:
    - Thấy rõ tổng token dùng qua Antigravity ở thẻ nguồn log và bảng **Theo nhà cung cấp**.
    - Tách biệt với **Gemini CLI** (`~/.gemini/tmp`) và **Claude Code** (`~/.claude/projects`).
- **Mở rộng tuỳ chọn (nếu cần phân biệt thêm model Claude bên trong Antigravity)**:
  - Cách 1 (gọn nhất, nên làm nếu muốn lọc): thêm helper suy luận `vendor` từ `r.model` ở frontend (`/^claude/i` → `Anthropic`, `/^gemini/i` → `Google`, `/^(gpt|o\d|codex)/i` → `OpenAI`, còn lại → `Khác`) để thêm một bảng nhỏ "Theo hãng model" trên `TokenPage` mà không làm rối `sources`.
  - Lưu ý nhỏ ở `TokenPage.tsx` dòng 68: `modelProvider` đang dùng `new Map(rows.map((r) => [r.model, r.provider]))` — nếu hai công cụ cùng gọi một tên model giống hệt nhau thì chấm màu ở bảng "Theo model" sẽ lấy theo provider gặp sau cùng.

---

## 3. Các bước triển khai chi tiết

### Bước 1: Tạo adapter backend & test fixture
- [ ] Tạo `server/usage/antigravity.js`:
  - Xuất `{ id: 'antigravity', label: 'Antigravity', root: ROOT, files, parse }`.
  - `files()`: duyệt thư mục cấp 1 trong `ROOT`, thu thập `<ROOT>/<convId>/.system_generated/logs/transcript.jsonl` tồn tại.
  - `parse(text, file)`: lấy `convId` từ cấu trúc đường dẫn (cha cấp 3 của `transcript.jsonl`), duyệt `jsonLines(text, '"PLANNER_RESPONSE"')`, map các dòng hợp lệ thành `UsageRow`.
- [ ] Đăng ký `require('./antigravity')` vào mảng `ADAPTERS` trong `server/usage/index.js`.
- [ ] Tạo fixture `server/usage/__fixtures__/antigravity.jsonl` gồm:
  - Dòng `USER_INPUT` và `GENERIC` (phải bị bỏ qua).
  - Dòng `PLANNER_RESPONSE` model Gemini có `cache_read_tokens > 0`.
  - Dòng `PLANNER_RESPONSE` model Claude (trong cùng hội thoại) để kiểm chứng tách model.
  - Một dòng JSON lỗi (phải bỏ qua an toàn).
- [ ] Bổ sung assertion cho `antigravity` trong `server/usage/test.js` và chạy `node server/usage/test.js`.

### Bước 2: Cập nhật kiểu dữ liệu & logic tổng hợp frontend
- [ ] `src/types.ts`: cập nhật `export type Provider = 'claude' | 'codex' | 'gemini' | 'antigravity'`.
- [ ] `src/lib/usage.ts`:
  - Thêm `{ id: 'antigravity', label: 'Antigravity', color: '#8B5CF6' }` vào `PROVIDERS`.
  - Cập nhật `Bucket` interface và hàm `buckets()` để có field `antigravity: number` (tránh hardcode thiếu key khi chọn biểu đồ *Theo nhà cung cấp*).
- [ ] `src/components/StackedChart.tsx`:
  - Cập nhật union type `keys` (dòng 9) để bao gồm `'antigravity'` (nên dùng `Provider` từ `../types` thay vì liệt kê tay từng provider).

### Bước 3: Cập nhật UI & tài liệu
- [ ] `src/pages/TokenPage.tsx`:
  - Kiểm tra bộ lọc `Segmented` "Nhà cung cấp", sidebar "Nguồn log", bảng "Theo nhà cung cấp" và "Theo model" tự nhận `antigravity` từ `PROVIDERS` và `/api/usage/sources`.
  - (Tuỳ chọn) Thêm bảng/nhóm "Theo hãng model" nếu muốn gộp model Claude ở cả Claude Code và Antigravity lại xem chung.
- [ ] `src/pages/HomePage.tsx`:
  - Cập nhật mô tả thẻ `QuickCard` "AI" (`desc` và `foot`) để liệt kê thêm `Antigravity`.
- [ ] `README.md`:
  - Bổ sung dòng `Antigravity` (`~/.gemini/antigravity/brain`, biến `ANTIGRAVITY_DIR`) vào bảng "Nguồn log AI".

---

## 4. Kiểm thử & tiêu chí hoàn thành

- [ ] `node server/usage/test.js` pass toàn bộ các adapter (`claude`, `codex`, `gemini`, `antigravity`).
- [ ] `npm run typecheck` (`tsc --noEmit`) và `npm run build` pass không lỗi TypeScript.
- [ ] Chạy `npm run dev` hoặc `npm start`, kiểm tra:
  - `GET /api/usage/sources` trả về nguồn `antigravity` với `found: true`, số file và số dòng hợp lý.
  - `GET /api/usage` trả về các row `provider: "antigravity"`, `input` khớp `input_tokens`, `cacheRead` khớp `cache_read_tokens`, `output` khớp `output_tokens`.
  - Trang AI hiển thị nguồn `Antigravity`, lọc theo nhà cung cấp `Antigravity` hoạt động, biểu đồ xếp chồng theo loại token & theo nhà cung cấp hiển thị đúng, bảng "Theo model" tách riêng từng model dùng trong Antigravity.

---

## 5. Rủi ro & lưu ý

- **Thay đổi schema của Antigravity**: `transcript.jsonl` là log nội bộ trong `.system_generated/logs/`, các phiên bản Antigravity sau có thể đổi tên trường hoặc cấu trúc. Parser cần phòng thủ (dùng `jsonLines`, kiểm tra kiểu số với `num()`, bỏ qua dòng lạ không crash).
- **Trùng dữ liệu khi đổi tên hoặc subagent**: mỗi subagent cũng có thư mục riêng trong `brain/<subagent-conv-id>/.system_generated/logs/transcript.jsonl`, nên khử trùng lặp bằng `${convId}#${step_index}` sẽ không bị đè nhầm giữa các cuộc hội thoại, đồng thời cộng gộp được cả token của subagent (nếu không muốn tính subagent thì cần lọc thêm sau).
- **Tên `project`**: vì log không gắn sẵn `projectId`, mặc định hiển thị theo mã hội thoại rút gọn; nếu cần tên repo đẹp cần bổ sung heuristic hoặc đọc metadata từ Antigravity.
