# Turning on accounts (Supabase + Google + Apple)

The app works without this: everything is saved on the phone. These steps connect it to its server so people can sign in and sync across devices.

Allow about 30–45 minutes. Do the parts in order. Website menus get renamed from time to time; if a label below doesn't match exactly, look for the closest one.

---

## Part 1: Create the Supabase project (free)

1. Go to **https://supabase.com** and sign up (signing up with GitHub is easiest).
2. Click **New project**.
   - Name: `swipeshop`
   - Database password: click **Generate a password** and save it in your password manager.
   - Region: the one closest to you.
   - Click **Create new project** and wait a minute or two.

### Load the database

3. On your PC, open PowerShell in the `shoppingswipe` folder and get the latest code:

   ```powershell
   git pull
   ```

4. Open the file `supabase\setup.sql` in Notepad:

   ```powershell
   notepad supabase\setup.sql
   ```

   Press **Ctrl+A**, then **Ctrl+C** to copy everything.
5. In Supabase, click **SQL Editor** (left side), then **New query**. Paste with **Ctrl+V** and click **Run**.
   You should see "Success. No rows returned". Run it **once** only.
6. Check it worked: click **Table Editor**, open **products**. You should see 176 sample products.

### Connect the app

7. In Supabase, open **Project Settings → API Keys** (or **Connect** at the top). Copy:
   - the **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - the **Publishable key** (starts with `sb_publishable_`)

   Never copy the **secret** or **service_role** key into the app.
8. In PowerShell (in the project folder):

   ```powershell
   Copy-Item .env.example .env
   ```

   ```powershell
   notepad .env
   ```

   Paste the two values after the `=` signs so it looks like this, then save:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
   ```

   `.env` is never uploaded to GitHub (it's on the ignore list).
9. Restart the app server so it picks up the new settings:

   ```powershell
   npx expo start --clear
   ```

   The app now loads its products from Supabase. The **Account** screen will show the sign-in buttons (they won't work until Parts 2 and 3).

### Allow the app's return address

10. In Supabase: **Authentication → URL Configuration → Redirect URLs → Add URL**. Add these two:
    - `exp://**` (Expo Go while testing)
    - `swipeshop://**` (the real app later)

---

## Part 2: Google sign-in (free)

1. In Supabase: **Authentication → Sign In / Providers → Google**. Copy the **Callback URL** shown there (looks like `https://abcdefgh.supabase.co/auth/v1/callback`). Leave this tab open.
2. Go to **https://console.cloud.google.com** and sign in. Create a project named `Swipeshop` (project picker at the top → **New project**).
3. Open **APIs & Services → OAuth consent screen** (may be called **Google Auth Platform**). Click **Get started**:
   - App name: `Swipeshop`, support email: yours
   - Audience: **External**
   - Contact email: yours → **Create**
4. Open **Clients** (or **Credentials → Create credentials → OAuth client ID**):
   - Application type: **Web application**
   - Name: `Swipeshop Supabase`
   - **Authorized redirect URIs → Add URI**: paste the Callback URL from step 1
   - Click **Create**. Copy the **Client ID** and **Client secret**.
5. Back in Supabase's Google provider page: turn **Enable** on, paste the Client ID and Client secret, click **Save**.
6. Test on your phone: Account → **Continue with Google**.

While the Google app is in "Testing" mode, only Google accounts you add under **Audience → Test users** can sign in. Add your own email there. Before launch you'll click **Publish app**.

---

## Part 3: Apple sign-in (needs the $99/year Apple Developer Program)

Apple only allows "Sign in with Apple" for paid developer accounts. You need this account anyway to publish on the App Store. Enroll at **https://developer.apple.com/programs/** (approval can take a day or two).

Once enrolled, at **https://developer.apple.com/account** → **Certificates, Identifiers & Profiles**:

1. **Identifiers → +** → **App IDs** → App:
   - Description: `Swipeshop`, Bundle ID: `com.swipeshop.app` (Explicit)
   - Tick **Sign in with Apple** → Continue → Register.
2. **Identifiers → +** → **Services IDs**:
   - Description: `Swipeshop sign-in`, Identifier: `com.swipeshop.app.signin`
   - Register, then open it, tick **Sign in with Apple** → **Configure**:
     - Primary App ID: the one from step 1
     - Domains: `abcdefgh.supabase.co` (your project's domain, without `https://`)
     - Return URLs: the Supabase Callback URL (`https://abcdefgh.supabase.co/auth/v1/callback`)
   - Save → Continue → Save.
3. **Keys → +**: name `Swipeshop sign-in`, tick **Sign in with Apple** → Configure → choose the App ID → Save → Continue → Register. **Download the .p8 file** (you can only download it once) and note the **Key ID**. Your **Team ID** is shown at the top right of the developer site.
4. In Supabase: **Authentication → Sign In / Providers → Apple**:
   - Enable it.
   - **Client IDs**: `com.swipeshop.app.signin`
   - **Secret key**: Supabase's Apple page links to a tool that turns your Team ID, Key ID, Services ID and .p8 file into the secret. Paste the result and **Save**.
5. Test: Account → **Continue with Apple**.

The Apple secret **expires after 6 months**. Put a calendar reminder to generate a new one (step 4) before then, or Apple sign-in will stop working.

---

## Checking it all works ("done when")

1. On phone A: swipe a few things, keep a couple, make a list.
2. Open **Account → Continue with Google** (or Apple). The status should say **Synced just now**.
3. On phone B (or after deleting and reinstalling Expo Go's data): open the app, sign in with the same account.
4. Phone B should show the same kept items, lists and style picks, and the "For you" picks should lean the same way.
5. Keep something on phone B, then open the app on phone A. It appears within a few seconds (or tap **Sync now**).

If something doesn't work, note what the screen says and send it to Claude.
