# DevDeck

DevDeck là dashboard cục bộ cho dev, gồm hai trang:

- **AI**: lượng token đã dùng của Claude Code, Codex, Gemini CLI và Antigravity (theo phút / giờ / ngày, theo nhà cung cấp, model, dự án). Đọc log cục bộ, không gọi mạng.
- **Git**: mọi repo trên máy, nhánh của từng repo, nhánh đang mở, trạng thái thay đổi, ahead/behind.

Kế hoạch từng giai đoạn nằm ở [plan/README.md](plan/README.md) (sắp tới: tạo/xóa nhánh, tạo/xóa repo).

## Chạy

```bash
npm install
npm run build   # build giao diện vào dist/
npm start       # http://localhost:4317
```

### App desktop (Electron)

```bash
npm run desktop   # build giao diện + mở cửa sổ app
npm run dist      # đóng gói release/DevDeck-<ver>-setup.exe và -portable.exe
npm run release   # tăng số phiên bản (x|y|z|X.Y.Z), đẩy main + tag vX.Y.Z
```

Tag `v*.*.*` kích hoạt workflow *Release Windows* (`.github/workflows/release-windows.yml`): build trên GitHub, đính bộ cài vào Release.
App hỏi Release mới nhất sau 5 giây khi mở, tải xong thì hỏi khởi động lại để cài. Chỉ `git push` thì app không biết, phải có tag mới.
Dữ liệu (`config.json`, `audit.log`) nằm ở `%APPDATA%/devdeck/data`. Bản build chưa ký số nên Windows SmartScreen sẽ cảnh báo.

### Chạy nền không cần Electron

Muốn server luôn sẵn ở `http://localhost:4317` mà không mở cửa sổ app (cần `npm run build` trước):

```bash
npm run service:install     # Task Scheduler: tự chạy node server/index.js mỗi lần đăng nhập, ẩn cửa sổ
npm run service:status
npm run service:uninstall
```

Dùng `pm2` cũng được: `npx pm2 start server/index.js --name devdeck && npx pm2 save` (tự chạy lúc khởi động cần `pm2-windows-startup` hoặc dùng Task Scheduler ở trên).
Task chạy dưới tài khoản hiện tại, không cần quyền admin; dữ liệu ở `data/` trong thư mục dự án.

Phát triển (hot reload, giao diện ở http://localhost:5183):

```bash
npm run dev
```

Kiểm thử:

```bash
npm test              # vitest: hàm thuần ở src/ (relTime, rootOf, nameFromUrl, CSV, gom biểu đồ…)
npm run test:server   # node: parseStatus, kiểm tra tên, thao tác nhánh / repo trên repo tạm, parser log AI
npm run typecheck
```

Đổi cổng API bằng biến `PORT`. Đổi thư mục quét repo trong giao diện (nút "Thư mục quét", lưu ở `data/config.json`)
hoặc đặt biến `GIT_ROOTS` (nhiều thư mục ngăn cách bằng `;` trên Windows). Mặc định quét `~/Desktop`, sâu 4 cấp.

## Công nghệ

Vite + React 18 + TypeScript (strict), CSS thuần có sẵn chế độ sáng/tối, biểu đồ SVG tự vẽ. Server Node không phụ thuộc.

## Cấu trúc

```
server/   index.js (HTTP + static) · usage/ (adapter đọc log token: claude, codex, gemini) · git.js (lệnh git đọc) · git-actions.js (lệnh git ghi theo từng repo) · git-repos.js (tạo / clone / xóa repo)
src/      App.tsx · api.ts · pages/ · components/ · lib/
plan/     kế hoạch theo giai đoạn
```

## API

| Đường dẫn | Mô tả |
|---|---|
| `GET /api/usage` | Mỗi phản hồi của model: nhà cung cấp, thời điểm, dự án, model, 4 loại token |
| `GET /api/usage/sources` | Nguồn log đã dò: có thấy không, số file, số tin |
| `GET /api/git/repos[?rescan=1]` | Danh sách repo + nhánh hiện tại, trạng thái, ahead/behind |
| `GET /api/git/repo?path=` | Chi tiết một repo: nhánh local/remote, file thay đổi, 20 commit, remote, stash |
| `GET/PUT /api/git/config` | Thư mục gốc quét và độ sâu |
| `POST /api/git/action` | Thao tác ghi trên một repo đã quét: stage, commit, fetch, pull, push, checkout, tạo / đổi tên / xóa nhánh (local và remote). `dryRun: true` chỉ cho xóa nhánh, trả về điều sẽ xảy ra |
| `POST /api/git/repo-action` | `create` (git init + README / .gitignore tùy chọn), `delete` (dry-run rồi chuyển vào Thùng rác) |
| `POST /api/git/clone`, `GET /api/git/clone?id=` | Bắt đầu clone (trả `id`), hỏi tiến độ; `{action:'cancel', id}` để hủy và dọn bản dở |

## Nguồn log AI

| Nguồn | Thư mục mặc định | Đổi bằng biến môi trường |
|---|---|---|
| Claude Code | `~/.claude/projects` | `CLAUDE_CONFIG_DIR` |
| Codex | `~/.codex/sessions` | `CODEX_HOME` |
| Gemini CLI | `~/.gemini/tmp/*/chats` | `GEMINI_DIR` |
| Antigravity | `~/.gemini/antigravity/brain/*/.system_generated/logs/transcript.jsonl` | `ANTIGRAVITY_DIR` |

Parser Antigravity đã đối chiếu với log thật. Parser Codex và Gemini CLI dựa trên định dạng log đã biết, chỉ kiểm thử bằng fixture (`node server/usage/test.js`), chưa kiểm chứng trên log thật. Antigravity không ghi project trong log nên tên project suy ra từ `~/.gemini/projects.json`, không khớp thì hiện `agy-<mã hội thoại>`. Nguồn không có thư mục thì hiện "chưa có".

## An toàn

Chỉ nghe `127.0.0.1`, từ chối Host khác localhost (chống DNS rebinding). Mọi lệnh git chạy bằng `execFile`, không qua shell,
và chỉ nhận đường dẫn nằm trong danh sách repo đã quét.

Thao tác ghi:
- Mỗi hành động là một hàm riêng trong `server/git-actions.js` (không nhận chuỗi lệnh tự do); tên nhánh qua `git check-ref-format`, chặn tên bắt đầu bằng `-`; API chỉ nhận `application/json`.
- Thao tác phá hủy cần xác nhận hai bước: giao diện bắt gõ lại tên, server kiểm lại `confirmName`. Xóa nhánh local dùng `-d`, chỉ dùng `-D` khi người dùng tick "vẫn xóa" cho nhánh chưa merge. Không xóa nhánh đang mở và nhánh mặc định. Chuyển nhánh bị từ chối khi còn thay đổi chưa commit.
- Tạo repo, clone, xóa repo chỉ làm trong các thư mục quét đã cấu hình (không phải chính thư mục gốc khi xóa). Clone chỉ nhận URL `https://`, `ssh://`, `git@`; tắt giao thức `ext`/`file`, không hỏi mật khẩu (dùng credential manager / ssh-agent có sẵn). Xóa repo chuyển vào Thùng rác chứ không xóa vĩnh viễn; không có Thùng rác thì từ chối.
- Mọi thao tác ghi (kể cả lỗi) vào `data/audit.log`; không ghi `confirmName`, dry-run không được ghi.
