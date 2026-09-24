# Dakar Dapper — Setup & Operations

Everything in the code is done. There are **seven things only you can do**, because they
need access to your Supabase account. Work through them in order; the whole thing takes
about twenty-five minutes. Steps 1–3 are done already if you followed the last round.

---

## Step 1 — Lock down the database (do this first)

Right now your database is open to the public: anyone can read every customer's name,
phone number and address, and anyone can edit or delete your products. This script fixes
that. Nothing else works properly until it has run.

1. Open your Supabase dashboard → **SQL Editor** → **New query**.
2. Open `supabase/setup.sql` from this project, copy **all** of it, paste it in.
3. Press **Run**.

It is safe to run on your existing data — it keeps your products, orders and subscribers,
and only replaces the security rules. It is also safe to run more than once.

**What changes after this:**

| Who | Can do |
|---|---|
| A visitor to your website | Read the product catalogue. Place an order. Join the newsletter. Nothing else. |
| A stranger with your anon key | Exactly the same as above. The key is public by design and now grants nothing dangerous. |
| You, signed into the admin | Everything. |

---

## Step 2 — Create your admin account

1. Supabase dashboard → **Authentication** → **Users** → **Add user**.
2. Enter your email and a **strong** password. Tick **Auto Confirm User**.
3. Go back to the **SQL Editor** and run this, with your real email:

```sql
INSERT INTO public.dd_admins (user_id, email, role)
SELECT id, email, 'owner' FROM auth.users
WHERE email = 'your-real-email@example.com'
ON CONFLICT (user_id) DO NOTHING;
```

4. Check it worked: `SELECT * FROM public.dd_admins;` — your email should be listed.

Now open `admin.html` and sign in.

> The old "tap the logo five times, PIN 1234" entrance is gone. It offered no real
> protection: the PIN lived in the browser and the whole admin shipped to every visitor.

---

## Step 3 — Turn on photo uploads

So you can add product photos from your phone instead of typing file paths.

1. Supabase dashboard → **Storage** → **New bucket**.
2. Name it exactly **`products`**, and tick **Public bucket**.
3. Create it, then run this in the SQL Editor so only admins can upload:

```sql
CREATE POLICY "admins upload product images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'products' AND public.is_admin());

CREATE POLICY "anyone can view product images" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'products');

CREATE POLICY "admins delete product images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'products' AND public.is_admin());
```

---

## Step 4 — Change the Supabase password you shared

You pasted your anon key into a chat. That key is public by design and is safe to share —
but treat it as a prompt to check the rest:

- Supabase → **Settings → API**: confirm your **service_role** key has never been put in
  any file in this project. (It is not in any file here — I checked.)
- If you ever pasted the service_role key anywhere, rotate it immediately.

---

## Step 5 — Run migrations 002 and 003

Same place: **SQL Editor → New query → paste → Run**, one at a time.

- `supabase/002_product_pages.sql` — product URL slugs and photo galleries.
- `supabase/003_reviews_alerts_sizes.sql` — reviews, restock alerts, size
  charts, and the order email queue.
- `supabase/004_categories_marketing.sql` — the ten new categories and their
  size charts, marketing consent, the Audience list, campaigns and unsubscribe.
- `supabase/005_fix_ratings.sql` — clears the made-up 5-star ratings saved by
  the old admin. Safe to run any time.

**003 also deletes the invented ratings** the first build shipped (every
product showed something like "4.9 · 38 reviews" that nobody wrote). After it
runs, products show *"Be the first to review"* until real customers write one.

---

## Step 6 — Turn on emails (order confirmations and campaigns)

Every order already puts a confirmation email in a queue. This step deploys
the small program that actually sends what is in that queue. Everything is
done in your browser; no command line needed.

**A. Get an email sender (Resend)**

1. Sign up at [resend.com](https://resend.com) (free: 100 emails a day).
2. **Domains → Add domain →** `dakardapper.com`. Resend shows a few DNS
   records. Add them where you manage your domain's DNS (Vercel → your
   project → Domains, or your registrar). Wait until Resend says **Verified**.
3. **API Keys → Create API key** (Sending access). Copy it; it starts with `re_`.

**B. Deploy the sender**

1. Supabase dashboard → **Edge Functions → Deploy a new function → Via Editor**.
2. Name it exactly `send-emails`.
3. Delete the sample code, then paste **all** of
   `supabase/functions/send-emails/index.ts` from this project.
4. Click **Deploy**.

**C. Give it its settings**

Supabase dashboard → **Edge Functions → Secrets** (or Project Settings →
Edge Functions → Secrets). Add these four:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the `re_...` key from A3 |
| `FROM_EMAIL` | `Dakar Dapper <orders@dakardapper.com>` |
| `STORE_URL` | `https://www.dakardapper.com` |
| `WHATSAPP_NUMBER` | `2349019603621` |

Supabase provides the database address and service key to the function
itself; you do not add those.

**D. Run it every minute**

SQL Editor → paste and run **`supabase/006_email_schedule.sql`**.

**E. Check it works**

Place a small test order on the site with your own email. Within a couple
of minutes you should get the confirmation, and **Admin → More → Order
emails** should show *Sent: 1, Waiting: 0*. If it stays in *Waiting*, the
function or the schedule is not running; if it shows *Failed*, the Resend
key or domain is not set up yet.

> Confirmations go to whatever address the customer typed at checkout.

---

## Step 7 — Reviews and restock alerts

Nothing to configure; both are live once 003 has run.

- **Reviews** — customers write them on the product page. They land in
  **Admin → Reviews** marked *Waiting*. Tap **Publish** and it appears on the
  site; the product's star rating recalculates itself. A review whose email
  matches a real order is automatically badged **Verified purchase**.
- **Restock alerts** — a sold-out product shows a "Tell me when it is back"
  form. The waiting list appears at the bottom of **Admin → Reviews**. Restock
  the product and an **Email them** button appears; one tap queues the emails.

---

## Step 8 — Go live: customer accounts and sales analytics

SQL Editor → paste and run **`supabase/008_golive_accounts_analytics.sql`**.

It does four things:

1. **Retires the old "Wears" category.** Its products move to the client's
   categories: anything named *short* goes to Shorts; *trouser*, *jean*, *pant* or
   *cargo* goes to Trousers; everything else (tees, sets, jackets) goes to Casual
   Shirts. Check them in **Admin → Products** afterwards and move any that belong
   elsewhere. A category can no longer be deleted while it still has products.
2. **Removes test data**: orders and subscribers created while testing
   (test@dakardapper.com and anything named "verification test").
3. **Gives every customer a private account page** (`/account.html`): their orders,
   payments, saved pieces, restock waitlist, reviews, viewing and search history
   (which they can delete), and settings. Each person sees only their own rows;
   the database enforces that, not the page.
4. **Adds sales analytics** to the admin home screen (below).

**Optional: start with zero orders.** At the bottom of the file there is a block
marked *OPTIONAL — START COMPLETELY FRESH*. If every order so far was you testing,
select just that block and run it. It deletes all orders and queued mail. It does
not restore stock, so set real stock counts in Admin → Products.

> **Keep "Confirm email" switched on** (Supabase → Authentication → Sign In /
> Providers → Email). An order placed as a guest appears in someone's account only
> after they have confirmed that they own its email address. Without confirmation,
> anyone could sign up with a stranger's email and read that person's orders.

---

## Email marketing, in short

**Admin → Customers → Audience** lists everyone who joined the newsletter or
bought something, and shows what they bought. Pick a filter or a *Smart
audience*, tap **Email this audience**, write the email or pick a template, send
yourself a test, then send.

Only people marked **Can email** receive campaigns: newsletter signups, and
buyers who ticked the box at checkout. Buying alone is not consent to marketing
under the NDPA, so the system will not email those buyers however you filter.
Every campaign email has its own unsubscribe link.

Campaigns go out through the same `send-emails` function as order
confirmations (Step 6), so that has to be deployed first. Order confirmations
always go before campaign mail. Resend's free plan sends 100 emails a day; move
to a paid plan once your list is bigger than that.

---

## Using the admin

Open `admin.html`, or tap **Manage** in the website footer.

**Home** — what needs doing right now (orders waiting, stock alerts), then **Sales**:
pick Today, 7 days, 30 days, 90 days, 12 months or your own dates. You get revenue,
orders, average order, items sold, customers and payment collected, each compared
with the period before. Below that: a revenue or orders chart (tap **Table** for the
exact numbers), best sellers, sales by category, where orders go, and orders by
status (tap one to open those orders). Cancelled orders never count as revenue.

**Orders** — every order, filterable by status and searchable by name, phone or reference.
Tap one to see the full delivery address and the items, message the customer on WhatsApp or
call them with one tap, and move it through Pending → Confirmed → Packed → Shipped →
Delivered. New orders arrive live with a notification, even while you have the page open.

**Products** — tap **−** or **+** on any product to change stock; it saves by itself. The
**Add** button adds a new product: as many photos as you like, price, sizes, colours,
the lot. Photos are shrunk on your phone before uploading, so a 6MB camera shot
becomes about 150KB. The first photo shows in the shop grid; the rest become the
gallery on the product page, and you can promote any photo to main with the ★.
Everything you save appears on the live website immediately.

**Reviews** — approve or hide what customers write, and see who is waiting for a
sold-out item to come back.

**More** — categories, the words on your homepage, delivery threshold, your newsletter list
(exportable as CSV), and a security log of every admin action.

It works the same on your phone as on a laptop.

---

## What to do next

### Cloudflare — worth doing

1. Add your domain to Cloudflare (free plan is enough).
2. Point your nameservers at Cloudflare.
3. Turn on: **Always Use HTTPS**, **Auto Minify**, **Brotli**.
4. Consider **Cloudflare Pages** to host the site itself — free, fast, and it deploys
   straight from your Git repo.

Your images are already 83% smaller than they were, so Cloudflare is now a bonus rather
than a rescue.

### Paystack — when you are ready to take card payments

The groundwork is done: `place_order()` already computes the authoritative total on the
server, and `dd_orders` already has `payment_status` and `payment_ref` columns. What is
left is the part that must never live in the browser:

1. Create a **Supabase Edge Function** called `paystack-init`. It reads the order by
   reference, calls Paystack's initialize endpoint with the total **from the database**,
   and returns the checkout URL. Your Paystack secret key lives here, never in the page.
2. Create a second function, `paystack-webhook`, as your Paystack webhook URL. Verify the
   `x-paystack-signature` header, then set `payment_status = 'paid'` and store the
   reference.
3. Only ever trust the webhook. A customer returning to your success page proves nothing.

Two things that catch people out:

- **Paystack works in kobo.** ₦42,000 is `4200000`. Getting this wrong charges 100× too
  little or too much.
- Do not decrement stock on payment — `place_order()` already reserved it atomically when
  the order was placed.

### Still worth building

- **Card payments (Paystack)**, above. Until then the account page shows each order's
  payment status as you set it in the admin.
- **Categories for tees and jackets.** They currently sit under Casual Shirts; add
  T-Shirts or Jackets in Admin → Products → Categories if the range grows.

---

## Running it locally

```
python -m http.server 8000
```

Then open <http://localhost:8000>. The admin is at
<http://localhost:8000/admin.html>.

---

## Files

| Path | What it is |
|---|---|
| `index.html`, `shop.html`, `product.html` | The storefront |
| `account.html`, `js/account.js`, `css/account.css` | The customer's private account page |
| `admin.html` | The management suite (never loaded by the storefront) |
| `privacy.html`, `shipping.html` | Policy pages, linked from the footer |
| `404.html` | Not-found page |
| `js/db.js` | All database access, in one place |
| `js/app.js` | Storefront behaviour, cart, checkout |
| `js/shop.js` | Shop page filtering and sorting |
| `js/products.js` | Local fallback catalogue and cloud sync |
| `js/admin.js` | The admin suite |
| `css/style.css` | Storefront styles |
| `css/admin.css` | Admin styles |
| `css/page.css` | Policy page styles |
| `supabase/setup.sql` | **The security script from Step 1** |
