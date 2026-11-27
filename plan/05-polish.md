# 5. Hoàn thiện

- [x] Test đơn vị cho `parseStatus`, kiểm tra tên nhánh, bucket thời gian (vitest) — vitest `src/lib/lib.test.ts` (relTime, rootOf, nameFromUrl…) + `server/git-test.js` (parseStatus, tên); chạy `npm test`, `npm run test:server`
- [x] Test tích hợp tạo repo tạm, chạy các hành động, kiểm tra kết quả — `server/git-test.js`: repo tạm, remote bare cục bộ, clone lỗi / hủy, xóa vào Thùng rác, audit
- [ ] Trạng thái tải / rỗng / lỗi nhất quán cho mọi trang
- [ ] Bàn phím và a11y: focus, nhãn, tương phản sáng-tối
- [ ] Hiệu năng: cache có TTL cho `/api/usage`, quét repo bất đồng bộ, ảo hóa bảng nếu hơn 200 repo
- [ ] Biểu đồ token: so sánh theo dự án, xuất CSV
- [x] README cập nhật; script `npm run dev` / `build` / `start` đã ghi — thêm API, an toàn, cách chạy test
- [ ] Đóng gói chạy nền (tùy chọn): Windows Task Scheduler / `pm2`
