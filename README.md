# DevDeck

DevDeck là dashboard cục bộ cho dev, gồm hai trang:

- **Token**: lượng token Claude Code đã dùng (theo phút / giờ / ngày, theo model, theo dự án).
- **Git**: mọi repo trên máy, nhánh của từng repo, nhánh đang mở, trạng thái thay đổi, ahead/behind.

Kế hoạch từng giai đoạn nằm ở [plan/README.md](plan/README.md) (sắp tới: tạo/xóa nhánh, tạo/xóa repo).

## Chạy

```bash
npm install
npm run build   # build giao diện vào dist/
npm start       # http://localhost:4317
```

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
server/   index.js (HTTP + static) · usage.js (đọc log token) · git.js (lệnh git chỉ-đọc)
src/      App.tsx · api.ts · pages/ · components/ · lib/
plan/     kế hoạch theo giai đoạn
```

## API

| Đường dẫn | Mô tả |
|---|---|
| `GET /api/usage` | Mỗi phản hồi của model: thời điểm, dự án, model, 4 loại token |
| `GET /api/git/repos[?rescan=1]` | Danh sách repo + nhánh hiện tại, trạng thái, ahead/behind |
| `GET /api/git/repo?path=` | Chi tiết một repo: nhánh local/remote, file thay đổi, 20 commit, remote, stash |
| `GET/PUT /api/git/config` | Thư mục gốc quét và độ sâu |

## An toàn

Chỉ nghe `127.0.0.1`, từ chối Host khác localhost (chống DNS rebinding). Hiện tại chỉ chạy lệnh git đọc
(`status`, `for-each-ref`, `log`, `remote`, `stash list`) bằng `execFile`, không qua shell; `/api/git/repo` chỉ nhận
đường dẫn nằm trong danh sách repo đã quét.
