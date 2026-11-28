# 10 — Git: stash, worktree, diff theo hunk, thao tác hàng loạt

Mục tiêu: làm trọn vòng việc Git hằng ngày trong DevDeck, không phải mở terminal: cất / lấy lại thay đổi, làm song song nhiều nhánh bằng worktree, xem diff và stage từng phần, dọn và cập nhật nhiều repo một lần.

Giữ nguyên nguyên tắc ở [README.md](README.md): lệnh đọc ở `server/git.js`, lệnh ghi ở `server/git-actions.js` (mỗi lệnh một hàm), `execFile` không qua shell, chỉ repo đã quét, thao tác phá hủy có dry-run + gõ lại tên, ghi `data/audit.log`.

## 10a — Quản lý stash

Hiện tại: `repoDetail` chỉ đếm `git stash list` (`stashes: number`), giao diện hiện "N stash".

- [x] Đọc: `git stash list --format=%gd%x00%gs%x00%ci` → `stashes: { ref, message, at, branch }[]`; số tệp mỗi stash bằng `git stash show --numstat <ref>` khi mở ra
- [x] Tab "Stash" trong `RepoDetail`: danh sách, bấm để xem tệp + diff (dùng chung viewer ở 10c)
- [x] Ghi: `stash` (kèm message, tùy chọn `--include-untracked`), `stash apply`, `stash pop`, `stash drop`
- [x] `drop` cần xác nhận (không khôi phục được); `pop` bị conflict thì báo rõ, giữ stash lại (git tự giữ)
- [x] Nút "Stash rồi chuyển" khi checkout bị chặn vì còn thay đổi (thay cho thông báo "commit hoặc stash trước")
- [x] Kiểm `ref` dạng `stash@{N}` bằng regex chặt trước khi đưa vào lệnh
- [x] Test trong `server/git-test.js`: tạo stash, apply, pop có conflict, drop

## 10b — Git worktree

Hợp khi chạy nhiều phiên Claude Code / dev server song song trên cùng một repo.

- [x] Đọc: `git worktree list --porcelain` → `worktrees: { path, branch, head, locked, prunable }[]` trong `repoDetail`
- [x] Bộ quét (`listRepos`) nhận ra worktree (`.git` là **tệp** `gitdir: …`, không phải thư mục) và gom vào repo chính thay vì hiện thành repo riêng; danh sách repo có chip "N worktree"
- [x] Tab "Worktree" trong `RepoDetail`: đường dẫn, nhánh, trạng thái sạch/bẩn, nút mở VS Code / Terminal / Explorer (IPC hiện có, thêm đường dẫn worktree vào whitelist `knownRepo`)
- [x] Ghi: `worktree add <path> -b <nhánh mới>` hoặc từ nhánh có sẵn; đường dẫn mặc định `<repo>-wt/<nhánh>` và phải nằm trong thư mục quét
- [x] Ghi: `worktree remove` (dry-run: còn thay đổi chưa commit thì cảnh báo, cần tick "vẫn xóa" mới thêm `--force`), `worktree prune`
- [x] Tab Job: job chạy trong worktree hiện tên nhánh của worktree đó (đã có `branchOf(dir)`, kiểm lại với `.git` dạng tệp)
- [x] Test: tạo worktree trên repo tạm, xóa sạch / xóa khi bẩn, prune

## 10c — Diff từng tệp, stage theo hunk

Hiện tại: tab Thay đổi có ô tick stage cả tệp và số dòng +/− (`numstat`), chưa xem được nội dung diff.

- [x] API đọc `GET /api/git/diff?path=&file=&kind=staged|unstaged|untracked|stash[&ref=]` (thay cho staged=0|1 để dùng chung với diff trong stash) → `git diff [--cached] --no-color -U3 -- <file>`; tệp untracked dùng `git diff --no-index /dev/null <file>`
- [x] Server tách diff thành hunk `{ header, lines, hash }`; giới hạn kích thước (ví dụ > 500 KB hoặc tệp nhị phân thì chỉ báo, không hiện)
- [x] Viewer diff: cột số dòng cũ/mới, màu +/−, gập hunk, chế độ unified (side-by-side để sau); font JetBrains Mono đã có
- [x] Stage / bỏ stage **từng hunk**: client chỉ gửi `file + hash của hunk`; server tự tạo lại diff, tìm hunk theo hash, dựng patch rồi `git apply --cached` (unstage: `--reverse`). Không nhận patch tùy ý từ giao diện
- [x] Hash không còn khớp (tệp đã đổi) → từ chối, tải lại diff
- [ ] (Tùy chọn) Bỏ thay đổi một hunk (`git apply --reverse` vào working tree): cần xác nhận, ghi audit
- [x] Phím tắt: ↑↓ chọn tệp, `s` stage hunk, `u` bỏ stage hunk, `]` / `[` hunk kế / trước
- [x] Test: tách hunk (hàm thuần parseDiff ở server/git-diff.js, test trong server/git-test.js; đánh số dòng ở src/lib/diff.ts, test vitest), stage một hunk trong tệp có 2 hunk rồi kiểm `git diff --cached`

## 10d — Thao tác hàng loạt

Hiện tại: đã có "Fetch tất cả" (Command Palette).

- [x] "Pull tất cả": chỉ chọn repo **sạch**, có upstream, `behind > 0`, `ahead = 0`; chạy `pull --ff-only` song song (pool 4–8); repo không đủ điều kiện liệt kê kèm lý do và bỏ qua
- [x] "Dọn nhánh đã merge": mỗi repo `git branch --merged <nhánh mặc định>`, loại nhánh hiện tại, nhánh mặc định, nhánh có worktree đang dùng
- [x] Dry-run bắt buộc: bảng repo × nhánh sẽ xóa, bỏ tick từng dòng được; xác nhận bằng cách gõ số nhánh; xóa bằng `-d` (không bao giờ `-D` ở chế độ hàng loạt)
- [ ] (Tùy chọn) Nhánh remote đã merge: chỉ liệt kê và chép lệnh, không tự xóa (giống tab Branches của Remotes)
- [x] Chọn phạm vi: tất cả repo / repo đang lọc (trong hộp thoại)
- [x] Phạm vi "repo đã tick": menu "⋯" › "Chọn nhiều repo…" bật ô tick trong `RepoList`; hộp thoại có thêm phạm vi "Repo đã tick"
- [x] Bảng kết quả theo từng repo (ok / bỏ qua / lỗi + thông báo); mỗi repo ghi một dòng audit
- [x] Lệnh trong Command Palette + menu "⋯" ở thanh công cụ trang Git
- [x] Test: 3 repo tạm (sạch-behind, bẩn, ahead) → pull tất cả chỉ đụng repo đầu; dọn nhánh không xóa nhánh chưa merge

Ghi chú 10d (đã làm): `server/git-bulk.js`, route `POST /api/git/bulk` (pullPlan/pullRun/cleanupPlan/cleanupRun); bước chạy kiểm tra lại điều kiện từng repo, cleanup chỉ xóa nhánh vẫn "đã merge" lúc chạy, luôn `-d`. Nhánh trùng đầu nhánh mặc định (mới tạo chưa commit) không coi là đã merge. UI: `BulkDialog`, menu "⋯" trên thanh công cụ Git + Command Palette. Chưa kiểm bằng mắt.

Ghi chú 10b (đã làm): worktree phụ được nhận ra bằng .git/worktrees/<tên>/gitdir của repo chính (không spawn git) nên cũng bắt được worktree nằm ngoài thư mục quét; chỉ ẩn khỏi danh sách khi repo chính có trong danh sách. Worktree được thêm vào whitelist của knownRepo (mở VS Code / Terminal / Explorer). Job chạy trong worktree thành nhóm riêng, hiện đúng nhánh. Xóa worktree không xóa nhánh; worktree bị khóa hoặc đã mất thì chặn (dùng prune).

Ghi chú 10a / 10c (đã làm): diff nằm ngay dưới tên tệp trong tab Thay đổi (khung chi tiết hẹp nên không mở khung riêng). Tệp untracked chỉ xem, stage cả tệp. Tệp không phải UTF-8 / nhị phân / > 500 KB: chỉ stage cả tệp. Hash hunk = sha1(tiêu đề + dòng) nên đổi khi hunk khác được stage; giao diện tải lại diff sau mỗi thao tác. Chưa kiểm bằng mắt.

## Tiêu chí xong

- Stash, worktree, hunk, hàng loạt đều làm được bằng chuột và bàn phím, kết quả khớp `git status` / `git stash list` / `git worktree list` chạy tay.
- Không thao tác nào nhận chuỗi lệnh hoặc patch tùy ý từ giao diện.
- `npm run test:server` có test cho từng nhóm.

## Rủi ro

- **Hunk lệch**: tệp đổi giữa lúc xem và lúc stage → dùng hash hunk, lệch thì từ chối.
- **CRLF trên Windows**: `git apply` có thể lỗi khi `core.autocrlf` bật → dựng patch từ chính output `git diff` (không chỉnh khoảng trắng), thêm `--whitespace=nowarn`, test trên repo có CRLF.
- **Worktree bị quét thành repo riêng**: cần đổi logic quét, kiểm số repo trước/sau.
- **Hàng loạt trên nhiều repo**: lỗi một repo không được dừng cả lượt; đặt timeout cho từng repo.
