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
  document.getElementById("export-subs-btn").addEventListener("click", exportSubscribers);
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const PANE_TITLES = {
  home: ["Dashboard", "Dakar Dapper"],
  orders: ["Orders", "Fulfilment"],
  products: ["Products", "Inventory"],
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
  const [products, categories, content, orders, stats, subs, audit, shipping] =
    await Promise.all([
      dbFetchProducts(), dbFetchCategories(), dbFetchContent(),
      dbFetchOrders({ limit: 200 }), dbAdminStats(),
      dbFetchSubscribers(), dbFetchAuditLog(25), dbFetchShippingRates()
    ]);

  A.products = products || [];
  A.categories = categories || [];
  A.content = content;
  A.orders = orders || [];
  A.stats = stats;
  A.subscribers = subs || [];
  A.audit = audit || [];
  A.shipping = shipping || [];
  A.orders.forEach(o => A.seenOrderIds.add(o.id));

  renderDashboard();
  renderOrderFilters();
  renderOrders();
  renderProductFilters();
  renderProducts();
  renderCategories();
  renderCmsForm();
  renderShippingForm();
  renderSubscribers();
  renderAudit();
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
    rating: 5, reviews: 0, description: "", details: [], care: "",
    isNew: true, badge: "", badgeType: "tag-gold", isActive: true
  } : { ...A.products.find(x => x.id === id) };

  if (!p) return;
  A.editing = JSON.parse(JSON.stringify(p));

  openSheet(isNew ? "New product" : "Edit product", `
    <div class="a-error" id="editor-error" hidden></div>

    <div class="a-field">
      <label>Photo</label>
      <div id="image-slot"></div>
      <input type="file" id="image-file" accept="image/jpeg,image/png,image/webp" hidden>
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

function renderImageSlot() {
  const slot = document.getElementById("image-slot");
  const img = A.editing.image;

  slot.innerHTML = img ? `
    <div class="img-preview">
      <img src="${escUrl(img)}" alt="">
      <button class="img-preview-x" id="img-remove" aria-label="Remove photo">✕</button>
    </div>` : `
    <div class="img-drop" id="img-drop" tabindex="0" role="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v13"/></svg>
      <p>Tap to add a photo</p>
      <span>or drag an image here · JPG, PNG or WebP</span>
    </div>`;

  const drop = document.getElementById("img-drop");
  const fileInput = document.getElementById("image-file");

  if (drop) {
    drop.addEventListener("click", () => fileInput.click());
    drop.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
    });
    ["dragenter", "dragover"].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("dragging"); }));
    ["dragleave", "drop"].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("dragging"); }));
    drop.addEventListener("drop", e => {
      const file = e.dataTransfer?.files?.[0];
      if (file) uploadImage(file);
    });
  }

  const remove = document.getElementById("img-remove");
  if (remove) remove.addEventListener("click", () => {
    A.editing.image = "";
    renderImageSlot();
  });

  fileInput.onchange = () => {
    if (fileInput.files?.[0]) uploadImage(fileInput.files[0]);
  };
}

async function uploadImage(file) {
  const slot = document.getElementById("image-slot");
  const setStatus = msg => {
    slot.innerHTML = `<div class="img-preview"><div class="img-uploading">${esc(msg)}</div></div>`;
  };
  setStatus("Preparing…");

  const res = await dbUploadProductImage(file, setStatus);
  if (!res.ok) {
    editorError(res.message + " — if the bucket is missing, create a public bucket named “products” in Supabase Storage.");
    renderImageSlot();
    return;
  }

  A.editing.image = res.url;
  A.editing.thumb = res.thumbUrl || "";
  renderImageSlot();

  toast(res.saved > 0
    ? `Photo uploaded — ${formatBytes(res.before)} shrunk to ${formatBytes(res.after)} (${res.saved}% smaller)`
    : "Photo uploaded");
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
    <div class="a-row">
      <div class="a-field">
        <label for="cms-ig">Instagram URL</label>
        <input class="a-input" id="cms-ig" value="${esc(c.instagramUrl || "")}" placeholder="https://instagram.com/…">
      </div>
      <div class="a-field">
        <label for="cms-tw">X / Twitter URL</label>
        <input class="a-input" id="cms-tw" value="${esc(c.twitterUrl || "")}">
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
    instagramUrl: v("cms-ig"), twitterUrl: v("cms-tw"), emailAddress: v("cms-email"),
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

function renderSubscribers() {
  const mount = document.getElementById("subscribers-list");
  if (!A.subscribers.length) {
    mount.innerHTML = `<div class="a-empty"><p>No subscribers yet.</p></div>`;
    return;
  }
  mount.innerHTML = `
    <p style="font-size:.84rem;color:var(--a-text-2);margin-bottom:10px">
      <strong>${A.subscribers.length}</strong> ${A.subscribers.length === 1 ? "person" : "people"} on your list
    </p>
    ${A.subscribers.slice(0, 12).map(s => `
      <div class="a-list-row">
        <div class="a-list-row-main">
          <strong style="font-weight:500;font-size:.85rem">${esc(s.email)}</strong>
          <span>${esc(s.source)} · ${esc(timeAgo(s.created_at))}</span>
        </div>
      </div>`).join("")}
    ${A.subscribers.length > 12 ? `<p style="font-size:.78rem;color:var(--a-text-3);margin-top:10px">and ${A.subscribers.length - 12} more — export to see all</p>` : ""}`;
}

function exportSubscribers() {
  if (!A.subscribers.length) return toast("Nothing to export yet.");
  const rows = [["email", "source", "subscribed_at"],
    ...A.subscribers.map(s => [s.email, s.source, s.created_at])];
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `dakar-dapper-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Export downloaded");
}

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
