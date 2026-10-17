/* ==========================================================================
   paystack-webhook — Supabase Edge Function
   --------------------------------------------------------------------------
   Handles:
     1. Paystack Webhook (POST with x-paystack-signature)
     2. Instant transaction verification from client (?action=verify)

   Deploy:
     supabase functions deploy paystack-webhook
     supabase secrets set PAYSTACK_SECRET_KEY=sk_test_... (or sk_live_...)

   Paystack Dashboard Webhook URL:
     https://<project-ref>.supabase.co/functions/v1/paystack-webhook
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};

// Web Crypto HMAC SHA-512 signature check
async function verifyPaystackSignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const hex = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex.toLowerCase() === signature.trim().toLowerCase();
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false }
  });
  const rawBody = await req.text();

  const isVerifyAction = url.searchParams.get("action") === "verify";
  const isInitAction = url.searchParams.get("action") === "initialize";

  // --------------------------------------------------------------------------
  // ACTION: Direct Paystack hosted checkout initialization (ad-blocker fallback)
  // --------------------------------------------------------------------------
  if (isInitAction) {
    if (!PAYSTACK_SECRET_KEY) {
      return Response.json(
        { ok: false, message: "PAYSTACK_SECRET_KEY not set in Supabase Secrets." },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    let payload: { email?: string; amount?: number; order_number?: string; callback_url?: string } = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return Response.json({ ok: false, message: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
    }

    const { email, amount, order_number, callback_url } = payload;
    if (!email || !amount) {
      return Response.json({ ok: false, message: "Missing email or amount" }, { status: 400, headers: CORS_HEADERS });
    }

    try {
      const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          amount,
          reference: order_number ? `${order_number}-${Math.floor(Math.random() * 1000)}` : undefined,
          callback_url: callback_url || `${url.origin}/account.html`,
          metadata: { order_number }
        })
      });
      const initJson = await initRes.json();
      return Response.json(initJson, { status: initRes.status, headers: CORS_HEADERS });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ ok: false, message: msg }, { status: 500, headers: CORS_HEADERS });
    }
  }

  // --------------------------------------------------------------------------
  // ACTION: In-browser immediate verification (called by checkout after popup)
  // --------------------------------------------------------------------------
  if (isVerifyAction) {
    if (!PAYSTACK_SECRET_KEY) {
      return Response.json(
        { ok: false, message: "PAYSTACK_SECRET_KEY not set in Supabase Secrets." },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    let payload: { reference?: string; order_number?: string } = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return Response.json({ ok: false, message: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
    }

    const reference = payload.reference || url.searchParams.get("reference");
    const orderNumber = payload.order_number || url.searchParams.get("order_number");

    if (!reference) {
      return Response.json({ ok: false, message: "Missing reference" }, { status: 400, headers: CORS_HEADERS });
    }

    try {
      // Query Paystack verify endpoint
      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      });
      const verifyJson = await verifyRes.json();

      if (!verifyRes.ok || !verifyJson.status || verifyJson.data?.status !== "success") {
        return Response.json(
          { ok: false, message: verifyJson.message || "Payment not verified" },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const tx = verifyJson.data;
      const ref = tx.reference;
      const targetOrder = orderNumber || tx.metadata?.order_number || ref;

      // Update order in Supabase
      const { data: updated, error } = await db
        .from("dd_orders")
        .update({
          payment_status: "paid",
          payment_ref: ref,
          payment_gateway: "paystack",
          paid_at: tx.paid_at || new Date().toISOString(),
          status: "confirmed",
          updated_at: new Date().toISOString()
        })
        .or(`order_number.eq.${targetOrder},payment_ref.eq.${ref}`)
        .select()
        .single();

      if (error) {
        console.warn("Could not find order to update:", error.message);
      }

      return Response.json(
        {
          ok: true,
          status: "paid",
          order_number: updated?.order_number || targetOrder,
          amount_paid: tx.amount,
          reference: ref
        },
        { headers: CORS_HEADERS }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ ok: false, message: msg }, { status: 500, headers: CORS_HEADERS });
    }
  }

  // --------------------------------------------------------------------------
  // ACTION: Paystack Webhook (POST from Paystack servers)
  // --------------------------------------------------------------------------
  const signature = req.headers.get("x-paystack-signature");
  if (!signature) {
    return Response.json({ error: "No signature provided" }, { status: 401, headers: CORS_HEADERS });
  }

  const isValid = await verifyPaystackSignature(rawBody, signature, PAYSTACK_SECRET_KEY);
  if (!isValid) {
    console.error("Invalid Paystack webhook signature rejected");
    return Response.json({ error: "Invalid signature" }, { status: 401, headers: CORS_HEADERS });
  }

  let eventData: any = null;
  try {
    eventData = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Malformed payload" }, { status: 400, headers: CORS_HEADERS });
  }

  // Handle charge.success
  if (eventData?.event === "charge.success") {
    const data = eventData.data;
    const ref = data.reference;
    const orderNumber = data.metadata?.order_number || ref;

    console.log(`Processing successful Paystack charge for order ${orderNumber} (Ref: ${ref})`);

    const { error } = await db
      .from("dd_orders")
      .update({
        payment_status: "paid",
        payment_ref: ref,
        payment_gateway: "paystack",
        paid_at: data.paid_at || new Date().toISOString(),
        status: "confirmed",
        updated_at: new Date().toISOString()
      })
      .or(`order_number.eq.${orderNumber},payment_ref.eq.${ref}`);

    if (error) {
      console.error(`Failed to update order ${orderNumber} on webhook:`, error.message);
    }
  }

  return Response.json({ received: true }, { headers: CORS_HEADERS });
});
