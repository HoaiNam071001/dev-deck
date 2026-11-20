# 1. Nền tảng

Mục tiêu: chuyển từ một file HTML sang Vite + React + TypeScript, server tách module, giữ nguyên tính năng token.

- [x] Server tách `server/index.js`, `server/usage.js`, `server/git.js`
- [x] Server phục vụ `dist/` (SPA fallback), chặn Host lạ
- [x] `package.json`: scripts `dev` (api + vite), `build`, `typecheck`, `start`
- [x] Vite proxy `/api` tới cổng 4317
- [x] `tsconfig.json` strict
- [x] Layout chung: thanh điều hướng Token / Git, theme sáng-tối theo hệ thống
- [x] Trang Token chuyển sang React: KPI, biểu đồ cột chồng (có trục giờ/ngày), 2 bảng
- [x] Routing hash (`#/tokens`, `#/git`), không cần thư viện

Xong khi: `npm run build` không lỗi, `npm start` mở được cả hai trang, trang Token cho số liệu giống bản cũ.

Rủi ro: `npm install` cần mạng; nếu offline thì giữ bản cũ.
