// Ước lượng thời gian làm một ticket từ thời điểm các commit của chính mình trên nhánh của ticket (kiểu git-hours).
const GAP = 2 * 3600       // hai commit cách nhau quá 2 giờ thì coi là hai phiên làm việc
const FIRST = 30 * 60      // commit đầu của mỗi phiên: cộng thêm 30 phút làm trước đó
const STEP = 15 * 60       // làm tròn lên 15 phút

/** `times`: unix giây của các commit. Trả { seconds, commits, sessions }; seconds giới hạn 1 phút – 24 giờ (khoảng Jira nhận). */
function estimate(times) {
  const t = [...new Set(times.filter((x) => Number.isFinite(x)))].sort((a, b) => a - b)
  if (!t.length) return { seconds: 0, commits: 0, sessions: 0 }
  let secs = 0, sessions = 1
  secs += FIRST
  for (let i = 1; i < t.length; i++) {
    const d = t[i] - t[i - 1]
    if (d > GAP) { sessions++; secs += FIRST } else secs += d
  }
  secs = Math.min(86400, Math.max(STEP, Math.ceil(secs / STEP) * STEP))
  return { seconds: secs, commits: t.length, sessions }
}

module.exports = { estimate }
