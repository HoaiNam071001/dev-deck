# 12 — Chạy script npm ngay trong app

Mục tiêu: từ chi tiết repo hoặc tab Job, bấm để chạy `dev`, `test`, `build`, `lint`… của `package.json`, xem log trực tiếp và dừng được. Hiện tab Job chỉ **theo dõi** và **dừng** tiến trình chạy ở nơi khác.

## Việc cần làm

### Server (`server/jobs/runner.js` mới)
- [ ] Đọc `scripts` trong `package.json` của repo đã quét (kể cả package con trong monorepo: `workspaces`, hoặc `package.json` sâu 2 cấp); nhận ra trình quản lý gói qua lockfile (`package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`)
- [ ] `POST /api/jobs/run { path, script }`: tên script phải **có trong** `package.json` (không nhận lệnh tự do); chạy `npm run <script>` (hoặc pnpm / yarn) bằng `spawn` với mảng tham số, `cwd` = thư mục package
- [ ] Windows: `npm` là `.cmd` → gọi `cmd.exe /d /s /c` với tham số đã kiểm (tên script chỉ nhận `[A-Za-z0-9:_.-]`) hoặc gọi thẳng `node <npm-cli.js>`; ghi lý do chọn vào file này
- [ ] Tham số thêm (ví dụ tên tệp test) qua ô riêng, kiểm từng phần, truyền sau `--`
- [ ] Giữ log trong bộ đệm vòng (ví dụ 5.000 dòng / job), đọc qua `GET /api/jobs/log?id=&since=` (poll) hoặc SSE; lưu tệp log ở `data/runs/<id>.log` để xem lại sau khi xong
- [ ] Dừng: dùng lại `taskkill /T` hiện có (cây tiến trình)
- [ ] Script chạy vitest: tự gắn reporter tiến độ hiện có để tab Job thấy "N/M file"
- [ ] Mỗi lần chạy / dừng ghi audit (repo, script, mã thoát, thời lượng)

### Giao diện
- [ ] `RepoDetail`: tab "Script" liệt kê script, nút ▶ chạy, ghim script hay dùng lên đầu
- [ ] Job do DevDeck khởi chạy hiện cùng danh sách Job với nhãn "chạy từ app", mở ra thấy log trực tiếp (cuộn theo, tìm chữ, sao chép), mã màu ANSI cơ bản
- [ ] Dev server: hiện cổng đang nghe (đã có `jobPorts`) kèm nút mở `http://localhost:<port>`
- [ ] Lịch sử: 20 lần chạy gần nhất mỗi repo (script, lúc chạy, thời lượng, mã thoát), bấm để xem lại log
- [ ] Thông báo khi job chạy lâu (build / test) kết thúc, theo công tắc thông báo hiện có
- [ ] Command Palette: "Chạy script…" → chọn repo → chọn script
- [ ] Chạy lại cùng script đang chạy → hỏi "dừng bản cũ và chạy lại?"

## Tiêu chí xong

- Chạy `npm run dev` của một repo, thấy log và cổng, mở được trang, dừng được và không còn tiến trình con.
- Chạy test vitest thấy tiến độ "N/M file" và mã thoát đúng.
- Không cách nào chạy được lệnh không có trong `package.json`.

## Rủi ro

- **Chèn lệnh qua `cmd.exe`**: tên script và tham số phải qua whitelist ký tự; script có trong `package.json` vẫn là mã của repo, chỉ chạy khi người dùng bấm.
- **Tiến trình mồ côi** khi đóng app → khi thoát hỏi "dừng N job đang chạy?", mặc định dừng.
- **Log lớn** (dev server chạy cả ngày) → bộ đệm vòng + tệp log giới hạn kích thước.
- Chỉ Windows được thử trước (giống tab Job hiện tại).
