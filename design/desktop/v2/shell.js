/* DevDeck v2: dựng khung app (thanh tiêu đề, thanh icon, thanh trạng thái, toast, bảng lệnh) quanh nội dung trang.
   Trang gọi DD.mount({ page, status, commands }) sau khi có <div class="win"><div class="content">…</div></div>. */
(function () {
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    ai: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    git: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10"/><path d="M18 10c0 4-6 3-11.3 7.4"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3"/><path d="M13 15h4"/>',
    merge: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v10"/><path d="M6 7c0 6 12 4 12 10"/>',
    ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
    dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    pin: '<path d="M9 3h6l-1 6 4 3v2H6v-2l4-3z"/><path d="M12 14v7"/>',
    code: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m14 5-4 14"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    sort: '<path d="M7 4v16"/><path d="m4 7 3-3 3 3"/><path d="M17 20V4"/><path d="m14 17 3 3 3-3"/>',
    up: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>', down: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
    check: '<path d="m5 12 5 5 9-10"/>', play: '<path d="M7 5v14l11-7z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    ext: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    branch: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 8v8"/><path d="M18 11c0 3-4 3-10.5 5.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    modal: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="7" y="8" width="10" height="8" rx="1"/>',
  }
  const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const COLORS = ['#5AA9F5', '#F2A65A', '#B18CF2', '#30CF43', '#F78C8C', '#7DD3C0', '#E6C86E']
  const avColor = (n) => COLORS[[...String(n)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
  const av = (n, size = 22) => n ? `<span class="av" style="background:${avColor(n)};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px" title="${esc(n)}">${esc(n.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase())}</span>` : `<span class="av" style="background:var(--raised);color:var(--fg-mute);border:1px dashed var(--border-pop);width:${size}px;height:${size}px">?</span>`
  const $ = (s, r = document) => r.querySelector(s)
  const short = (n) => n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K' : String(n)

  const PAGES = [
    { id: 'home', file: 'Home.html', label: 'Tổng quan', icon: 'home' },
    { id: 'ai', file: 'AI.html', label: 'AI', icon: 'ai' },
    { id: 'git', file: 'Git.html', label: 'Git', icon: 'git', badge: '3' },
    { id: 'jobs', file: 'Jobs.html', label: 'Job', icon: 'terminal', badge: '2', red: false },
    { id: 'remotes', file: 'Remotes.html', label: 'Remotes', icon: 'merge', badge: '4' },
    { id: 'jira', file: 'Jira.html', label: 'Jira', icon: 'ticket', badge: '3' },
  ]
  const MOD = /Mac|iPhone/.test(navigator.platform) ? '⌘' : 'Ctrl+'

  function toast(title, detail = '', opts = {}) {
    const el = document.createElement('div')
    el.className = 'toast ' + (opts.kind || '')
    el.innerHTML = `<div style="flex:1;min-width:0"><b>${esc(title)}</b>${detail ? `<div class="d">${esc(detail)}</div>` : ''}${opts.actions ? `<div class="acts">${opts.actions}</div>` : ''}</div><button class="icon-btn" style="width:22px;height:22px;align-self:flex-start" aria-label="Đóng">${icon('x', 'sm')}</button>`
    el.querySelector('button.icon-btn').onclick = () => el.remove()
    el.addEventListener('click', (e) => { if (e.target.closest('.acts button')) el.remove() })
    $('.toasts').prepend(el)
    setTimeout(() => el.remove(), opts.ms || (opts.actions ? 8000 : 3200))
  }

  // Màu chính (nút, mục đang chọn, tab): tách khỏi xanh lá dùng cho trạng thái "sạch / qua"
  const THEMES = {
    indigo: ['Chàm', '#8B93FF', '#A7ADFF', '#11143A', 'rgba(139,147,255,.16)'],
    teal: ['Ngọc', '#2CC8B4', '#52DCCB', '#062824', 'rgba(44,200,180,.15)'],
    amber: ['Hổ phách', '#F0B53C', '#F6C866', '#2A1D04', 'rgba(240,181,60,.15)'],
    green: ['Xanh lá (cũ)', '#30CF43', '#5EE070', '#0C1A0E', 'rgba(48,207,67,.14)'],
  }
  function theme(id) {
    const t = THEMES[id] || THEMES.indigo, r = document.documentElement.style
    r.setProperty('--primary', t[1]); r.setProperty('--primary-hover', t[2]); r.setProperty('--on-primary', t[3]); r.setProperty('--primary-soft', t[4])
    document.querySelectorAll('.swatches button').forEach((b) => b.classList.toggle('on', b.dataset.theme === id))
  }

  function mount({ page, status = '', commands = [] }) {
    const cur0 = load('theme', 'indigo'); theme(cur0)
    const win = $('.win')
    const content = $('.content', win)
    const cur = PAGES.find((p) => p.id === page)
    document.title = `DevDeck · ${cur.label} (thiết kế v2)`
    win.insertAdjacentHTML('afterbegin', `<div class="titlebar"><div class="lights"><i></i><i></i><i></i></div><span class="t">DevDeck · <b>${cur.label}</b></span><div class="cmdk" id="cmdk">${icon('search', 'sm')}Tìm lệnh, repo, ticket, trang…<kbd>${MOD}K</kbd></div><span class="spacer"></span></div>`)
    const shell = document.createElement('div'); shell.className = 'shell'
    shell.innerHTML = `<nav class="apprail" aria-label="Trang">${PAGES.map((p, i) => `<a href="${p.file}" class="${p.id === page ? 'on' : ''}" aria-label="${p.label}">${icon(p.icon)}${p.badge ? `<span class="b ${p.red ? 'red' : ''}">${p.badge}</span>` : ''}<span class="tip">${p.label}<kbd>${MOD}${i + 1}</kbd></span></a>`).join('')}<span class="grow"></span><a href="#" aria-label="Cài đặt" onclick="return false">${icon('settings')}<span class="tip">Cài đặt<kbd>${MOD},</kbd></span></a></nav>`
    content.replaceWith(shell); shell.appendChild(content)
    win.insertAdjacentHTML('beforeend', `<div class="statusbar" id="statusbar">${status}</div><div class="toasts"></div>
      <div class="palette-back" id="palBack"></div>
      <div class="palette" id="pal" role="dialog" aria-label="Bảng lệnh"><input id="palQ" placeholder="Gõ để tìm lệnh, trang…" autocomplete="off"><div class="list" id="palList"></div></div>`)
    const note = $('.note')
    if (note) note.insertAdjacentHTML('beforeend', `<span class="swatches"><b>Màu chính:</b>${Object.entries(THEMES).map(([id, t]) => `<button data-theme="${id}" class="${id === cur0 ? 'on' : ''}" aria-label="Màu chính: ${t[0]}"><i style="background:${t[1]}"></i>${t[0]}</button>`).join('')}<a href="Colors.html">So sánh 4 màu →</a></span>`)
    document.querySelectorAll('.swatches button').forEach((b) => (b.onclick = () => { save('theme', b.dataset.theme); theme(b.dataset.theme); toast('Màu chính: ' + THEMES[b.dataset.theme][0], 'Đã nhớ cho mọi trang') }))
    if (note) note.insertAdjacentHTML('beforeend', `<span class="pages">${PAGES.map((p) => `<a href="${p.file}" class="${p.id === page ? 'on' : ''}">${p.label}</a>`).join('')}</span>`)

    // Bảng lệnh
    const all = [...PAGES.map((p, i) => ({ g: 'Đi tới', label: p.label, key: MOD + (i + 1), run: () => (location.href = p.file) })), ...commands.map((c) => ({ g: 'Trang này', ...c }))]
    let sel = 0, shown = all
    const draw = () => {
      let g = ''
      $('#palList').innerHTML = shown.map((c, i) => `${c.g !== g ? `<div class="g">${(g = c.g)}</div>` : ''}<div class="it ${i === sel ? 'on' : ''}" data-i="${i}">${esc(c.label)}${c.key ? `<kbd>${esc(c.key)}</kbd>` : ''}</div>`).join('') || '<div class="empty" style="padding:20px">Không có lệnh khớp</div>'
    }
    const open = (on) => { $('#pal').classList.toggle('open', on); $('#palBack').classList.toggle('open', on); if (on) { $('#palQ').value = ''; shown = all; sel = 0; draw(); setTimeout(() => $('#palQ').focus(), 10) } }
    const run = (c) => { open(false); c && c.run() }
    $('#cmdk').onclick = () => open(true)
    $('#palBack').onclick = () => open(false)
    $('#palQ').oninput = (e) => { const q = e.target.value.toLowerCase(); shown = all.filter((c) => c.label.toLowerCase().includes(q)); sel = 0; draw() }
    $('#palQ').onkeydown = (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); draw(); e.preventDefault() }
      if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault() }
      if (e.key === 'Enter') run(shown[sel])
      if (e.key === 'Escape') open(false)
    }
    $('#palList').onclick = (e) => { const it = e.target.closest('[data-i]'); if (it) run(shown[+it.dataset.i]) }
    // Panel trái của mọi trang kéo đổi độ rộng được, nhớ riêng từng trang
    const side = $('.side', win)
    if (side) resizable(side, { key: 'side.' + page, edge: 'right', min: 170, max: 340, def: 216 })
    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); open(!$('#pal').classList.contains('open')) }
      if (mod && /^[1-6]$/.test(e.key)) { e.preventDefault(); location.href = PAGES[+e.key - 1].file }
    })
  }

  // Menu nổi dùng chung: DD.menu(anchor, [{label, run, danger, key} | 'sep'])
  function menu(anchor, items) {
    document.querySelectorAll('.menu.dd').forEach((m) => m.remove())
    const win = $('.win'), r = anchor.getBoundingClientRect(), w = win.getBoundingClientRect()
    const m = document.createElement('div'); m.className = 'menu dd open'
    m.innerHTML = items.map((it, i) => it === 'sep' ? '<hr>' : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${esc(it.label)}${it.key ? `<kbd>${it.key}</kbd>` : ''}</button>`).join('')
    win.appendChild(m)
    const left = Math.min(r.right - w.left - m.offsetWidth, w.width - m.offsetWidth - 8)
    m.style.left = Math.max(8, left) + 'px'; m.style.top = (r.bottom - w.top + 4) + 'px'
    m.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) { m.remove(); items[+b.dataset.i].run?.() } }
    setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off) } }), 0)
  }

  // Nhớ cài đặt giao diện trên máy (có thể bị chặn trong cửa sổ riêng tư: bỏ qua)
  const load = (k, d) => { try { const v = localStorage.getItem('devdeck.' + k); return v === null ? d : JSON.parse(v) } catch { return d } }
  const save = (k, v) => { try { localStorage.setItem('devdeck.' + k, JSON.stringify(v)) } catch { /* bỏ qua */ } }

  /** Kéo đổi độ rộng một panel; edge = cạnh có tay kéo ('right' cho panel trái, 'left' cho khung chi tiết). Nhớ theo key. */
  function resizable(el, { key, edge = 'right', min = 160, max = 640, def }) {
    def = def ?? el.getBoundingClientRect().width
    const apply = (w) => { el.style.width = Math.round(Math.max(min, Math.min(max, w))) + 'px' }
    apply(load('w.' + key, def))
    el.classList.add('rzable')
    const h = document.createElement('div')
    h.className = 'rz ' + edge; h.tabIndex = 0; h.setAttribute('role', 'separator'); h.setAttribute('aria-orientation', 'vertical')
    h.title = 'Kéo để đổi độ rộng · nhấp đúp để về mặc định'
    el.appendChild(h)
    const commit = () => save('w.' + key, el.getBoundingClientRect().width)
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault(); const x0 = e.clientX, w0 = el.getBoundingClientRect().width
      document.body.classList.add('resizing'); h.classList.add('drag')
      const move = (ev) => apply(w0 + (edge === 'right' ? ev.clientX - x0 : x0 - ev.clientX))
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); h.classList.remove('drag'); commit() }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    })
    h.addEventListener('dblclick', () => { apply(def); commit(); toast('Đã về độ rộng mặc định', Math.round(def) + 'px') })
    h.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0
      if (d) { e.preventDefault(); apply(el.getBoundingClientRect().width + (edge === 'right' ? d : -d)); commit() }
    })
  }

  /** Khung chi tiết đổi được giữa panel bên phải và cửa sổ nổi; nhớ lựa chọn theo key. */
  function dock(el, { key, onClose, def = 'panel' }) {
    const home = el.parentNode
    const back = document.createElement('div'); back.className = 'back dock'
    const box = document.createElement('div'); box.className = 'modal lg dockbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true')
    back.appendChild(box); $('.win').appendChild(back)
    let mode = load('mode.' + key, def)
    const apply = () => {
      if (mode === 'modal') { box.appendChild(el); el.classList.add('in-modal') }
      else { home.appendChild(el); el.classList.remove('in-modal'); back.classList.remove('open') }
    }
    const api = {
      get mode() { return mode },
      set(m) { mode = m; save('mode.' + key, m); apply(); if (m === 'modal') back.classList.add('open'); toast(m === 'modal' ? 'Chi tiết mở dạng cửa sổ nổi' : 'Chi tiết hiện ở khung bên phải', 'Đã nhớ lựa chọn') },
      toggle() { api.set(mode === 'modal' ? 'panel' : 'modal') },
      open() { if (mode === 'modal') back.classList.add('open') },
      close() { back.classList.remove('open'); onClose && onClose() },
      get isOpen() { return mode === 'panel' || back.classList.contains('open') },
      /** Nút chuyển chế độ + nút đóng, đặt ở đầu khung chi tiết. */
      buttons() {
        return `<button class="icon-btn" data-dock-toggle title="${mode === 'modal' ? 'Chuyển sang khung bên phải' : 'Chuyển sang cửa sổ nổi'}">${icon(mode === 'modal' ? 'panel' : 'modal')}</button>` +
          `<button class="icon-btn" data-dock-close title="Đóng (Esc)">${icon('x')}</button>`
      },
    }
    back.addEventListener('click', (e) => { if (e.target === back) api.close() })
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-dock-toggle]')) { e.stopPropagation(); api.toggle(); onToggle && onToggle() }
      else if (e.target.closest('[data-dock-close]')) { e.stopPropagation(); api.close() }
    })
    let onToggle = null
    api.onToggle = (f) => (onToggle = f)
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && back.classList.contains('open') && !e.target.matches('input,textarea')) api.close() })
    apply()
    return api
  }

  window.DD = { icon, esc, av, avColor, toast, mount, menu, short, MOD, $, load, save, resizable, dock }
})()
