/* ==========================================================================
   ACCOUNT.JS — the customer's own profile
   --------------------------------------------------------------------------
   Orders, payments, saved pieces, restock waitlist, reviews, viewing and
   search history, and settings. Every request goes through database rules
   that return only the signed-in person's own rows; there is no way to ask
   this page for anyone else's data.
   ========================================================================== */

const ACC_TABS = [
  { id: "overview", label: "Overview" },
  { id: "orders",   label: "Orders" },
  { id: "payments", label: "Payments" },
  { id: "saved",    label: "Saved" },
  { id: "waitlist", label: "Waitlist" },
  { id: "reviews",  label: "Reviews" },
  { id: "history",  label: "History" },
  { id: "settings", label: "Settings" }
];

const ORDER_STEPS = [
  { id: "pending",   label: "Received" },
  { id: "confirmed", label: "Confirmed" },
  { id: "packed",    label: "Packed" },
  { id: "shipped",   label: "On its way" },
  { id: "delivered", label: "Delivered" }
];

const PAY_LABEL = { paid: "Paid", unpaid: "Awaiting payment", refunded: "Refunded", failed: "Failed" };

const ACC = {
  user: null, data: null, tab: "overview",
  wish: [], viewed: [], searches: [],
  orderFilter: "all", orderQuery: "", payFilter: "all", payPeriod: "all",
  loading: false
};

/* ── Boot ────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  const fromHash = (location.hash || "").replace("#", "");
  if (ACC_TABS.some(t => t.id === fromHash)) ACC.tab = fromHash;

  if (typeof supabaseClient !== "undefined" && supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") { ACC.recovery = true; loadAccount(); }
      else if (event === "SIGNED_IN" || event === "SIGNED_OUT") loadAccount();
    });
  }

  window.addEventListener("hashchange", () => {
    const t = location.hash.replace("#", "");
    if (ACC_TABS.some(x => x.id === t) && t !== ACC.tab) { ACC.tab = t; renderAccount(); }
  });

  // The catalogue is needed to show saved and viewed pieces.
  if (typeof syncFromSupabase === "function") await syncFromSupabase();
  loadAccount();
});

async function loadAccount() {
  if (ACC.loading) return;
  ACC.loading = true;
  try {
    ACC.user = typeof customerCurrent === "function" ? await customerCurrent() : null;
    if (!ACC.user) { ACC.data = null; renderSignedOut(); return; }

    const [data, wish, viewed, searches] = await Promise.all([
      dbMyAccount(),
      dbMyList("dd_wishlist", "created_at"),
      dbMyList("dd_recently_viewed", "viewed_at"),
      dbMyList("dd_search_history", "created_at")
    ]);
    ACC.data = data || { profile: { email: ACC.user.email }, orders: [], reviews: [], waitlist: [], newsletter: { subscribed: false } };
    ACC.setupMissing = !data;
    ACC.wish = wish.map(w => Number(w.product_id));
    ACC.viewed = viewed.map(v => Number(v.product_id));
    ACC.searches = searches;
    if (new URLSearchParams(location.search).get("reset") === "1") ACC.recovery = true;
    renderAccount();
  } finally {
    ACC.loading = false;
  }
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
const accMount = () => document.getElementById("acc-mount");
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "";
const fmtDateTime = iso => iso ? new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const productById = id => PRODUCTS.find(p => p.id === Number(id));
const firstName = () => {
  const n = (ACC.data?.profile?.name || ACC.user?.user_metadata?.full_name || "").trim();
  return n ? n.split(/\s+/)[0] : "";
};

function emptyState(title, text, cta) {
  return `<div class="acc-empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${cta || ""}</div>`;
}

function statusChip(o) {
  if (o.status === "cancelled") return `<span class="acc-chip bad">✕ Cancelled</span>`;
  const step = ORDER_STEPS.find(s => s.id === o.status) || ORDER_STEPS[0];
  const done = o.status === "delivered";
  return `<span class="acc-chip ${done ? "good" : "info"}">${done ? "✓" : "●"} ${esc(step.label)}</span>`;
}

function payChip(status) {
  const cls = status === "paid" ? "good" : status === "refunded" ? "info" : status === "failed" ? "bad" : "wait";
  const icon = status === "paid" ? "✓" : status === "failed" ? "✕" : status === "refunded" ? "↺" : "○";
  return `<span class="acc-chip ${cls}">${icon} ${esc(PAY_LABEL[status] || "Awaiting payment")}</span>`;
}

/* ── Signed out ──────────────────────────────────────────────────────── */
function renderSignedOut() {
  accMount().innerHTML = `
    <section class="acc-signedout">
      <span class="acc-kicker">Your account</span>
      <h1 class="serif">Sign in to see everything in one place</h1>
      <p>Track orders and payments, keep your saved pieces across devices, manage restock
         alerts and reviews, and see or clear your history.</p>
      <div class="acc-actions">
        <button class="btn btn-dark" id="acc-signin">Sign in</button>
        <button class="btn btn-outline" id="acc-signup">Create an account</button>
      </div>
      <p class="acc-note">Ordered as a guest? Create an account with the same email and, once you
         confirm it, those orders appear here too.</p>
    </section>`;
  document.getElementById("acc-signin").onclick = () => { openAuth(); switchAuthTab("signin"); };
  document.getElementById("acc-signup").onclick = () => { openAuth(); switchAuthTab("signup"); };
}

/* ── Signed in ───────────────────────────────────────────────────────── */
function renderAccount() {
  if (!ACC.user || !ACC.data) return;
  const p = ACC.data.profile || {};
  const name = firstName();

  accMount().innerHTML = `
    <header class="acc-head">
      <div class="acc-avatar" aria-hidden="true">${esc((name || p.email || "?").charAt(0).toUpperCase())}</div>
      <div class="acc-head-text">
        <h1 class="serif">${name ? `Hello, ${esc(name)}` : "Your account"}</h1>
        <p>${esc(p.email || ACC.user.email)}${p.joined ? ` · member since ${esc(fmtDate(p.joined))}` : ""}</p>
      </div>
    </header>

    ${ACC.recovery ? resetPanel() : ""}
    ${ACC.setupMissing ? `<div class="acc-alert">Some account features are still being switched on. Your orders will appear here shortly.</div>` : ""}
    ${p.confirmed === false ? `<div class="acc-alert">
        <strong>Confirm your email address.</strong> We sent you a link when you signed up.
        Once confirmed, orders you placed as a guest with this email appear here, and you can
        manage newsletter emails.</div>` : ""}

    <div class="acc-layout">
      <nav class="acc-tabs" role="tablist" aria-label="Account sections">
        ${ACC_TABS.map(t => `
          <a href="#${t.id}" role="tab" class="acc-tab${ACC.tab === t.id ? " active" : ""}"
             aria-selected="${ACC.tab === t.id}" data-tab="${t.id}">${esc(t.label)}${tabCount(t.id)}</a>`).join("")}
      </nav>
      <section class="acc-panel" id="acc-panel" role="tabpanel"></section>
    </div>`;

  document.querySelectorAll(".acc-tab").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    ACC.tab = a.dataset.tab;
    history.replaceState(null, "", "#" + ACC.tab);
    renderAccount();
    document.getElementById("acc-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  // keep the active tab visible in the scrolling strip on phones
  document.querySelector(".acc-tab.active")?.scrollIntoView({ block: "nearest", inline: "center" });

  if (ACC.recovery) bindResetPanel();
  renderPanel();
}

function tabCount(id) {
  const d = ACC.data;
  const n = id === "orders" ? d.orders.length
    : id === "saved" ? savedIds().length
    : id === "waitlist" ? d.waitlist.filter(w => !w.notified_at).length
    : id === "reviews" ? d.reviews.length : 0;
  return n ? ` <span class="acc-count">${n}</span>` : "";
}

function renderPanel() {
  const panel = document.getElementById("acc-panel");
  const map = { overview: panelOverview, orders: panelOrders, payments: panelPayments, saved: panelSaved,
                waitlist: panelWaitlist, reviews: panelReviews, history: panelHistory, settings: panelSettings };
  panel.innerHTML = (map[ACC.tab] || panelOverview)();
  (bindPanel[ACC.tab] || (() => {}))();
  if (typeof bindCardReveal === "function") bindCardReveal();
}

/* ── Overview ────────────────────────────────────────────────────────── */
function panelOverview() {
  const d = ACC.data;
  const live = d.orders.filter(o => o.status !== "cancelled");
  const spent = live.reduce((t, o) => t + Number(o.total || 0), 0);
  const open = live.filter(o => o.status !== "delivered");
  const latest = d.orders[0];

  return `
    <div class="acc-stats">
      <div class="acc-stat"><span>Orders</span><strong>${d.orders.length}</strong></div>
      <div class="acc-stat"><span>In progress</span><strong>${open.length}</strong></div>
      <div class="acc-stat"><span>Total spent</span><strong>${formatPrice(spent)}</strong></div>
      <div class="acc-stat"><span>Saved pieces</span><strong>${savedIds().length}</strong></div>
    </div>

    ${latest ? `
      <h2 class="acc-h2">Latest order</h2>
      ${orderCard(latest, true)}` : emptyState("No orders yet",
        "When you place an order it will appear here with its progress and payment status.",
        `<a class="btn btn-dark" href="/shop.html">Start shopping</a>`)}

    <div class="acc-shortcuts">
      ${[["saved", "Saved pieces", `${savedIds().length} saved`],
         ["waitlist", "Restock waitlist", `${d.waitlist.filter(w => !w.notified_at).length} waiting`],
         ["history", "History", "Viewed & searched"],
         ["settings", "Settings", "Name, password, emails"]].map(([id, t, s]) => `
        <a href="#${id}" class="acc-shortcut" data-go="${id}"><strong>${esc(t)}</strong><span>${esc(s)}</span></a>`).join("")}
    </div>`;
}

/* ── Orders ──────────────────────────────────────────────────────────── */
function filteredOrders() {
  let list = ACC.data.orders;
  const f = ACC.orderFilter;
  if (f === "active") list = list.filter(o => !["delivered", "cancelled"].includes(o.status));
  else if (f !== "all") list = list.filter(o => o.status === f);
  const q = ACC.orderQuery.toLowerCase();
  if (q) list = list.filter(o => (o.order_number || "").toLowerCase().includes(q)
    || (o.items || []).some(i => String(i.name || "").toLowerCase().includes(q)));
  return list;
}

function panelOrders() {
  const all = ACC.data.orders;
  if (!all.length) return emptyState("No orders yet", "Your orders will show here as soon as you place one.",
    `<a class="btn btn-dark" href="/shop.html">Browse the shop</a>`);
  const count = s => s === "all" ? all.length
    : s === "active" ? all.filter(o => !["delivered", "cancelled"].includes(o.status)).length
    : all.filter(o => o.status === s).length;
  const list = filteredOrders();
  return `
    <div class="acc-toolbar">
      <div class="acc-filters" role="group" aria-label="Filter orders">
        ${[["all", "All"], ["active", "In progress"], ["delivered", "Delivered"], ["cancelled", "Cancelled"]]
          .map(([id, l]) => `<button class="acc-filter${ACC.orderFilter === id ? " active" : ""}" data-of="${id}"
                aria-pressed="${ACC.orderFilter === id}">${l} <span>${count(id)}</span></button>`).join("")}
      </div>
      <input class="acc-search" id="acc-order-q" type="search" placeholder="Search by reference or item"
             value="${esc(ACC.orderQuery)}" aria-label="Search orders">
    </div>
    ${list.length ? list.map(o => orderCard(o, false)).join("")
      : emptyState("No orders match", "Try another filter or clear the search.")}`;
}

function orderCard(o, compact) {
  const cancelled = o.status === "cancelled";
  const at = ORDER_STEPS.findIndex(s => s.id === o.status);
  const items = o.items || [];
  const help = `https://wa.me/${PHONE}?text=${encodeURIComponent(`Hello Dakar Dapper, I have a question about order ${o.order_number}.`)}`;

  return `
    <article class="acc-order">
      <div class="acc-order-top">
        <div>
          <span class="acc-ref">${esc(o.order_number || "")}</span>
          <span class="acc-date">${esc(fmtDateTime(o.created_at))}</span>
        </div>
        <strong class="acc-total">${formatPrice(o.total)}</strong>
      </div>
      <div class="acc-order-chips">${statusChip(o)}${payChip(o.payment_status)}</div>

      ${cancelled ? "" : `
        <ol class="acc-steps" aria-label="Order progress">
          ${ORDER_STEPS.map((s, i) => `
            <li class="${i < at ? "done" : i === at ? "current" : ""}"${i === at ? ' aria-current="step"' : ""}>
              <span class="dot" aria-hidden="true"></span><span class="lbl">${esc(s.label)}</span>
            </li>`).join("")}
        </ol>`}

      ${compact ? `<p class="acc-order-sum">${items.length} item${items.length === 1 ? "" : "s"} ·
          ${esc(items.slice(0, 2).map(i => i.name).join(", "))}${items.length > 2 ? "…" : ""}</p>
          <a class="acc-link" href="#orders" data-go="orders">See all orders →</a>` : `
        <ul class="acc-items">
          ${items.map(i => `
            <li>
              ${productPicture(i.image, "", "", 56, 70)}
              <div><strong>${esc(i.name)}</strong>
                <span>${[i.size, i.color].filter(Boolean).map(esc).join(" · ")}${i.size || i.color ? " · " : ""}Qty ${esc(i.qty)}</span></div>
              <b>${formatPrice(Number(i.price) * Number(i.qty))}</b>
            </li>`).join("")}
        </ul>
        <dl class="acc-sums">
          <div><dt>Subtotal</dt><dd>${formatPrice(o.subtotal)}</dd></div>
          <div><dt>Delivery</dt><dd>${Number(o.shipping) === 0 ? "Free" : formatPrice(o.shipping)}</dd></div>
          <div class="total"><dt>Total</dt><dd>${formatPrice(o.total)}</dd></div>
        </dl>
        <div class="acc-order-actions">
          <a class="btn btn-outline btn-sm" href="${esc(help)}" target="_blank" rel="noopener">Ask about this order</a>
          <button class="btn btn-dark btn-sm" data-reorder="${esc(o.order_number)}">Buy again</button>
        </div>`}
    </article>`;
}

/* ── Payments ────────────────────────────────────────────────────────── */
function panelPayments() {
  const all = ACC.data.orders.filter(o => o.status !== "cancelled" || o.payment_status !== "unpaid");
  if (!all.length) return emptyState("No payments yet", "Every order and its payment status will be listed here.");

  const since = { "30": 30, "90": 90, "365": 365 }[ACC.payPeriod];
  let list = all;
  if (since) list = list.filter(o => Date.now() - new Date(o.created_at) <= since * 864e5);
  if (ACC.payFilter !== "all") list = list.filter(o => (ACC.payFilter === "unpaid"
    ? !["paid", "refunded"].includes(o.payment_status) : o.payment_status === ACC.payFilter));

  const paid = list.filter(o => o.payment_status === "paid").reduce((t, o) => t + Number(o.total), 0);
  const due = list.filter(o => !["paid", "refunded"].includes(o.payment_status) && o.status !== "cancelled")
                  .reduce((t, o) => t + Number(o.total), 0);

  return `
    <div class="acc-stats two">
      <div class="acc-stat"><span>Paid</span><strong>${formatPrice(paid)}</strong></div>
      <div class="acc-stat"><span>Awaiting payment</span><strong>${formatPrice(due)}</strong></div>
    </div>
    <div class="acc-toolbar">
      <div class="acc-filters" role="group" aria-label="Filter payments">
        ${[["all", "All"], ["paid", "Paid"], ["unpaid", "Awaiting"], ["refunded", "Refunded"]]
          .map(([id, l]) => `<button class="acc-filter${ACC.payFilter === id ? " active" : ""}" data-pf="${id}" aria-pressed="${ACC.payFilter === id}">${l}</button>`).join("")}
      </div>
      <select class="acc-select" id="acc-pay-period" aria-label="Time period">
        ${[["all", "All time"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"]]
          .map(([v, l]) => `<option value="${v}"${ACC.payPeriod === v ? " selected" : ""}>${l}</option>`).join("")}
      </select>
    </div>
    ${list.length ? `
      <ul class="acc-tx">
        ${list.map(o => `
          <li>
            <div class="acc-tx-main">
              <strong>${esc(o.order_number)}</strong>
              <span>${esc(fmtDate(o.created_at))}${o.payment_ref ? ` · ref ${esc(o.payment_ref)}` : ""}</span>
            </div>
            <div class="acc-tx-side">
              <b>${formatPrice(o.total)}</b>
              ${payChip(o.payment_status)}
            </div>
          </li>`).join("")}
      </ul>` : emptyState("Nothing in this period", "Try a wider time period or another filter.")}
    <p class="acc-note">Payment is confirmed with you on WhatsApp when you order. Card payments on the
       site are coming soon; they will appear here with their receipt reference.</p>`;
}

/* ── Saved (wishlist) ────────────────────────────────────────────────── */
function savedIds() {
  return [...new Set([...(ACC.wish || []), ...(typeof wishlist !== "undefined" ? wishlist : [])])]
    .filter(id => productById(id));
}

function panelSaved() {
  const ids = savedIds();
  if (!ids.length) return emptyState("Nothing saved yet", "Tap the heart on any piece to keep it here, on every device you sign in on.",
    `<a class="btn btn-dark" href="/shop.html">Browse the shop</a>`);
  return `<div class="shop-product-grid acc-grid">${ids.map(id => productCardHtml(productById(id))).join("")}</div>`;
}

/* ── Waitlist ────────────────────────────────────────────────────────── */
function panelWaitlist() {
  const list = ACC.data.waitlist;
  if (!list.length) return emptyState("No restock alerts", "When a piece is sold out, tap “Notify me” on its page and it will be listed here.");
  return `<ul class="acc-list">${list.map(w => `
    <li>
      <a class="acc-list-img" href="/product/${encodeURIComponent(w.product_slug || "")}">${productPicture(w.product_image, "", "", 56, 70)}</a>
      <div class="acc-list-main">
        <a href="/product/${encodeURIComponent(w.product_slug || "")}"><strong>${esc(w.product_name)}</strong></a>
        <span>${w.size ? `Size ${esc(w.size)} · ` : ""}since ${esc(fmtDate(w.created_at))}</span>
        ${w.in_stock ? `<span class="acc-chip good">✓ Back in stock</span>`
          : w.notified_at ? `<span class="acc-chip info">Emailed ${esc(fmtDate(w.notified_at))}</span>`
          : `<span class="acc-chip wait">○ Waiting</span>`}
      </div>
      <div class="acc-list-act">
        ${w.in_stock ? `<a class="btn btn-dark btn-sm" href="/product/${encodeURIComponent(w.product_slug || "")}">Shop</a>` : ""}
        <button class="acc-x" data-leave="${esc(w.id)}" aria-label="Leave the waitlist for ${esc(w.product_name)}">Remove</button>
      </div>
    </li>`).join("")}</ul>`;
}

/* ── Reviews ─────────────────────────────────────────────────────────── */
function panelReviews() {
  const list = ACC.data.reviews;
  if (!list.length) return emptyState("No reviews yet", "Reviews you write on product pages show here, with whether they have been published.");
  const st = { pending: ["wait", "○ Waiting for approval"], approved: ["good", "✓ Published"], rejected: ["bad", "Not published"] };
  return `<ul class="acc-list">${list.map(r => `
    <li>
      <div class="acc-list-main">
        <a href="/product/${encodeURIComponent(r.product_slug || "")}"><strong>${esc(r.product_name || "Product")}</strong></a>
        <span class="acc-stars" aria-label="${r.rating} out of 5">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
        ${r.title ? `<b>${esc(r.title)}</b>` : ""}
        <p>${esc(r.body)}</p>
        <span>${esc(fmtDate(r.created_at))} · <span class="acc-chip ${st[r.status]?.[0] || "wait"}">${esc(st[r.status]?.[1] || r.status)}</span></span>
      </div>
      <div class="acc-list-act">
        <button class="acc-x" data-delrev="${esc(r.id)}" aria-label="Delete this review">Delete</button>
      </div>
    </li>`).join("")}</ul>`;
}

/* ── History ─────────────────────────────────────────────────────────── */
function historyViewed() {
  const local = typeof localList === "function" ? localList(LOCAL_VIEWED) : [];
  return [...new Set([...ACC.viewed, ...local])].filter(id => productById(id)).slice(0, 20);
}

function historySearches() {
  const server = ACC.searches.map(s => ({ id: s.id, q: s.query, at: s.created_at }));
  const local = (typeof localList === "function" ? localList(LOCAL_SEARCHES) : [])
    .filter(q => !server.some(s => s.q.toLowerCase() === q.toLowerCase()))
    .map(q => ({ id: null, q, at: null }));
  return [...server, ...local].slice(0, 50);
}

function panelHistory() {
  const viewed = historyViewed();
  const searches = historySearches();
  return `
    <div class="acc-section-head">
      <h2 class="acc-h2">Recently viewed</h2>
      ${viewed.length ? `<button class="acc-x" id="acc-clear-viewed">Clear</button>` : ""}
    </div>
    ${viewed.length ? `<div class="shop-product-grid acc-grid">${viewed.map(id => productCardHtml(productById(id))).join("")}</div>`
      : `<p class="acc-muted">Pieces you look at will appear here.</p>`}

    <div class="acc-section-head">
      <h2 class="acc-h2">Search history</h2>
      ${searches.length ? `<button class="acc-x" id="acc-clear-searches">Clear all</button>` : ""}
    </div>
    ${searches.length ? `<ul class="acc-searches">${searches.map((s, i) => `
      <li>
        <a href="/shop.html?q=${encodeURIComponent(s.q)}">${esc(s.q)}</a>
        <span>${s.at ? esc(fmtDateTime(s.at)) : "this device"}</span>
        <button class="acc-x icon" data-delsearch="${i}" aria-label="Delete “${esc(s.q)}” from history">✕</button>
      </li>`).join("")}</ul>`
      : `<p class="acc-muted">Your searches will appear here. You can delete any of them.</p>`}`;
}

/* ── Settings ────────────────────────────────────────────────────────── */
function panelSettings() {
  const p = ACC.data.profile || {};
  const subscribed = !!ACC.data.newsletter?.subscribed;
  return `
    <form class="acc-card" id="acc-name-form">
      <h2 class="acc-h2">Your details</h2>
      <label class="acc-field"><span>Name</span>
        <input id="acc-name" type="text" autocomplete="name" value="${esc(p.name || "")}" required></label>
      <label class="acc-field"><span>Email</span>
        <input type="email" value="${esc(p.email || ACC.user.email)}" disabled></label>
      <button class="btn btn-dark btn-sm" type="submit">Save name</button>
    </form>

    <div class="acc-card">
      <h2 class="acc-h2">Emails from us</h2>
      <label class="acc-toggle">
        <input type="checkbox" id="acc-news"${subscribed ? " checked" : ""}${p.confirmed === false ? " disabled" : ""}>
        <span><strong>New arrivals and private offers</strong>
        <small>${p.confirmed === false ? "Confirm your email address first." : "Order confirmations are always sent, whatever you choose here."}</small></span>
      </label>
    </div>

    <form class="acc-card" id="acc-pass-form">
      <h2 class="acc-h2">Change password</h2>
      <label class="acc-field"><span>New password</span>
        <input id="acc-pass" type="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></label>
      <button class="btn btn-dark btn-sm" type="submit">Update password</button>
    </form>

    <div class="acc-card">
      <h2 class="acc-h2">Your activity</h2>
      <p class="acc-muted">Clear what you have viewed and searched, on this device and in your account.</p>
      <button class="btn btn-outline btn-sm" id="acc-clear-all">Clear viewing and search history</button>
    </div>

    <button class="btn btn-outline acc-signout" id="acc-signout">Sign out</button>`;
}

/* ── Password reset (arriving from the email link) ──────────────────── */
function resetPanel() {
  return `
    <form class="acc-card acc-reset" id="acc-reset-form">
      <h2 class="acc-h2">Choose a new password</h2>
      <label class="acc-field"><span>New password</span>
        <input id="acc-reset-pass" type="password" autocomplete="new-password" minlength="8" required></label>
      <button class="btn btn-dark btn-sm" type="submit">Save new password</button>
    </form>`;
}

function bindResetPanel() {
  document.getElementById("acc-reset-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const pw = document.getElementById("acc-reset-pass").value;
    if (pw.length < 8) return showToast("Use at least 8 characters.");
    const res = await dbUpdateMyPassword(pw);
    if (!res.ok) return showToast(res.message);
    ACC.recovery = false;
    history.replaceState(null, "", "/account.html");
    showToast("Password updated");
    renderAccount();
  });
}

/* ── Interaction per panel ───────────────────────────────────────────── */
const bindPanel = {
  overview() { bindGo(); },

  orders() {
    bindGo();
    document.querySelectorAll("[data-of]").forEach(b => b.onclick = () => { ACC.orderFilter = b.dataset.of; renderPanel(); });
    const q = document.getElementById("acc-order-q");
    if (q) q.addEventListener("input", debounceAcc(() => {
      ACC.orderQuery = q.value.trim();
      const pos = q.selectionStart;
      renderPanel();
      const again = document.getElementById("acc-order-q");
      again.focus(); again.setSelectionRange(pos, pos);
    }, 250));
    document.querySelectorAll("[data-reorder]").forEach(b => b.onclick = () => buyAgain(b.dataset.reorder));
  },

  payments() {
    document.querySelectorAll("[data-pf]").forEach(b => b.onclick = () => { ACC.payFilter = b.dataset.pf; renderPanel(); });
    document.getElementById("acc-pay-period")?.addEventListener("change", e => { ACC.payPeriod = e.target.value; renderPanel(); });
  },

  saved() {
    // The heart on a card removes it from saved; redraw after it toggles.
    document.querySelectorAll("#acc-panel .heart-btn").forEach(b => b.addEventListener("click", () => {
      setTimeout(() => {
        ACC.wish = ACC.wish.filter(id => wishlist.includes(id));
        renderAccount();
      }, 50);
    }));
  },

  waitlist() {
    document.querySelectorAll("[data-leave]").forEach(b => b.onclick = async () => {
      b.disabled = true;
      if (await dbLeaveWaitlist(Number(b.dataset.leave))) {
        ACC.data.waitlist = ACC.data.waitlist.filter(w => String(w.id) !== b.dataset.leave);
        showToast("Removed from the waitlist");
        renderAccount();
      } else { b.disabled = false; showToast("Could not remove that. Please try again."); }
    });
  },

  reviews() {
    document.querySelectorAll("[data-delrev]").forEach(b => b.onclick = async () => {
      if (!confirm("Delete this review? This cannot be undone.")) return;
      if (await dbDeleteMyReview(Number(b.dataset.delrev))) {
        ACC.data.reviews = ACC.data.reviews.filter(r => String(r.id) !== b.dataset.delrev);
        showToast("Review deleted");
        renderAccount();
      } else showToast("Could not delete that review.");
    });
  },

  history() {
    document.getElementById("acc-clear-viewed")?.addEventListener("click", async () => {
      await dbViewedClear();
      saveLocalList(LOCAL_VIEWED, []);
      ACC.viewed = [];
      showToast("Viewing history cleared");
      renderPanel();
    });
    document.getElementById("acc-clear-searches")?.addEventListener("click", async () => {
      await dbSearchClear();
      saveLocalList(LOCAL_SEARCHES, []);
      ACC.searches = [];
      showToast("Search history cleared");
      renderPanel();
    });
    const list = historySearches();
    document.querySelectorAll("[data-delsearch]").forEach(b => b.onclick = async () => {
      const s = list[Number(b.dataset.delsearch)];
      if (!s) return;
      if (s.id) { await dbSearchDelete(s.id); ACC.searches = ACC.searches.filter(x => x.id !== s.id); }
      saveLocalList(LOCAL_SEARCHES, localList(LOCAL_SEARCHES).filter(q => q.toLowerCase() !== s.q.toLowerCase()));
      renderPanel();
    });
  },

  settings() {
    document.getElementById("acc-name-form").onsubmit = async e => {
      e.preventDefault();
      const name = document.getElementById("acc-name").value.trim();
      if (name.length < 2) return showToast("Please enter your name.");
      const res = await dbUpdateMyName(name);
      if (!res.ok) return showToast(res.message);
      ACC.data.profile.name = name;
      showToast("Name saved");
      renderAccount();
    };
    document.getElementById("acc-news")?.addEventListener("change", async e => {
      const on = e.target.checked;
      const res = await dbSetNewsletter(on);
      if (!res.ok) { e.target.checked = !on; return showToast(res.message); }
      ACC.data.newsletter = { subscribed: on };
      showToast(on ? "You will get new arrivals and offers" : "You will not get marketing emails");
    });
    document.getElementById("acc-pass-form").onsubmit = async e => {
      e.preventDefault();
      const pw = document.getElementById("acc-pass").value;
      if (pw.length < 8) return showToast("Use at least 8 characters.");
      const res = await dbUpdateMyPassword(pw);
      if (!res.ok) return showToast(res.message);
      document.getElementById("acc-pass").value = "";
      showToast("Password updated");
    };
    document.getElementById("acc-clear-all").onclick = async () => {
      await Promise.all([dbViewedClear(), dbSearchClear()]);
      saveLocalList(LOCAL_VIEWED, []); saveLocalList(LOCAL_SEARCHES, []);
      ACC.viewed = []; ACC.searches = [];
      showToast("Viewing and search history cleared");
    };
    document.getElementById("acc-signout").onclick = async () => {
      await customerSignOut();
      currentUser = null;
      showToast("Signed out");
      window.location.href = "/index.html";
    };
  }
};

function bindGo() {
  document.querySelectorAll("#acc-panel [data-go]").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    ACC.tab = a.dataset.go;
    history.replaceState(null, "", "#" + ACC.tab);
    renderAccount();
  }));
}

function debounceAcc(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

function buyAgain(ref) {
  const o = ACC.data.orders.find(x => x.order_number === ref);
  if (!o) return;
  let added = 0, missing = 0;
  (o.items || []).forEach(i => {
    const p = productById(i.id);
    if (p && p.stock > 0) { addToCart(p.id, i.size, i.color, Math.min(Number(i.qty) || 1, p.stock)); added++; }
    else missing++;
  });
  if (added) openDrawer("cart-drawer");
  showToast(missing ? `${added} added to your bag; ${missing} no longer available` : "Added to your bag");
}
