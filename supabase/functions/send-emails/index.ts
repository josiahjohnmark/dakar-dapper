/* ==========================================================================
   send-emails — Supabase Edge Function
   --------------------------------------------------------------------------
   Drains dd_email_queue and sends each message through Resend.

   Deploy:
     supabase functions deploy send-emails
     supabase secrets set RESEND_API_KEY=re_xxx
     supabase secrets set FROM_EMAIL="Dakar Dapper <orders@yourdomain.com>"
     supabase secrets set STORE_URL="https://dakar-dapper.vercel.app"
     supabase secrets set WHATSAPP_NUMBER="2349019603621"

   Trigger it every minute from the Supabase dashboard
   (Database -> Cron, or Integrations -> Cron):
     select net.http_post(
       url    := 'https://<project-ref>.supabase.co/functions/v1/send-emails',
       headers:= '{"Authorization":"Bearer <service-role-key>"}'::jsonb
     );

   The service role key never leaves the server. Nothing here is reachable
   from the browser.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Dakar Dapper <onboarding@resend.dev>";
const STORE_URL = Deno.env.get("STORE_URL") ?? "https://dakar-dapper.vercel.app";
const WHATSAPP = Deno.env.get("WHATSAPP_NUMBER") ?? "2349019603621";

const BATCH = 20;
const MAX_ATTEMPTS = 4;

/* ── helpers ─────────────────────────────────────────────────────────── */

const naira = (n: unknown) =>
  "₦" + Number(n ?? 0).toLocaleString("en-NG");

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* Absolute URL — email clients cannot resolve relative paths. */
const img = (src: unknown) => {
  const s = String(src ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return STORE_URL.replace(/\/$/, "") + "/" + s.replace(/^\//, "");
};

/* ── order confirmation ──────────────────────────────────────────────── */

interface OrderItem {
  id: number; name: string; image?: string;
  price: number; qty: number; size?: string; color?: string;
}

function orderConfirmationSubject(p: Record<string, unknown>) {
  return `Order ${p.order_number} confirmed — Dakar Dapper`;
}

function orderConfirmationHtml(p: Record<string, any>) {
  const items: OrderItem[] = Array.isArray(p.items) ? p.items : [];
  const firstName = String(p.name ?? "there").split(" ")[0];
  const placed = p.placed_at
    ? new Date(p.placed_at).toLocaleDateString("en-NG",
        { day: "numeric", month: "long", year: "numeric" })
    : "";

  const waText = encodeURIComponent(
    `Hello Dakar Dapper, I'm checking on order ${p.order_number}.`);

  const rows = items.map((it) => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #EAE6DF;vertical-align:top;width:64px">
        ${it.image ? `<img src="${esc(img(it.image))}" width="56" height="70" alt=""
             style="display:block;width:56px;height:70px;object-fit:cover;border-radius:6px;background:#F0EDE7">` : ""}
      </td>
      <td style="padding:14px 12px;border-bottom:1px solid #EAE6DF;vertical-align:top">
        <div style="font-size:14px;font-weight:600;color:#1A1A1A;line-height:1.4">${esc(it.name)}</div>
        <div style="font-size:12px;color:#7A7468;margin-top:3px">
          ${[it.size, it.color].filter(Boolean).map(esc).join(" &middot; ")}
          ${it.size || it.color ? " &middot; " : ""}Qty ${esc(it.qty)}
        </div>
      </td>
      <td style="padding:14px 0;border-bottom:1px solid #EAE6DF;vertical-align:top;
                 text-align:right;font-size:14px;font-weight:600;color:#1A1A1A;white-space:nowrap">
        ${esc(naira(Number(it.price) * Number(it.qty)))}
      </td>
    </tr>`).join("");

  const addressLines = [p.address, [p.city, p.state].filter(Boolean).join(", ")]
    .filter(Boolean).map((l: string) => esc(l)).join("<br>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(orderConfirmationSubject(p))}</title>
</head>
<body style="margin:0;padding:0;background:#F4F2EE;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <!-- Preheader: what shows in the inbox preview -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">
    Your order ${esc(p.order_number)} is confirmed. Total ${esc(naira(p.total))}.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2EE;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden;
                    box-shadow:0 1px 3px rgba(20,19,14,.06)">

        <!-- Header -->
        <tr>
          <td style="background:#14130E;padding:26px 28px;text-align:center">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;
                        letter-spacing:.14em;color:#FFFFFF;font-weight:600">DAKAR DAPPER</div>
            <div style="font-size:10px;letter-spacing:.22em;color:#B8965A;
                        text-transform:uppercase;margin-top:5px">Proper Men's Fashion Line</div>
          </td>
        </tr>

        <!-- Confirmation -->
        <tr>
          <td style="padding:32px 28px 8px;text-align:center">
            <div style="width:52px;height:52px;line-height:52px;border-radius:50%;
                        background:#E8F5E9;color:#1B7F32;font-size:24px;margin:0 auto 16px">&#10003;</div>
            <h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:24px;
                       color:#1A1A1A;font-weight:600">Thank you, ${esc(firstName)}</h1>
            <p style="margin:0;font-size:14px;color:#6B6558;line-height:1.6">
              Your order is confirmed and we are preparing it now.
            </p>
          </td>
        </tr>

        <!-- Reference -->
        <tr>
          <td style="padding:22px 28px 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="background:#F7F5F1;border-radius:10px">
              <tr>
                <td style="padding:16px 18px;text-align:center">
                  <div style="font-size:11px;letter-spacing:.14em;color:#8A8377;
                              text-transform:uppercase">Order reference</div>
                  <div style="font-size:20px;font-weight:700;letter-spacing:.08em;
                              color:#1A1A1A;margin-top:4px">${esc(p.order_number)}</div>
                  ${placed ? `<div style="font-size:12px;color:#8A8377;margin-top:4px">Placed ${esc(placed)}</div>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Items -->
        <tr>
          <td style="padding:26px 28px 0">
            <div style="font-size:11px;letter-spacing:.14em;color:#8A8377;
                        text-transform:uppercase;font-weight:700;
                        padding-bottom:6px;border-bottom:2px solid #1A1A1A">
              Your order
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${rows}
            </table>
          </td>
        </tr>

        <!-- Totals -->
        <tr>
          <td style="padding:18px 28px 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
              <tr>
                <td style="padding:5px 0;color:#6B6558">Subtotal</td>
                <td style="padding:5px 0;text-align:right;color:#1A1A1A">${esc(naira(p.subtotal))}</td>
              </tr>
              <tr>
                <td style="padding:5px 0;color:#6B6558">Delivery</td>
                <td style="padding:5px 0;text-align:right;color:#1A1A1A">
                  ${Number(p.shipping) === 0 ? "FREE" : esc(naira(p.shipping))}
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0 0;border-top:1px solid #EAE6DF;
                           font-size:16px;font-weight:700;color:#1A1A1A">Total</td>
                <td style="padding:12px 0 0;border-top:1px solid #EAE6DF;text-align:right;
                           font-size:16px;font-weight:700;color:#1A1A1A">${esc(naira(p.total))}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Delivery -->
        <tr>
          <td style="padding:26px 28px 0">
            <div style="font-size:11px;letter-spacing:.14em;color:#8A8377;
                        text-transform:uppercase;font-weight:700;
                        padding-bottom:6px;border-bottom:2px solid #1A1A1A">
              Delivering to
            </div>
            <div style="font-size:14px;color:#1A1A1A;line-height:1.7;padding-top:12px">
              <strong>${esc(p.name)}</strong><br>
              ${addressLines}<br>
              <span style="color:#6B6558">${esc(p.phone)}</span>
            </div>
            ${p.note ? `<div style="font-size:13px;color:#6B6558;margin-top:10px;
                          padding:10px 12px;background:#F7F5F1;border-radius:8px">
                          <strong style="color:#1A1A1A">Your note:</strong> ${esc(p.note)}</div>` : ""}
          </td>
        </tr>

        <!-- What happens next -->
        <tr>
          <td style="padding:26px 28px 0">
            <div style="font-size:11px;letter-spacing:.14em;color:#8A8377;
                        text-transform:uppercase;font-weight:700;
                        padding-bottom:6px;border-bottom:2px solid #1A1A1A">
              What happens next
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="font-size:14px;color:#6B6558;line-height:1.6;padding-top:12px">
              <tr><td style="padding:6px 0"><strong style="color:#1A1A1A">1.</strong>
                We confirm your order and payment on WhatsApp.</td></tr>
              <tr><td style="padding:6px 0"><strong style="color:#1A1A1A">2.</strong>
                Your pieces are packed with care.</td></tr>
              <tr><td style="padding:6px 0"><strong style="color:#1A1A1A">3.</strong>
                We hand over to the courier &mdash; 1&ndash;2 days in Lagos, 3&ndash;7 nationwide.</td></tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:26px 28px 8px;text-align:center">
            <a href="https://wa.me/${esc(WHATSAPP)}?text=${waText}"
               style="display:inline-block;background:#25D366;color:#FFFFFF;
                      text-decoration:none;padding:14px 30px;border-radius:8px;
                      font-size:14px;font-weight:700">Chat with us on WhatsApp</a>
            <div style="margin-top:12px">
              <a href="${esc(STORE_URL)}/shop.html"
                 style="font-size:13px;color:#6B6558;text-decoration:underline">Continue shopping</a>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:26px 28px 30px;text-align:center;border-top:1px solid #EAE6DF;margin-top:20px">
            <p style="margin:0 0 8px;font-size:12px;color:#8A8377;line-height:1.6">
              Questions about this order? Reply to this email or message us on WhatsApp,
              quoting <strong>${esc(p.order_number)}</strong>.
            </p>
            <p style="margin:0;font-size:11px;color:#A8A196">
              Dakar Dapper &middot; Mainland, Lagos, Nigeria<br>
              <a href="${esc(STORE_URL)}/shipping.html" style="color:#A8A196">Shipping &amp; Returns</a> &middot;
              <a href="${esc(STORE_URL)}/privacy.html" style="color:#A8A196">Privacy</a>
            </p>
          </td>
        </tr>
      </table>

      <div style="max-width:560px;margin:14px auto 0;font-size:11px;color:#A8A196;text-align:center">
        You are receiving this because you placed an order at Dakar Dapper.
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

/* Plain-text alternative — some clients, and every spam filter, want one. */
function orderConfirmationText(p: Record<string, any>) {
  const items: OrderItem[] = Array.isArray(p.items) ? p.items : [];
  const lines = items.map(it =>
    `  - ${it.name}${it.size ? ` (${it.size})` : ""} x${it.qty}  ${naira(Number(it.price) * Number(it.qty))}`);

  return [
    `DAKAR DAPPER`,
    ``,
    `Thank you, ${String(p.name ?? "").split(" ")[0]}.`,
    `Your order is confirmed and we are preparing it now.`,
    ``,
    `Order reference: ${p.order_number}`,
    ``,
    `YOUR ORDER`,
    ...lines,
    ``,
    `Subtotal: ${naira(p.subtotal)}`,
    `Delivery: ${Number(p.shipping) === 0 ? "FREE" : naira(p.shipping)}`,
    `Total:    ${naira(p.total)}`,
    ``,
    `DELIVERING TO`,
    `${p.name}`,
    `${p.address}`,
    `${[p.city, p.state].filter(Boolean).join(", ")}`,
    `${p.phone}`,
    ``,
    `WHAT HAPPENS NEXT`,
    `1. We confirm your order and payment on WhatsApp.`,
    `2. Your pieces are packed with care.`,
    `3. We hand over to the courier - 1-2 days in Lagos, 3-7 nationwide.`,
    ``,
    `Questions? Message us on https://wa.me/${WHATSAPP} quoting ${p.order_number}.`,
    ``,
    `Dakar Dapper - Mainland, Lagos, Nigeria`,
    `${STORE_URL}`
  ].join("\n");
}

/* ── back in stock ───────────────────────────────────────────────────── */

function backInStockHtml(p: Record<string, any>) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F2EE;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">
    ${esc(p.product_name)} is back in stock.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#FFFFFF;border-radius:14px;overflow:hidden">
        <tr><td style="background:#14130E;padding:24px;text-align:center">
          <div style="font-family:Georgia,serif;font-size:20px;letter-spacing:.14em;
                      color:#FFF;font-weight:600">DAKAR DAPPER</div>
        </td></tr>
        <tr><td style="padding:30px 28px;text-align:center">
          <div style="font-size:11px;letter-spacing:.18em;color:#B8965A;
                      text-transform:uppercase;font-weight:700">Back in stock</div>
          <h1 style="margin:10px 0 6px;font-family:Georgia,serif;font-size:23px;color:#1A1A1A">
            ${esc(p.product_name)}
          </h1>
          <p style="margin:0 0 20px;font-size:14px;color:#6B6558;line-height:1.6">
            You asked us to let you know. It is available again &mdash; but stock is limited.
          </p>
          ${p.product_image ? `<img src="${esc(img(p.product_image))}" width="240" alt=""
              style="display:block;margin:0 auto 20px;width:240px;max-width:100%;
                     border-radius:10px;background:#F0EDE7">` : ""}
          <a href="${esc(STORE_URL)}/product/${esc(p.slug ?? "")}"
             style="display:inline-block;background:#14130E;color:#FFF;text-decoration:none;
                    padding:14px 32px;border-radius:8px;font-size:14px;font-weight:700">
            Shop it now
          </a>
        </td></tr>
        <tr><td style="padding:0 28px 28px;text-align:center;font-size:11px;color:#A8A196">
          You asked for this alert at Dakar Dapper. We will not email you about it again.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* ── templates ───────────────────────────────────────────────────────── */

function render(template: string, payload: Record<string, any>) {
  switch (template) {
    case "order_confirmation":
      return {
        subject: orderConfirmationSubject(payload),
        html: orderConfirmationHtml(payload),
        text: orderConfirmationText(payload)
      };
    case "back_in_stock":
      return {
        subject: `${payload.product_name} is back in stock — Dakar Dapper`,
        html: backInStockHtml(payload),
        text: `${payload.product_name} is back in stock at Dakar Dapper.\n` +
              `${STORE_URL}/product/${payload.slug ?? ""}`
      };
    default:
      return null;
  }
}

/* ── send ────────────────────────────────────────────────────────────── */

async function sendViaResend(to: string, subject: string, html: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, text })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!RESEND_API_KEY) {
    return Response.json({ error: "RESEND_API_KEY is not set" }, { status: 500 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false }
  });

  const { data: jobs, error } = await db
    .from("dd_email_queue")
    .select("*")
    .eq("status", "queued")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!jobs?.length) return Response.json({ sent: 0, failed: 0, message: "nothing queued" });

  let sent = 0, failed = 0;

  for (const job of jobs) {
    const rendered = render(job.template, job.payload ?? {});

    if (!rendered) {
      await db.from("dd_email_queue").update({
        status: "failed",
        last_error: `Unknown template: ${job.template}`,
        attempts: (job.attempts ?? 0) + 1
      }).eq("id", job.id);
      failed++;
      continue;
    }

    try {
      await sendViaResend(job.to_email, rendered.subject, rendered.html, rendered.text);
      await db.from("dd_email_queue").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        attempts: (job.attempts ?? 0) + 1,
        last_error: null
      }).eq("id", job.id);
      sent++;
    } catch (err) {
      const attempts = (job.attempts ?? 0) + 1;
      await db.from("dd_email_queue").update({
        // Keep it queued so a transient failure is retried, up to MAX_ATTEMPTS.
        status: attempts >= MAX_ATTEMPTS ? "failed" : "queued",
        attempts,
        last_error: String(err).slice(0, 500)
      }).eq("id", job.id);
      failed++;
    }
  }

  return Response.json({ sent, failed, processed: jobs.length });
});
