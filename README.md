# Swipeshop

Swipe through products from many retailers. Right to keep, left to skip. The app learns your taste as you go.

See `CLAUDE.md` for the product brief, architecture rules and phase plan.

## Run it on your phone (Windows)

You need [Node.js LTS](https://nodejs.org) and the **Expo Go** app on your phone (App Store / Google Play).

In PowerShell, in this folder:

```powershell
npm install
npx expo start
```

Scan the QR code with your phone's camera (iPhone) or with Expo Go (Android). Your phone and PC must be on the same Wi-Fi. If it can't connect, stop the server (Ctrl+C) and run `npx expo start --tunnel`.

## Checks

```powershell
npm run check     # typecheck + unit tests
npx expo lint     # lint
```

## Where things live

| Folder | What's in it |
| --- | --- |
| `src/app/` | Screens (Discover, swipe deck, Kept, product detail) |
| `src/components/` | Reusable UI: swipe card, buttons, tiles |
| `src/hooks/` | Glue between data, store and recommender (`useDeck`) |
| `src/recommendation/` | The ranking engine. Pure TypeScript, unit-tested |
| `src/data/` | `ProductRepository` + the local sample catalog |
| `src/store/` | On-device swipe log and kept list |
| `src/theme/tokens.ts` | All colors, fonts, spacing |
| `supabase/migrations/` | Database schema + row-level security (not connected yet) |

All sample data is fictional: made-up stores on `*.example.com`, placeholder photos.
