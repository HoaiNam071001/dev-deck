/**
 * Ghi chú phát hành, bản mới nhất ở đầu. Khi release: thêm một mục có `version` đúng số sắp phát hành
 * (scripts/release.sh sẽ từ chối nếu thiếu). Người dùng mở app lên bản mới sẽ thấy modal "Có gì mới".
 */
export type NoteTag = 'new' | 'improve' | 'fix'
export interface ReleaseNote { version: string; date: string; title: string; items: { tag: NoteTag; text: string }[] }

export const RELEASE_NOTES: ReleaseNote[] = [
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
