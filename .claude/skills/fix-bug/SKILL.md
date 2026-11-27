---
name: fix-bug
description: Sửa lỗi người dùng báo trong DevDeck (vd "bị lỗi", "không hiện", "quay mãi", "số token sai", "repo không thấy", "UI lệch", "bấm không ăn"). Lỗi vặt (UI, 1–2 file) đi đường nhanh; lỗi thường thì tìm nguyên nhân gốc, test tái hiện trước, sửa, rà chỗ cùng kiểu lỗi.
---

# Sửa bug

## 0. Chọn đường: lỗi vặt hay lỗi thường

**Lỗi vặt** = đủ cả 3: nhìn là thấy chỗ sai (UI lệch / sai chữ / sai màu / nút không ăn), sửa gọn trong 1–2 file, không đổi API server ↔ client hay `data/config.json`. Làm nhanh:

1. Mở đúng file, sửa tận gốc (không vá triệu chứng), `grep` chỗ cùng mẫu.
2. Logic thuần → thêm 1 ca vào `src/lib/lib.test.ts` (hoặc `server/*-test.js`); thuần giao diện → xem bằng `npm run dev` nếu được.
3. `npm run typecheck` + vitest (lệnh ở mục 5).
4. Commit kiểu `Fix …` / `Sửa …` (theo lịch sử). Bỏ qua senior-review, wrap-up đầy đủ.

Đang sửa thấy lỗi sâu hơn (nhiều file, đụng server / cache / poll, không chắc nguyên nhân) → chuyển đường thường.

## 1. Hiểu đúng lỗi

- Ghi lại: làm gì → mong gì → thấy gì; trang nào (Tổng quan / AI / Git / Jobs / Remotes), chạy kiểu nào (`npm run dev`, `npm start`, app Electron đã cài, bản portable), phiên bản (thanh trạng thái). Thiếu thông tin quyết định hướng sửa → hỏi một lần, gom câu hỏi.
- Dữ liệu thật: `data/audit.log` (thao tác ghi git), `data/config.json`; app đã cài thì ở `%APPDATA%/devdeck/data`. Lỗi số token → xem log nguồn (`~/.claude/projects`, `~/.codex/sessions`…) và `GET /api/usage/sources`.

## 2. Tìm nguyên nhân gốc

Lần ngược tới chỗ giá trị sai sinh ra. Nghi vấn hay gặp ở dự án này:

- **Cache / làm mới**: `useLoad` + `dropCache` (`src/api.ts`) – thao tác ghi xong không xóa cache, key cache trùng giữa trang; cache 5s / mtime của `server/usage/index.js`; `store.rev` không tăng.
- **Poll chồng nhau / quay mãi**: spinner không tắt ở nhánh lỗi, poll mới chạy khi poll cũ chưa xong (đã từng lỗi ở Jobs).
- **Windows**: đường dẫn `\` vs `/`, chữ hoa thường ổ đĩa, `.cmd`, ký tự điều khiển trong command line (Jobs), PowerShell chậm khởi động.
- **Git**: repo detached HEAD, không upstream, repo rỗng chưa commit, nhánh có `/`, worktree / submodule; output git đổi theo locale.
- **Parser log AI**: dòng hỏng / đang stream, bản ghi lặp (đếm hai lần), cache đọc bị cộng vào input, project suy sai.
- **Remotes**: phân trang API, rate limit, GitLab self-hosted khác URL, token hết hạn → phải báo rõ, không im lặng.
- **Electron vs dev**: cổng khác nhau (4317 dev, 47317 bản cài, 47318 chạy từ mã nguồn), `DEVDECK_DATA` khác thư mục.

Không chắc → thêm log / test nhỏ để chứng minh, không đoán. Nói rõ nguyên nhân cho người dùng bằng 1–2 câu.

## 3. Test tái hiện trước khi sửa

- Logic TS thuần: `src/lib/lib.test.ts`. Server git: `server/git-test.js` (repo tạm). Parser log: `server/usage/test.js` + fixture trong `server/usage/__fixtures__/` (cắt từ log thật, bỏ nội dung riêng tư).
- Test phải **đỏ** trước khi sửa, **xanh** sau. Lỗi chỉ thấy trên UI / máy thật → ghi cách thử tay trong mục con của file plan.

## 4. Sửa

- Sửa nhỏ nhất đúng chỗ gốc; không kèm refactor không liên quan (ghi thành mục backlog nếu cần).
- `grep` cùng mẫu lỗi ở chỗ khác (adapter AI khác, provider GitLab ↔ GitHub, trang khác dùng cùng `useLoad`) và sửa luôn.
- Thông báo lỗi cho người dùng (tiếng Việt) nói được cách khắc phục.

## 5. Kiểm tra + ghi lại

```bash
npm run typecheck
npx vitest run --reporter=default --reporter=devdeck-reporter
npm run test:server     # khi đụng server/
```

- File plan liên quan: thêm mục con `- [x] Sửa: <triệu chứng> – <nguyên nhân>`.
- Lỗi người dùng thấy được → thêm mục `tag: 'fix'` vào bản kế tiếp trong `src/releaseNotes.ts` (xem skill `release`). Commit qua skill `wrap-up`.
