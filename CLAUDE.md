# Swipeshop: project brief for Claude Code

Read this file and `AGENTS.md` before doing anything. `AGENTS.md` has Expo-specific rules (SDK 58 has breaking changes; check current docs and don't rely on memory).

## The product

A mobile shopping discovery app for iOS and Android. The user picks a category (furniture, clothing, bedding, collectibles, decor, footwear) and swipes through full-screen product cards pulled from many retailers. Right = keep, left = skip. The app learns their taste from swipes and keeps surfacing more relevant products. Kept items go to a list; tapping a product opens its detail page with a link to buy on the retailer's own site.

Think "Tinder for shopping", but it has to feel premium: minimal, modern, fast, with no clutter.

**Business model (later):** affiliate commission on outbound purchase clicks. That's why every buy link must eventually go through a server-side link rewriter. The app never stores affiliate secrets.

**Scale target:** thousands of products across many retailers at launch, built so it can grow well beyond that.

## Owner

Devin is the product owner, not an engineer. He runs the app on a Windows PC with Expo Go on his phone.
- Explain what you built in plain language, briefly. No jargon without a one-line explanation.
- When something needs him to act (install, sign up, paste a key), give exact steps for Windows / PowerShell.
- Push back if a request is a bad idea; say why and offer the better option.
- Ask before decisions that are expensive to reverse (auth providers, paid services, schema changes after real users exist).

## Tech stack (already set up; don't swap out)

- Expo SDK 58, React Native 0.88, TypeScript (strict), Expo Router (routes in `src/app/`)
- Reanimated 4 + Gesture Handler 3 for swiping (v3 API: `usePanGesture` + `GestureDetector`; shared values use `.get()` / `.set()`)
- Zustand + AsyncStorage for on-device state
- Supabase (Postgres + Auth + Edge Functions) as the backend
- Jest (`jest-expo`) for tests
- Always add packages with `npx expo install <pkg>`, never plain npm, so versions match the SDK.

## Architecture rules

```
src/
  app/              Screens only. Thin: compose hooks + components. No business logic.
  components/       Reusable, presentational UI. No data fetching.
  hooks/            Glue between data, store and recommender (e.g. useDeck).
  recommendation/   Pure TypeScript ranking engine. No React, no I/O. Must stay unit-tested.
  data/             ProductRepository interface + implementations (local now, Supabase in Phase 3).
  store/            Zustand stores. Record facts (swipes, saved ids); no ranking logic.
  domain/types.ts   Shared types. Must mirror the SQL schema.
  lib/              env, Supabase client, formatting helpers.
  theme/tokens.ts   All colors, type, spacing, radii. No raw hex values in components.
supabase/migrations/  SQL schema + row-level security.
```

1. **Screens never touch the catalog directly.** Everything goes through `ProductRepository`.
2. **The swipe log is the source of truth.** Taste profiles are recomputed from it.
3. **The recommender stays pure** so it can run in a Supabase Edge Function unchanged.
4. **Secrets:** only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` may be in the app. Service-role keys and retailer/affiliate credentials go in Edge Function secrets only. Never commit `.env`.
5. **Sample data stays obviously fake:** fictional retailers, `*.example.com` URLs. Never imitate a real store.

## Design direction ("D · Mix", chosen by Devin)

Warm espresso dark (`#12110F`) with off-white text (`#F3F2EF`) and one champagne accent (`#D8C29D`) for Keep and selection; rose (`#E0A39A`) for Skip and errors. Instrument Serif for names, prices and headings; Geist for everything else, with small spaced capitals for labels (FURNITURE · 18 LEFT). The swipe card is a full-screen photo with frosted-glass controls floating over it and a "For you" bubble explaining the pick. Kept and lists are mood boards (two columns, varying heights). Sentence-case copy; buttons say exactly what they do ("Keep", "Buy now"). All values live in `src/theme/tokens.ts`.

## Current state: Phase 2 is done (awaiting Devin's go-ahead for Phase 3)

**MVP scope (Devin's call): furniture only.** Rooms → product types:
- Bedroom: bed frames, nightstands, dressers
- Living room: sofas, accent chairs, coffee tables, TV stands, rugs
- Kitchen & dining: bar stools, dining tables, dining chairs

In code, "category" = room (`CATEGORY_IDS`) and "subcategory" = product type (`SUBCATEGORY_IDS`). Discover shows each room with a row of product types; the deck takes `/deck/<room>?type=<type>`. Product photos use the "showcase" fit (whole product visible over a blurred copy of itself) so store photos are never cropped.

Phase 1:
- Discover screen: category tiles with remaining-item counts, plus search
- Swipe deck: drag and button swipes, Keep/Skip stamps, photo tapping, undo, haptics
- Recommender: content-based (style tags, material, color, brand, retailer, price band), skips weighted 0.6×, recency decay, 15% exploration, cold start until 3 keeps, taste carries across categories, re-ranks after every swipe behind the two visible cards, "Matches your taste for…" reasons
- Kept list, product detail with outbound buy link
- Supabase schema with RLS (not yet connected)
- Fictional sample catalog: 176 furniture products, 16 per type (generator can make 10k+ for load testing)

Phase 2:
- Named wishlists: Lists row on Kept, Select → Copy/Move to list, list screen (rename, delete, remove items), Add to list on product page. Rules in `src/domain/wishlists.ts`; migration `20261101000000_wishlists.sql`
- Search filters: category, store, price presets + min/max, live result count, removable chips (`src/domain/filters.ts`)
- First-launch taste picker (`/welcome`): 3–5 styles seed the taste profile as virtual keeps older than any real swipe
- Offline strip (expo-network), offline-aware Buy now, root ErrorBoundary, not-found screen
- Accessibility: reduce-motion support, card Keep/Skip screen-reader actions and swipe announcements, sheet Close buttons, 44pt+ tap targets, capped display-text scaling, WCAG contrast test
- Checks passing: typecheck, lint, 53 unit tests
- Sample photos are random placeholders from picsum.photos until real feeds arrive (Phase 4)

## Phase plan

Build **one phase at a time**. Within a phase, work in small steps and commit after each working step.

### Phase 2: Polish and core features (local only, no backend)
- Named wishlists: create, rename and delete lists; move or copy items from Kept
- Search filters: price range, retailer, category
- First-launch taste picker: user taps 3–5 style images to skip the cold start
- Empty, error and offline states on every screen
- Accessibility pass: screen reader labels, reduced-motion support, tap target sizes
- **Done when:** all of the above works in Expo Go, and tests cover wishlist logic and the taste picker's effect on ranking

### Phase 3: Supabase backend
- **Ask Devin first:** which sign-in options (recommended: Apple + Google only)
- Auth flow, plus a `SupabaseProductRepository` matching the existing interface
- Sync swipes and wishlists, with an offline queue that replays when back online
- Seed script that loads the sample catalog into Supabase
- Merge local history into the account on first sign-in
- **Done when:** a user can sign in on two devices and see the same kept items and taste

### Phase 4: Real retailer data
- Edge Function jobs that pull affiliate product feeds into `products`; dedupe across retailers
- Server-side affiliate link rewriting; image CDN/resizing
- Move ranking server-side once the catalog passes ~50k products (consider pgvector embeddings)
- **Done when:** at least one real affiliate feed is live with working tracked links

### Phase 5: Launch prep
- Analytics funnel: swipe → detail view → buy click
- EAS builds, app icons, splash screen, store listings, privacy policy
- TestFlight and Google Play internal testing

## Working rules for every step

1. Say what you're about to build in 1–2 sentences.
2. Build it.
3. Run `npm run check` (typecheck + tests) and `npx expo lint`. Fix everything before moving on.
4. Commit with a clear message.
5. Tell Devin in plain language: what changed, how to see it on his phone, and what's next.
6. Stop at the end of each phase and wait for his go-ahead before starting the next.

Never mark something done that you haven't run. If you can't verify something (e.g. on a real device), say so.
