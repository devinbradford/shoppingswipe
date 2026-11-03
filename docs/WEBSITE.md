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

Once Supabase is set up (see `docs/SETUP-ACCOUNTS.md`; `supabase/setup.sql` already includes the waitlist table):
1. Open `website/config.js` in Notepad.
2. Paste the same **Project URL** and **Publishable key** you put in the app's `.env`, then save.
3. Re-upload the `website` folder to Netlify.
4. Sign up with your own email to test, then check **Supabase → Table Editor → waitlist**.

The publishable key is safe on a public website: the waitlist table only lets people add an email, never read the list.

Until then, the form politely tells visitors to email you instead.
