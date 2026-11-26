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

Phát triển (hot reload, giao diện ở http://localhost:5173):

```bash
npm run dev
```

Đổi cổng API bằng biến `PORT`. Đổi thư mục quét repo trong giao diện (nút "Thư mục quét", lưu ở `data/config.json`)
hoặc đặt biến `GIT_ROOTS` (nhiều thư mục ngăn cách bằng `;` trên Windows). Mặc định quét `~/Desktop`, sâu 4 cấp.

## Công nghệ

Vite + React 18 + TypeScript (strict), CSS thuần có sẵn chế độ sáng/tối, biểu đồ SVG tự vẽ. Server Node không phụ thuộc.

## Cấu trúc

```
server/   index.js (HTTP + static) · usage/ (adapter đọc log token: claude, codex, gemini) · git.js (lệnh git chỉ-đọc)
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

## Nguồn log AI

| Nguồn | Thư mục mặc định | Đổi bằng biến môi trường |
|---|---|---|
| Claude Code | `~/.claude/projects` | `CLAUDE_CONFIG_DIR` |
| Codex | `~/.codex/sessions` | `CODEX_HOME` |
| Gemini CLI | `~/.gemini/tmp/*/chats` | `GEMINI_DIR` |
| Antigravity | `~/.gemini/antigravity/brain/*/.system_generated/logs/transcript.jsonl` | `ANTIGRAVITY_DIR` |

Parser Antigravity đã đối chiếu với log thật. Parser Codex và Gemini CLI dựa trên định dạng log đã biết, chỉ kiểm thử bằng fixture (`node server/usage/test.js`), chưa kiểm chứng trên log thật. Antigravity không ghi project trong log nên tên project suy ra từ `~/.gemini/projects.json`, không khớp thì hiện `agy-<mã hội thoại>`. Nguồn không có thư mục thì hiện "chưa có".

## An toàn

Chỉ nghe `127.0.0.1`, từ chối Host khác localhost (chống DNS rebinding). Hiện tại chỉ chạy lệnh git đọc
(`status`, `for-each-ref`, `log`, `remote`, `stash list`) bằng `execFile`, không qua shell; `/api/git/repo` chỉ nhận
đường dẫn nằm trong danh sách repo đã quét.
