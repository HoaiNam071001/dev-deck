// DevDeck: tự thêm reporter tiến độ khi chạy "vitest run" (được nạp qua NODE_OPTIONS=--require=<file này>).
// - Lệnh chưa có cờ --reporter: thêm "--reporter=default --reporter=devdeck-reporter".
// - Lệnh đã có --reporter (vd. verbose, dot, json): GIỮ nguyên và chỉ thêm "--reporter=devdeck-reporter" (vitest chạy nhiều reporter song song).
// - Chỉ thêm khi project tìm thấy gói devdeck-reporter (cài ở thư mục chung phía trên project); nếu không thì để nguyên.
// - Không bao giờ được làm hỏng tiến trình Node.
try {
  const a = process.argv
  const script = String(a[1] || '').replace(/\\/g, '/')
  if (/\/vitest(\.mjs)?$/i.test(script) && a.includes('run') && !process.env.DEVDECK_NO_REPORTER) {
    // Giá trị các cờ reporter: --reporter=x · --reporter x
    const given = []
    a.forEach((x, i) => {
      if (/^--reporter=/.test(x)) given.push(x.slice(11))
      else if (x === '--reporter' && a[i + 1]) given.push(a[i + 1])
    })
    if (!given.some((v) => /devdeck-reporter/.test(v))) {
      try {
        require.resolve('devdeck-reporter', { paths: [process.cwd()] })
        if (given.length === 0) a.push('--reporter=default')
        a.push('--reporter=devdeck-reporter')
      } catch { /* project này chưa có gói: bỏ qua */ }
    }
  }
} catch { /* bỏ qua */ }
