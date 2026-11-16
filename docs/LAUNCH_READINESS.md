# CureAvo V2: launch-readiness audit (read-only, 16 Nov 2026)

**Goal:** a private beta of the current V2 app with 5–10 real shoppers. Visual Intelligence V3 continues separately as research. **No production code was changed in this audit.**

**Labels:**
- **Verified** means I ran it or read it in the code or logs today.
- **Untested** means it can't be checked from this cloud session (real phones, live sign-in, app stores). It is not known to work.

## Bottom line

The app itself is in good shape:
- the first-session journey works end to end;
- all 442 tests pass;
- the iOS and Android code bundles build cleanly.

Three things block a beta:
1. **The nightly product import has been failing for Tribesigns, more than half the catalog, for three nights.**
2. **There is no native build or distribution set up at all.** Nothing can be installed on a tester's phone today.
3. **Nothing has ever run on a real phone against the live database**, including sign-in.

None of these is large. The shortest realistic path is about 3–5 working days, mostly configuration and real-device testing. Two decisions cost money (Apple and Google developer accounts) and need your approval.

## P0: must fix before any beta

| # | Finding | Evidence | What fixes it |
| --- | --- | --- | --- |
| P0-1 | **Tribesigns import fails every night since 14 Nov.** The database rejects a duplicate store item id (`46641698341083`), and the whole Tribesigns batch (~1,150 products, 58% of the catalog) stops updating. Sicotas and Welax still import fine. Tribesigns prices, stock and removals are frozen at 13 Nov, so testers could be sent to sold-out items. GitHub has been emailing failures that went unnoticed. | **Verified:** GitHub Actions logs for 14, 15 and 16 Nov. Probable cause, from the code: products are saved by CureAvo's id (built from store page + colour), while the database also requires the store's item id to be unique. When a store renames a page or colour, the "new" product carries an item id already stored under the old one. Confirming it needs the current feed (only the GitHub job can download it). | Code fix in the import (for example, release or reuse the old row's item id), plus a test, plus a manual re-run of the workflow. About half a day. |
| P0-2 | **No way to install the app on a tester's phone.** There's no `eas.json` (build profiles), no Expo/EAS project, no build numbers, and no export-compliance flag. **Critical detail:** if the two public Supabase settings aren't provided to the build, the app silently falls back to the built-in **fake sample catalog** (`src/lib/env.ts`). | **Verified** (files absent; fallback in code). `expo-doctor`: 17 Expo packages are a patch version behind SDK 58. | Add build profiles, link a free Expo account, set the two public Supabase values for builds, and align the packages (`npx expo install --check`). About half a day plus your account setup. |
| P0-3 | **Never run on a real phone against the live database.** Native builds, gestures and haptics on device, live catalog loading, real photos, the store hand-off and back, and the "Did you buy it?" prompt are all unconfirmed. | **Untested.** What *is* verified: the iOS and Android bundles build (5.5 / 5.7 MB), and a browser run of onboarding → Keep / Skip / Undo → Kept → reload passed with 0 app errors (sample catalog). | A 20-minute device checklist on one iPhone and one Android phone before inviting anyone (in the path below). |
| P0-4 | **Sign-in and sync never tested live.** Apple and Google sign-in, the `cureavo://` return link, two-phone sync and live account deletion have only run against test doubles. | **Untested** live. **Verified** in code: sign-in errors show a calm message; Delete account calls a guarded database function and clears the phone. | Either finish `docs/SETUP-ACCOUNTS.md` (Supabase providers plus the `cureavo://**` redirect) and test on the build, or ship the beta without sign-in (see decision 3). |
| P0-5 | **Privacy policy must be reachable and accurate.** The app links to `cureavo.com/privacy.html`. It promises "error reports", which the app doesn't collect, and doesn't mention the website's Google Analytics. | Content **verified**; whether the site is live is **untested** (cureavo.com can't be reached from this session). TestFlight external testing and Google Play both ask for a privacy-policy link. | Two-sentence policy edit and re-upload to Netlify; open the link on your phone. |
| P0-6 | **Onboarding room photos have no licence record.** The 8 photos in `assets/rooms` are the first thing every tester sees, and their source and licence are still marked "to be confirmed". Installing the app on others' phones is distribution, even in a private beta. | **Verified** (CLAUDE.md, `src/data/rooms.ts`) | You confirm where each came from and that it may be used in an app. Swap any you can't confirm (one-line change each). |

## P1: must fix before public release

| # | Finding | Status |
| --- | --- | --- |
| P1-1 | **No crash or error reporting.** The error screen exists but reports nothing. During a beta, TestFlight and Google Play give basic crash reports, which is enough for 5–10 people but not for a public launch. | Verified (no reporting code) |
| P1-2 | **No analytics** for the swipe → product page → Buy funnel (planned for Phase 5). With accounts on, the database holds testers' swipes and saves; without accounts, only interviews tell us anything. | Verified |
| P1-3 | **Affiliate tracking not proven end to end.** Every product link carries CureAvo's Awin publisher id (1,000/1,000 sampled links), but no click has been confirmed in Awin's reports. Awin's promotional-space settings should list the app. The planned server-side link rewriter isn't built; links go straight from the feed, which works but CureAvo can't count clicks itself. | Link ids verified; tracking untested |
| P1-4 | **Status bar is unreadable on cream screens.** The app still sets a light (white) status bar from the old dark theme (`src/app/_layout.tsx`), so the clock and battery icons are white on cream on Kept, Profile and other light screens. `app.json` also still says the interface style is dark. | Verified in code; not seen on a device |
| P1-5 | **App-store paperwork:** Apple App Privacy answers; Google Play Data safety form; a **web page for account-deletion requests** (Google Play requires one for apps with accounts); age rating; screenshots; support URL; export-compliance flag. | Not started |
| P1-6 | **Screen readers on real phones** (VoiceOver, TalkBack) never tested. Code-level accessibility work is extensive. | Untested |
| P1-7 | **Import failures need a visible alert**, not only GitHub emails (P0-1 went unnoticed for 3 days). | Verified |
| P1-8 | **Repository is public** with old rater answers in its history (see `docs/REPO_PRIVATE_CHECKLIST.md`). | Verified |

## P2: can wait until after launch

- **Old audit item P2-3:** the Discover tab label is cut off at 200% text size. Still open (verified in code).
- **Onboarding room cards** still have the Undo-during-fly-out timing pattern that was fixed for product cards. Verified in code.
- **Old audit items P3-1 to P3-4:** brand line repeats on the product page; Welcome back card overlaps the photo for 6 s; fast repeated taps are ignored; the Buy click is recorded before the shop opens.
- **Photo framing database column** (`image_meta`) never added in production. The import logs say so every night; the app falls back to showing photos whole. Verified in logs. Add it for nicer framing.
- **On-phone-only data:** purchases, signals and the history of switched-off products aren't synced.
- **Reminders** are local only; server push needs more setup.
- **Catalog breadth:** 3 stores; chairs, stools and beds are thin; the Super Area Rugs feed is stale.
- **Free-tier limits** (Supabase, Expo builds) are fine for a beta; revisit before a public launch.

## What works today (verified)

| Area | Evidence |
| --- | --- |
| Code quality | Typecheck, lint, 442 unit tests (including the V2 golden ranking test) all pass |
| Native code bundles | iOS and Android bundles build cleanly with `expo export` |
| First session | Browser run: welcome → 8 rooms → taste reveal → room choice → For you deck → Keep, Skip, Undo, Keep → Kept shows 2 pieces → survives a reload. 0 app errors (only the sample photos' host is blocked here) |
| Catalog import | Sicotas and Welax refresh nightly with health checks (store pages 40/40 and 34/34 healthy) |
| Discontinued items | Kept and lists show an "Unavailable" section instead of dropping items (fixed and tested in the earlier audit) |
| Full-catalog coverage, Undo race, learning-data integrity | Fixed and tested in the earlier audit and V3 Phase 1 |
| Affiliate links and disclosure | Awin id on every sampled link; disclosure next to every Buy now |
| Account deletion | In the app (Account → Delete account), confirmed by a dialog, through a database function only signed-in users can call |

## Shortest realistic path to a private beta

**Day 1: Claude, after your approval of the fixes**
1. Fix the Tribesigns import (P0-1), add a test, re-run the workflow and confirm all three stores succeed.
2. Build setup (P0-2): build profiles, package alignment, build numbers, export-compliance flag, and the status-bar fix (P1-4, a one-line change).
3. Privacy-policy corrections (P0-5), ready for you to re-upload.

**Day 1: you**

4. Create a free Expo account and tell me the username, so I can link the project.
5. Decide platforms (decision 1) and accounts (decision 3).
6. Confirm the room-photo licences (P0-6).
7. Check cureavo.com/privacy.html opens on your phone.

**Day 2**

8. Builds. Android: an installable test build (APK) from the free Expo plan; testers tap a link and install, with no Play Store needed. iPhone: a TestFlight build, which needs the Apple Developer Program.
9. If accounts are on: finish the Supabase / Google / Apple setup (`docs/SETUP-ACCOUNTS.md`, about 1 hour) and test sign-in, sync and delete on the build.

**Day 2–3**

10. Device checklist on your phone plus one other (P0-3): install, onboarding, 30 swipes, Undo, Kept, a list, Buy now → store → back → "Did you buy it?", airplane mode, reopen the app, sign in/out and delete (if accounts are on), and the status bar on cream screens.

**Day 3–5**

11. Invite 5–10 shoppers with a short note: what CureAvo is, what's collected, how to send feedback (email, or TestFlight's screenshot feedback).
12. Check the import job daily for the first week.

## Decisions needed

1. **Platforms and cost:**
   - **(a) Android only first: $0.** An installable file shared by link (testers allow "install unknown apps").
   - **(b) Android + iPhone:** the Apple Developer Program is **$99/year** (TestFlight needs it). A Google Play internal test track is optional ($25 one-time).
   - Expo Go isn't a practical route for testers: it needs your PC running a server.
2. **Approve the P0 fixes** (import, build setup, status bar, privacy text). These are production code and configuration changes, so they need your go-ahead.
3. **Accounts in the beta:**
   - **(a) On:** about 1 hour more setup and testing. We see testers' swipes and saves, with their consent, and their data survives reinstalling.
   - **(b) Off for the first beta:** fewer moving parts, but data stays on each phone and we learn only from feedback.

   I recommend (a): learning from real swipes is the point of the beta.
4. **Make the repository private** (5-minute checklist; no history rewrite).
