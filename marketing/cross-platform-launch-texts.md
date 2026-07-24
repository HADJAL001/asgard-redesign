# Launch copy for Product Hunt analogs — OSGARD NEW WORLD

English-language texts for platforms similar to Product Hunt, adapted from
`marketing/product-hunt-launch-final.md` (the source of truth for product
facts: TimeCoin/SPL token 1:1 backing, rarity/stats, Orchestrator, JARVIS/VALLI
advisors). Each platform has a different audience and format expectation, so
tone and length differ — do not just copy the PH text as-is.

**Same blocker as the PH launch kit applies here:** no demo GIF/video yet.
Record one before publishing anywhere — it matters more on BetaList/IH than
on HN, but helps everywhere.

**Website**: https://osgardnewworld.com (verified live, English UI now
shipped alongside Russian/Kazakh).

---

## 1. BetaList

BetaList reviews submissions before publishing — expect a short screening
questionnaire on top of this. Tone: polished, benefit-first, early-access
framing works well here.

**Product name**: OSGARD NEW WORLD

**Tagline** (≤60 chars):
> Turn your idea into a legendary AI-forged artifact

**Short description** (≤200 chars, used in the feed):
> Describe an idea and AI forges it into a unique digital artifact — rarity,
> stats, lore — that you can trade in a real token-backed economy.

**Full description**:
OSGARD NEW WORLD lets you describe an idea — a sword, an amulet, a relic,
anything — and AI forges it into a one-of-a-kind digital artifact with its
own rarity, stats (power/defense/magic/speed), lore, and art style.

Once forged, your artifact isn't just a picture sitting in a gallery: sell it
for TimeCoin (TC) on the built-in marketplace, climb the "Architects of the
Universe" leaderboard, or trade with other creators. TimeCoin is backed 1:1
by a real SPL token on Solana — it's not a made-up in-app currency.

What's inside:
- Text-to-artifact generation across Sci-Fi / Fantasy / Cyberpunk / Steampunk styles
- Rarity, stats, and lore generated per artifact — not just an image
- TimeCoin economy: marketplace, staking, P2P transfers, referral program
- Orchestrator — chain multiple AI generation steps into one pipeline
- JARVIS (AI advisor) and VALLI (3D advisor) as premium modules
- Public Hall of Fame leaderboard and a live activity feed

**Category tags**: Artificial Intelligence, Crypto / Web3, Design Tools

**Launch/access framing**: request early access — works well with BetaList's
pre-launch audience even though the product is already live; frame it as
"come see what we shipped."

---

## 2. Hacker News (Show HN)

HN's audience punishes marketing language and unverified hype, especially
around crypto — say what the token backing actually does mechanically and
don't oversell it. Title must be factual and short (HN truncates around
80 chars); no exclamation marks, no emoji.

**Title** (pick one):
> Show HN: I built an AI tool that turns a text prompt into a tradeable digital artifact
> Show HN: OSGARD – AI-generated artifacts with rarity/stats, backed by a 1:1 Solana token

**First comment (post immediately after submitting, this IS the actual pitch on HN)**:

> Hi HN,
>
> I built OSGARD NEW WORLD — you describe an idea in text (a sword, an
> amulet, whatever), and an LLM pipeline generates a "digital artifact" with
> procedurally assigned rarity, stats, and lore text, plus generated art.
>
> The part I think is more interesting than the generation itself is the
> economy layered on top: artifacts trade on an internal marketplace for
> TimeCoin, a currency backed 1:1 by a real SPL token on Solana (not a fake
> in-app currency with no floor). There's staking, P2P transfers, and a
> public leaderboard.
>
> Technical bits that might interest this crowd:
> - Generation has provider fallback so a single LLM outage/rate-limit
>   doesn't take down artifact creation
> - "Orchestrator" — lets you chain multiple generation steps into one
>   pipeline instead of one-shot prompting
> - Same backend serves both the web app (Next.js/React) and a
>   React Native/Expo mobile client — one account, wallet, and artifact
>   history across both
>
> Live at https://osgardnewworld.com — there's a demo account in the
> comments below if you want to poke around without signing up
> (`alex_odin` / `password123`, seeded test user, no real data).
>
> Happy to answer anything about the generation pipeline, the token
> mechanics, or why we went with Solana specifically. Feedback — especially
> critical — is very welcome.

**Notes**:
- Post the demo account as a *reply to your own submission*, not in the
  main text — keeps the pitch comment scannable.
- Don't argue with early skeptical comments about crypto; answer the
  mechanical "how does the 1:1 backing actually work" questions factually,
  that's what defuses it on HN.

---

## 3. Indie Hackers

IH rewards founder narrative and specifics (what was hard, what you learned)
over polished marketing copy. First-person, process-focused.

**Post title**:
> I built an AI platform where your ideas become tradeable artifacts backed by a real token — here's what I learned

**Post body**:
> Hey IH,
>
> I've been building OSGARD NEW WORLD — you type a description of an idea
> (think: a weapon, an amulet, a relic) and it gets forged into a unique
> digital artifact: rarity, stats, lore, art. The twist is that it's not
> just a generated image — it plugs into a real economy. Artifacts trade
> for TimeCoin on an internal marketplace, and TimeCoin is backed 1:1 by an
> actual SPL token on Solana, not a made-up in-app number.
>
> **Why I built it**: I wanted something more tangible than "prompt → image
> → done." Giving the output rarity, stats, and a place to trade meant
> building an actual product loop (generate → own → trade → climb a
> leaderboard) instead of a single generation feature.
>
> **What was hard**:
> - Making LLM-based generation reliable enough to not embarrass itself
>   under real traffic — ended up building provider fallback so one
>   API outage doesn't stop the whole pipeline
> - Sharing one backend across a Next.js web app and a React
>   Native/Expo mobile app cleanly (same account/wallet/history on
>   both) — worth it, but the mobile side (voice input, offline cache,
>   push notifications) took longer than the web app itself
> - Deciding how much of the "economy" to expose up front vs. let people
>   discover — marketplace, staking, P2P transfers, and referrals are all
>   in, but onboarding needed to stay about the artifact, not the finance
>
> **Where it's at**: live at https://osgardnewworld.com, English/Russian/
> Kazakh UI. Looking for feedback on whether the token-backed angle is a
> selling point or a trust hurdle for people who haven't touched crypto —
> genuinely don't know yet and would rather hear it here than guess.
>
> Happy to go deep on the generation pipeline, the tokenomics, or the
> web/mobile shared-backend setup if anyone's curious.

**Tags/categories**: AI, Crypto, Gaming, SaaS

---

## Cross-platform checklist (in addition to the PH checklist)

- [ ] Record the demo GIF/video (shared blocker — do this once, reuse everywhere)
- [ ] BetaList: submit and wait for review (can take days — submit earliest)
- [ ] HN: post at a time with strong US/EU morning overlap (~8-10am ET tends
      to get more front-page visibility); do not cross-post the exact PH
      copy — HN readers notice reposted marketing text
- [ ] IH: post to a relevant group in addition to the main feed if applicable
      (e.g. an AI-tools or crypto-adjacent group)
- [ ] Reuse the same seeded demo account (`alex_odin` / `password123`)
      across all platforms — already confirmed safe to publish
