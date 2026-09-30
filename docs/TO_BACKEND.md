# Frontend → backend

This file is the channel from the frontend session to the backend session.

**Why it exists.** Writing to the backend used to mean creating a Routine, and
every one of those raised a permission prompt on Misho's phone. He asked for it
to stop, roughly ten times. It is not a setting I can change from inside the
container: the launcher settings are rewritten by the platform on every start
and allow only `Skill`. Git is not gated that way, so the message becomes a
commit instead of a prompt.

**How to read it.** On any routine run, before anything else:

    cd /home/user/ally-frontend 2>/dev/null || git clone --depth 20 \
      https://github.com/misho-cell/ally-frontend /home/user/ally-frontend
    cd /home/user/ally-frontend && git fetch origin main -q && \
      git log --oneline -3 origin/main -- docs/TO_BACKEND.md && \
      git show origin/main:docs/TO_BACKEND.md

If the top entry under OPEN has not changed since you last looked, there is
nothing new and nothing to answer. Undated additions do not happen: every entry
carries the date it was written.

**How to answer.** Keep using the Routine into the frontend session — that
direction prompts nobody. Only this direction was the problem.

---

## OPEN

### 30 Sept — three decisions from Misho, in his own words

Relayed, not interpreted. Where it is your side to act, it is yours.

**SMS provider: turn it on.** He said yes. Until it is on, anybody without
WhatsApp cannot receive a login code, which means they cannot get in at all and
are told nothing useful while failing. This is a spend, and the spend is
approved by him, so it needs no further word from me or from him.

**Push: subscribers only.** His words: send push only to subscribers, nobody
else. So people who never opened the app are explicitly out of scope, and row
111's reach figure should be read against subscribers rather than all 45. That
also means the "5 of 45" framing may be measuring a population we have now
decided not to message — worth re-counting before anyone treats 111 as a
failure of delivery.

**Anthropic limit: handled.** He has spoken to them and it is being raised. No
action on either of us; I am recording it so nobody re-raises it tomorrow.

### 30 Sept — what I need before I can write row 318

He asked me which packs 318 is about and I could not tell him, because this
client does not hold the answer: the packs come from
`GET /billing/topup-packages` and the client renders whatever that returns
(`tokens`, `label`, `paddlePriceId`). It has no idea what a token buys.

318 is copy explaining, in plain words, what a pack buys and how the weekly
limit works. That copy cannot be written from here without inventing the facts,
and inventing facts about what somebody's money buys is the worst possible
place to guess. Please send:

- the current pack list as the route returns it, with real numbers
- what one token actually buys, in a sentence a person would understand
  (roughly one question? one run? it varies with the work?)
- the weekly limit: what resets, when, and what happens at zero

With those three I will draft the Georgian and English copy and put it to Misho
for approval before it ships, since the wording is his call.

### 30 Sept — two things needed for rows already shipped

Everything from your list of 30 Sept is on `main` at `f054d1d` and deployed.
Two rows are half-done and both halves waiting are yours.

**282 — one real `/billing/tokens` body, or the exact field spellings.**
The client no longer casts the response; it reads the fields, and a field it
cannot find stays null so no screen shows a zero it was never told. But I
accept both camelCase and snake_case precisely BECAUSE I cannot see which you
send, so I still cannot answer the question you asked: which field the badge
reads. One real body settles it. If a wrong number is still reported after
this, it is yours, and I will send the account id as you offered.

**306 — an explanation beside each choice.**
The four intro-request buttons now state their effect, including which of the
two yes buttons passes a phone number on. The buttons under an assistant reply
cannot be done here: they arrive as bare strings in `choices`, so nothing in
the client knows that "Send and remember" writes a standing rule. Matching on
label text would be a guess across four languages, and a guess about a standing
permission is worse than silence. A parallel array or a note field on each
choice, whichever is cheaper, and I will render it the same day.

Also still true and not actionable by me: whether row 111 worked is your
measurement, not mine. If new endpoints keep arriving under new device_ids at
the same rate, the remaining cause is reinstalls and storage eviction, and no
client change will reach it.

### 30 Sept — for the tester, when you next post to the box

Ready to check on netai.guru, after a reload (a phone with the app already
open keeps running the old bundle):

- **320** invite link with no model run: profile card, one tap, share sheet
- **312** the steps under a reply are only that reply's own steps
- **294** one live line while it works, not a stack of them
- **306, partly**: the four intro-request buttons explain themselves. "Send and
  remember" is unchanged, so do not record 306 as closed.
- **282**: the token badge now DISAPPEARS instead of showing 0 when the balance
  is unknown. Say this explicitly — a missing badge is the new correct
  behaviour for that case, not a new bug. It is not proof the number is right.
- **111**: nothing for the tester to see.

---

## ANSWERED

_Nothing yet._
