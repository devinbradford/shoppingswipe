# Making the repository private: checklist

**Why:** the repository `devinbradford/shoppingswipe` is **public**. Commit `a729bf0` contains three raw calibration answer files (rater codes, timestamps, per-person answers). They were removed from the current files in `9fdc044` but are still in the history. Making the repository private hides the whole history without rewriting it, so no force-push is needed.

**Decision rules:**
- No history rewrite or force-push without Devin's separate, explicit approval.
- Only anonymous aggregates are committed from now on (`data/vision-eval/labels/` is git-ignored).

## What was checked (16 Nov 2026)

| Item | Finding | Effect of going private |
| --- | --- | --- |
| Forks | **0** (checked via the GitHub API) | None: there's no public copy on GitHub that would stay public |
| Stars / watchers | 0 / 0 | None |
| GitHub Pages | Not used | None |
| Deployments and environments | None recorded | None |
| Website (cureavo.com) | Deployed by Netlify Drop (drag and drop), not linked to the repository (`docs/WEBSITE.md`) | None. Updating it stays a manual upload |
| Supabase Edge Functions | Deployed from a bundle or the CLI, not from GitHub | None |
| Expo / EAS | Not set up yet (no `eas.json`) | None. EAS builds upload from a computer, and EAS can also be linked to private repositories |
| GitHub Actions: nightly import | About 2.5–3 minutes per night, so about 80–90 minutes a month | **Starts counting** against the free private-repository allowance. GitHub Free includes 2,000 minutes a month for private repositories, so this fits comfortably. Private runners are smaller (2 CPUs, 8 GB RAM instead of 4 and 16); the import doesn't need more |
| GitHub Actions: vision-benchmark | Manual only, about 15–25 minutes per run | Counts against the same 2,000 minutes if run after going private |
| Actions artifacts | A few KB (benchmark results), 30-day expiry | Counts against the 500 MB free storage; negligible |
| Repository secrets | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `AWIN_GOOGLE_FEED_URL`, … | Unchanged |
| Collaborators | Couldn't be listed from this session | Check **Settings → Collaborators**. On a private repository only listed people can see it (unlimited collaborators on GitHub Free) |
| Claude Code access | Uses the Claude GitHub app | Confirm the app still has access to this repository after the switch (**Settings → Integrations → GitHub Apps**); otherwise future sessions can't push |
| Copies made while public | Anyone could have cloned it, and public code archives may have copied it | Going private can't recall those. The exposed data is rater codes (R1/R2/R3, no names) and timestamps, low sensitivity |

## Steps (about 5 minutes, done by Devin on github.com)

1. **Settings → Collaborators:** note who has access, and remove anyone who shouldn't keep it.
2. **Settings → General → Danger Zone → Change repository visibility → Make private.** Type the repository name to confirm.
3. **Actions tab:** check that the next "Nightly product import" runs on schedule. It will, but this confirms nothing needs re-enabling.
4. **Settings → Integrations → GitHub Apps:** confirm the Claude app still lists this repository.
5. Open a link to a file in commit `a729bf0` while signed out (or in a private window). It should now show "404".
6. Optional, separate decision: rewriting history to remove `a729bf0`'s files entirely. That needs explicit approval, because it changes every later commit id and breaks existing clones. Not needed once the repository is private.
