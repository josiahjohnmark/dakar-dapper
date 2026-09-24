/* ==========================================================================
   ADMIN.JS — Dakar Dapper Management Suite
   --------------------------------------------------------------------------
   Runs only on admin.html. Authentication is Supabase Auth; authorisation is
   enforced by Row Level Security in the database, so nothing here can be
   bypassed by editing the page in a browser. The UI simply reflects what the
   server will allow.
   ========================================================================== */

/* ── Escaping: product and customer text is never trusted as markup ──── */
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escUrl(v) {
  const s = String(v == null ? "" : v).trim();
  return /^(javascript|data|vbscript):/i.test(s) ? "" : esc(s);
}
function escColor(v) {
  const s = String(v == null ? "" : v).trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(s) ? s : "#cccccc";
}

/* ── State ───────────────────────────────────────────────────────────── */
const A = {
  user: null,
  products: [],
  categories: [],
  content: null,
  orders: [],
  stats: null,
  subscribers: [],
  audit: [],
  shipping: [],
  reviews: [],
  reviewFilter: "pending",
  stockAlerts: [],
  customersSub: "audience",
  audFilter: {},
  audAll: null,
  aud: null,
  audReq: 0,
  audPresetTemplate: null,
  reachReq: 0,
  campaigns: [],
  campaignStats: {},
  camp: null,
  campReach: 0,
  socialsDraft: null,
  orderFilter: "all",
  orderSearch: "",
  productFilter: "all",
  productSearch: "",
  editing: null,
  chartTable: false,
  seenOrderIds: new Set()
};

const ORDER_STATUSES = [
  { id: "pending",   label: "Pending",   icon: "●" },
  { id: "confirmed", label: "Confirmed", icon: "✓" },
  { id: "packed",    label: "Packed",    icon: "■" },
  { id: "shipped",   label: "Shipped",   icon: "→" },
  { id: "delivered", label: "Delivered", icon: "✔" },
  { id: "cancelled", label: "Cancelled", icon: "✕" }
];

const money = n => "₦" + Number(n || 0).toLocaleString("en-NG");
const shortMoney = n => {
  const v = Number(n || 0);
  if (v >= 1000000) return "₦" + (v / 1000000).toFixed(v >= 10000000 ? 0 : 1) + "M";
  if (v >= 1000) return "₦" + Math.round(v / 1000) + "k";
  return "₦" + v;
};

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

/* ══════════════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  bindLogin();
  bindShell();

  const user = await authCurrentAdmin();
  if (user) { A.user = user; enterApp(); }
});

function bindLogin() {
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document.getElementById("forgot-btn").addEventListener("click", handleForgot);
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById("login-btn");
  const box = document.getElementById("login-error");
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-pass").value;

  box.hidden = true;
  btn.disabled = true;
  btn.textContent = "Signing in…";

  const res = await authSignIn(email, password);

  btn.disabled = false;
  btn.textContent = "Sign In";

  if (!res.ok) {
    box.hidden = false;
    box.textContent = res.message;
    return;
  }
  A.user = res.user;
  document.getElementById("login-pass").value = "";
  enterApp();
}

async function handleForgot() {
  const email = document.getElementById("login-email").value.trim();
  if (!email) {
    const box = document.getElementById("login-error");
    box.hidden = false;
    box.textContent = "Enter your email address first, then tap again.";
    return;
  }
  await authSendReset(email);
  // Always the same message, so this cannot be used to discover which
  // addresses have accounts.
  toast("If that address has an account, a reset link is on its way.");
}

async function enterApp() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app-shell").classList.add("active");
  document.getElementById("account-email").textContent = A.user?.email || "—";
  setGreeting();
  await loadAll();
  startLiveOrders();
}

function setGreeting() {
  const h = new Date().getHours();
  const word = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const name = (A.user?.email || "").split("@")[0];
  document.getElementById("greeting").textContent = `${word}${name ? ", " + name : ""}`;
}

/* ══════════════════════════════════════════════════════════════════════
   SHELL — tabs, theme, refresh, sheet
   ══════════════════════════════════════════════════════════════════════ */

function bindShell() {
  document.querySelectorAll(".a-tab").forEach(tab => {
    tab.addEventListener("click", () => switchPane(tab.dataset.pane));
  });

  document.getElementById("theme-btn").addEventListener("click", toggleTheme);
  document.getElementById("refresh-btn").addEventListener("click", async () => {
    toast("Refreshing…");
    await loadAll();
    toast("Up to date");
  });

  document.getElementById("signout-btn").addEventListener("click", async () => {
    await authSignOut();
    location.reload();
  });

  document.getElementById("add-product-btn").addEventListener("click", () => openProductEditor(null));
  document.getElementById("sheet-close").addEventListener("click", closeSheet);
  document.getElementById("sheet-backdrop").addEventListener("click", closeSheet);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeSheet();
  });

  document.getElementById("order-search").addEventListener("input", debounce(e => {
    A.orderSearch = e.target.value.trim();
    renderOrders();
  }, 220));

  document.getElementById("product-search").addEventListener("input", debounce(e => {
    A.productSearch = e.target.value.trim().toLowerCase();
    renderProducts();
  }, 180));

  document.getElementById("chart-view-toggle").addEventListener("click", () => {
    A.chartTable = !A.chartTable;
    renderChart();
  });

  document.getElementById("add-cat-btn").addEventListener("click", openCategoryEditor);
  bindCustomers();
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const PANE_TITLES = {
  home: ["Dashboard", "Dakar Dapper"],
  orders: ["Orders", "Fulfilment"],
  products: ["Products", "Inventory"],
  customers: ["Customers", "Audience & email"],
  more: ["Settings", "Store"]
};

function switchPane(name) {
  document.querySelectorAll(".a-tab").forEach(t =>
    t.classList.toggle("active", t.dataset.pane === name));
  document.querySelectorAll(".a-pane").forEach(p =>
    p.classList.toggle("active", p.id === "pane-" + name));

  const [title, sub] = PANE_TITLES[name] || ["Dakar Dapper", ""];
  document.getElementById("topbar-title").textContent = title;
  document.getElementById("topbar-sub").textContent = sub;

  window.scrollTo({ top: 0, behavior: "instant" });

  if (name === "orders") clearOrderBadge();
}

function initTheme() {
  const saved = localStorage.getItem("dd_admin_theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const next = cur ? (cur === "dark" ? "light" : "dark") : (sysDark ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("dd_admin_theme", next);
  renderChart();
}

/* ══════════════════════════════════════════════════════════════════════
   DATA LOADING
   ══════════════════════════════════════════════════════════════════════ */

async function loadAll() {
  const [products, categories, content, orders, stats, subs, audit, shipping,
         reviews, stockAlerts] =
    await Promise.all([
      dbFetchProducts(), dbFetchCategories(), dbFetchContent(),
      dbFetchOrders({ limit: 200 }), dbAdminStats(),
      dbFetchSubscribers(), dbFetchAuditLog(25), dbFetchShippingRates(),
      dbFetchReviewsForAdmin({ status: "all", limit: 200 }), dbFetchStockAlerts()
    ]);

  A.products = products || [];
  A.categories = categories || [];
  A.content = content;
  A.orders = orders || [];
  A.stats = stats;
  A.subscribers = subs || [];
  A.audit = audit || [];
  A.shipping = shipping || [];
  A.reviews = reviews || [];
  A.stockAlerts = stockAlerts || [];
  A.orders.forEach(o => A.seenOrderIds.add(o.id));

  renderDashboard();
  renderOrderFilters();
  renderOrders();
  renderProductFilters();
  renderProducts();
  renderCategories();
  renderCmsForm();
  A.socialsDraft = null;          // start from what is saved
  renderSocialsEditor();
  renderShippingForm();
  renderAudit();
  renderReviewFilters();
  renderReviewsList();
  renderStockAlerts();
  refreshEmailStatus();

  A.audAll = null;           // recount totals on every full refresh
  loadAudience();
}

/* ══════════════════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════════════════ */

function renderDashboard() {
  const s = A.stats;
  const tiles = document.getElementById("stat-tiles");

  if (!s) {
    tiles.innerHTML = Array(4).fill('<div class="a-skeleton" style="height:96px"></div>').join("");
    return;
  }

  const lowOrOut = Number(s.low_stock) + Number(s.out_of_stock);

  tiles.innerHTML = `
    <div class="a-stat">
      <div class="a-stat-label">Revenue this month</div>
      <div class="a-stat-value">${money(s.revenue_month)}</div>
      <div class="a-stat-sub">${money(s.revenue_total)} all time</div>
    </div>
    <div class="a-stat${Number(s.orders_pending) > 0 ? " is-warn" : ""}">
      <div class="a-stat-label">Awaiting action</div>
      <div class="a-stat-value">${s.orders_pending}</div>
      <div class="a-stat-sub">${s.orders_today} order${Number(s.orders_today) === 1 ? "" : "s"} today</div>
    </div>
    <div class="a-stat${Number(s.out_of_stock) > 0 ? " is-alert" : lowOrOut > 0 ? " is-warn" : ""}">
      <div class="a-stat-label">Stock alerts</div>
      <div class="a-stat-value">${lowOrOut}</div>
      <div class="a-stat-sub">${s.out_of_stock} sold out · ${s.low_stock} low</div>
    </div>
    <div class="a-stat">
      <div class="a-stat-label">Stock value</div>
      <div class="a-stat-value">${shortMoney(s.stock_value)}</div>
      <div class="a-stat-sub">${s.products_total} products · ${s.subscribers} subscribers</div>
    </div>`;

  renderChart();
  renderTopProducts();
  renderAttention();
  renderActivity();
}

/* ── Revenue chart: one measure, one series, one axis ─────────────────
   Bars for daily magnitude. Grid stays recessive, the peak gets the only
   direct label, hover gives exact values, and the same numbers are
   available as a table for anyone who cannot use the visual.
   ─────────────────────────────────────────────────────────────────────── */
function renderChart() {
  const mount = document.getElementById("chart-mount");
  const toggle = document.getElementById("chart-view-toggle");
  const days = (A.stats && A.stats.sales_14d) || [];

  if (!days.length) {
    mount.innerHTML = `<div class="a-empty"><p>No sales data yet.</p></div>`;
    return;
  }

  const total = days.reduce((t, d) => t + Number(d.amount), 0);
  document.getElementById("chart-total").textContent =
    `${money(total)} across 14 days`;

  toggle.textContent = A.chartTable ? "Chart" : "Table";
  toggle.setAttribute("aria-expanded", String(A.chartTable));

  if (A.chartTable) {
    mount.innerHTML = `
      <table class="viz-table">
        <caption class="sr-only">Daily revenue for the last 14 days</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Revenue</th></tr></thead>
        <tbody>${days.map(d => `
          <tr><td>${new Date(d.day).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })}</td>
              <td>${money(d.amount)}</td></tr>`).join("")}</tbody>
      </table>`;
    return;
  }

  const max = Math.max(...days.map(d => Number(d.amount)), 1);
  const peakIdx = days.findIndex(d => Number(d.amount) === max);

  mount.innerHTML = `
    <div class="viz-chart" id="viz-chart">
      ${days.map((d, i) => {
        const amt = Number(d.amount);
        const h = amt > 0 ? Math.max(3, (amt / max) * 100) : 3;
        const label = new Date(d.day).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });
        return `
        <div class="viz-bar-wrap" tabindex="0" role="img"
             aria-label="${esc(label)}: ${esc(money(amt))}"
             data-label="${esc(label)}" data-value="${esc(money(amt))}">
          ${i === peakIdx && amt > 0 ? `<span class="viz-peak-label">${esc(shortMoney(amt))}</span>` : ""}
          <div class="viz-bar${amt === 0 ? " is-zero" : ""}" style="height:${h}%"></div>
        </div>`;
      }).join("")}
      <div class="viz-tip" id="viz-tip" role="presentation"></div>
    </div>
    <div class="viz-baseline"></div>
    <div class="viz-xaxis">
      <span>${new Date(days[0].day).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</span>
      <span>Today</span>
    </div>`;

  bindChartHover();
}

function bindChartHover() {
  const chart = document.getElementById("viz-chart");
  const tip = document.getElementById("viz-tip");
  if (!chart || !tip) return;

  const show = el => {
    tip.innerHTML = `${esc(el.dataset.label)}<br><b>${esc(el.dataset.value)}</b>`;
    tip.classList.add("show");
    const cRect = chart.getBoundingClientRect();
    const bRect = el.getBoundingClientRect();
    const x = bRect.left - cRect.left + bRect.width / 2;
    tip.style.left = Math.max(4, Math.min(x - tip.offsetWidth / 2, cRect.width - tip.offsetWidth - 4)) + "px";
    tip.style.bottom = (cRect.bottom - bRect.top + 6) + "px";
  };
  const hide = () => tip.classList.remove("show");

  chart.querySelectorAll(".viz-bar-wrap").forEach(el => {
    el.addEventListener("mouseenter", () => show(el));
    el.addEventListener("focus", () => show(el));
    el.addEventListener("mouseleave", hide);
    el.addEventListener("blur", hide);
  });
  chart.addEventListener("touchstart", e => {
    const el = e.target.closest(".viz-bar-wrap");
    if (el) show(el);
  }, { passive: true });
}

function renderTopProducts() {
  const mount = document.getElementById("top-products");
  const top = (A.stats && A.stats.top_products) || [];

  if (!top.length) {
    mount.innerHTML = `<div class="a-empty"><p>No sales yet. Your best sellers will appear here.</p></div>`;
    return;
  }
  const max = Math.max(...top.map(t => Number(t.units)), 1);

  mount.innerHTML = top.map(t => `
    <div class="a-list-row">
      <div class="a-list-row-main">
        <strong>${esc(t.name)}</strong>
        <span>${esc(t.units)} sold · ${money(t.revenue)}</span>
        <div style="height:4px;border-radius:2px;background:var(--viz-grid);margin-top:6px;overflow:hidden">
          <div style="height:100%;width:${(Number(t.units) / max) * 100}%;background:var(--viz-series);border-radius:2px"></div>
        </div>
      </div>
    </div>`).join("");
}

function renderAttention() {
  const mount = document.getElementById("attention-list");
  const items = [];

  const pending = A.orders.filter(o => o.status === "pending");
  if (pending.length) {
    items.push({
      icon: "●", cls: "st-pending",
      text: `<strong>${pending.length} order${pending.length === 1 ? "" : "s"}</strong> waiting to be confirmed`,
      action: () => { switchPane("orders"); setOrderFilter("pending"); }
    });
  }

  const out = A.products.filter(p => p.stock <= 0);
  if (out.length) {
    items.push({
      icon: "✕", cls: "st-cancelled",
      text: `<strong>${out.length} product${out.length === 1 ? "" : "s"}</strong> sold out — restock to keep selling`,
      action: () => { switchPane("products"); setProductFilter("out"); }
    });
  }

  const low = A.products.filter(p => p.stock > 0 && p.stock <= 3);
  if (low.length) {
    items.push({
      icon: "▲", cls: "st-pending",
      text: `<strong>${low.length} product${low.length === 1 ? "" : "s"}</strong> running low`,
      action: () => { switchPane("products"); setProductFilter("low"); }
    });
  }

  const pendingReviews = (A.reviews || []).filter(r => r.status === "pending");
  if (pendingReviews.length) {
    items.push({
      icon: "★", cls: "st-pending",
      text: `<strong>${pendingReviews.length} review${pendingReviews.length === 1 ? "" : "s"}</strong> waiting for approval`,
      action: () => { switchPane("customers"); switchSub("reviews"); }
    });
  }

  const noImage = A.products.filter(p => !p.image);
  if (noImage.length) {
    items.push({
      icon: "□", cls: "st-unpaid",
      text: `<strong>${noImage.length} product${noImage.length === 1 ? "" : "s"}</strong> missing a photo`,
      action: () => switchPane("products")
    });
  }

  if (!items.length) {
    mount.innerHTML = `<div class="a-empty">
      <div class="a-empty-mark">✓</div>
      <h4>All clear</h4><p>Nothing needs you right now.</p></div>`;
    return;
  }

  mount.innerHTML = items.map((it, i) => `
    <button class="a-list-row" data-attn="${i}" style="cursor:pointer">
      <div style="display:flex;gap:11px;align-items:center;min-width:0">
        <span class="st-chip ${it.cls}"><span class="ic">${it.icon}</span></span>
        <div class="a-list-row-main"><span style="font-size:.85rem;color:var(--a-text)">${it.text}</span></div>
      </div>
      <span style="color:var(--a-text-3)">›</span>
    </button>`).join("");

  mount.querySelectorAll("[data-attn]").forEach(btn => {
    btn.addEventListener("click", () => items[Number(btn.dataset.attn)].action());
  });
}

function renderActivity() {
  const mount = document.getElementById("activity-feed");
  const events = [];

  A.orders.slice(0, 6).forEach(o => events.push({
    at: o.created_at, icon: "●",
    html: `<strong>${esc(o.customer_name)}</strong> ordered ${money(o.total)} · ${esc(o.order_number || "")}`
  }));

  A.audit.slice(0, 6).forEach(l => events.push({
    at: l.created_at, icon: "✎",
    html: `${esc(auditLabel(l))}`
  }));

  events.sort((a, b) => new Date(b.at) - new Date(a.at));

  if (!events.length) {
    mount.innerHTML = `<div class="a-empty"><p>Activity will show up here.</p></div>`;
    return;
  }

  mount.innerHTML = events.slice(0, 8).map(e => `
    <div class="feed-item">
      <div class="feed-dot">${e.icon}</div>
      <div class="feed-body">
        <p>${e.html}</p>
        <div class="feed-time">${esc(timeAgo(e.at))}</div>
      </div>
    </div>`).join("");
}

function auditLabel(l) {
  const map = {
    "product.save": "Product saved", "product.delete": "Product deleted",
    "product.stock": "Stock updated", "category.save": "Category saved",
    "category.delete": "Category deleted", "content.save": "Homepage words updated",
    "order.status": "Order status changed", "order.payment": "Payment marked",
    "image.upload": "Photo uploaded"
  };
  return map[l.action] || l.action;
}

/* ══════════════════════════════════════════════════════════════════════
   ORDERS
   ══════════════════════════════════════════════════════════════════════ */

function renderOrderFilters() {
  const counts = { all: A.orders.length };
  ORDER_STATUSES.forEach(s => {
    counts[s.id] = A.orders.filter(o => o.status === s.id).length;
  });

  const options = [{ id: "all", label: "All" }, ...ORDER_STATUSES];
  document.getElementById("order-filters").innerHTML = options.map(o => `
    <button class="a-chip${A.orderFilter === o.id ? " active" : ""}" data-filter="${esc(o.id)}">
      ${esc(o.label)} <span class="n">${counts[o.id] || 0}</span>
    </button>`).join("");

  document.querySelectorAll("#order-filters .a-chip").forEach(chip => {
    chip.addEventListener("click", () => setOrderFilter(chip.dataset.filter));
  });
}

function setOrderFilter(f) {
  A.orderFilter = f;
  renderOrderFilters();
  renderOrders();
}

function filteredOrders() {
  let list = A.orders;
  if (A.orderFilter !== "all") list = list.filter(o => o.status === A.orderFilter);
  if (A.orderSearch) {
    const q = A.orderSearch.toLowerCase();
    list = list.filter(o =>
      (o.customer_name || "").toLowerCase().includes(q) ||
      (o.customer_phone || "").includes(q) ||
      (o.order_number || "").toLowerCase().includes(q) ||
      (o.customer_email || "").toLowerCase().includes(q));
  }
  return list;
}

function statusChip(status) {
  const s = ORDER_STATUSES.find(x => x.id === status) || ORDER_STATUSES[0];
  return `<span class="st-chip st-${esc(s.id)}"><span class="ic" aria-hidden="true">${s.icon}</span>${esc(s.label)}</span>`;
}

function payChip(p) {
  return p === "paid"
    ? `<span class="st-chip st-paid"><span class="ic" aria-hidden="true">✔</span>Paid</span>`
    : `<span class="st-chip st-unpaid"><span class="ic" aria-hidden="true">○</span>Unpaid</span>`;
}

function renderOrders() {
  const list = filteredOrders();
  const mount = document.getElementById("orders-list");

  document.getElementById("orders-count-line").textContent =
    `${A.orders.length} order${A.orders.length === 1 ? "" : "s"} in total`;

  if (!list.length) {
    mount.innerHTML = `<div class="a-empty">
      <div class="a-empty-mark">○</div>
      <h4>No orders here</h4>
      <p>${A.orders.length ? "Try a different filter or search." : "Your first order will appear the moment it is placed."}</p>
    </div>`;
    return;
  }

  mount.innerHTML = list.map(o => {
    const itemCount = (o.items || []).reduce((n, i) => n + Number(i.qty || 0), 0);
    return `
    <button class="order-card" data-order="${esc(o.id)}">
      <div class="order-card-top">
        <div style="min-width:0">
          <div class="order-ref-no">${esc(o.order_number || "#" + o.id)}</div>
          <h4>${esc(o.customer_name)}</h4>
          <div class="order-meta">
            <span>${esc(o.customer_city || "—")}${o.customer_state ? ", " + esc(o.customer_state) : ""}</span>
            <span>${itemCount} item${itemCount === 1 ? "" : "s"}</span>
            <span>${esc(timeAgo(o.created_at))}</span>
          </div>
        </div>
      </div>
      <div class="order-card-bot">
        <span class="order-total">${money(o.total)}</span>
        <span class="order-chips">${statusChip(o.status)}${payChip(o.payment_status)}</span>
      </div>
    </button>`;
  }).join("");

  mount.querySelectorAll("[data-order]").forEach(card => {
    card.addEventListener("click", () => openOrderSheet(Number(card.dataset.order)));
  });
}

function openOrderSheet(id) {
  const o = A.orders.find(x => x.id === id);
  if (!o) return;

  const phoneDigits = String(o.customer_phone || "").replace(/\D/g, "");
  const waNumber = phoneDigits.startsWith("0") ? "234" + phoneDigits.slice(1) : phoneDigits;
  const waMsg = encodeURIComponent(
    `Hello ${o.customer_name}, this is Dakar Dapper about your order ${o.order_number || ""}.`);

  openSheet(o.order_number || "Order", `
    <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px">
      ${statusChip(o.status)}${payChip(o.payment_status)}
      <span class="st-chip st-unpaid"><span class="ic">◷</span>${esc(timeAgo(o.created_at))}</span>
    </div>

    <h4 style="font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--a-text-3);margin-bottom:6px">Customer</h4>
    <dl>
      <div class="a-kv"><dt>Name</dt><dd>${esc(o.customer_name)}</dd></div>
      <div class="a-kv"><dt>Phone</dt><dd>${esc(o.customer_phone)}</dd></div>
      <div class="a-kv"><dt>Email</dt><dd>${esc(o.customer_email)}</dd></div>
      <div class="a-kv"><dt>Address</dt><dd>${esc(o.customer_address)}</dd></div>
      <div class="a-kv"><dt>City</dt><dd>${esc(o.customer_city || "—")}, ${esc(o.customer_state || "—")}</dd></div>
      ${o.note ? `<div class="a-kv"><dt>Note</dt><dd>${esc(o.note)}</dd></div>` : ""}
    </dl>

    <div class="a-contact-row">
      <a class="a-btn a-btn-gold" href="https://wa.me/${esc(waNumber)}?text=${waMsg}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="a-btn a-btn-ghost" href="tel:${esc(o.customer_phone)}">Call</a>
    </div>

    <div class="a-divider"></div>

    <h4 style="font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--a-text-3);margin-bottom:6px">Items</h4>
    ${(o.items || []).map(i => `
      <div class="a-order-item">
        <img src="${escUrl(i.image)}" alt="" loading="lazy">
        <div class="a-order-item-b">
          <strong>${esc(i.name)}</strong>
          <span>${esc(i.size || "")}${i.color ? " · " + esc(i.color) : ""} · ×${esc(i.qty)}</span>
        </div>
        <span class="a-order-item-p">${money(Number(i.price) * Number(i.qty))}</span>
      </div>`).join("")}

    <div class="a-divider"></div>
    <dl>
      <div class="a-kv"><dt>Subtotal</dt><dd>${money(o.subtotal)}</dd></div>
      <div class="a-kv"><dt>Delivery</dt><dd>${Number(o.shipping) === 0 ? "FREE" : money(o.shipping)}</dd></div>
      <div class="a-kv" style="font-size:1rem"><dt>Total</dt><dd>${money(o.total)}</dd></div>
    </dl>

    <div class="a-divider"></div>

    <h4 style="font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--a-text-3);margin-bottom:8px">Order status</h4>
    <div class="status-picker" id="status-picker">
      ${ORDER_STATUSES.map(s => `
        <button class="status-opt${o.status === s.id ? " active" : ""}" data-status="${esc(s.id)}">
          <span aria-hidden="true">${s.icon}</span>${esc(s.label)}
        </button>`).join("")}
    </div>

    <h4 style="font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--a-text-3);margin:16px 0 8px">Payment</h4>
    <div class="status-picker" id="pay-picker">
      <button class="status-opt${o.payment_status === "unpaid" ? " active" : ""}" data-pay="unpaid">
        <span aria-hidden="true">○</span>Unpaid</button>
      <button class="status-opt${o.payment_status === "paid" ? " active" : ""}" data-pay="paid">
        <span aria-hidden="true">✔</span>Paid</button>
    </div>
  `, `<button class="a-btn a-btn-ghost" onclick="closeSheet()">Done</button>`);

  document.querySelectorAll("#status-picker .status-opt").forEach(btn => {
    btn.addEventListener("click", async () => {
      const next = btn.dataset.status;
      const res = await dbUpdateOrderStatus(o.id, next);
      if (!res.ok) return toast("Could not update: " + res.message);
      o.status = next;
      document.querySelectorAll("#status-picker .status-opt").forEach(b =>
        b.classList.toggle("active", b.dataset.status === next));
      toast("Marked as " + next);
      renderOrderFilters(); renderOrders(); refreshStats();
    });
  });

  document.querySelectorAll("#pay-picker .status-opt").forEach(btn => {
    btn.addEventListener("click", async () => {
      const next = btn.dataset.pay;
      const res = await dbUpdateOrderPayment(o.id, next);
      if (!res.ok) return toast("Could not update: " + res.message);
      o.payment_status = next;
      document.querySelectorAll("#pay-picker .status-opt").forEach(b =>
        b.classList.toggle("active", b.dataset.pay === next));
      toast(next === "paid" ? "Marked as paid" : "Marked unpaid");
      renderOrders();
    });
  });
}

/* ── Live order notifications ─────────────────────────────────────────── */
function startLiveOrders() {
  if (typeof dbSubscribeToOrders !== "function") return;
  dbSubscribeToOrders(async () => {
    const fresh = await dbFetchOrders({ limit: 200 });
    const newOnes = fresh.filter(o => !A.seenOrderIds.has(o.id));
    A.orders = fresh;
    fresh.forEach(o => A.seenOrderIds.add(o.id));

    if (newOnes.length) {
      bumpOrderBadge(newOnes.length);
      toast(`New order from ${newOnes[0].customer_name} — ${money(newOnes[0].total)}`);
      try { navigator.vibrate && navigator.vibrate(180); } catch {}
    }
    renderOrderFilters(); renderOrders(); refreshStats();
  });
}

function bumpOrderBadge(n) {
  const badge = document.getElementById("orders-badge");
  const current = Number(badge.textContent) || 0;
  badge.textContent = current + n;
  badge.hidden = false;
}

function clearOrderBadge() {
  const badge = document.getElementById("orders-badge");
  badge.textContent = "0";
  badge.hidden = true;
}

async function refreshStats() {
  A.stats = await dbAdminStats();
  renderDashboard();
}

/* ══════════════════════════════════════════════════════════════════════
   PRODUCTS
   ══════════════════════════════════════════════════════════════════════ */

function renderProductFilters() {
  const opts = [
    { id: "all", label: "All", n: A.products.length },
    { id: "low", label: "Low stock", n: A.products.filter(p => p.stock > 0 && p.stock <= 3).length },
    { id: "out", label: "Sold out", n: A.products.filter(p => p.stock <= 0).length },
    ...A.categories.map(c => ({
      id: "cat:" + c.id, label: c.name,
      n: A.products.filter(p => p.category === c.id).length
    }))
  ];

  document.getElementById("product-filters").innerHTML = opts.map(o => `
    <button class="a-chip${A.productFilter === o.id ? " active" : ""}" data-filter="${esc(o.id)}">
      ${esc(o.label)} <span class="n">${o.n}</span>
    </button>`).join("");

  document.querySelectorAll("#product-filters .a-chip").forEach(chip => {
    chip.addEventListener("click", () => setProductFilter(chip.dataset.filter));
  });
}

function setProductFilter(f) {
  A.productFilter = f;
  renderProductFilters();
  renderProducts();
}

function filteredProducts() {
  let list = [...A.products];
  const f = A.productFilter;
  if (f === "low") list = list.filter(p => p.stock > 0 && p.stock <= 3);
  else if (f === "out") list = list.filter(p => p.stock <= 0);
  else if (f.startsWith("cat:")) list = list.filter(p => p.category === f.slice(4));

  if (A.productSearch) {
    list = list.filter(p =>
      p.name.toLowerCase().includes(A.productSearch) ||
      (p.subtitle || "").toLowerCase().includes(A.productSearch));
  }
  return list;
}

function renderProducts() {
  const list = filteredProducts();
  const mount = document.getElementById("products-list");

  document.getElementById("products-count-line").textContent =
    `${A.products.length} product${A.products.length === 1 ? "" : "s"} · tap − or + to restock instantly`;

  if (!list.length) {
    mount.innerHTML = `<div class="a-empty" style="grid-column:1/-1">
      <div class="a-empty-mark">□</div>
      <h4>Nothing here</h4>
      <p>${A.products.length ? "Try another filter." : "Tap + to add your first product."}</p>
    </div>`;
    return;
  }

  mount.innerHTML = list.map(p => {
    const out = p.stock <= 0;
    const low = p.stock > 0 && p.stock <= 3;
    return `
    <div class="prod-card${out ? " is-out" : low ? " is-low" : ""}" data-pid="${esc(p.id)}">
      <div class="prod-thumb">
        ${p.image
          ? `<img src="${escUrl(p.image)}" alt="${esc(p.name)}" loading="lazy">`
          : `<div style="display:grid;place-items:center;height:100%;color:var(--a-text-3);font-size:.7rem">No photo</div>`}
      </div>
      <div class="prod-body">
        <h4>${esc(p.name)}</h4>
        <div class="prod-sub">${esc(p.subtitle || p.category)}</div>
        <div class="prod-row">
          <span class="prod-price">${money(p.price)}</span>
          ${out ? `<span class="st-chip st-cancelled"><span class="ic">✕</span>Sold out</span>`
                : low ? `<span class="st-chip st-pending"><span class="ic">▲</span>${p.stock} left</span>` : ""}
        </div>
        <div class="prod-row">
          <div class="stock-step">
            <button data-step="-1" data-pid="${esc(p.id)}" aria-label="Reduce stock"${p.stock <= 0 ? " disabled" : ""}>−</button>
            <input type="number" inputmode="numeric" value="${esc(p.stock)}" data-stock="${esc(p.id)}" aria-label="Stock for ${esc(p.name)}" min="0">
            <button data-step="1" data-pid="${esc(p.id)}" aria-label="Increase stock">+</button>
          </div>
          <div class="prod-actions">
            <button class="prod-icon-btn" data-edit="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
            </button>
            <button class="prod-icon-btn danger" data-del="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");

  bindProductRowActions();
}

function bindProductRowActions() {
  document.querySelectorAll("[data-step]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.pid);
      const input = document.querySelector(`[data-stock="${id}"]`);
      const next = Math.max(0, (Number(input.value) || 0) + Number(btn.dataset.step));
      input.value = next;
      queueStockSave(id, next);
    });
  });

  document.querySelectorAll("[data-stock]").forEach(input => {
    input.addEventListener("change", () => {
      const id = Number(input.dataset.stock);
      const next = Math.max(0, Number(input.value) || 0);
      input.value = next;
      queueStockSave(id, next);
    });
  });

  document.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openProductEditor(Number(btn.dataset.edit)));
  });

  document.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => confirmDeleteProduct(Number(btn.dataset.del)));
  });
}

/* Debounced so holding "+" is a single write, not twenty. */
const stockTimers = {};
function queueStockSave(id, value) {
  clearTimeout(stockTimers[id]);
  stockTimers[id] = setTimeout(async () => {
    const res = await dbSetStock(id, value);
    if (!res.ok) return toast("Could not save stock: " + res.message);
    const p = A.products.find(x => x.id === id);
    if (p) { p.stock = value; p.isOutOfStock = value <= 0; }
    toast(`Stock set to ${value}`);
    renderProducts();
    renderProductFilters();
    refreshStats();
  }, 700);
}

/* ── Product editor ───────────────────────────────────────────────────── */
function openProductEditor(id) {
  const isNew = id === null;
  const p = isNew ? {
    id: null, name: "", subtitle: "", category: A.categories[0]?.id || "wears",
    price: 0, originalPrice: null, showDiscount: true, stock: 10, image: "",
    sizes: ["S", "M", "L", "XL"], colors: ["#1A1A1A"], colorNames: ["Noir"],
    rating: null, reviews: 0, description: "", details: [], care: "",
    isNew: true, badge: "", badgeType: "tag-gold", isActive: true
  } : { ...A.products.find(x => x.id === id) };

  if (!p) return;
  A.editing = JSON.parse(JSON.stringify(p));

  openSheet(isNew ? "New product" : "Edit product", `
    <div class="a-error" id="editor-error" hidden></div>

    <div class="a-field">
      <label>Photos</label>
      <div id="image-slot"></div>
      <input type="file" id="image-file" accept="image/jpeg,image/png,image/webp" multiple hidden>
    </div>

    <div class="a-field">
      <label for="pf-name">Product name</label>
      <input class="a-input" id="pf-name" value="${esc(p.name)}" placeholder="Riviera Cuban Silk Shirt">
    </div>

    <div class="a-field">
      <label for="pf-sub">Short description</label>
      <input class="a-input" id="pf-sub" value="${esc(p.subtitle)}" placeholder="Silk-viscose blend, resort print">
    </div>

    <div class="a-row">
      <div class="a-field">
        <label for="pf-price">Price (₦)</label>
        <input class="a-input" id="pf-price" type="number" inputmode="numeric" min="0" value="${esc(p.price)}">
      </div>
      <div class="a-field">
        <label for="pf-was">Was (₦)</label>
        <input class="a-input" id="pf-was" type="number" inputmode="numeric" min="0" value="${p.originalPrice || ""}" placeholder="Optional">
        <div class="hint" id="disc-hint"></div>
      </div>
    </div>

    <div class="a-row">
      <div class="a-field">
        <label for="pf-stock">Stock</label>
        <input class="a-input" id="pf-stock" type="number" inputmode="numeric" min="0" value="${esc(p.stock)}">
      </div>
      <div class="a-field">
        <label for="pf-cat">Category</label>
        <select class="a-select" id="pf-cat">
          ${A.categories.map(c => `<option value="${esc(c.id)}"${p.category === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="a-row">
      <div class="a-field">
        <label for="pf-badge">Badge</label>
        <input class="a-input" id="pf-badge" value="${esc(p.badge || "")}" placeholder="New, Trending…">
      </div>
      <div class="a-field">
        <label for="pf-new">Show in New Arrivals</label>
        <select class="a-select" id="pf-new">
          <option value="yes"${p.isNew ? " selected" : ""}>Yes</option>
          <option value="no"${!p.isNew ? " selected" : ""}>No</option>
        </select>
      </div>
    </div>

    <div class="a-field">
      <label>Sizes</label>
      <div class="chip-edit" id="size-chips"></div>
      <div class="chip-add">
        <input class="a-input" id="size-input" placeholder="Add a size (M, 42, One Size)">
        <button class="a-btn a-btn-ghost a-btn-sm" id="size-add">Add</button>
      </div>
    </div>

    <div class="a-field">
      <label>Colours</label>
      <div class="chip-edit" id="color-chips"></div>
      <div class="chip-add">
        <input type="color" class="a-input" id="color-pick" value="#1A1A1A" style="max-width:56px;padding:4px">
        <input class="a-input" id="color-name" placeholder="Colour name">
        <button class="a-btn a-btn-ghost a-btn-sm" id="color-add">Add</button>
      </div>
    </div>

    <div class="a-field">
      <label for="pf-desc">Full description</label>
      <textarea class="a-textarea" id="pf-desc" placeholder="Tell the story of this piece…">${esc(p.description)}</textarea>
    </div>

    <div class="a-field">
      <label>Product details</label>
      <div class="chip-edit" id="detail-chips"></div>
      <div class="chip-add">
        <input class="a-input" id="detail-input" placeholder="e.g. 100% Italian leather">
        <button class="a-btn a-btn-ghost a-btn-sm" id="detail-add">Add</button>
      </div>
    </div>

    <div class="a-field">
      <label for="pf-care">Care instructions</label>
      <input class="a-input" id="pf-care" value="${esc(p.care)}" placeholder="Machine wash cold inside out">
    </div>

    <div class="a-field">
      <label for="pf-active">Visible on the website</label>
      <select class="a-select" id="pf-active">
        <option value="yes"${p.isActive !== false ? " selected" : ""}>Yes — customers can see it</option>
        <option value="no"${p.isActive === false ? " selected" : ""}>No — hide it for now</option>
      </select>
    </div>
  `, `
    <button class="a-btn a-btn-ghost" onclick="closeSheet()">Cancel</button>
    <button class="a-btn a-btn-primary" id="save-product">${isNew ? "Add product" : "Save changes"}</button>
  `);

  renderImageSlot();
  renderChipEditors();
  bindEditorEvents();
  updateDiscountHint();
}

/* ── Product photo gallery ─────────────────────────────────────────────
   The first photo is the one customers see in the grid; the rest become the
   gallery on the product page. Every upload is shrunk on this device first,
   so adding six photos does not make the storefront heavy. */

function editorPhotos() {
  const e = A.editing;
  const list = [];
  if (e.image) list.push(e.image);
  (e.images || []).forEach(u => { if (u && u !== e.image) list.push(u); });
  return list;
}

function setEditorPhotos(list) {
  A.editing.image = list[0] || "";
  A.editing.images = list.slice(1);
  if (!list.length) A.editing.thumb = "";
  renderImageSlot();
}

function renderImageSlot() {
  const slot = document.getElementById("image-slot");
  if (!slot) return;
  const photos = editorPhotos();

  slot.innerHTML = `
    <div class="photo-grid" id="photo-grid">
      ${photos.map((src, i) => `
        <figure class="photo-tile${i === 0 ? " is-main" : ""}" data-i="${i}">
          <img src="${escUrl(src)}" alt="" loading="lazy">
          ${i === 0 ? `<figcaption class="photo-main-tag">Main</figcaption>` : ""}
          <div class="photo-tile-actions">
            ${i > 0 ? `<button type="button" class="photo-act" data-make-main="${i}"
                          title="Use as main photo" aria-label="Use as main photo">&#9733;</button>` : ""}
            <button type="button" class="photo-act danger" data-remove="${i}"
                    title="Remove photo" aria-label="Remove photo">&#10005;</button>
          </div>
        </figure>`).join("")}

      <button type="button" class="photo-add" id="photo-add">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        <span>${photos.length ? "Add photo" : "Add photos"}</span>
      </button>
    </div>
    <p class="photo-hint">
      ${photos.length
        ? `${photos.length} photo${photos.length === 1 ? "" : "s"} &middot; the first one shows in the shop grid`
        : "Add as many as you like &mdash; the first becomes the main photo."}
      Large photos are shrunk automatically.
    </p>
    <div class="photo-progress" id="photo-progress" hidden></div>`;

  bindPhotoGrid();
}

function bindPhotoGrid() {
  const fileInput = document.getElementById("image-file");
  const addBtn = document.getElementById("photo-add");
  const grid = document.getElementById("photo-grid");

  if (addBtn) {
    addBtn.addEventListener("click", () => fileInput.click());
    ["dragenter", "dragover"].forEach(ev =>
      addBtn.addEventListener(ev, e => { e.preventDefault(); addBtn.classList.add("dragging"); }));
    ["dragleave", "drop"].forEach(ev =>
      addBtn.addEventListener(ev, e => { e.preventDefault(); addBtn.classList.remove("dragging"); }));
  }

  if (grid) {
    ["dragenter", "dragover"].forEach(ev =>
      grid.addEventListener(ev, e => { e.preventDefault(); grid.classList.add("dragging"); }));
    ["dragleave"].forEach(ev =>
      grid.addEventListener(ev, e => { e.preventDefault(); grid.classList.remove("dragging"); }));
    grid.addEventListener("drop", e => {
      e.preventDefault();
      grid.classList.remove("dragging");
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) uploadPhotos(files);
    });
  }

  document.querySelectorAll("[data-remove]").forEach(btn =>
    btn.addEventListener("click", () => {
      const photos = editorPhotos();
      photos.splice(Number(btn.dataset.remove), 1);
      setEditorPhotos(photos);
    }));

  document.querySelectorAll("[data-make-main]").forEach(btn =>
    btn.addEventListener("click", () => {
      const photos = editorPhotos();
      const [picked] = photos.splice(Number(btn.dataset.makeMain), 1);
      setEditorPhotos([picked, ...photos]);
      toast("Main photo updated");
    }));

  if (fileInput) {
    fileInput.onchange = () => {
      const files = Array.from(fileInput.files || []);
      if (files.length) uploadPhotos(files);
      fileInput.value = "";
    };
  }
}

async function uploadPhotos(files) {
  const progress = document.getElementById("photo-progress");
  const show = msg => {
    if (!progress) return;
    progress.hidden = false;
    progress.textContent = msg;
  };

  let savedBytes = 0;
  let added = 0;
  const photos = editorPhotos();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const label = files.length > 1 ? ` (${i + 1} of ${files.length})` : "";

    const res = await dbUploadProductImage(file, s => show(s + label));
    if (!res.ok) {
      show("");
      if (progress) progress.hidden = true;
      editorError(res.message +
        " — if the bucket is missing, create a public bucket named “products” in Supabase Storage.");
      break;
    }

    photos.push(res.url);
    // The thumbnail belongs to the main photo only.
    if (photos.length === 1 && res.thumbUrl) A.editing.thumb = res.thumbUrl;
    savedBytes += Math.max(0, res.before - res.after);
    added++;
  }

  if (progress) progress.hidden = true;
  setEditorPhotos(photos);

  if (added) {
    toast(savedBytes > 0
      ? `${added} photo${added === 1 ? "" : "s"} added — ${formatBytes(savedBytes)} saved by optimising`
      : `${added} photo${added === 1 ? "" : "s"} added`);
  }
}

function renderChipEditors() {
  const e = A.editing;

  document.getElementById("size-chips").innerHTML = (e.sizes || []).map((s, i) => `
    <span class="chip-tag">${esc(s)}<button data-rm-size="${i}" aria-label="Remove ${esc(s)}">✕</button></span>`).join("")
    || `<span style="font-size:.78rem;color:var(--a-text-3)">No sizes yet</span>`;

  document.getElementById("color-chips").innerHTML = (e.colors || []).map((c, i) => `
    <span class="chip-tag">
      <span class="chip-swatch" style="background:${escColor(c)}"></span>
      ${esc((e.colorNames || [])[i] || c)}
      <button data-rm-color="${i}" aria-label="Remove colour">✕</button>
    </span>`).join("")
    || `<span style="font-size:.78rem;color:var(--a-text-3)">No colours yet</span>`;

  document.getElementById("detail-chips").innerHTML = (e.details || []).map((d, i) => `
    <span class="chip-tag">${esc(d)}<button data-rm-detail="${i}" aria-label="Remove">✕</button></span>`).join("")
    || `<span style="font-size:.78rem;color:var(--a-text-3)">No details yet</span>`;

  document.querySelectorAll("[data-rm-size]").forEach(b => b.addEventListener("click", () => {
    e.sizes.splice(Number(b.dataset.rmSize), 1); renderChipEditors();
  }));
  document.querySelectorAll("[data-rm-color]").forEach(b => b.addEventListener("click", () => {
    const i = Number(b.dataset.rmColor);
    e.colors.splice(i, 1);
    if (e.colorNames) e.colorNames.splice(i, 1);
    renderChipEditors();
  }));
  document.querySelectorAll("[data-rm-detail]").forEach(b => b.addEventListener("click", () => {
    e.details.splice(Number(b.dataset.rmDetail), 1); renderChipEditors();
  }));
}

function bindEditorEvents() {
  const e = A.editing;

  const addSize = () => {
    const input = document.getElementById("size-input");
    const v = input.value.trim();
    if (!v) return;
    e.sizes = e.sizes || [];
    if (!e.sizes.includes(v)) e.sizes.push(v);
    input.value = "";
    renderChipEditors();
  };
  document.getElementById("size-add").addEventListener("click", addSize);
  document.getElementById("size-input").addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); addSize(); }
  });

  const addColor = () => {
    const hex = document.getElementById("color-pick").value;
    const nameInput = document.getElementById("color-name");
    const name = nameInput.value.trim() || hex;
    e.colors = e.colors || []; e.colorNames = e.colorNames || [];
    e.colors.push(hex); e.colorNames.push(name);
    nameInput.value = "";
    renderChipEditors();
  };
  document.getElementById("color-add").addEventListener("click", addColor);
  document.getElementById("color-name").addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); addColor(); }
  });

  const addDetail = () => {
    const input = document.getElementById("detail-input");
    const v = input.value.trim();
    if (!v) return;
    e.details = e.details || [];
    e.details.push(v);
    input.value = "";
    renderChipEditors();
  };
  document.getElementById("detail-add").addEventListener("click", addDetail);
  document.getElementById("detail-input").addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); addDetail(); }
  });

  ["pf-price", "pf-was"].forEach(id =>
    document.getElementById(id).addEventListener("input", updateDiscountHint));

  document.getElementById("save-product").addEventListener("click", saveProduct);
}

function updateDiscountHint() {
  const price = Number(document.getElementById("pf-price").value) || 0;
  const was = Number(document.getElementById("pf-was").value) || 0;
  const hint = document.getElementById("disc-hint");
  if (was > price && price > 0) {
    hint.textContent = `Shows −${Math.round((1 - price / was) * 100)}% on the site`;
    hint.style.color = "var(--st-good)";
  } else if (was > 0 && was <= price) {
    hint.textContent = "Must be higher than the price";
    hint.style.color = "var(--st-critical)";
  } else {
    hint.textContent = "";
  }
}

function editorError(msg) {
  const box = document.getElementById("editor-error");
  if (!box) return toast(msg);
  box.hidden = false;
  box.textContent = msg;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveProduct() {
  const e = A.editing;
  const btn = document.getElementById("save-product");
  const val = id => document.getElementById(id).value.trim();

  const name = val("pf-name");
  const price = Number(val("pf-price"));
  const was = Number(val("pf-was")) || null;
  const stock = Number(val("pf-stock"));

  if (name.length < 2) return editorError("Give the product a name.");
  if (!(price > 0)) return editorError("Enter a price above zero.");
  if (was && was <= price) return editorError("“Was” must be higher than the price.");
  if (stock < 0 || Number.isNaN(stock)) return editorError("Stock cannot be negative.");
  if (!(e.sizes || []).length) return editorError("Add at least one size.");

  const product = {
    ...e,
    id: e.id === null ? await dbNextProductId() : e.id,
    name, subtitle: val("pf-sub"),
    category: val("pf-cat"),
    price, originalPrice: was,
    showDiscount: true,
    stock,
    badge: val("pf-badge") || null,
    isNew: val("pf-new") === "yes",
    description: val("pf-desc"),
    care: val("pf-care"),
    isActive: val("pf-active") === "yes"
  };

  btn.disabled = true;
  btn.textContent = "Saving…";

  const res = await dbSaveProduct(product);

  btn.disabled = false;
  btn.textContent = "Save changes";

  if (!res.ok) return editorError("Could not save: " + res.message);

  const idx = A.products.findIndex(x => x.id === product.id);
  if (idx >= 0) A.products[idx] = product; else A.products.push(product);

  closeSheet();
  toast(idx >= 0 ? "Product updated — live on the site" : "Product added — live on the site");
  renderProducts(); renderProductFilters(); refreshStats();
}

function confirmDeleteProduct(id) {
  const p = A.products.find(x => x.id === id);
  if (!p) return;

  openSheet("Delete product", `
    <p style="font-size:.9rem;line-height:1.6">
      Delete <strong>${esc(p.name)}</strong> permanently? It will disappear from the
      website immediately. Past orders keep their record of it.
    </p>
    <p style="font-size:.82rem;color:var(--a-text-3);margin-top:10px">
      To take it off the site without losing it, edit the product and set
      <em>Visible on the website</em> to No instead.
    </p>
  `, `
    <button class="a-btn a-btn-ghost" onclick="closeSheet()">Keep it</button>
    <button class="a-btn a-btn-danger" id="confirm-del">Delete</button>
  `);

  document.getElementById("confirm-del").addEventListener("click", async () => {
    const res = await dbDeleteProduct(id);
    if (!res.ok) return toast("Could not delete: " + res.message);
    A.products = A.products.filter(x => x.id !== id);
    closeSheet();
    toast("Product deleted");
    renderProducts(); renderProductFilters(); refreshStats();
  });
}

/* ══════════════════════════════════════════════════════════════════════
   CATEGORIES
   ══════════════════════════════════════════════════════════════════════ */

function renderCategories() {
  const mount = document.getElementById("categories-list");
  if (!A.categories.length) {
    mount.innerHTML = `<div class="a-empty"><p>No categories yet.</p></div>`;
    return;
  }
  mount.innerHTML = A.categories.map(c => {
    const n = A.products.filter(p => p.category === c.id).length;
    return `
    <div class="a-list-row">
      <div class="a-list-row-main">
        <strong>${esc(c.name)}</strong>
        <span>${n} product${n === 1 ? "" : "s"}</span>
      </div>
      <button class="prod-icon-btn danger" data-delcat="${esc(c.id)}" aria-label="Delete ${esc(c.name)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
      </button>
    </div>`;
  }).join("");

  mount.querySelectorAll("[data-delcat]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.delcat;
      const n = A.products.filter(p => p.category === id).length;
      if (n > 0) return toast(`Move or delete its ${n} product${n === 1 ? "" : "s"} first.`);
      const res = await dbDeleteCategory(id);
      if (!res.ok) return toast("Could not delete: " + res.message);
      A.categories = A.categories.filter(c => c.id !== id);
      renderCategories(); renderProductFilters();
      toast("Category deleted");
    });
  });
}

function openCategoryEditor() {
  openSheet("New category", `
    <div class="a-error" id="cat-error" hidden></div>
    <div class="a-field">
      <label for="cat-name">Category name</label>
      <input class="a-input" id="cat-name" placeholder="e.g. Fragrances">
      <div class="hint">This appears in the shop filters straight away.</div>
    </div>
  `, `
    <button class="a-btn a-btn-ghost" onclick="closeSheet()">Cancel</button>
    <button class="a-btn a-btn-primary" id="save-cat">Add category</button>
  `);

  document.getElementById("save-cat").addEventListener("click", async () => {
    const name = document.getElementById("cat-name").value.trim();
    const box = document.getElementById("cat-error");
    if (name.length < 2) { box.hidden = false; box.textContent = "Give the category a name."; return; }

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (A.categories.some(c => c.id === id)) {
      box.hidden = false; box.textContent = "That category already exists."; return;
    }

    const res = await dbSaveCategory({ id, name }, A.categories.length + 1);
    if (!res.ok) { box.hidden = false; box.textContent = res.message; return; }

    A.categories.push({ id, name });
    closeSheet();
    toast("Category added — live on the site");
    renderCategories(); renderProductFilters();
  });
}

/* ══════════════════════════════════════════════════════════════════════
   CMS + SHIPPING
   ══════════════════════════════════════════════════════════════════════ */

function renderCmsForm() {
  const c = A.content || {};
  document.getElementById("cms-form").innerHTML = `
    <div class="a-field">
      <label for="cms-badge">Hero badge</label>
      <input class="a-input" id="cms-badge" value="${esc(c.heroBadge || "")}">
    </div>
    <div class="a-field">
      <label for="cms-title">Hero headline</label>
      <input class="a-input" id="cms-title" value="${esc(c.heroTitle || "")}">
      <div class="hint">Wrap a word in &lt;em&gt; to italicise it.</div>
    </div>
    <div class="a-field">
      <label for="cms-desc">Hero paragraph</label>
      <textarea class="a-textarea" id="cms-desc">${esc(c.heroDesc || "")}</textarea>
    </div>
    <div class="a-field">
      <label for="cms-banner">Announcement bar</label>
      <input class="a-input" id="cms-banner" value="${esc(c.bannerNotice || "")}">
    </div>
    <div class="a-divider"></div>
    <div class="a-field">
      <label for="cms-story-title">Story headline</label>
      <input class="a-input" id="cms-story-title" value="${esc(c.storyTitle || "")}">
    </div>
    <div class="a-field">
      <label for="cms-story-desc">Story paragraph</label>
      <textarea class="a-textarea" id="cms-story-desc">${esc(c.storyDesc || "")}</textarea>
    </div>
    <div class="a-divider"></div>
    <div class="a-row">
      <div class="a-field">
        <label for="cms-phone">WhatsApp number</label>
        <input class="a-input" id="cms-phone" value="${esc(c.phone || "")}" placeholder="2349019603621">
        <div class="hint">International format, no +</div>
      </div>
      <div class="a-field">
        <label for="cms-phone-display">Shown as</label>
        <input class="a-input" id="cms-phone-display" value="${esc(c.phoneDisplay || "")}">
      </div>
    </div>
    <div class="a-field">
      <label for="cms-email">Contact email</label>
      <input class="a-input" id="cms-email" type="email" value="${esc(c.emailAddress || "")}">
    </div>
    <button class="a-btn a-btn-primary a-btn-full" id="save-cms">Save &amp; publish</button>`;

  document.getElementById("save-cms").addEventListener("click", saveCms);
}

async function saveCms() {
  const btn = document.getElementById("save-cms");
  const v = id => document.getElementById(id).value.trim();

  const payload = {
    ...(A.content || {}),
    heroBadge: v("cms-badge"), heroTitle: v("cms-title"), heroDesc: v("cms-desc"),
    bannerNotice: v("cms-banner"),
    storyTitle: v("cms-story-title"), storyDesc: v("cms-story-desc"),
    phone: v("cms-phone").replace(/\D/g, ""), phoneDisplay: v("cms-phone-display"),
    emailAddress: v("cms-email"),
    freeShipMin: A.content?.freeShipMin || 150000,
    popupDelaySec: A.content?.popupDelaySec || 30,
    heroBtn1Text: A.content?.heroBtn1Text || "Shop Collection",
    heroBtn2Text: A.content?.heroBtn2Text || "Our Story",
    storyKicker: A.content?.storyKicker || "The Dakar Dapper Story"
  };

  btn.disabled = true; btn.textContent = "Saving…";
  const res = await dbSaveContent(payload);
  btn.disabled = false; btn.textContent = "Save & publish";

  if (!res.ok) return toast("Could not save: " + res.message);
  A.content = payload;
  toast("Homepage updated — live now");
}

function renderShippingForm() {
  const c = A.content || {};
  document.getElementById("shipping-form").innerHTML = `
    <div class="a-field">
      <label for="ship-free">Free delivery above (₦)</label>
      <input class="a-input" id="ship-free" type="number" inputmode="numeric" min="0" value="${esc(c.freeShipMin || 150000)}">
      <div class="hint">Orders at or above this total ship free, anywhere.</div>
    </div>
    <button class="a-btn a-btn-primary a-btn-full" id="save-ship">Save</button>
    <div class="a-divider"></div>
    <p style="font-size:.8rem;color:var(--a-text-3);line-height:1.6">
      Per-state delivery fees are set in the database table
      <strong>dd_shipping_rates</strong> (${A.shipping.length} states configured).
      The server uses them to price every order.
    </p>`;

  document.getElementById("save-ship").addEventListener("click", async () => {
    const btn = document.getElementById("save-ship");
    const val = Number(document.getElementById("ship-free").value) || 0;
    btn.disabled = true; btn.textContent = "Saving…";
    const res = await dbSaveContent({ ...(A.content || {}), freeShipMin: val });
    btn.disabled = false; btn.textContent = "Save";
    if (!res.ok) return toast("Could not save: " + res.message);
    A.content = { ...(A.content || {}), freeShipMin: val };
    toast("Delivery threshold saved");
  });
}

/* ══════════════════════════════════════════════════════════════════════
   SUBSCRIBERS + AUDIT
   ══════════════════════════════════════════════════════════════════════ */



function renderAudit() {
  const mount = document.getElementById("audit-list");
  if (!A.audit.length) {
    mount.innerHTML = `<div class="a-empty"><p>No recorded actions yet.</p></div>`;
    return;
  }
  mount.innerHTML = A.audit.map(l => `
    <div class="a-list-row">
      <div class="a-list-row-main">
        <strong style="font-weight:500;font-size:.85rem">${esc(auditLabel(l))}</strong>
        <span>${esc(l.actor_email || "system")} · ${esc(timeAgo(l.created_at))}</span>
      </div>
    </div>`).join("");
}

/* ══════════════════════════════════════════════════════════════════════
   SHEET + TOAST
   ══════════════════════════════════════════════════════════════════════ */

let lastFocused = null;

function openSheet(title, bodyHtml, footHtml) {
  lastFocused = document.activeElement;
  document.getElementById("sheet-title").textContent = title;
  document.getElementById("sheet-body").innerHTML = bodyHtml;
  document.getElementById("sheet-foot").innerHTML = footHtml || "";
  const sheet = document.getElementById("sheet");
  sheet.classList.add("open");
  sheet.removeAttribute("inert");
  document.getElementById("sheet-backdrop").classList.add("open");
  document.body.style.overflow = "hidden";
  const first = document.querySelector("#sheet-body input, #sheet-body button");
  if (first && window.innerWidth >= 768) first.focus();
}

function closeSheet() {
  const sheet = document.getElementById("sheet");
  sheet.classList.remove("open");
  sheet.setAttribute("inert", "");
  document.getElementById("sheet-backdrop").classList.remove("open");
  document.body.style.overflow = "";
  A.editing = null;
  if (lastFocused) { try { lastFocused.focus(); } catch {} }
}

function toast(msg) {
  const box = document.getElementById("toast-box");
  const el = document.createElement("div");
  el.className = "a-toast";
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

/* ══════════════════════════════════════════════════════════════════════
   REVIEWS — moderation
   Nothing a customer writes appears on the site until it is approved here.
   ══════════════════════════════════════════════════════════════════════ */

function renderReviewFilters() {
  const counts = {
    pending: A.reviews.filter(r => r.status === "pending").length,
    approved: A.reviews.filter(r => r.status === "approved").length,
    rejected: A.reviews.filter(r => r.status === "rejected").length
  };
  counts.all = A.reviews.length;

  const opts = [
    { id: "pending", label: "Waiting" },
    { id: "approved", label: "Published" },
    { id: "rejected", label: "Hidden" },
    { id: "all", label: "All" }
  ];

  document.getElementById("review-filters").innerHTML = opts.map(o => `
    <button class="a-chip${A.reviewFilter === o.id ? " active" : ""}" data-rfilter="${esc(o.id)}">
      ${esc(o.label)} <span class="n">${counts[o.id] || 0}</span>
    </button>`).join("");

  document.querySelectorAll("[data-rfilter]").forEach(chip =>
    chip.addEventListener("click", () => {
      A.reviewFilter = chip.dataset.rfilter;
      renderReviewFilters();
      renderReviewsList();
    }));

  ["reviews-badge", "reviews-seg-badge"].forEach(id => {
    const badge = document.getElementById(id);
    if (!badge) return;
    badge.textContent = counts.pending;
    badge.hidden = counts.pending === 0;
  });

  const line = document.getElementById("reviews-count-line");
  if (line) {
    line.textContent = counts.pending
      ? `${counts.pending} waiting for your decision`
      : "Nothing is waiting. New reviews appear here first.";
  }
}

function reviewStars(n) {
  return `<span class="rev-stars" aria-label="${n} out of 5">` +
    [1,2,3,4,5].map(i => `<span class="${i <= n ? "on" : ""}">★</span>`).join("") + `</span>`;
}

function renderReviewsList() {
  const mount = document.getElementById("reviews-list");
  const list = A.reviewFilter === "all"
    ? A.reviews
    : A.reviews.filter(r => r.status === A.reviewFilter);

  if (!list.length) {
    mount.innerHTML = `<div class="a-empty">
      <div class="a-empty-mark">☆</div>
      <h4>Nothing here</h4>
      <p>${A.reviews.length ? "No reviews with that status." : "Customer reviews will appear here for approval."}</p>
    </div>`;
    return;
  }

  mount.innerHTML = list.map(r => {
    const product = r.dd_products || {};
    return `
    <div class="a-card rev-card" data-review="${esc(r.id)}">
      <div class="rev-top">
        <div class="rev-product">
          ${product.image ? `<img src="${escUrl(product.image)}" alt="" loading="lazy">` : ""}
          <div>
            <strong>${esc(product.name || "Product")}</strong>
            <span>${esc(r.author_name)} &middot; ${esc(timeAgo(r.created_at))}</span>
          </div>
        </div>
        <span class="st-chip st-${r.status === "approved" ? "delivered" : r.status === "rejected" ? "cancelled" : "pending"}">
          <span class="ic" aria-hidden="true">${r.status === "approved" ? "✔" : r.status === "rejected" ? "✕" : "●"}</span>
          ${r.status === "approved" ? "Published" : r.status === "rejected" ? "Hidden" : "Waiting"}
        </span>
      </div>

      <div class="rev-body">
        ${reviewStars(r.rating)}
        ${r.verified ? `<span class="rev-verified">✓ Verified purchase</span>` : `<span class="rev-unverified">No matching order</span>`}
        ${r.title ? `<h4>${esc(r.title)}</h4>` : ""}
        <p>${esc(r.body)}</p>
        <span class="rev-meta">
          ${esc(r.author_email)}${r.size_bought ? ` &middot; size ${esc(r.size_bought)}` : ""}
        </span>
      </div>

      <div class="rev-actions">
        ${r.status !== "approved" ? `<button class="a-btn a-btn-primary a-btn-sm" data-approve="${esc(r.id)}">Publish</button>` : ""}
        ${r.status !== "rejected" ? `<button class="a-btn a-btn-ghost a-btn-sm" data-reject="${esc(r.id)}">Hide</button>` : ""}
        <button class="a-btn a-btn-danger a-btn-sm" data-delrev="${esc(r.id)}">Delete</button>
      </div>
    </div>`;
  }).join("");

  bindReviewActions();
}

function bindReviewActions() {
  const setStatus = async (id, status, word) => {
    const res = await dbSetReviewStatus(id, status);
    if (!res.ok) return toast("Could not update: " + res.message);
    const r = A.reviews.find(x => x.id === id);
    if (r) r.status = status;
    toast(word);
    renderReviewFilters();
    renderReviewsList();
    loadProductsAfterReview();
  };

  document.querySelectorAll("[data-approve]").forEach(b =>
    b.addEventListener("click", () => setStatus(Number(b.dataset.approve), "approved", "Review published")));
  document.querySelectorAll("[data-reject]").forEach(b =>
    b.addEventListener("click", () => setStatus(Number(b.dataset.reject), "rejected", "Review hidden")));

  document.querySelectorAll("[data-delrev]").forEach(b =>
    b.addEventListener("click", async () => {
      const id = Number(b.dataset.delrev);
      const res = await dbDeleteReview(id);
      if (!res.ok) return toast("Could not delete: " + res.message);
      A.reviews = A.reviews.filter(x => x.id !== id);
      toast("Review deleted");
      renderReviewFilters();
      renderReviewsList();
      loadProductsAfterReview();
    }));
}

/* Publishing a review changes the product's average, so refresh the catalogue. */
async function loadProductsAfterReview() {
  A.products = (await dbFetchProducts()) || A.products;
  renderProducts();
}

/* ══════════════════════════════════════════════════════════════════════
   BACK-IN-STOCK WAITING LIST
   ══════════════════════════════════════════════════════════════════════ */

function renderStockAlerts() {
  const mount = document.getElementById("stock-alerts-list");
  if (!A.stockAlerts.length) {
    mount.innerHTML = `<div class="a-empty"><p>Nobody is waiting on a restock right now.</p></div>`;
    return;
  }

  mount.innerHTML = A.stockAlerts.map(a => `
    <div class="alert-row" data-alert="${esc(a.product_id)}">
      <div class="alert-main">
        ${a.product_image ? `<img src="${escUrl(a.product_image)}" alt="" loading="lazy">` : ""}
        <div>
          <strong>${esc(a.product_name)}</strong>
          <span>${esc(a.waiting)} waiting &middot; ${Number(a.stock) > 0
            ? `<b class="in-stock">${esc(a.stock)} in stock now</b>`
            : "still sold out"}</span>
        </div>
      </div>
      ${Number(a.stock) > 0
        ? `<button class="a-btn a-btn-gold a-btn-sm" data-notify="${esc(a.product_id)}">Email them</button>`
        : `<button class="a-btn a-btn-ghost a-btn-sm" data-seewho="${esc(a.product_id)}">See who</button>`}
    </div>`).join("");

  document.querySelectorAll("[data-notify]").forEach(b =>
    b.addEventListener("click", () => notifyWaiting(Number(b.dataset.notify))));
  document.querySelectorAll("[data-seewho]").forEach(b =>
    b.addEventListener("click", () => showWaiting(Number(b.dataset.seewho))));
}

function showWaiting(productId) {
  const a = A.stockAlerts.find(x => Number(x.product_id) === productId);
  if (!a) return;
  openSheet(a.product_name, `
    <p style="font-size:.86rem;color:var(--a-text-2);margin-bottom:14px">
      ${esc(a.waiting)} ${Number(a.waiting) === 1 ? "person is" : "people are"} waiting for this to come back.
      Restock it and the <strong>Email them</strong> button appears.
    </p>
    ${(a.people || []).map(p => `
      <div class="a-list-row">
        <div class="a-list-row-main">
          <strong style="font-weight:500;font-size:.85rem">${esc(p.email)}</strong>
          <span>${p.size ? "size " + esc(p.size) + " &middot; " : ""}${esc(timeAgo(p.since))}</span>
        </div>
      </div>`).join("")}
  `, `<button class="a-btn a-btn-ghost" onclick="closeSheet()">Close</button>`);
}

async function notifyWaiting(productId) {
  const a = A.stockAlerts.find(x => Number(x.product_id) === productId);
  if (!a) return;

  const product = A.products.find(p => p.id === productId);
  const res = await dbQueueBackInStock(
    { ...a, slug: product ? product.slug : "" }, a.people || []);

  if (!res.ok) return toast("Could not queue emails: " + res.message);

  await dbMarkAlertsNotified(productId);
  A.stockAlerts = A.stockAlerts.filter(x => Number(x.product_id) !== productId);
  renderStockAlerts();
  toast(`${res.count} back-in-stock email${res.count === 1 ? "" : "s"} queued`);
  refreshEmailStatus();
}

/* ══════════════════════════════════════════════════════════════════════
   EMAIL DELIVERY STATUS
   ══════════════════════════════════════════════════════════════════════ */

async function refreshEmailStatus() {
  const mount = document.getElementById("email-status");
  if (!mount) return;
  const s = await dbEmailQueueSummary();

  if (!s || (s.queued === undefined)) {
    mount.innerHTML = `<div class="a-empty"><p>Email queue not set up yet. Run migration 003.</p></div>`;
    return;
  }

  mount.innerHTML = `
    <div class="a-stats" style="margin-bottom:12px">
      <div class="a-stat"><div class="a-stat-label">Sent</div>
        <div class="a-stat-value">${esc(s.sent)}</div></div>
      <div class="a-stat${Number(s.queued) > 0 ? " is-warn" : ""}"><div class="a-stat-label">Waiting</div>
        <div class="a-stat-value">${esc(s.queued)}</div></div>
      <div class="a-stat${Number(s.failed) > 0 ? " is-alert" : ""}"><div class="a-stat-label">Failed</div>
        <div class="a-stat-value">${esc(s.failed)}</div></div>
    </div>
    <p style="font-size:.8rem;color:var(--a-text-3);line-height:1.6">
      Every order queues a confirmation email to the address the customer gave at
      checkout. The <strong>send-emails</strong> function delivers them.
      ${Number(s.queued) > 0 ? " Messages are waiting — check that the function is deployed and scheduled." : ""}
    </p>`;
}

/* ══════════════════════════════════════════════════════════════════════
   CUSTOMERS — sub-sections
   ══════════════════════════════════════════════════════════════════════ */

function switchSub(name) {
  document.querySelectorAll(".a-seg-btn").forEach(b => {
    const on = b.dataset.sub === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
  document.querySelectorAll(".a-sub").forEach(s =>
    s.classList.toggle("active", s.id === "sub-" + name));
  A.customersSub = name;
  if (name === "campaigns") refreshCampaigns();
}

function bindCustomers() {
  document.querySelectorAll(".a-seg-btn").forEach(b =>
    b.addEventListener("click", () => switchSub(b.dataset.sub)));

  document.getElementById("aud-search").addEventListener("input", debounce(e => {
    A.audFilter.search = e.target.value.trim();
    loadAudience();
  }, 300));

  document.getElementById("aud-reset").addEventListener("click", () => {
    A.audFilter = {};
    document.getElementById("aud-search").value = "";
    renderAudienceControls();
    loadAudience();
  });

  document.getElementById("aud-export").addEventListener("click", exportAudience);
  document.getElementById("aud-email").addEventListener("click", () => {
    openCampaignEditor(null, { segment: segmentFromFilter(A.audFilter) });
  });
  document.getElementById("camp-new").addEventListener("click", () => openCampaignEditor(null));
}

/* ══════════════════════════════════════════════════════════════════════
   AUDIENCE
   Everyone who has signed up or bought, one row per email address.
   Filtering runs in the database so the counts are exact.
   ══════════════════════════════════════════════════════════════════════ */

const NG_STATES_ADMIN = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue",
  "Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT - Abuja","Gombe",
  "Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa",
  "Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];

const AUD_KINDS = [
  { id: "all",         label: "Everyone" },
  { id: "subscribed",  label: "Can email" },
  { id: "customers",   label: "Customers" },
  { id: "never",       label: "Never bought" }
];

function audKind(f) {
  if (f.never_bought) return "never";
  if (f.customers_only) return "customers";
  if (f.subscribed_only) return "subscribed";
  return "all";
}

function setAudKind(kind) {
  delete A.audFilter.subscribed_only;
  delete A.audFilter.customers_only;
  delete A.audFilter.never_bought;
  if (kind === "subscribed") A.audFilter.subscribed_only = true;
  if (kind === "customers") A.audFilter.customers_only = true;
  if (kind === "never") A.audFilter.never_bought = true;
}

/* The filter minus the "who" chip: what a campaign segment keeps. The
   database adds "subscribed only" itself when it sends. */
function segmentFromFilter(f) {
  const seg = { ...f };
  delete seg.search;
  delete seg.subscribed_only;
  return seg;
}

const SPEND_STEPS = [0, 50000, 100000, 200000, 500000];
const WITHIN_STEPS = [0, 7, 30, 90, 180];
const LAPSED_STEPS = [0, 30, 60, 90, 180];

function filterSelectsHtml(f, idPrefix) {
  const opt = (v, label, cur) => `<option value="${esc(v)}"${String(cur ?? "") === String(v) ? " selected" : ""}>${esc(label)}</option>`;
  return `
    <div class="aud-grid">
      <label class="aud-field"><span>Bought from</span>
        <select class="a-select" data-f="category" id="${idPrefix}-category">
          ${opt("", "Any category", f.category)}
          ${A.categories.map(c => opt(c.id, c.name, f.category)).join("")}
        </select></label>
      <label class="aud-field"><span>Bought product</span>
        <select class="a-select" data-f="product_id" id="${idPrefix}-product">
          ${opt("", "Any product", f.product_id)}
          ${A.products.map(p => opt(p.id, p.name, f.product_id)).join("")}
        </select></label>
      <label class="aud-field"><span>Spent at least</span>
        <select class="a-select" data-f="min_spent" id="${idPrefix}-spent">
          ${SPEND_STEPS.map(v => opt(v || "", v ? money(v) : "Any amount", f.min_spent)).join("")}
        </select></label>
      <label class="aud-field"><span>Ordered within</span>
        <select class="a-select" data-f="bought_within_days" id="${idPrefix}-within">
          ${WITHIN_STEPS.map(v => opt(v || "", v ? `Last ${v} days` : "Any time", f.bought_within_days)).join("")}
        </select></label>
      <label class="aud-field"><span>Not ordered for</span>
        <select class="a-select" data-f="lapsed_days" id="${idPrefix}-lapsed">
          ${LAPSED_STEPS.map(v => opt(v || "", v ? `${v}+ days` : "Doesn't matter", f.lapsed_days)).join("")}
        </select></label>
      <label class="aud-field"><span>State</span>
        <select class="a-select" data-f="state" id="${idPrefix}-state">
          ${opt("", "Anywhere", f.state)}
          ${NG_STATES_ADMIN.map(s => opt(s, s, f.state)).join("")}
        </select></label>
    </div>`;
}

function readFilterSelects(container, into) {
  container.querySelectorAll("select[data-f]").forEach(sel => {
    const k = sel.dataset.f;
    if (sel.value === "") delete into[k];
    else into[k] = k === "category" || k === "state" ? sel.value : Number(sel.value);
  });
}

/* Ready-made audiences: the common marketing moves, one tap each. */
function audiencePresets() {
  const presets = [
    { id: "welcome", label: "Signed up, never bought",
      hint: "Send a welcome offer", filter: { subscribed_only: true, never_bought: true }, template: "welcome" },
    { id: "recent", label: "Bought in the last 30 days",
      hint: "Suggest what goes with it", filter: { bought_within_days: 30 }, template: "complete_look" },
    { id: "vip", label: "Top spenders (₦200k+)",
      hint: "Early access, private sale", filter: { min_spent: 200000 }, template: "private_sale" },
    { id: "lapsed", label: "Gone quiet (90+ days)",
      hint: "Win them back", filter: { lapsed_days: 90 }, template: "win_back" }
  ];

  // One preset per category people have actually bought from.
  const counts = {};
  (A.audAll?.rows || []).forEach(r => (r.categories || []).forEach(c => { counts[c] = (counts[c] || 0) + 1; }));
  Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([cat, n]) => {
    presets.push({
      id: "cat:" + cat, label: `Bought ${categoryLabel(cat)}`,
      hint: `${n} ${n === 1 ? "person" : "people"}`, filter: { category: cat }, template: "category"
    });
  });
  return presets;
}

function categoryLabel(id) {
  const c = A.categories.find(x => x.id === id);
  return c ? c.name : id;
}

function renderAudienceControls() {
  const f = A.audFilter;
  document.getElementById("aud-kind").innerHTML = AUD_KINDS.map(k => `
    <button class="a-chip${audKind(f) === k.id ? " active" : ""}" data-kind="${k.id}">${esc(k.label)}</button>`).join("");
  document.querySelectorAll("[data-kind]").forEach(b => b.addEventListener("click", () => {
    setAudKind(b.dataset.kind);
    renderAudienceControls();
    loadAudience();
  }));

  const box = document.getElementById("aud-filters");
  box.innerHTML = filterSelectsHtml(f, "aud");
  box.querySelectorAll("select").forEach(sel => sel.addEventListener("change", () => {
    readFilterSelects(box, A.audFilter);
    loadAudience();
  }));

  document.getElementById("aud-presets").innerHTML = audiencePresets().map(p => `
    <button class="aud-preset" data-preset="${esc(p.id)}">
      <strong>${esc(p.label)}</strong><span>${esc(p.hint)}</span>
    </button>`).join("");
  document.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => {
    const p = audiencePresets().find(x => x.id === b.dataset.preset);
    if (!p) return;
    A.audFilter = { ...p.filter };
    A.audPresetTemplate = p.template;
    document.getElementById("aud-search").value = "";
    renderAudienceControls();
    loadAudience();
    document.getElementById("aud-count").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

async function loadAudienceTotals() {
  A.audAll = await dbAudience({});
  const s = document.getElementById("aud-stats");
  if (!A.audAll) {
    s.innerHTML = "";
    document.getElementById("aud-count").textContent =
      "Audience is not set up yet. Run supabase/004_categories_marketing.sql.";
    return false;
  }
  const rows = A.audAll.rows || [];
  const neverBoughtSubs = rows.filter(r => r.subscribed && !r.orders).length;
  s.innerHTML = `
    <div class="a-stat"><div class="a-stat-label">Contacts</div>
      <div class="a-stat-value">${esc(A.audAll.total)}</div>
      <div class="a-stat-sub">signups and buyers</div></div>
    <div class="a-stat"><div class="a-stat-label">Can email</div>
      <div class="a-stat-value">${esc(A.audAll.subscribed)}</div>
      <div class="a-stat-sub">agreed to marketing</div></div>
    <div class="a-stat"><div class="a-stat-label">Customers</div>
      <div class="a-stat-value">${esc(A.audAll.customers)}</div>
      <div class="a-stat-sub">placed an order</div></div>
    <div class="a-stat"><div class="a-stat-label">Not bought yet</div>
      <div class="a-stat-value">${esc(neverBoughtSubs)}</div>
      <div class="a-stat-sub">subscribed, no order</div></div>`;
  return true;
}

async function loadAudience() {
  const ready = A.audAll ? true : await loadAudienceTotals();
  if (!ready) return;
  renderAudienceControls();

  const req = ++A.audReq;
  document.getElementById("aud-count").textContent = "Filtering…";
  const data = await dbAudience(A.audFilter);
  if (req !== A.audReq) return;           // a newer filter has started
  A.aud = data || { total: 0, subscribed: 0, rows: [] };
  renderAudienceList();
}

function renderAudienceList() {
  const { total, subscribed, rows } = A.aud;
  document.getElementById("aud-count").innerHTML =
    `<strong>${esc(total)}</strong> ${total === 1 ? "person" : "people"} &middot; ` +
    `<strong>${esc(subscribed)}</strong> can be emailed`;
  document.getElementById("aud-email").disabled = !subscribed;

  const mount = document.getElementById("aud-list");
  if (!rows.length) {
    mount.innerHTML = `<div class="a-empty"><div class="a-empty-mark">○</div>
      <h4>Nobody matches</h4><p>Loosen a filter, or clear them all.</p></div>`;
    return;
  }

  const shown = rows.slice(0, 100);
  mount.innerHTML = shown.map(r => `
    <div class="aud-row">
      <div class="aud-avatar" aria-hidden="true">${esc((r.name || r.email || "?").trim().charAt(0).toUpperCase())}</div>
      <div class="aud-main">
        <strong>${esc(r.name || r.email)}</strong>
        ${r.name ? `<span class="aud-email">${esc(r.email)}</span>` : ""}
        <div class="aud-tags">
          ${r.subscribed
            ? `<span class="st-chip st-delivered"><span class="ic" aria-hidden="true">✓</span>Can email</span>`
            : `<span class="st-chip st-unpaid"><span class="ic" aria-hidden="true">○</span>No marketing consent</span>`}
          ${(r.categories || []).slice(0, 3).map(c => `<span class="aud-cat">${esc(categoryLabel(c))}</span>`).join("")}
        </div>
      </div>
      <div class="aud-side">
        ${r.orders
          ? `<strong>${money(r.spent)}</strong><span>${esc(r.orders)} order${r.orders === 1 ? "" : "s"} &middot; ${esc(timeAgo(r.last_order))}</span>`
          : `<span>Signed up ${r.joined ? esc(timeAgo(r.joined)) : ""}</span>`}
        ${r.state ? `<span>${esc(r.state)}</span>` : ""}
      </div>
    </div>`).join("") +
    (rows.length > shown.length
      ? `<p class="aud-more">Showing the first ${shown.length} of ${rows.length}. Export to see everyone.</p>` : "");
}

function exportAudience() {
  const rows = A.aud?.rows || [];
  if (!rows.length) return toast("Nothing to export.");
  const out = [["email", "name", "can_email", "orders", "spent", "last_order", "categories", "state", "joined"],
    ...rows.map(r => [r.email, r.name || "", r.subscribed ? "yes" : "no", r.orders, r.spent,
      r.last_order || "", (r.categories || []).map(categoryLabel).join("; "), r.state || "", r.joined || ""])];
  const csv = out.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `dakar-dapper-audience-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`${rows.length} contacts exported`);
}

/* ══════════════════════════════════════════════════════════════════════
   CAMPAIGNS
   ══════════════════════════════════════════════════════════════════════ */

/* Starting points. {{first_name}} is replaced per reader. */
const CAMPAIGN_TEMPLATES = {
  new_arrivals: {
    label: "New arrivals",
    subject: "Just landed at Dakar Dapper",
    preheader: "A first look for subscribers, before everyone else.",
    headline: "New in, {{first_name}}",
    body: "A new edit has just landed, and you are seeing it first.\n\nEvery piece is chosen for fit, fabric and how it wears day after day. Quantities are small, so if something catches your eye, it is worth moving quickly.",
    cta_text: "Shop new arrivals", cta_url: "/shop.html?cat=new"
  },
  category: {
    label: "More of what they like",
    subject: "Picked for you, {{first_name}}",
    preheader: "New pieces in the category you shop most.",
    headline: "Chosen with you in mind",
    body: "You have shopped this collection with us before, so we set aside a first look at what just came in.\n\nSame standard of quality you already know, in new colours and cuts.",
    cta_text: "See the collection", cta_url: ""
  },
  complete_look: {
    label: "Complete the look",
    subject: "What goes with your last order",
    preheader: "A few pieces that pair well with what you bought.",
    headline: "Finish the look, {{first_name}}",
    body: "Thank you for shopping with us recently.\n\nWe picked a few pieces that pair well with what you chose, so the whole outfit comes together.",
    cta_text: "Complete the look", cta_url: "/shop.html"
  },
  private_sale: {
    label: "Private sale",
    subject: "Private access: members only",
    preheader: "A short private sale for our best customers.",
    headline: "An invitation, {{first_name}}",
    body: "As one of our most valued customers, you get access before anyone else.\n\nSelected pieces are reduced for a short time only. Once the sizes go, they go.",
    cta_text: "Shop the private sale", cta_url: "/shop.html"
  },
  win_back: {
    label: "We have missed you",
    subject: "It has been a while, {{first_name}}",
    preheader: "Here is what is new since your last visit.",
    headline: "Good to see you again",
    body: "It has been a little while since your last order, and a lot has arrived since.\n\nTake a look at what is new. If there is something you are looking for and cannot find, reply to this email or message us on WhatsApp.",
    cta_text: "See what's new", cta_url: "/shop.html?cat=new"
  },
  welcome: {
    label: "Welcome",
    subject: "Welcome to Dakar Dapper",
    preheader: "Thank you for joining us. Here is where to start.",
    headline: "Welcome, {{first_name}}",
    body: "Thank you for joining Dakar Dapper.\n\nWe curate menswear and accessories from Lagos, delivered to every state in Nigeria. Here are a few pieces our customers keep coming back for.",
    cta_text: "Start shopping", cta_url: "/shop.html"
  },
  restock: {
    label: "Back in stock",
    subject: "Back in stock: the pieces that sold out",
    preheader: "The favourites are back, in limited sizes.",
    headline: "They are back",
    body: "The pieces that sold out fastest are available again.\n\nWe restocked in limited numbers, so the popular sizes will not last long.",
    cta_text: "Shop the restock", cta_url: "/shop.html"
  }
};

async function refreshCampaigns() {
  const [list, stats] = await Promise.all([dbFetchCampaigns(), dbCampaignStats()]);
  A.campaigns = list;
  A.campaignStats = stats || {};
  renderCampaigns();
}

function renderCampaigns() {
  const mount = document.getElementById("camp-list");
  if (!A.campaigns.length) {
    mount.innerHTML = `<div class="a-empty"><div class="a-empty-mark">✉</div>
      <h4>No campaigns yet</h4>
      <p>Start one with <strong>New campaign</strong>, or pick an audience first and tap
      <strong>Email this audience</strong>.</p></div>`;
    return;
  }

  mount.innerHTML = A.campaigns.map(c => {
    const st = A.campaignStats[String(c.id)] || { sent: 0, queued: 0, failed: 0 };
    const total = Number(c.recipients) || 0;
    const pct = total ? Math.round((Number(st.sent) / total) * 100) : 0;
    const sent = c.status === "sent";
    return `
    <button class="camp-card" data-camp="${esc(c.id)}">
      <div class="camp-top">
        <div class="camp-titles">
          <strong>${esc(c.name)}</strong>
          <span>${esc(c.subject)}</span>
        </div>
        ${sent
          ? `<span class="st-chip st-delivered"><span class="ic" aria-hidden="true">✔</span>Sent</span>`
          : `<span class="st-chip st-pending"><span class="ic" aria-hidden="true">✎</span>Draft</span>`}
      </div>
      ${sent ? `
        <div class="camp-progress" role="img" aria-label="${esc(st.sent)} of ${esc(total)} delivered">
          <span style="width:${pct}%"></span>
        </div>
        <div class="camp-meta">
          <span><strong>${esc(st.sent)}</strong> of ${esc(total)} delivered</span>
          ${Number(st.queued) ? `<span>${esc(st.queued)} sending</span>` : ""}
          ${Number(st.failed) ? `<span class="bad">${esc(st.failed)} failed</span>` : ""}
          <span>${esc(timeAgo(c.sent_at))}</span>
        </div>`
      : `<div class="camp-meta"><span>Edited ${esc(timeAgo(c.updated_at || c.created_at))}</span>
           <span>${describeSegment(c.segment)}</span></div>`}
    </button>`;
  }).join("");

  mount.querySelectorAll("[data-camp]").forEach(b => b.addEventListener("click", () => {
    const c = A.campaigns.find(x => String(x.id) === b.dataset.camp);
    if (!c) return;
    if (c.status === "sent") openCampaignSummary(c);
    else openCampaignEditor(c);
  }));
}

function describeSegment(seg) {
  const s = seg || {};
  const parts = [];
  if (s.never_bought) parts.push("never bought");
  if (s.customers_only) parts.push("customers");
  if (s.category) parts.push("bought " + categoryLabel(s.category));
  if (s.product_id) {
    const p = A.products.find(x => String(x.id) === String(s.product_id));
    parts.push("bought " + (p ? p.name : "a product"));
  }
  if (s.min_spent) parts.push("spent " + money(s.min_spent) + "+");
  if (s.bought_within_days) parts.push(`ordered in last ${s.bought_within_days} days`);
  if (s.lapsed_days) parts.push(`quiet ${s.lapsed_days}+ days`);
  if (s.state) parts.push("in " + s.state);
  return esc(parts.length ? "Subscribers who " + parts.join(", ") : "All subscribers");
}

/* ── Editor ───────────────────────────────────────────────────────────── */

function blankCampaign(extra = {}) {
  const t = CAMPAIGN_TEMPLATES[A.audPresetTemplate] || CAMPAIGN_TEMPLATES.new_arrivals;
  const seg = extra.segment || {};
  return {
    id: null,
    name: `${t.label} — ${new Date().toLocaleDateString("en-NG", { day: "numeric", month: "short" })}`,
    subject: t.subject, preheader: t.preheader, headline: t.headline, body: t.body,
    cta_text: t.cta_text,
    cta_url: t.cta_url || (seg.category ? `/shop.html?cat=${seg.category}` : "/shop.html"),
    product_ids: suggestedProducts(seg),
    segment: seg
  };
}

/* Pre-select sensible products: in-stock pieces from the segment's category,
   otherwise the newest in-stock pieces. */
function suggestedProducts(seg) {
  const live = A.products.filter(p => p.isActive !== false && p.stock > 0);
  const pool = seg.category ? live.filter(p => p.category === seg.category) : live.filter(p => p.isNew);
  return (pool.length ? pool : live).slice(0, 4).map(p => p.id);
}

function openCampaignEditor(existing, extra) {
  A.camp = existing
    ? { ...existing, product_ids: [...(existing.product_ids || [])], segment: { ...(existing.segment || {}) } }
    : blankCampaign(extra || {});
  A.audPresetTemplate = null;

  const c = A.camp;
  openSheet(c.id ? "Edit campaign" : "New campaign", `
    <div class="a-error" id="camp-error" hidden></div>

    <div class="a-field">
      <label>Start from</label>
      <div class="chip-edit" id="camp-templates">
        ${Object.entries(CAMPAIGN_TEMPLATES).map(([id, t]) =>
          `<button type="button" class="a-chip" data-tpl="${esc(id)}">${esc(t.label)}</button>`).join("")}
      </div>
    </div>

    <h4 class="camp-step"><span>1</span> Who receives it</h4>
    <div id="camp-segment">${filterSelectsHtml(c.segment, "camp")}</div>
    <p class="camp-reach" id="camp-reach">Counting…</p>

    <h4 class="camp-step"><span>2</span> The email</h4>
    <div class="a-field">
      <label for="camp-name">Campaign name <span class="hint-inline">(only you see this)</span></label>
      <input class="a-input" id="camp-name" value="${esc(c.name)}">
    </div>
    <div class="a-field">
      <label for="camp-subject">Subject line</label>
      <input class="a-input" id="camp-subject" value="${esc(c.subject)}" maxlength="120">
      <div class="hint" id="camp-subject-hint"></div>
    </div>
    <div class="a-field">
      <label for="camp-preheader">Preview text <span class="hint-inline">(shows after the subject in the inbox)</span></label>
      <input class="a-input" id="camp-preheader" value="${esc(c.preheader || "")}" maxlength="140">
    </div>
    <div class="a-field">
      <label for="camp-headline">Headline</label>
      <input class="a-input" id="camp-headline" value="${esc(c.headline || "")}">
    </div>
    <div class="a-field">
      <label for="camp-body">Message</label>
      <textarea class="a-textarea" id="camp-body" rows="6">${esc(c.body || "")}</textarea>
      <div class="hint">Leave a blank line between paragraphs. Type <code>{{first_name}}</code> to greet each reader by name.</div>
    </div>

    <h4 class="camp-step"><span>3</span> Featured products <span class="hint-inline" id="camp-pick-count"></span></h4>
    <div class="camp-picker" id="camp-picker"></div>

    <h4 class="camp-step"><span>4</span> Button</h4>
    <div class="a-row">
      <div class="a-field">
        <label for="camp-cta">Button text</label>
        <input class="a-input" id="camp-cta" value="${esc(c.cta_text || "Shop now")}">
      </div>
      <div class="a-field">
        <label for="camp-link">Goes to</label>
        <select class="a-select" id="camp-link">
          ${ctaOptions(c.cta_url)}
        </select>
      </div>
    </div>

    <h4 class="camp-step"><span>5</span> Preview</h4>
    <p class="hint" style="margin:-4px 0 10px">A close likeness. <strong>Send test</strong> shows it exactly as customers will see it.</p>
    <div class="camp-preview" id="camp-preview"></div>
  `, `
    ${c.id ? `<button class="a-btn a-btn-danger" id="camp-delete" aria-label="Delete draft">Delete</button>` : ""}
    <button class="a-btn a-btn-ghost" id="camp-save">Save draft</button>
    <button class="a-btn a-btn-ghost" id="camp-test">Send test</button>
    <button class="a-btn a-btn-primary" id="camp-send">Send…</button>
  `);

  renderPicker();
  renderCampaignPreview();
  updateReach();
  bindCampaignEditor();
}

function ctaOptions(current) {
  const opts = [
    ["/shop.html", "The whole shop"],
    ["/shop.html?cat=new", "New arrivals"],
    ...A.categories.map(c => [`/shop.html?cat=${c.id}`, c.name])
  ];
  const known = opts.some(o => o[0] === current);
  return opts.map(([v, l]) => `<option value="${esc(v)}"${v === current ? " selected" : ""}>${esc(l)}</option>`).join("") +
    (current && !known ? `<option value="${esc(current)}" selected>${esc(current)}</option>` : "");
}

function renderPicker() {
  const picked = A.camp.product_ids.map(String);
  const live = A.products.filter(p => p.isActive !== false);
  document.getElementById("camp-pick-count").textContent =
    `(${picked.length} of 6 chosen)`;
  document.getElementById("camp-picker").innerHTML = live.map(p => {
    const i = picked.indexOf(String(p.id));
    return `
    <button type="button" class="pick${i >= 0 ? " on" : ""}" data-pick="${esc(p.id)}"
            aria-pressed="${i >= 0}" aria-label="${esc(p.name)}">
      <img src="${escUrl(p.thumb || p.image)}" alt="" loading="lazy">
      ${i >= 0 ? `<span class="pick-n">${i + 1}</span>` : ""}
      ${p.stock <= 0 ? `<span class="pick-out">Sold out</span>` : ""}
      <span class="pick-name">${esc(p.name)}</span>
    </button>`;
  }).join("") || `<p class="hint">Add products first.</p>`;

  document.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => {
    const id = Number(b.dataset.pick);
    const ids = A.camp.product_ids.map(Number);
    const at = ids.indexOf(id);
    if (at >= 0) ids.splice(at, 1);
    else if (ids.length >= 6) return toast("Six products at most — more makes the email heavy to load.");
    else ids.push(id);
    A.camp.product_ids = ids;
    renderPicker();
    renderCampaignPreview();
  }));
}

function readCampaignForm() {
  const v = id => (document.getElementById(id)?.value || "").trim();
  readFilterSelects(document.getElementById("camp-segment"), A.camp.segment);
  Object.assign(A.camp, {
    name: v("camp-name") || "Untitled campaign",
    subject: v("camp-subject"),
    preheader: v("camp-preheader"),
    headline: v("camp-headline"),
    body: document.getElementById("camp-body")?.value || "",
    cta_text: v("camp-cta") || "Shop now",
    cta_url: v("camp-link") || "/shop.html"
  });
  return A.camp;
}

function bindCampaignEditor() {
  document.querySelectorAll("[data-tpl]").forEach(b => b.addEventListener("click", () => {
    const t = CAMPAIGN_TEMPLATES[b.dataset.tpl];
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set("camp-subject", t.subject);
    set("camp-preheader", t.preheader);
    set("camp-headline", t.headline);
    set("camp-body", t.body);
    set("camp-cta", t.cta_text);
    if (t.cta_url) set("camp-link", t.cta_url);
    set("camp-name", `${t.label} — ${new Date().toLocaleDateString("en-NG", { day: "numeric", month: "short" })}`);
    readCampaignForm();
    renderCampaignPreview();
    toast(`${t.label} template applied`);
  }));

  ["camp-subject", "camp-preheader", "camp-headline", "camp-body", "camp-cta", "camp-link", "camp-name"]
    .forEach(id => document.getElementById(id)?.addEventListener("input", debounce(() => {
      readCampaignForm();
      renderCampaignPreview();
    }, 150)));

  document.querySelectorAll("#camp-segment select").forEach(sel =>
    sel.addEventListener("change", () => { readCampaignForm(); updateReach(); }));

  document.getElementById("camp-save").addEventListener("click", () => saveCampaign(true));
  document.getElementById("camp-test").addEventListener("click", sendTest);
  document.getElementById("camp-send").addEventListener("click", confirmSend);
  document.getElementById("camp-delete")?.addEventListener("click", deleteCampaign);
}

async function updateReach() {
  const el = document.getElementById("camp-reach");
  if (!el) return;
  el.textContent = "Counting…";
  const req = ++A.reachReq;
  const data = await dbAudience({ ...A.camp.segment, subscribed_only: true });
  if (req !== A.reachReq || !document.getElementById("camp-reach")) return;
  A.campReach = data ? Number(data.total) : 0;
  el.innerHTML = A.campReach
    ? `Will go to <strong>${esc(A.campReach)}</strong> subscriber${A.campReach === 1 ? "" : "s"} &middot; ${describeSegment(A.camp.segment)}`
    : `<span class="bad">No subscribers match this yet.</span> Customers who did not agree to marketing are never included.`;
}

function subjectHint() {
  const el = document.getElementById("camp-subject-hint");
  if (!el) return;
  const n = (A.camp.subject || "").length;
  el.textContent = n > 60
    ? `${n} characters — phones cut subjects off around 40–50. Put the important words first.`
    : `${n} characters`;
  el.style.color = n > 60 ? "var(--st-serious)" : "";
}

/* Mirrors the layout of the real email closely enough to judge it. */
function renderCampaignPreview() {
  subjectHint();
  const c = A.camp;
  const first = "Ade";
  const fill = s => String(s || "").replace(/\{\{\s*first_name\s*\}\}/gi, first);
  const products = c.product_ids.map(id => A.products.find(p => p.id === Number(id))).filter(Boolean);
  const paras = fill(c.body).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

  document.getElementById("camp-preview").innerHTML = `
    <div class="pv-inbox">
      <div class="pv-from">Dakar Dapper</div>
      <div class="pv-subject">${esc(fill(c.subject) || "(no subject)")}</div>
      <div class="pv-pre">${esc(c.preheader || "")}</div>
    </div>
    <div class="pv-mail">
      <div class="pv-head"><b>DAKAR DAPPER</b><small>Proper Men's Fashion Line</small></div>
      <div class="pv-body">
        <h3>${esc(fill(c.headline || c.subject))}</h3>
        ${paras}
      </div>
      ${products.length ? `<div class="pv-grid">${products.map(p => `
        <div class="pv-prod">
          <img src="${escUrl(p.thumb || p.image)}" alt="">
          <span>${esc(p.name)}</span>
          <b>${money(p.price)}</b>
        </div>`).join("")}</div>` : ""}
      <div class="pv-cta"><span>${esc(c.cta_text || "Shop now")}</span></div>
      <div class="pv-foot">Unsubscribe &middot; Privacy<br>Dakar Dapper &middot; Mainland, Lagos</div>
    </div>`;
}

function campError(msg) {
  const box = document.getElementById("camp-error");
  if (!box) return toast(msg);
  box.hidden = false;
  box.textContent = msg;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveCampaign(announce) {
  const c = readCampaignForm();
  if (!c.subject) { campError("Add a subject line."); return null; }
  if (!c.body.trim() && !c.product_ids.length) { campError("Write a message or feature at least one product."); return null; }

  const res = await dbSaveCampaign(c);
  if (!res.ok) { campError("Could not save: " + res.message); return null; }
  A.camp.id = res.campaign.id;
  if (announce) toast("Draft saved");
  refreshCampaigns();
  return res.campaign;
}

async function sendTest() {
  const saved = await saveCampaign(false);
  if (!saved) return;
  const to = A.user?.email;
  if (!to) return campError("Could not find your email address.");
  const res = await dbSendCampaign(saved.id, to);
  if (!res.ok) return campError(res.message);
  toast(`Test sent to ${to}. It arrives within a minute or two.`);
}

async function confirmSend() {
  const saved = await saveCampaign(false);
  if (!saved) return;
  await updateReach();
  if (!A.campReach) return campError("Nobody who agreed to marketing email matches this audience.");

  const c = A.camp;
  openSheet("Send campaign", `
    <div class="send-confirm">
      <div class="send-big">${esc(A.campReach)}</div>
      <p>${A.campReach === 1 ? "subscriber" : "subscribers"} will receive
         <strong>“${esc(c.subject)}”</strong></p>
      <p class="hint">${describeSegment(c.segment)}</p>
    </div>
    <ul class="send-checks">
      <li>Only people who agreed to marketing email are included.</li>
      <li>Each email has its own one-tap unsubscribe link.</li>
      <li>Order confirmations keep priority; this sends in the background.</li>
      <li>Once sent, it cannot be recalled.</li>
    </ul>
  `, `
    <button class="a-btn a-btn-ghost" id="send-back">Back to editing</button>
    <button class="a-btn a-btn-gold" id="send-go">Send now</button>
  `);

  document.getElementById("send-back").addEventListener("click", () => openCampaignEditor(A.campaigns.find(x => x.id === c.id) || c));
  document.getElementById("send-go").addEventListener("click", async () => {
    const btn = document.getElementById("send-go");
    btn.disabled = true; btn.textContent = "Sending…";
    const res = await dbSendCampaign(c.id, null);
    if (!res.ok) {
      btn.disabled = false; btn.textContent = "Send now";
      return toast(res.message);
    }
    closeSheet();
    toast(`Campaign on its way to ${res.recipients} subscriber${res.recipients === 1 ? "" : "s"}`);
    refreshCampaigns();
    refreshEmailStatus();
  });
}

async function deleteCampaign() {
  const id = A.camp.id;
  if (!id) return closeSheet();
  const res = await dbDeleteCampaign(id);
  if (!res.ok) return campError(res.message);
  closeSheet();
  toast("Draft deleted");
  refreshCampaigns();
}

function openCampaignSummary(c) {
  const st = A.campaignStats[String(c.id)] || { sent: 0, queued: 0, failed: 0 };
  openSheet(c.name, `
    <div class="a-stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="a-stat"><div class="a-stat-label">Delivered</div><div class="a-stat-value">${esc(st.sent)}</div></div>
      <div class="a-stat${Number(st.queued) ? " is-warn" : ""}"><div class="a-stat-label">Sending</div><div class="a-stat-value">${esc(st.queued)}</div></div>
      <div class="a-stat${Number(st.failed) ? " is-alert" : ""}"><div class="a-stat-label">Failed</div><div class="a-stat-value">${esc(st.failed)}</div></div>
    </div>
    <dl>
      <div class="a-kv"><dt>Subject</dt><dd>${esc(c.subject)}</dd></div>
      <div class="a-kv"><dt>Audience</dt><dd>${describeSegment(c.segment)}</dd></div>
      <div class="a-kv"><dt>Recipients</dt><dd>${esc(c.recipients)}</dd></div>
      <div class="a-kv"><dt>Sent</dt><dd>${esc(new Date(c.sent_at).toLocaleString("en-NG"))}</dd></div>
    </dl>
    ${Number(st.queued) ? `<p class="hint" style="margin-top:12px">Emails go out steadily in the background so
      order confirmations are never held up. Check back in a few minutes.</p>` : ""}
  `, `
    <button class="a-btn a-btn-ghost" onclick="closeSheet()">Close</button>
    <button class="a-btn a-btn-primary" id="camp-dup">Reuse as new draft</button>
  `);
  document.getElementById("camp-dup").addEventListener("click", () => {
    openCampaignEditor({ ...c, id: null, status: "draft", name: c.name + " (copy)" });
  });
}

/* ══════════════════════════════════════════════════════════════════════
   SOCIAL LINKS
   One ordered list. Paste a link and the platform is recognised, tracking
   tags are stripped, and the real brand icon is shown. Order here is the
   order on the site.
   ══════════════════════════════════════════════════════════════════════ */

function socialsReady() {
  return A.content && Array.isArray(A.content.socials);
}

function renderSocialsEditor() {
  const mount = document.getElementById("socials-editor");
  if (!mount) return;

  if (!socialsReady()) {
    mount.innerHTML = `<div class="a-empty"><p>Run <strong>supabase/007_socials.sql</strong>
      in the Supabase SQL Editor to turn on social links.</p></div>`;
    return;
  }

  if (!A.socialsDraft) A.socialsDraft = A.content.socials.map(s => ({ ...s }));
  const list = A.socialsDraft;
  const options = Object.entries(SOCIAL_PLATFORMS)
    .map(([id, p]) => [id, p.label]);

  mount.innerHTML = `
    <div class="soc-list">
      ${list.length ? list.map((s, i) => {
        const p = SOCIAL_PLATFORMS[s.platform] || SOCIAL_PLATFORMS.website;
        return `
        <div class="soc-row" data-i="${i}">
          <span class="soc-badge" style="--brand:${escColor(p.color)};--brand-fg:${escColor(p.fg)}"
                title="${esc(p.label)}">${socialIconSvg(s.platform, 18)}</span>
          <div class="soc-fields">
            <select class="a-select soc-platform" data-i="${i}" aria-label="Platform">
              ${options.map(([id, label]) =>
                `<option value="${esc(id)}"${id === s.platform ? " selected" : ""}>${esc(label)}</option>`).join("")}
            </select>
            <input class="a-input soc-url" data-i="${i}" type="url" inputmode="url"
                   value="${esc(s.url)}" placeholder="Paste the profile link" aria-label="${esc(p.label)} link">
          </div>
          <div class="soc-actions">
            <button type="button" class="prod-icon-btn" data-up="${i}" aria-label="Move up"${i === 0 ? " disabled" : ""}>↑</button>
            <button type="button" class="prod-icon-btn" data-down="${i}" aria-label="Move down"${i === list.length - 1 ? " disabled" : ""}>↓</button>
            <a class="prod-icon-btn" href="${escUrl(safeSocialHref(s.url))}" target="_blank" rel="noopener"
               aria-label="Open link" title="Open link">↗</a>
            <button type="button" class="prod-icon-btn danger" data-remove-soc="${i}" aria-label="Remove">✕</button>
          </div>
        </div>`;
      }).join("") : `<p class="hint" style="padding:6px 0 12px">No social links. The icons are hidden on the site until you add one.</p>`}
    </div>

    <button type="button" class="a-btn a-btn-ghost a-btn-full" id="soc-add">+ Add a link</button>

    <div class="soc-preview">
      <span>On the site</span>
      <div class="soc-preview-row">
        ${list.filter(s => safeSocialHref(cleanSocialUrl(s.url))).map(s => {
          const p = SOCIAL_PLATFORMS[s.platform] || SOCIAL_PLATFORMS.website;
          return `<span class="soc-badge" style="--brand:${escColor(p.color)};--brand-fg:${escColor(p.fg)}" title="${esc(p.label)}">${socialIconSvg(s.platform, 16)}</span>`;
        }).join("") || `<em>nothing yet</em>`}
      </div>
    </div>

    <div class="a-error" id="soc-error" hidden></div>
    <button type="button" class="a-btn a-btn-primary a-btn-full" id="soc-save">Save &amp; publish</button>`;

  bindSocialsEditor();
}

function bindSocialsEditor() {
  const list = A.socialsDraft;

  // Editing a field updates only its own row. Re-rendering the whole card
  // here would replace the Save button mid-tap when the field loses focus,
  // swallowing the first click on Save.
  document.querySelectorAll(".soc-url").forEach(input => {
    input.addEventListener("change", () => {
      const i = Number(input.dataset.i);
      const cleaned = cleanSocialUrl(input.value);
      list[i].url = cleaned || input.value.trim();
      if (cleaned) {
        list[i].platform = detectSocialPlatform(cleaned);
        input.value = cleaned;
      }
      refreshSocialRow(input.closest(".soc-row"), list[i]);
    });
  });

  document.querySelectorAll(".soc-platform").forEach(sel =>
    sel.addEventListener("change", () => {
      const i = Number(sel.dataset.i);
      list[i].platform = sel.value;
      refreshSocialRow(sel.closest(".soc-row"), list[i]);
    }));

  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    renderSocialsEditor();
  };
  document.querySelectorAll("[data-up]").forEach(b => b.addEventListener("click", () => move(Number(b.dataset.up), -1)));
  document.querySelectorAll("[data-down]").forEach(b => b.addEventListener("click", () => move(Number(b.dataset.down), 1)));
  document.querySelectorAll("[data-remove-soc]").forEach(b => b.addEventListener("click", () => {
    list.splice(Number(b.dataset.removeSoc), 1);
    renderSocialsEditor();
  }));

  document.getElementById("soc-add").addEventListener("click", () => {
    if (list.length >= 20) return toast("That's plenty — 20 links at most.");
    list.push({ platform: "instagram", url: "" });
    renderSocialsEditor();
    const inputs = document.querySelectorAll(".soc-url");
    inputs[inputs.length - 1]?.focus();
  });

  document.getElementById("soc-save").addEventListener("click", saveSocials);
}

function refreshSocialRow(row, item) {
  if (!row) return;
  const p = SOCIAL_PLATFORMS[item.platform] || SOCIAL_PLATFORMS.website;
  const badge = row.querySelector(".soc-badge");
  badge.style.setProperty("--brand", escColor(p.color));
  badge.style.setProperty("--brand-fg", escColor(p.fg));
  badge.title = p.label;
  badge.innerHTML = socialIconSvg(item.platform, 18);
  row.querySelector(".soc-platform").value = item.platform;
  row.querySelector(".soc-url").setAttribute("aria-label", p.label + " link");
  const open = row.querySelector("a.prod-icon-btn");
  if (open) open.href = safeSocialHref(item.url) || "#";

  const preview = document.querySelector(".soc-preview-row");
  if (preview) {
    preview.innerHTML = A.socialsDraft.filter(s => safeSocialHref(cleanSocialUrl(s.url))).map(s => {
      const q = SOCIAL_PLATFORMS[s.platform] || SOCIAL_PLATFORMS.website;
      return `<span class="soc-badge" style="--brand:${escColor(q.color)};--brand-fg:${escColor(q.fg)}" title="${esc(q.label)}">${socialIconSvg(s.platform, 16)}</span>`;
    }).join("") || `<em>nothing yet</em>`;
  }
}

async function saveSocials() {
  const box = document.getElementById("soc-error");
  const btn = document.getElementById("soc-save");
  box.hidden = true;

  // Read anything typed but not yet committed with a change event.
  document.querySelectorAll(".soc-url").forEach(input => {
    A.socialsDraft[Number(input.dataset.i)].url = input.value.trim();
  });

  const cleaned = [];
  for (const [n, s] of A.socialsDraft.entries()) {
    if (!s.url) continue;                         // empty rows are simply dropped
    const url = cleanSocialUrl(s.url);
    if (!safeSocialHref(url)) {
      box.hidden = false;
      box.textContent = `Link ${n + 1} is not a valid web address. It should start with https://`;
      return;
    }
    cleaned.push({ platform: SOCIAL_PLATFORMS[s.platform] ? s.platform : detectSocialPlatform(url), url });
  }

  btn.disabled = true; btn.textContent = "Saving…";
  const res = await dbSaveContent({ ...A.content, socials: cleaned });
  btn.disabled = false; btn.textContent = "Save & publish";

  if (!res.ok) { box.hidden = false; box.textContent = "Could not save: " + res.message; return; }
  A.content.socials = cleaned;
  A.socialsDraft = cleaned.map(s => ({ ...s }));
  renderSocialsEditor();
  toast(`${cleaned.length} social link${cleaned.length === 1 ? "" : "s"} live on the site`);
}
