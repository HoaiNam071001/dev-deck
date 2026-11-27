---
name: new-request
description: Người dùng đưa yêu cầu mới / đổi yêu cầu / ý tưởng tính năng cho DevDeck (vd "thêm tính năng…", "muốn đổi…", "sau này cần…", "ý tưởng: …"). Phân loại, đối chiếu plan, ghi vào plan/ đúng chỗ, hỏi những gì cần chốt – trước khi code.
---

# Nhận yêu cầu mới / đổi yêu cầu

Mục tiêu: không yêu cầu nào chỉ nằm trong chat; `plan/` luôn phản ánh đúng ý người dùng.

## 1. Hiểu + đối chiếu

- Viết lại yêu cầu bằng 1–2 câu theo ngôn ngữ người dùng (kết quả họ muốn thấy, không phải cách làm).
- Đối chiếu:
  - Bảng giai đoạn trong `plan/README.md` + `plan/00-backlog.md` – đã có / đã lên plan chưa? (`grep -ri <từ khóa> plan/`)
  - *Nguyên tắc xuyên suốt* (`plan/README.md`) và mục *An toàn* (`README.md`) – yêu cầu có đụng thao tác ghi, lệnh hệ thống, token / bí mật, mạng không?
  - Trang nào bị ảnh hưởng: Tổng quan, AI, Git, Jobs, Remotes (`src/pages/`), server module nào.

## 2. Phân loại

| Loại | Làm gì |
|---|---|
| Sửa nhỏ trong giai đoạn đang làm / đã xong | Thêm mục con `- [ ]` vào file giai đoạn đó, ghi *(người dùng yêu cầu YYYY-MM-DD)* |
| Mở rộng giai đoạn chưa làm | Thêm mục con vào file đó, chỉnh *Mục tiêu* / *Tiêu chí xong* nếu cần |
| Việc nhỏ chưa rõ chỗ | Một dòng `- [ ]` trong `plan/00-backlog.md` › *Chưa phân loại* |
| Tính năng mới hẳn | File mới `plan/<số tiếp theo>-<tên>.md` theo mẫu file khác (*Mục tiêu*, *Việc cần làm* chia Server / Giao diện, *Tiêu chí xong*, *Rủi ro*) + dòng trong bảng `plan/README.md` (trạng thái "chưa") |
| Đổi điều đã chốt (nguyên tắc an toàn, hành vi đã phát hành) | Nêu rõ cái cũ, cái mới, hệ quả (code phải sửa, dữ liệu cũ trong `data/`). Người dùng đồng ý → sửa file plan / README, ghi ngày + lý do |
| Lỗi | Dùng skill `fix-bug` |

## 3. Chốt với người dùng

- Chỉ hỏi những gì đổi hướng làm (hành vi, UI, phạm vi, ưu tiên) – mỗi câu kèm khuyến nghị và lý do. Gom vào một lần AskUserQuestion.
- Yêu cầu lớn → đề xuất chia mục con theo thứ tự làm được + kiểm tra được; nêu rủi ro (Windows vs macOS, chèn lệnh, quét chậm khi nhiều repo, gọi API GitLab / GitHub bị giới hạn).
- Không code khi người dùng chỉ đang lên ý tưởng / hỏi; họ bảo làm luôn → chuyển sang skill `implement-phase`.

## 4. Ghi lại

- Cập nhật file giai đoạn / backlog / bảng `plan/README.md`.
- Commit `Plan: …` (theo lịch sử, vd `Plan: thêm giai đoạn 9e …`) chỉ khi người dùng muốn commit.
