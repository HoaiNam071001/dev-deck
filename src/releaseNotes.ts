/**
 * Ghi chú phát hành, bản mới nhất ở đầu. Khi release: thêm một mục có `version` đúng số sắp phát hành
 * (scripts/release.sh sẽ từ chối nếu thiếu). Người dùng mở app lên bản mới sẽ thấy modal "Có gì mới".
 */
export type NoteTag = 'new' | 'improve' | 'fix'
export interface ReleaseNote { version: string; date: string; title: string; items: { tag: NoteTag; text: string }[] }

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '2.3.1',
    date: '2026-11-27',
    title: 'Sửa giao diện modal "Có gì mới"',
    items: [
      { tag: 'fix', text: 'Nút "Đã hiểu" dính đáy modal, không còn khoảng trống bên dưới khi nội dung ngắn.' },
      { tag: 'improve', text: 'Chữ mô tả từng mục dịu hơn, dễ phân biệt với tiêu đề phiên bản.' },
    ],
  },
  {
    version: '2.3.0',
    date: '2026-11-27',
    title: 'Chuyển trang nhanh hơn, nhớ bộ lọc, chu kỳ làm mới',
    items: [
      { tag: 'new', text: 'Dữ liệu được cache: quay lại trang là hiện ngay, rồi làm mới ngầm nếu đã cũ (Git, Token AI, Jobs, Remotes…).' },
      { tag: 'new', text: 'Thanh trạng thái hiện lúc tải gần nhất, thời gian tải và dropdown chọn chu kỳ tự làm mới (tắt, 10 giây đến 10 phút) cho từng trang.' },
      { tag: 'improve', text: 'Bộ lọc nhiều lựa chọn (phạm vi, nhóm theo ở Remotes; nhà cung cấp, khoảng thời gian ở Token AI) chuyển sang dropdown.' },
      { tag: 'improve', text: 'Nhớ thêm lựa chọn qua trang và lần mở app: khoảng thời gian / dự án Token AI, root và tab ở Git, thư mục lọc ở Jobs, ô tìm Remotes.' },
      { tag: 'fix', text: 'Bản đóng gói dùng cổng cố định nên ghim và bộ lọc không còn mất sau khi đóng app.' },
      { tag: 'fix', text: 'Chạy từ mã nguồn không còn đụng bản đã cài đang mở (userData, dữ liệu và cổng riêng).' },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-11-27',
    title: 'Remotes: pipeline, thông báo và thao tác ghi',
    items: [
      { tag: 'new', text: 'Tab Pipelines: pipeline GitLab / workflow run GitHub Actions gần nhất, xem job theo stage, job lỗi kèm đoạn cuối log (GitLab).' },
      { tag: 'new', text: 'Thông báo khi MR / PR của bạn có comment mới, pipeline lỗi, conflict, hoặc có MR mới cần bạn review.' },
      { tag: 'new', text: 'Thao tác ghi (tắt mặc định, bật bằng nút ✎ ở account): resolve và trả lời thread, approve, merge, tạo MR / PR từ nhánh, chạy lại job lỗi. Mọi thao tác ghi vào data/audit.log.' },
      { tag: 'new', text: 'Chi tiết MR / PR có thêm card "Chạy ở máy này": đối chiếu job test đang chạy ở local với trạng thái CI cùng nhánh.' },
      { tag: 'new', text: 'Phạm vi "Tất cả" xem cả MR / PR của người khác trong các project bạn tham gia, và là phạm vi mặc định.' },
      { tag: 'improve', text: 'Danh sách project cố định, sắp xếp theo tên; ghim và ẩn ngay trong danh sách, project đã ẩn nằm ở nút dính cuối panel trái.' },
      { tag: 'improve', text: 'Đổi bộ lọc không còn làm mất project đang chọn; lựa chọn project được nhớ lại sau khi mở app.' },
    ],
  },
]

const parts = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0)
/** So sánh số phiên bản dạng X.Y.Z: âm nếu a < b. */
export function cmpVersion(a: string, b: string): number {
  const x = parts(a), y = parts(b)
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

/**
 * Các mục cần hiện khi mở phiên bản `current`: mọi bản trong khoảng (seen, current].
 * Chưa có `seen` (lần đầu / bản cũ chưa có tính năng này) thì chỉ hiện đúng bản hiện tại.
 */
export function notesToShow(current: string, seen: string | null, notes: ReleaseNote[] = RELEASE_NOTES): ReleaseNote[] {
  return notes.filter((n) => cmpVersion(n.version, current) <= 0 && (seen ? cmpVersion(n.version, seen) > 0 : n.version === current))
}
