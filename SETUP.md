# Dakar Dapper — Setup & Operations

Everything in the code is done. There are **four things only you can do**, because they
need access to your Supabase account. Work through them in order; the whole thing takes
about fifteen minutes.

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

## Using the admin

Open `admin.html`, or tap **Manage** in the website footer.

**Home** — revenue, orders waiting, stock alerts, a 14-day sales chart, your best sellers,
and a feed of everything that has happened.

**Orders** — every order, filterable by status and searchable by name, phone or reference.
Tap one to see the full delivery address and the items, message the customer on WhatsApp or
call them with one tap, and move it through Pending → Confirmed → Packed → Shipped →
Delivered. New orders arrive live with a notification, even while you have the page open.

**Products** — tap **−** or **+** on any product to change stock; it saves by itself. The
**+** button at the bottom right adds a new product: photo, price, sizes, colours, the lot.
Everything you save appears on the live website immediately.

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

- **Individual product pages** with their own URLs, so you can send a customer a link to
  one item and so Google can index each product. This is the single biggest remaining
  growth item.
- **Order confirmation emails** — a Supabase Edge Function plus Resend or Postmark.
- **Real customer reviews.** The star ratings currently shown are placeholders from the
  original build; either collect real ones or remove them before you advertise.

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
| `index.html`, `shop.html` | The storefront |
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
