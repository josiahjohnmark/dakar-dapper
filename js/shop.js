/* ==========================================================================
   SHOP.JS — Dakar Dapper Shop Page Logic
   Comprehensive Filtering, Multi-Attribute Sorting & Page Navigation
   ========================================================================== */

let shopCategory = "all";
let shopPriceRange = "all";
let shopSize = "all";
let shopColor = "all";
let shopSortBy = "featured";
let shopQuery = "";
let lastFilteredCount = 0;
let currentPage = 1;
// 6 was too few: it forced pagination after barely one screen on desktop.
const itemsPerPage = 12;

/* ── COLOR MAPPINGS ────────────────────────────────────────────────── */
const COLOR_MAPPINGS = {
  black: ["#1A1A1A", "#111111", "#181818", "#1C1C1C", "#2C2C2C", "#2C2C3A", "#3C3C3C", "#3A3D40", "black", "noir", "charcoal", "slate"],
  white: ["#E5E5E5", "#EAE6DF", "#EBE6DD", "#E8E4DF", "#FFFFFF", "bone", "white", "chalk", "light"],
  earth: ["#8B4513", "#A0522D", "#8B6914", "#C4A882", "#5C4B3A", "#4A4036", "cognac", "sand", "tobacco", "earth", "brown", "ochre"],
  green: ["#1B4332", "#3B4237", "#4A5043", "#4ADE80", "green", "olive", "forest", "volt"],
  silver: ["#C0C0C0", "#E5E4E2", "silver", "rhodium", "gold", "platinum"]
};

/* ── INIT ──────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  readFiltersFromUrl();
  bindShopSearch();
  renderShopCategories();
  updateCounts();
  renderShop();

  // Back and forward should move through filter states, not leave the page.
  window.addEventListener("popstate", () => {
    readFiltersFromUrl();
    syncSidebarToState();
    renderShop();
  });
});

/* ── URL <-> filter state ───────────────────────────────────────────────
   Filters live in the query string so a filtered view can be bookmarked,
   shared, or reached again with the back button. */
function readFiltersFromUrl() {
  const p = new URLSearchParams(location.search);
  shopCategory   = p.get("cat")   || "all";
  shopPriceRange = p.get("price") || "all";
  shopSize       = p.get("size")  || "all";
  shopColor      = p.get("color") || "all";
  shopSortBy     = p.get("sort")  || "featured";
  shopQuery      = p.get("q")     || "";
  currentPage    = Math.max(1, Number(p.get("page")) || 1);

  const box = document.getElementById("shop-search");
  if (box) box.value = shopQuery;
  const sortSel = document.getElementById("shop-sort");
  if (sortSel) sortSel.value = shopSortBy;
}

function writeFiltersToUrl(push) {
  const p = new URLSearchParams();
  if (shopCategory !== "all")   p.set("cat", shopCategory);
  if (shopPriceRange !== "all") p.set("price", shopPriceRange);
  if (shopSize !== "all")       p.set("size", shopSize);
  if (shopColor !== "all")      p.set("color", shopColor);
  if (shopSortBy !== "featured") p.set("sort", shopSortBy);
  if (shopQuery)                p.set("q", shopQuery);
  if (currentPage > 1)          p.set("page", String(currentPage));

  const url = location.pathname + (p.toString() ? "?" + p : "");
  if (push) history.pushState({}, "", url);
  else history.replaceState({}, "", url);
}

function syncSidebarToState() {
  document.querySelectorAll(".sidebar-link[data-filter]").forEach(b =>
    b.classList.toggle("active", b.dataset.filter === shopCategory));
  document.querySelectorAll(".sidebar-link[data-price]").forEach(b =>
    b.classList.toggle("active", b.dataset.price === shopPriceRange));
  document.querySelectorAll(".sidebar-size").forEach(b =>
    b.classList.toggle("active", b.dataset.size === shopSize));
  document.querySelectorAll(".sidebar-color").forEach(b =>
    b.classList.toggle("active", b.dataset.color === shopColor));
}

/* ── In-page search ─────────────────────────────────────────────────── */
function bindShopSearch() {
  const box = document.getElementById("shop-search");
  if (!box) return;
  let t;
  box.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      shopQuery = box.value.trim();
      currentPage = 1;
      writeFiltersToUrl(false);
      renderShop();
    }, 200);
  });
  const clear = document.getElementById("shop-search-clear");
  if (clear) clear.addEventListener("click", () => {
    box.value = "";
    shopQuery = "";
    currentPage = 1;
    writeFiltersToUrl(false);
    renderShop();
    box.focus();
  });
}

function matchesQuery(p, q) {
  const hay = [p.name, p.subtitle, p.category, p.badge, p.description,
               ...(p.colorNames || []), ...(p.sizes || [])]
    .filter(Boolean).join(" ").toLowerCase();
  // Every word must appear somewhere, so "black tee" narrows rather than widens.
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

/* ── CATEGORY FILTER ───────────────────────────────────────────────── */
function shopFilter(cat, btn) {
  shopCategory = cat;
  currentPage = 1;
  document.querySelectorAll(".sidebar-link[data-filter]").forEach(l => l.classList.remove("active"));
  if (btn) {
    btn.classList.add("active");
  } else {
    const el = document.querySelector(`.sidebar-link[data-filter="${cat}"]`);
    if (el) el.classList.add("active");
  }
  writeFiltersToUrl(true);
  renderShop();
  
  // Update URL without reload
  const url = new URL(window.location);
  if (cat === "all") url.searchParams.delete("cat");
  else url.searchParams.set("cat", cat);
  history.replaceState(null, "", url);
}

/* ── PRICE FILTER ──────────────────────────────────────────────────── */
function shopPriceFilter(range, btn) {
  shopPriceRange = range;
  currentPage = 1;
  document.querySelectorAll(".sidebar-link[data-price]").forEach(l => l.classList.remove("active"));
  if (btn) {
    btn.classList.add("active");
  } else {
    const el = document.querySelector(`.sidebar-link[data-price="${range}"]`);
    if (el) el.classList.add("active");
  }
  writeFiltersToUrl(true);
  renderShop();
}

/* ── SIZE FILTER ───────────────────────────────────────────────────── */
function shopSizeFilter(size, btn) {
  shopSize = (shopSize === size) ? "all" : size;
  currentPage = 1;
  document.querySelectorAll(".sidebar-size").forEach(l => {
    l.classList.toggle("active", l.dataset.size === shopSize);
  });
  writeFiltersToUrl(true);
  renderShop();
}

/* ── COLOR FILTER ──────────────────────────────────────────────────── */
function shopColorFilter(color, btn) {
  shopColor = (shopColor === color) ? "all" : color;
  currentPage = 1;
  document.querySelectorAll(".sidebar-color").forEach(l => {
    l.classList.toggle("active", l.dataset.color === shopColor);
  });
  writeFiltersToUrl(true);
  renderShop();
}

/* ── SORT ──────────────────────────────────────────────────────────── */
function shopSort(val) {
  shopSortBy = val;
  currentPage = 1;
  writeFiltersToUrl(true);
  renderShop();
}

/* ── PAGINATION NAVIGATION ─────────────────────────────────────────── */
function goToPage(p) {
  currentPage = p;
  writeFiltersToUrl(true);
  renderShop();
  // Smooth scroll to top of shop main
  const target = document.querySelector(".shop-main");
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/* ── CLEAR ALL FILTERS ─────────────────────────────────────────────── */
function clearAllFilters() {
  shopQuery = "";
  const box = document.getElementById("shop-search");
  if (box) box.value = "";
  shopCategory = "all";
  shopPriceRange = "all";
  shopSize = "all";
  shopColor = "all";
  shopSortBy = "featured";
  currentPage = 1;

  document.querySelectorAll(".sidebar-link[data-filter]").forEach(l => l.classList.toggle("active", l.dataset.filter === "all"));
  document.querySelectorAll(".sidebar-link[data-price]").forEach(l => l.classList.toggle("active", l.dataset.price === "all"));
  document.querySelectorAll(".sidebar-size").forEach(l => l.classList.remove("active"));
  document.querySelectorAll(".sidebar-color").forEach(l => l.classList.remove("active"));
  const sortSelect = document.getElementById("shop-sort");
  if (sortSelect) sortSelect.value = "featured";

  const url = new URL(window.location);
  url.searchParams.delete("cat");
  history.replaceState(null, "", url);
  writeFiltersToUrl(true);

  renderShop();
}

/* ── REMOVE INDIVIDUAL FILTER ──────────────────────────────────────── */
function removeFilter(type) {
  if (type === "category") shopFilter("all", null);
  else if (type === "price") shopPriceFilter("all", null);
  else if (type === "size") shopSizeFilter("all", null);
  else if (type === "color") shopColorFilter("all", null);
}

/* ── MOBILE SIDEBAR TOGGLE ─────────────────────────────────────────── */
function toggleShopSidebar() {
  const sidebar = document.getElementById("shop-sidebar");
  const overlay = document.getElementById("overlay");
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains("open");
  sidebar.classList.toggle("open", !isOpen);
  if (overlay) overlay.classList.toggle("active", !isOpen);
  document.body.classList.toggle("no-scroll", !isOpen);
}

function closeShopSidebar() {
  const sidebar = document.getElementById("shop-sidebar");
  const overlay = document.getElementById("overlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("active");
  document.body.classList.remove("no-scroll");
}

/* ── RENDER SHOP & PAGINATION ──────────────────────────────────────── */
function renderShop(append) {
  renderShopCategories();
  let items = [...PRODUCTS];

  // 1. Category filter
  if (shopCategory === "new") {
    items = items.filter(p => p.isNew);
  } else if (shopCategory !== "all") {
    items = items.filter(p => p.category === shopCategory);
  }

  // 1b. Free-text search
  if (shopQuery) items = items.filter(p => matchesQuery(p, shopQuery));

  // 2. Price filter
  if (shopPriceRange === "under50") {
    items = items.filter(p => p.price < 50000);
  } else if (shopPriceRange === "50to100") {
    items = items.filter(p => p.price >= 50000 && p.price <= 100000);
  } else if (shopPriceRange === "100to200") {
    items = items.filter(p => p.price > 100000 && p.price <= 200000);
  } else if (shopPriceRange === "over200") {
    items = items.filter(p => p.price > 200000);
  }

  // 3. Size filter
  if (shopSize !== "all") {
    items = items.filter(p => p.sizes && p.sizes.includes(shopSize));
  }

  // 4. Color filter
  if (shopColor !== "all" && COLOR_MAPPINGS[shopColor]) {
    const allowed = COLOR_MAPPINGS[shopColor].map(s => s.toLowerCase());
    items = items.filter(p => {
      const matchHex = p.colors && p.colors.some(c => allowed.includes(c.toLowerCase()));
      const matchName = p.colorNames && p.colorNames.some(cn => allowed.some(a => cn.toLowerCase().includes(a)));
      return matchHex || matchName;
    });
  }

  // 5. Sort
  switch (shopSortBy) {
    case "price-low":  items.sort((a, b) => a.price - b.price); break;
    case "price-high": items.sort((a, b) => b.price - a.price); break;
    case "newest":     items.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0)); break;
    case "rating":     items.sort((a, b) => b.rating - a.rating); break;
    // 'featured' keeps curated order
  }

  // Calculate pagination
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  lastFilteredCount = totalItems;
  const endIndex = Math.min(currentPage * itemsPerPage, totalItems);
  const pageItems = items.slice(0, endIndex);

  // Update Page Title and Counter
  const foundCat = (typeof CATEGORIES !== "undefined") ? CATEGORIES.find(c => c.id === shopCategory) : null;
  const categoryTitle = shopCategory === "all" ? "All Products" : (shopCategory === "new" ? "New Arrivals" : (foundCat ? foundCat.name : shopCategory.charAt(0).toUpperCase() + shopCategory.slice(1)));
  const titleEl = document.getElementById("shop-page-title");
  const breadcrumbEl = document.getElementById("breadcrumb-current");
  const countEl = document.getElementById("shop-product-count");

  if (titleEl) titleEl.textContent = categoryTitle;
  if (breadcrumbEl) breadcrumbEl.textContent = categoryTitle;
  if (countEl) {
    if (totalItems === 0) {
      countEl.textContent = "0 products found";
    } else {
      countEl.textContent = shopQuery
        ? `${totalItems} result${totalItems !== 1 ? "s" : ""} for “${shopQuery}”`
        : `${totalItems} product${totalItems !== 1 ? "s" : ""}`;
    }
  }

  // Render Active Filter Pills
  renderActiveFilters();

  // Render Mobile Badge
  updateMobileFilterBadge();

  // Render Grid
  const grid = document.getElementById("shop-grid");
  if (!grid) return;

  if (totalItems === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <h3>${shopQuery ? "Nothing matches “" + esc(shopQuery) + "”" : "No products found"}</h3>
        <p>${shopQuery
            ? "Try a shorter search, or browse the full collection."
            : "No pieces match that combination of filters."}</p>
        <button class="btn btn-dark" onclick="clearAllFilters()">
          ${shopQuery ? "Clear search &amp; filters" : "Reset all filters"}
        </button>
      </div>`;
    renderPagination(0, 1);
    return;
  }

  grid.innerHTML = pageItems.map(productCardHtml).join("");

  // Re-bind card reveal animation
  bindCardReveal();

  // Render Pagination Controls
  renderPagination(totalPages, currentPage);
}

/* ── RENDER ACTIVE FILTER PILLS ────────────────────────────────────── */
function renderActiveFilters() {
  const bar = document.getElementById("active-filters-bar");
  if (!bar) return;

  const pills = [];

  if (shopCategory !== "all") {
    const foundCat = (typeof CATEGORIES !== "undefined") ? CATEGORIES.find(c => c.id === shopCategory) : null;
    const catName = shopCategory === "new" ? "New Arrivals" : (foundCat ? foundCat.name : shopCategory.charAt(0).toUpperCase() + shopCategory.slice(1));
    pills.push({ type: "category", label: `Category: ${catName}` });
  }
  if (shopPriceRange !== "all") {
    const priceLabels = {
      under50: "Under ₦50k",
      "50to100": "₦50k – ₦100k",
      "100to200": "₦100k – ₦200k",
      over200: "Over ₦200k"
    };
    pills.push({ type: "price", label: `Price: ${priceLabels[shopPriceRange] || shopPriceRange}` });
  }
  if (shopSize !== "all") {
    pills.push({ type: "size", label: `Size: ${shopSize}` });
  }
  if (shopColor !== "all") {
    const colorLabels = {
      black: "Noir / Black",
      white: "Bone / White",
      earth: "Earth / Brown",
      green: "Olive / Green",
      silver: "Silver / Chrome"
    };
    pills.push({ type: "color", label: `Color: ${colorLabels[shopColor] || shopColor}` });
  }

  if (pills.length === 0) {
    bar.style.display = "none";
    bar.innerHTML = "";
    return;
  }

  bar.style.display = "flex";
  bar.innerHTML = `
    <span class="active-filters-title">Active Filters:</span>
    ${pills.map(p => `
      <span class="filter-pill">
        ${esc(p.label)}
        <span class="filter-pill-remove" onclick="removeFilter('${esc(p.type)}')" title="Remove filter">✕</span>
      </span>
    `).join("")}
    <button class="clear-all-btn" onclick="clearAllFilters()">Clear All</button>
  `;
}

/* ── UPDATE MOBILE BADGE ───────────────────────────────────────────── */
function updateMobileFilterBadge() {
  const badge = document.getElementById("active-filter-badge");
  if (!badge) return;
  let activeCount = 0;
  if (shopCategory !== "all") activeCount++;
  if (shopPriceRange !== "all") activeCount++;
  if (shopSize !== "all") activeCount++;
  if (shopColor !== "all") activeCount++;

  if (activeCount > 0) {
    badge.style.display = "inline-flex";
    badge.textContent = activeCount;
  } else {
    badge.style.display = "none";
  }
}

/* ── RENDER PAGINATION ─────────────────────────────────────────────── */
function renderPagination(totalPages, activePage) {
  const container = document.getElementById("shop-pagination");
  if (!container) return;

  const total = lastFilteredCount;
  const shown = Math.min(activePage * itemsPerPage, total);

  if (totalPages <= 1 || shown >= total) {
    container.innerHTML = total > itemsPerPage
      ? `<div class="load-more-wrap"><span class="load-more-count">Showing all ${total} products</span></div>`
      : "";
    return;
  }

  container.innerHTML = `
    <div class="load-more-wrap">
      <button class="load-more-btn" onclick="loadMore()">Load more</button>
      <span class="load-more-count">Showing ${shown} of ${total} products</span>
    </div>`;
}

function loadMore() {
  currentPage += 1;
  writeFiltersToUrl(false);
  renderShop(true);
  // Keep focus near where the new items appeared.
  const btn = document.querySelector(".load-more-btn");
  if (btn) btn.focus();
}

/* ── COUNTS ────────────────────────────────────────────────────────── */
function updateCounts() {
  const countAll = document.getElementById("count-all");
  const countNew = document.getElementById("count-new");

  if (countAll) countAll.textContent = PRODUCTS.length;
  if (countNew) countNew.textContent = PRODUCTS.filter(p => p.isNew).length;

  if (typeof CATEGORIES !== "undefined") {
    CATEGORIES.forEach(c => {
      const el = document.getElementById(`count-${c.id}`);
      if (el) el.textContent = PRODUCTS.filter(p => p.category === c.id).length;
    });
  }
}

/* ── DYNAMIC SIDEBAR CATEGORIES ────────────────────────────────────── */
function renderShopCategories() {
  const container = document.getElementById("shop-category-list");
  if (!container) return;

  const cats = (typeof CATEGORIES !== "undefined" && CATEGORIES.length) ? CATEGORIES : [
    { id: "wears", name: "Wears" },
    { id: "accessories", name: "Accessories" },
    { id: "footwear", name: "Footwear" }
  ];

  let html = `
    <button class="sidebar-link${shopCategory === 'all' ? ' active' : ''}" data-filter="all" onclick="shopFilter('all',this)">
      All Products <span class="count" id="count-all">${PRODUCTS.length}</span>
    </button>
  `;

  cats.forEach(c => {
    const count = PRODUCTS.filter(p => p.category === c.id).length;
    html += `
      <button class="sidebar-link${shopCategory === c.id ? ' active' : ''}" data-filter="${c.id}" onclick="shopFilter('${c.id}',this)">
        ${c.name} <span class="count" id="count-${c.id}">${count}</span>
      </button>
    `;
  });

  const newCount = PRODUCTS.filter(p => p.isNew).length;
  html += `
    <button class="sidebar-link${shopCategory === 'new' ? ' active' : ''}" data-filter="new" onclick="shopFilter('new',this)">
      New Arrivals <span class="count" id="count-new">${newCount}</span>
    </button>
  `;

  container.innerHTML = html;
}

