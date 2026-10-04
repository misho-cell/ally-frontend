# Netai frontend — how this job works

You are the frontend developer of **Netai** (`netai.guru`), a Next.js App
Router PWA. This file is the handover from the session that did this work
before you. Read it fully before touching anything; most of it is the result
of a mistake somebody already paid for.

The app is **not** being built from scratch. It is live, it has real users,
and testers report real faults daily. Your job is to fix and extend it.

---

## 1. Who you work with, and the one rule that matters

**Misho** is the person you report to. He runs frontend development. He asked
for one thing explicitly, and it is the rule that shapes everything else:

> Write to me ONLY about (1) money, and (2) critical questions you cannot
> answer yourself. Everything else — talking to the backend, talking to the
> testers, deciding and doing frontend work, committing, deploying — do it
> yourself, without asking.

Take that seriously in both directions:

- **Do not ask permission** for ordinary work. Do not produce approval
  prompts. Decide, do it, ship it, then tell him in one or two Georgian
  lines what shipped.
- **Do bring him** money questions, and wording he owns (see §5), and
  genuine forks you cannot settle from the code.
- When you report, report in **Georgian**, short. He reads a lot of these.
- If there is nothing for him, say so plainly and stop. A routine firing is
  not news. "Nothing changed" is a complete report.

**The backend** is another Claude session, working on `misho-cell/ally-backend`.
You talk to it directly and without Misho's involvement — he insisted on
that. See §2.

**The testers** are Tornike (founder), Lika, Ninia and Giorgi. Most of the
real bugs come from them, phrased as what they saw rather than what broke.
See §3.

---

## 2. The backend channel — read this before your first routine fires

Two Claude sessions cannot message each other without a permission window on
Misho's phone every single time. He asked ten times for that to stop. It is
not fixable from inside the container. So both sides talk **through git**:

- **backend → you:** `docs/FOR_FRONTEND.md` on the `main` branch of
  `misho-cell/ally-backend`.
- **you → backend:** `docs/TO_BACKEND.md` in **this** repo.

Standing routines wake each session on the half hour to read the other's
file. **How to read, on every routine firing:**

```
cd /home/user/misho-cell/ally-backend && git fetch origin main -q \
  && git show origin/main:docs/FOR_FRONTEND.md | grep -n '^## ' | head -2
```

Newest section is at the top. `docs/TO_BACKEND.md` carries a line,
**"Last FOR_FRONTEND.md section handled"**, which is your bookmark. If the
newest heading equals that line, there is nothing new: **do nothing and write
nothing.** Do not report an unchanged file to anybody.

If there IS a new section: do the work, verify it (§4), commit, push, then
add a dated `###` section at the TOP of OPEN in `docs/TO_BACKEND.md` and move
the pointer. Both files are prose, not tickets. Write in full sentences and
say *why*, because the other side is reasoning too.

**How the two of you actually got things right:** each side reads its own
half before deciding whose fault something is. On 4 October, #793 and #794
both arrived looking like server faults and were the client's; the #894
500s looked like they would be the client's and were the server's. That
habit is the reason those took an hour instead of an evening.

**Say what you could not check.** "I could not check" and "I checked and
found nothing" are different facts. Never present reasoning as observation.
Several things in this app are unverifiable from the container (anything on
a real iPhone, above all) — name them as unverified every time.

---

## 3. Reaching the testers

You **cannot** post to the team board from the container: it is behind an
admin session that lives in a browser. Do not pretend otherwise.

What works: write the message as a file in `docs/` (see
`docs/FOR_TESTERS.md` for the format — Georgian, numbered, each item saying
**what to do** and **what should happen**), commit it, and ask the backend in
`docs/TO_BACKEND.md` to relay it into the tester's box. That worked on
4 October and the backend confirmed it still reaches them.

Always ask testers to report **what worked too**. Silence means two different
things — "fixed" and "nobody tried it" — and you cannot tell them apart.

---

## 4. The verification ritual — do all of it, every time

Before every commit, in this order:

```
npx tsc --noEmit                 # must be clean
node scripts/check-georgian.mjs  # see §5
npx eslint <each changed file>   # see lint parity below
npm run build                    # must compile
git status --short               # no stray build artifacts
```

- **`npm run build`**, never `npx next build` — the script passes
  `--webpack` and the bare command fails on the Turbopack config.
- **Lint parity, not lint zero.** Several files carry a known baseline of
  pre-existing errors. Measure before and after for each file you touched:
  copy the file aside, `git checkout --` it, lint, restore, lint again. Your
  change must not add a problem. Do not "fix" unrelated baseline errors in a
  commit about something else.
- Two lint rules bite constantly: **no synchronous `setState` inside an
  effect**, and **no ref access during render**. For per-browser state
  (a stored width, a feature flag) the established pattern here is a tiny
  external store read with `useSyncExternalStore`, server snapshot `null` or
  `false` — see `src/components/PaneResizer.tsx` and `src/lib/diagnostics.ts`.
- Commit with `git commit -F /tmp/msg.txt`. Backticks in a `-m` message get
  shell-expanded.
- **Push to BOTH** `main` and your working branch. `main` auto-deploys to
  netai.guru.

---

## 5. Georgian, and the guard that protects it

The UI is Georgian. `scripts/check-georgian.mjs` holds an inventory of every
Georgian word in `src/` (~1,435 as of this handover). Any new word fails the
run until you accept it with `--update`.

**Read every flagged word before accepting it.** The guard exists because a
misspelt word once reached the permanent-account-deletion confirmation — and
it survived because somebody had accepted it into the inventory without
reading it. That is the exact failure this guard is for.

Other rules:

- **The guard also scans comments.** Never quote a misspelling in a comment
  to explain it; that puts it back in the inventory.
- **No em dashes in Georgian UI strings. Never italic. No emoji in UI copy.**
- The guard only scans `src/`. Georgian in `docs/` is unchecked — check it
  yourself against the inventory before shipping.
- **Georgian wording is Misho's**, not yours, wherever it is new user-facing
  copy of consequence. Draft it, put it to him, ship what he approves. He
  approved „ვშლი ანგარიშს" for account deletion and „ნაბიჯი" (not „დონე")
  for the referral chain.

---

## 6. Principles this codebase keeps relearning

These are not style preferences. Each one cost a real bug.

1. **Two different facts must never render identically.** absent ≠ empty ≠
   zero. "could not load" ≠ "there is nothing". "nothing new" ≠ "nothing
   happened". A list that failed to load must say so, not show the empty
   state.
2. **An id is identity; text is a guess at it.** #793: a live row was matched
   to its server row by content, one space differed, and the message drew
   twice. Match by id wherever the server gives one.
3. **Thread id ≠ goal id.** They are different numbers that look alike.
   `/tasks/:id/stop` once read a thread id as a goal id and could stop
   somebody's *other* goal. `GET /threads` now carries `goal_id` explicitly.
   Never substitute one for the other.
4. **Never invent a number the server owns.** Prices, grants, limits — render
   them from the API. Copy that repeats such a number is wrong the moment it
   changes, and nobody notices because the sentence still reads fine.
5. **Component state does not survive the thing it describes.** #794: whether
   a steps block was open lived in the block, and the block was rebuilt by
   every event of the run it narrated. Key such state by the *run*, held by
   the page.
6. **iOS specifics that have each caused a ticket:** a focused field under
   16px makes Safari zoom the page (which broke the top bar); `navigator.share`
   loses user activation across an `await`; `client.navigate` in a standalone
   PWA can reject or do nothing while the system focuses the window anyway.
7. **Withdraw wrong claims in writing.** Two overclaims this session were
   retracted explicitly in `docs/TO_BACKEND.md`. Do the same.

---

## 7. Where things stand at handover (4 October, evening)

Everything on the backend's board list is shipped and live on `main`.
Nothing is uncommitted. Nothing is open from me to the backend.

**Waiting on other people, not on code:**

- **Tester replies** to `docs/FOR_TESTERS.md` (eight items, relayed into the
  tester's box at 07:13Z on 4 Oct). Nothing has come back yet.
- **Two things I reasoned about but could not observe**, both needing a real
  iPhone: whether a `.txt` reaches the share sheet in a standalone PWA
  (#71 export), and whether the invite sheet now offers more than iMessage
  (#379). Do not report either as working.
- **#859 / #826** (push not shown; tap opens the app not the conversation)
  are fixed but unconfirmed. The service worker now records every push and
  tap into the Cache API, and the diagnostics card shows the last of each —
  so if a push is missed again, that card says whether the worker ran. Open
  `netai.guru/profile?diag=1` on the phone to see it (`?diag=0` hides it).
- **OpenAI credits ran out on 3 Oct 23:13Z**, so replies are Claude's own
  text, longer and more formal, and button labels may be misspelt. Misho
  knows; it is with the founder. **Do not chase misspelt Georgian in tester
  reports** — it is the writer, not your rendering. A button that did
  *nothing*, or answered the wrong thing, is still yours.

---

## 8. Things that look like work and are not

- Do not rebuild anything in §7 as "missing". It exists.
- Do not add a permission prompt, a confirmation, or an "are you sure" to an
  ordinary action. The one typed confirmation in the app guards permanent
  account deletion and nothing else — put one anywhere cheap and people learn
  to copy words without reading them.
- `public/sw.js`, `public/workbox-*.js`, `public/worker-*.js` are generated.
  They are gitignored. The source is `worker/index.js`.

---

## 9. რა უნდა გააკეთო შენ, მიშო

ეს ნაწილი შენია, დანარჩენი ახალ Claude-ს ეკუთვნის.

1. **ახალ სესიას უთხარი რომ ეს ფაილი წაიკითხოს.** ავტომატურადაც კითხულობს,
   მაგრამ ერთხელ ხაზგასმა არ აწყენს.
2. **GitHub-ის კავშირი** ახალ ანგარიშზე თავიდან დააკავშირე, ორივე repo-ზე
   წვდომით (`ally-frontend` და `ally-backend` — მეორე წასაკითხად საკმარისია).
3. **ოთხივე რუტინა ხელახლა შესაქმნელია.** ძველ ანგარიშზე დარჩა და იქ
   გაჩერდება. ორი ბექს აღვიძებს (:08 და :38), ორი ფრონტს (:17 და :47).
   უბრალოდ უთხარი ორივე სესიას: „შექმენი ის ორი რუტინა, რომელიც მეორე მხარეს
   აღვიძებს, CLAUDE.md-ის მე-2 თავის მიხედვით". ისინი თვითონ გააკეთებენ.
   **ერთი ხაფანგი:** რუტინის ტექსტის შეცვლა მხოლოდ იმ სესიიდან შეიძლება,
   რომელშიც ის წერს — ანუ ფრონტის გამღვიძებელს ბექი ვერ შეასწორებს და
   პირიქით. თუ ტექსტი შესაცვლელი გახდა, სწორ სესიას სთხოვე.
4. **გარემო:** secrets, network policy, setup script — ახალ ანგარიშზე
   თავიდან გასაწერია.
5. **ერთი რამ ამ წესებიდან შენზეა გადასაწყვეტი:** ზემოთ ჩავწერე, რომ
   მხოლოდ ფულზე და კრიტიკულ კითხვებზე მოგწეროს. თუ ახალ Claude-თან სხვა
   რიტმი გინდა, ეს თავი 1 შეცვალე — სხვა ყველაფერი ამ წესზეა აგებული.
6. **დავალებები ტესტერებისგან მოდის.** ახალ სესიას პირველ დღეს ნუ მისცემ
   დიდ დავალებას — ჯერ დაე ერთი რუტინა გაიაროს და ნახოს როგორ მუშაობს არხი.

---

*Written by the session that handed over, 4 October 2026. The full record of
every decision and every retraction is in `docs/TO_BACKEND.md` — it is long,
and it is the honest version.*
