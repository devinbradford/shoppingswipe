# Putting the Arvelle website online

The website lives in the `website` folder: `index.html` (home page), `privacy.html` (privacy policy) and `config.js` (settings). It's plain files, so any host works. These steps use **Netlify** because it's free and needs no coding.

## 1. Get a free live link (5 minutes)

1. Go to **https://app.netlify.com/drop** and sign up (free; "Sign up with GitHub" is easiest).
2. On your PC, open File Explorer and find the project folder (`shoppingswipe`). Run `git pull` first in PowerShell so you have the latest files.
3. **Drag the whole `website` folder** onto the Netlify Drop page.
4. In a few seconds you get a link like `https://random-name-123.netlify.app`. Open it on your phone and computer to check it.
5. Optional: in Netlify, **Site configuration → Change site name** to something like `arvelle` (gives `arvelle.netlify.app`).

To update the site later: in Netlify open the site → **Deploys** → drag the `website` folder again.

## 2. Use your own web address (after you buy it)

1. In Netlify: open the site → **Domain management → Add a domain** → type your domain (e.g. `arvelleco.com`) → follow the prompts.
2. Netlify shows DNS settings to copy into your domain seller's site (Namecheap, Cloudflare, etc.), or offers to manage DNS for you. Follow its on-screen steps; it can take up to a few hours to switch over.
3. Netlify turns on the secure padlock (HTTPS) automatically.

## 3. Get a contact email (free)

The site lists **hello@arvelleco.com**. Make it real before applying to CJ:
- Most domain sellers (Namecheap, Cloudflare) offer **free email forwarding**: send `hello@yourdomain` to your Gmail. Turn it on in your domain's settings.
- If you choose a different domain, change `contactEmail` in `website/config.js` and re-upload.

## 4. Turn on the waitlist (after the Supabase setup)

Both sign-up forms send emails to a small server-side function in Supabase called **`waitlist-signup`**. It checks the email, blocks spam and repeated attempts, records which disclosure the person saw, and saves the email to the **`waitlist_signups`** table. The website itself holds **no Supabase keys**, and nobody on the internet can read the list; only you can, in the Supabase dashboard.

Until step 4.4 is done, the forms politely ask visitors to email you instead.

### 4.1 Add the waitlist table (once)

1. Supabase dashboard → your project → **SQL Editor** → **New query**.
2. Open `supabase/migrations/20261106000000_waitlist_signups.sql` in Notepad, copy everything, paste it in, and press **Run**. You should see "Success. No rows returned".
   - If you are setting up a brand-new project with `supabase/setup.sql`, skip this: it's already included.
   - This only **adds** two tables (`waitlist_signups`, `waitlist_rate_limits`) and one function (`waitlist_signup`). It doesn't change or delete anything existing.

### 4.2 Set the function's two secrets

Supabase dashboard → **Edge Functions** → **Secrets** → add:

| Name | Value |
| --- | --- |
| `WAITLIST_ALLOWED_ORIGINS` | Your website addresses, comma-separated, exactly as they appear in the browser, e.g. `https://cureavo.com,https://www.cureavo.com,https://your-site.netlify.app` |
| `WAITLIST_IP_SALT` | A long random string. Make one in PowerShell: `[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')` and paste the result. Don't share it. |

Supabase gives the function its database access automatically (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`); never put those anywhere in the website. (If your project has legacy API keys turned off, create a **secret** API key under **Project Settings → API Keys** and add it as a secret named `WAITLIST_SERVICE_KEY`.)

### 4.3 Deploy the function (PowerShell, from the project folder)

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy waitlist-signup --no-verify-jwt
```

- `YOUR_PROJECT_REF` is the code in your project's URL (`https://YOUR_PROJECT_REF.supabase.co`), also under **Project Settings → General**.
- `--no-verify-jwt` is required: visitors aren't logged in. The function protects itself with the website allow-list, spam checks and rate limits.

### 4.4 Point the website at it

1. Open `website/config.js` in Notepad and set
   `waitlistUrl: 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/waitlist-signup'`.
2. Re-upload the `website` folder to Netlify.
3. Test: sign up with your own email on the live site, then check **Supabase → Table Editor → waitlist_signups**. Sign up again with the same email in capitals: you'll see the same success message, and still only one row.

### What gets stored

- **`waitlist_signups`**: the email (trimmed, lower case), which form was used (`hero` or `footer`), the exact disclosure text shown next to that form plus its version, the time, and `marketing_opt_in = false` (people only agree to launch updates). Empty columns `confirmed_at`, `welcome_email_sent_at` and `unsubscribed_at` are ready for when emails are added later.
- **`waitlist_rate_limits`**: one row per attempt with a salted hash of the visitor's IP (never the IP itself), deleted automatically after a day. Each visitor gets 5 attempts per 10 minutes and 20 per day.

### Changing the wording next to a form

The text under each form is the consent record. If you change it (for example when renaming to CureAvo), also add a new version in `supabase/functions/waitlist-signup/handler.ts` (`CONSENT_DISCLOSURES`, e.g. `hero-v2`), update the form's `data-consent` attribute in `index.html` to match, and redeploy the function.

### Adding a welcome email later

Brand-new signups (not repeats) run `onNewSignup()` in `supabase/functions/waitlist-signup/index.ts`. Send the email there, then fill in `welcome_email_sent_at`. A failing email never blocks the signup.

### The older `waitlist` table

Earlier versions of the site wrote straight to a table called `waitlist`. The website no longer uses it, but it was left untouched. If it exists in your project and you want to close it to the public, run:

```sql
revoke insert on public.waitlist from anon, authenticated;
drop policy if exists "Waitlist: anyone can join" on public.waitlist;
```
