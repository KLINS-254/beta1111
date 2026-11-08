# ADBETA — deployable starter

ADBETA is an original advertising-rewards platform starter inspired by common member-dashboard patterns. It is **not an exact copy** of AdSelect's proprietary branding, source code, text or assets.

## Included
- React + Vite responsive member portal and installable-ready mobile layout
- Free email/password registration with optional referral code
- Supabase profile and role creation
- Ad campaigns, daily check-in, referral tracking, activity ledger
- Story submission workflow
- Wallet and withdrawal request UI for M-Pesa and USDT BEP20
- Admin dashboard for campaign creation and withdrawal review
- Supabase RLS policies and server-side reward/withdrawal functions
- Vercel API routes for Safaricom Daraja STK Push and callback

## 1. Create Supabase
1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase/schema.sql`.
3. In Authentication settings, configure your site URL and redirect URLs.
4. Create a member account on the deployed site.
5. In Supabase SQL Editor, run:
   ```sql
   update public.user_roles
   set role='admin'
   where user_id='YOUR_AUTH_USER_UUID';
   ```
   Find the UUID in Authentication → Users. Never make every user an admin.

## 2. Run locally
```bash
npm install
cp .env.example .env
# Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

## 3. Deploy to GitHub + Vercel
1. Upload all project files to a new GitHub repository named `adbeta`.
2. Import the repository into Vercel.
3. Framework preset: Vite; build command `npm run build`; output directory `dist`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Add server-only environment variables from `.env.example` for M-Pesa API routes.
6. Redeploy after adding environment variables.

## 4. M-Pesa setup
- Apply for Daraja access with Safaricom and configure the sandbox app.
- Set `DARAJA_ENV=sandbox` for testing.
- Configure shortcode, passkey, consumer key, consumer secret and callback URL.
- Set callback URL to `https://YOUR-VERCEL-DOMAIN/api/mpesa/callback`.
- The included STK API is a payment-collection starter. It does not automatically convert advertising rewards into M-Pesa payouts. Outgoing B2C payouts require separate Safaricom approval, B2C credentials, callback handling and reconciliation.
- Do not switch to production until Safaricom has approved your use case and end-to-end tests pass.

## 5. USDT withdrawals
The current implementation accepts a BEP20 wallet address and records a withdrawal request for manual admin processing. It does **not** hold private keys or automatically send crypto. Admins should only mark a request paid after verifying the transaction on BscScan. Never collect seed phrases or private keys.

## Important production work still required
This is a working foundation, not a fully audited money-transfer service. Before public launch:
- Add campaign view verification (server-side signed sessions, minimum watch duration, bot/fraud checks and advertiser impression callbacks). The included ad completion RPC is a demo eligibility gate and must not be treated as proof of a valid paid impression.
- Implement a compliant outgoing M-Pesa B2C payout flow if automated payouts are needed.
- Add admin UI for story review, member moderation, reward configuration and support tickets.
- Add email verification, rate limiting, CAPTCHA, audit logs, privacy/terms pages and data-retention rules.
- Confirm Kenyan legal, tax, consumer-protection, advertising and data-protection obligations.
- Use real advertiser revenue to fund rewards; do not promise fixed income or pay earlier users using later users' deposits.

## Current reward defaults
Daily check-in is set to $0.05 in the SQL function. Admins should adjust this before launch to match the actual advertiser-funded reward budget. Ad campaign reward values are configured by an admin. There is no member deposit or joining fee.
