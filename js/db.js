/* ==========================================================================
   DB.JS — Dakar Dapper data layer
   --------------------------------------------------------------------------
   The anon key below is PUBLIC by design; it is safe to ship because every
   table is protected by Row Level Security (see supabase/setup.sql).
   Anonymous visitors can read the catalogue and nothing else. Orders and
   newsletter signups go through server-side functions that revalidate the
   input and recompute all money. Admin writes require a signed-in admin.
   ========================================================================== */

const SUPABASE_URL = "https://cqcyxiqsxcuqikvbkcrs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxY3l4aXFzeGN1cWlrdmJrY3JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NTY3NTIsImV4cCI6MjEwNTQzMjc1Mn0.pnnfzVRNvTAN_cvpEsSm5GhNhGMjNwudXlLPuJIyn54";

let supabaseClient = null;

(function initSupabase() {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.warn("Dakar Dapper: Supabase library unavailable — running on local data.");
    return;
  }
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "dd_admin_session"
      }
    });
  } catch (err) {
    console.warn("Dakar Dapper: could not initialise Supabase.", err);
  }
})();

function dbReady() { return !!supabaseClient; }

/* ── Row <-> object mapping ─────────────────────────────────────────── */

function mapDbToProduct(row) {
  return {
    id: Number(row.id),
    name: row.name || "",
    subtitle: row.subtitle || "",
    category: row.category,
    badge: row.badge,
    badgeType: row.badge_type || "tag-gold",
    price: Number(row.price) || 0,
    originalPrice: row.original_price ? Number(row.original_price) : null,
    showDiscount: row.show_discount !== false,
    stock: row.stock === undefined || row.stock === null ? 0 : Number(row.stock),
    isOutOfStock: Boolean(row.is_out_of_stock),
    image: row.image || "",
    thumb: row.thumb || "",
    images: Array.isArray(row.images) ? row.images : [],
    sizes: Array.isArray(row.sizes) ? row.sizes : ["S", "M", "L", "XL"],
    colors: Array.isArray(row.colors) ? row.colors : ["#1A1A1A", "#E5E5E5"],
    colorNames: Array.isArray(row.color_names) ? row.color_names : ["Noir", "Bone"],
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    reviews: Number(row.reviews) || 0,
    description: row.description || "",
    details: Array.isArray(row.details) ? row.details : [],
    care: row.care || "",
    isNew: Boolean(row.is_new),
    isActive: row.is_active !== false,
    slug: row.slug || "",
    reviewsVerified: true
  };
}

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function mapProductToDb(p) {
  return {
    id: p.id,
    name: p.name,
    subtitle: p.subtitle || "",
    category: p.category,
    badge: p.badge || null,
    badge_type: p.badgeType || "tag-gold",
    price: p.price,
    original_price: p.originalPrice || null,
    show_discount: p.showDiscount !== false,
    stock: Number(p.stock) || 0,
    is_out_of_stock: (Number(p.stock) || 0) <= 0,
    image: p.image,
    thumb: p.thumb || null,
    images: p.images || [],
    sizes: p.sizes,
    colors: p.colors,
    color_names: p.colorNames,
    description: p.description || "",
    details: p.details || [],
    care: p.care || "",
    is_new: Boolean(p.isNew),
    is_active: p.isActive !== false,
    slug: p.slug || slugify(p.name)
  };
}

function mapDbToContent(d) {
  return {
    heroBadge: d.hero_badge, heroTitle: d.hero_title, heroDesc: d.hero_desc,
    heroBtn1Text: d.hero_btn1_text, heroBtn2Text: d.hero_btn2_text,
    bannerNotice: d.banner_notice, storyKicker: d.story_kicker,
    storyTitle: d.story_title, storyDesc: d.story_desc,
    phone: d.phone, phoneDisplay: d.phone_display,
    instagramUrl: d.instagram_url || "", twitterUrl: d.twitter_url || "",
    emailAddress: d.email_address || "",
    freeShipMin: Number(d.free_ship_min) || 150000,
    popupDelaySec: d.popup_delay_sec || 30,
    // undefined (not []) when migration 007 has not run, so saves skip it
    socials: Array.isArray(d.socials) ? d.socials : undefined
  };
}

/* ══════════════════════════════════════════════════════════════════════
   PUBLIC STOREFRONT READS
   ══════════════════════════════════════════════════════════════════════ */

async function dbFetchProducts() {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from("dd_products").select("*").order("id", { ascending: true });
    if (error) { console.warn("products:", error.message); return null; }
    return (data || []).map(mapDbToProduct);
  } catch (err) { console.warn("products:", err); return null; }
}

async function dbFetchCategories() {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from("dd_categories").select("id,name,display_order")
      .order("display_order", { ascending: true });
    if (error) { console.warn("categories:", error.message); return null; }
    return (data || []).map(c => ({ id: c.id, name: c.name }));
  } catch (err) { console.warn("categories:", err); return null; }
}

async function dbFetchContent() {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from("dd_content").select("*").eq("id", "main").maybeSingle();
    if (error) { console.warn("content:", error.message); return null; }
    return data ? mapDbToContent(data) : null;
  } catch (err) { console.warn("content:", err); return null; }
}

/* One product, by its URL slug. Uses the RPC when available (a single round
   trip that also respects is_active), else falls back to a filtered select. */
async function dbFetchProductBySlug(slug) {
  if (!supabaseClient || !slug) return null;
  try {
    const { data, error } = await supabaseClient.rpc("product_by_slug", { p_slug: slug });
    if (!error && data) return mapDbToProduct(data);
  } catch { /* fall through to the select below */ }

  try {
    const { data, error } = await supabaseClient
      .from("dd_products").select("*").eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    return mapDbToProduct(data);
  } catch { return null; }
}

/* ── Reviews ─────────────────────────────────────────────────────────── */

async function dbFetchReviews(productId) {
  if (!supabaseClient) return { summary: { count: 0, average: 0 }, items: [] };
  try {
    const { data, error } = await supabaseClient.rpc("product_reviews", { p_product_id: productId });
    if (error || !data) return { summary: { count: 0, average: 0 }, items: [] };
    return {
      summary: data.summary || { count: 0, average: 0 },
      items: Array.isArray(data.items) ? data.items : []
    };
  } catch { return { summary: { count: 0, average: 0 }, items: [] }; }
}

async function dbSubmitReview(review) {
  if (!supabaseClient) return { ok: false, message: "We could not reach the store." };
  try {
    const { data, error } = await supabaseClient.rpc("submit_review", { payload: review });
    if (error) return { ok: false, message: error.message || "Could not submit your review." };
    return { ok: true, verified: !!(data && data.verified) };
  } catch {
    return { ok: false, message: "Network error. Please try again." };
  }
}

/* ── Back-in-stock alerts ────────────────────────────────────────────── */

async function dbRequestStockAlert(productId, email, size) {
  if (!supabaseClient) return false;
  try {
    const { data, error } = await supabaseClient.rpc("request_stock_alert", {
      p_product_id: productId, p_email: email, p_size: size || null
    });
    return !error && data !== false;
  } catch { return false; }
}

/* ── Size charts ─────────────────────────────────────────────────────── */

async function dbFetchSizeCharts() {
  if (!supabaseClient) return {};
  try {
    const { data, error } = await supabaseClient
      .from("dd_size_charts").select("category_id,unit,columns,rows,note");
    if (error || !data) return {};
    const byCategory = {};
    data.forEach(c => { byCategory[c.category_id] = c; });
    return byCategory;
  } catch { return {}; }
}

async function dbFetchShippingRates() {
  if (!supabaseClient) return [];
  try {
    const { data, error } = await supabaseClient
      .from("dd_shipping_rates").select("state,fee").order("state");
    if (error) return [];
    return data || [];
  } catch { return []; }
}

/* ══════════════════════════════════════════════════════════════════════
   CHECKOUT — totals are computed on the server, never here
   ══════════════════════════════════════════════════════════════════════ */

async function dbPlaceOrder(orderData) {
  if (!supabaseClient) {
    return { ok: false, message: "We could not reach the store. Check your connection." };
  }
  try {
    const { data, error } = await supabaseClient.rpc("place_order", {
      payload: {
        name: orderData.name,
        email: orderData.email,
        phone: orderData.phone,
        address: orderData.address,
        city: orderData.city,
        state: orderData.state,
        note: orderData.note || "",
        marketing: !!orderData.marketing,
        items: (orderData.items || []).map(i => ({
          id: i.id, qty: i.qty, size: i.size, color: i.color
        }))
      }
    });
    if (error) return { ok: false, message: error.message || "Order could not be placed." };
    return { ok: true, order: data };
  } catch (err) {
    return { ok: false, message: "Network error. Please try again." };
  }
}

async function dbAddSubscriber(email, source = "popup") {
  if (!supabaseClient || !email) return false;
  try {
    const { data, error } = await supabaseClient.rpc("subscribe_email", {
      p_email: email, p_source: source
    });
    return !error && data !== false;
  } catch { return false; }
}

/* ══════════════════════════════════════════════════════════════════════
   CUSTOMER ACCOUNTS
   ══════════════════════════════════════════════════════════════════════ */

function friendlyAuthError(msg) {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login")) return "Email or password is incorrect.";
  if (m.includes("already registered")) return "That email already has an account. Try signing in.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a moment.";
  if (m.includes("password")) return "Password must be at least 8 characters.";
  return msg || "Something went wrong. Please try again.";
}

async function customerSignUp(email, password, fullName) {
  if (!supabaseClient) return { ok: false, message: "Service unavailable." };
  const { data, error } = await supabaseClient.auth.signUp({
    email: String(email || "").trim(),
    password,
    options: { data: { full_name: String(fullName || "").trim().slice(0, 120) } }
  });
  if (error) return { ok: false, message: friendlyAuthError(error.message) };
  return { ok: true, user: data.user, needsConfirm: !data.session };
}

async function customerSignIn(email, password) {
  if (!supabaseClient) return { ok: false, message: "Service unavailable." };
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: String(email || "").trim(), password
  });
  if (error) return { ok: false, message: friendlyAuthError(error.message) };
  return { ok: true, user: data.user };
}

async function customerSignOut() {
  if (supabaseClient) await supabaseClient.auth.signOut();
}

async function customerCurrent() {
  if (!supabaseClient) return null;
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session ? session.user : null;
}

async function customerOrders() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.from("dd_orders")
    .select("order_number,items,total,status,payment_status,created_at")
    .order("created_at", { ascending: false }).limit(25);
  return error ? [] : (data || []);
}

/* ══════════════════════════════════════════════════════════════════════
   ADMIN AUTH
   ══════════════════════════════════════════════════════════════════════ */

async function authSignIn(email, password) {
  if (!supabaseClient) return { ok: false, message: "Service unavailable." };
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };

  const { data: isAdmin, error: rpcErr } = await supabaseClient.rpc("is_admin");
  if (rpcErr || !isAdmin) {
    await supabaseClient.auth.signOut();
    return { ok: false, message: "This account is not authorised for the admin suite." };
  }
  return { ok: true, user: data.user };
}

async function authSignOut() {
  if (supabaseClient) await supabaseClient.auth.signOut();
}

async function authCurrentAdmin() {
  if (!supabaseClient) return null;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return null;
  const { data: isAdmin } = await supabaseClient.rpc("is_admin");
  return isAdmin ? session.user : null;
}

async function authSendReset(email) {
  if (!supabaseClient) return false;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/admin.html"
  });
  return !error;
}

/* ══════════════════════════════════════════════════════════════════════
   ADMIN WRITES — every one of these is rejected by the database unless
   the caller holds a valid admin session.
   ══════════════════════════════════════════════════════════════════════ */

async function dbSaveProduct(product) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const { error } = await supabaseClient
    .from("dd_products").upsert(mapProductToDb(product), { onConflict: "id" });
  if (error) return { ok: false, message: error.message };
  dbLog("product.save", "product", String(product.id), { name: product.name });
  return { ok: true };
}

async function dbDeleteProduct(id) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const { error } = await supabaseClient.from("dd_products").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  dbLog("product.delete", "product", String(id));
  return { ok: true };
}

async function dbSetStock(id, stock) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const s = Math.max(0, Number(stock) || 0);
  const { error } = await supabaseClient.from("dd_products")
    .update({ stock: s, is_out_of_stock: s <= 0 }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  dbLog("product.stock", "product", String(id), { stock: s });
  return { ok: true };
}

async function dbNextProductId() {
  if (!supabaseClient) return Date.now() % 100000;
  const { data } = await supabaseClient
    .from("dd_products").select("id").order("id", { ascending: false }).limit(1);
  return data && data.length ? Number(data[0].id) + 1 : 1;
}

async function dbSaveCategory(cat, order = 99) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const { error } = await supabaseClient.from("dd_categories")
    .upsert({ id: cat.id, name: cat.name, display_order: order }, { onConflict: "id" });
  if (error) return { ok: false, message: error.message };
  dbLog("category.save", "category", cat.id);
  return { ok: true };
}

async function dbDeleteCategory(id) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const { error } = await supabaseClient.from("dd_categories").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  dbLog("category.delete", "category", id);
  return { ok: true };
}

async function dbSaveContent(c) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const { error } = await supabaseClient.from("dd_content").upsert({
    id: "main",
    hero_badge: c.heroBadge, hero_title: c.heroTitle, hero_desc: c.heroDesc,
    hero_btn1_text: c.heroBtn1Text, hero_btn2_text: c.heroBtn2Text,
    banner_notice: c.bannerNotice, story_kicker: c.storyKicker,
    story_title: c.storyTitle, story_desc: c.storyDesc,
    phone: c.phone, phone_display: c.phoneDisplay,
    instagram_url: c.instagramUrl, twitter_url: c.twitterUrl,
    email_address: c.emailAddress,
    free_ship_min: c.freeShipMin, popup_delay_sec: c.popupDelaySec,
    ...(Array.isArray(c.socials) ? { socials: c.socials } : {})
  }, { onConflict: "id" });
  if (error) return { ok: false, message: error.message };
  dbLog("content.save", "content", "main");
  return { ok: true };
}

async function dbFetchOrders({ status = "all", search = "", limit = 100 } = {}) {
  if (!supabaseClient) return [];
  let q = supabaseClient.from("dd_orders").select("*")
    .order("created_at", { ascending: false }).limit(limit);
  if (status !== "all") q = q.eq("status", status);
  if (search) {
    const s = `%${search}%`;
    q = q.or(`customer_name.ilike.${s},customer_phone.ilike.${s},order_number.ilike.${s},customer_email.ilike.${s}`);
  }
  const { data, error } = await q;
  if (error) { console.warn("orders:", error.message); return []; }
  return data || [];
}

async function dbUpdateOrderStatus(id, status) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const { error } = await supabaseClient.from("dd_orders")
    .update({ status }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  dbLog("order.status", "order", String(id), { status });
  return { ok: true };
}

async function dbUpdateOrderPayment(id, payment_status) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const { error } = await supabaseClient.from("dd_orders")
    .update({ payment_status }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  dbLog("order.payment", "order", String(id), { payment_status });
  return { ok: true };
}

/* ── Admin: review moderation ────────────────────────────────────────── */

async function dbFetchReviewsForAdmin({ status = "pending", limit = 100 } = {}) {
  if (!supabaseClient) return [];
  let q = supabaseClient.from("dd_reviews")
    .select("*, dd_products(name,image)")
    .order("created_at", { ascending: false }).limit(limit);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) { console.warn("reviews:", error.message); return []; }
  return data || [];
}

async function dbSetReviewStatus(id, status) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const { error } = await supabaseClient.from("dd_reviews").update({ status }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  dbLog("review." + status, "review", String(id));
  return { ok: true };
}

async function dbDeleteReview(id) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const { error } = await supabaseClient.from("dd_reviews").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  dbLog("review.delete", "review", String(id));
  return { ok: true };
}

/* ── Admin: who is waiting for a restock ─────────────────────────────── */

async function dbFetchStockAlerts() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.rpc("pending_stock_alerts");
  if (error) { console.warn("stock alerts:", error.message); return []; }
  return Array.isArray(data) ? data : [];
}

async function dbMarkAlertsNotified(productId) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const { data, error } = await supabaseClient.rpc("mark_alerts_notified", { p_product_id: productId });
  if (error) return { ok: false, message: error.message };
  return { ok: true, count: data };
}

/* Queue a back-in-stock email for everyone waiting on this product. */
async function dbQueueBackInStock(product, people) {
  if (!supabaseClient || !people?.length) return { ok: false, message: "Nobody waiting." };
  const rows = people.map(person => ({
    to_email: person.email,
    template: "back_in_stock",
    payload: {
      product_name: product.product_name,
      product_image: product.product_image,
      slug: product.slug || ""
    }
  }));
  const { error } = await supabaseClient.from("dd_email_queue").insert(rows);
  if (error) return { ok: false, message: error.message };
  dbLog("alerts.queued", "product", String(product.product_id), { count: rows.length });
  return { ok: true, count: rows.length };
}

async function dbEmailQueueSummary() {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient.rpc("email_queue_summary");
  return error ? null : data;
}

async function dbSaveSizeChart(chart) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const { error } = await supabaseClient.from("dd_size_charts").upsert({
    category_id: chart.category_id,
    unit: chart.unit || "cm",
    columns: chart.columns,
    rows: chart.rows,
    note: chart.note || null,
    updated_at: new Date().toISOString()
  }, { onConflict: "category_id" });
  if (error) return { ok: false, message: error.message };
  dbLog("sizechart.save", "category", chart.category_id);
  return { ok: true };
}

async function dbFetchSubscribers(limit = 500) {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.from("dd_subscribers")
    .select("*").order("created_at", { ascending: false }).limit(limit);
  return error ? [] : (data || []);
}

async function dbAdminStats() {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient.rpc("admin_stats");
  if (error) { console.warn("stats:", error.message); return null; }
  return data;
}

async function dbFetchAuditLog(limit = 50) {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.from("dd_audit_log")
    .select("*").order("created_at", { ascending: false }).limit(limit);
  return error ? [] : (data || []);
}

function dbLog(action, entity, entityId, detail) {
  if (!supabaseClient) return;
  supabaseClient.rpc("log_admin_action", {
    p_action: action, p_entity: entity || null,
    p_entity_id: entityId || null, p_detail: detail || null
  }).then(() => {}, () => {});
}

/* ══════════════════════════════════════════════════════════════════════
   PRODUCT IMAGE UPLOAD (Supabase Storage bucket: "products")
   ══════════════════════════════════════════════════════════════════════ */

async function dbUploadProductImage(file, onProgress) {
  if (!supabaseClient) return { ok: false, message: "Offline." };

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"];
  if (!allowed.includes(file.type)) {
    return { ok: false, message: "Please choose a JPG, PNG or WebP image." };
  }
  // Generous, because we are about to shrink it ourselves.
  if (file.size > 25 * 1024 * 1024) {
    return { ok: false, message: "That image is over 25MB. Please pick a smaller one." };
  }

  // Shrink on the device first. A 6MB phone photo becomes ~150KB before it
  // ever touches the network, so uploads are fast even on mobile data.
  let opt;
  try {
    if (onProgress) onProgress("Optimising…");
    opt = await optimizeImage(file);
  } catch (err) {
    return { ok: false, message: "Could not read that image. Try a different photo." };
  }

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${stamp}.${opt.ext}`;
  const thumbPath = `${stamp}-thumb.${opt.ext}`;

  if (onProgress) onProgress(`Uploading ${formatBytes(opt.after)}…`);

  const { error } = await supabaseClient.storage
    .from("products")
    .upload(path, opt.blob, { cacheControl: "31536000", upsert: false, contentType: opt.mime });
  if (error) return { ok: false, message: error.message };

  // The thumbnail is a nice-to-have; a failure here must not lose the upload.
  let thumbUrl = "";
  if (opt.thumbBlob) {
    const { error: tErr } = await supabaseClient.storage
      .from("products")
      .upload(thumbPath, opt.thumbBlob, { cacheControl: "31536000", upsert: false, contentType: opt.mime });
    if (!tErr) {
      thumbUrl = supabaseClient.storage.from("products").getPublicUrl(thumbPath).data.publicUrl;
    }
  }

  const { data } = supabaseClient.storage.from("products").getPublicUrl(path);
  dbLog("image.upload", "storage", path, { before: opt.before, after: opt.after });

  return {
    ok: true,
    url: data.publicUrl,
    thumbUrl,
    before: opt.before,
    after: opt.after,
    saved: opt.saved,
    width: opt.width,
    height: opt.height
  };
}

/* ── Realtime: push catalogue changes to open storefronts ───────────── */
function dbSubscribeToCatalog(onChange) {
  if (!supabaseClient) return null;
  return supabaseClient.channel("dd_catalog")
    .on("postgres_changes", { event: "*", schema: "public", table: "dd_products" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "dd_content" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "dd_categories" }, onChange)
    .subscribe();
}

function dbSubscribeToOrders(onInsert) {
  if (!supabaseClient) return null;
  return supabaseClient.channel("dd_orders_live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "dd_orders" }, onInsert)
    .subscribe();
}

/* ══════════════════════════════════════════════════════════════════════
   EMAIL MARKETING (admin)
   Audience filtering and campaign sending run inside the database, so the
   "only people who agreed to marketing" rule cannot be bypassed from here.
   ══════════════════════════════════════════════════════════════════════ */

async function dbAudience(filter = {}) {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient.rpc("audience", { p_filter: filter });
  if (error) { console.warn("audience:", error.message); return null; }
  return data;
}

async function dbFetchCampaigns() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.from("dd_campaigns")
    .select("*").order("created_at", { ascending: false }).limit(100);
  return error ? [] : (data || []);
}

async function dbSaveCampaign(c) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const row = {
    name: c.name, subject: c.subject, preheader: c.preheader || null,
    headline: c.headline || null, body: c.body || null,
    cta_text: c.cta_text || "Shop now", cta_url: c.cta_url || null,
    product_ids: c.product_ids || [], segment: c.segment || {}
  };
  const q = c.id
    ? supabaseClient.from("dd_campaigns").update(row).eq("id", c.id).eq("status", "draft").select().single()
    : supabaseClient.from("dd_campaigns").insert(row).select().single();
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  return { ok: true, campaign: data };
}

async function dbDeleteCampaign(id) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const { error } = await supabaseClient.from("dd_campaigns").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

async function dbSendCampaign(id, testEmail) {
  if (!supabaseClient) return { ok: false, message: "Offline." };
  const { data, error } = await supabaseClient.rpc("send_campaign", {
    p_id: id, p_test_email: testEmail || null
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, ...data };
}

async function dbCampaignStats() {
  if (!supabaseClient) return {};
  const { data, error } = await supabaseClient.rpc("campaign_stats");
  return error ? {} : (data || {});
}

/* Public: the link at the bottom of every campaign email. */
async function dbUnsubscribe(token) {
  if (!supabaseClient || !token) return { ok: false };
  try {
    const { data, error } = await supabaseClient.rpc("unsubscribe", { p_token: token });
    return error ? { ok: false } : (data || { ok: false });
  } catch { return { ok: false }; }
}
