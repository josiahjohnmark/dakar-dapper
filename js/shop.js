/* ==========================================================================
   SHOP.JS — Dakar Dapper Shop Page Logic
   Comprehensive Filtering, Multi-Attribute Sorting & Page Navigation
   ========================================================================== */

let shopCategory = "all";
let shopPriceRange = "all";
let shopSize = "all";
let shopColor = "all";
let shopSortBy = "featured";
let currentPage = 1;
const itemsPerPage = 6;

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
  // Check URL params for deep-linking
  const params = new URLSearchParams(window.location.search);
  const cat = params.get("cat");
  if (cat) {
    shopCategory = cat;
  }

  renderShopCategories();
  updateCounts();
  renderShop();
});

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
  renderShop();
}

/* ── SIZE FILTER ───────────────────────────────────────────────────── */
function shopSizeFilter(size, btn) {
  shopSize = (shopSize === size) ? "all" : size;
  currentPage = 1;
  document.querySelectorAll(".sidebar-size").forEach(l => {
    l.classList.toggle("active", l.dataset.size === shopSize);
  });
  renderShop();
}

/* ── COLOR FILTER ──────────────────────────────────────────────────── */
function shopColorFilter(color, btn) {
  shopColor = (shopColor === color) ? "all" : color;
  currentPage = 1;
  document.querySelectorAll(".sidebar-color").forEach(l => {
    l.classList.toggle("active", l.dataset.color === shopColor);
  });
  renderShop();
}

/* ── SORT ──────────────────────────────────────────────────────────── */
function shopSort(val) {
  shopSortBy = val;
  currentPage = 1;
  renderShop();
}

/* ── PAGINATION NAVIGATION ─────────────────────────────────────────── */
function goToPage(p) {
  currentPage = p;
  renderShop();
  // Smooth scroll to top of shop main
  const target = document.querySelector(".shop-main");
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/* ── CLEAR ALL FILTERS ─────────────────────────────────────────────── */
function clearAllFilters() {
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
function renderShop() {
  renderShopCategories();
  let items = [...PRODUCTS];

  // 1. Category filter
  if (shopCategory === "new") {
    items = items.filter(p => p.isNew);
  } else if (shopCategory !== "all") {
    items = items.filter(p => p.category === shopCategory);
  }

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

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const pageItems = items.slice(startIndex, endIndex);

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
      countEl.textContent = `Showing ${startIndex + 1}–${endIndex} of ${totalItems} product${totalItems !== 1 ? 's' : ''}`;
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
        <h3>No products found</h3>
        <p>No pieces match the selected combination of filters.</p>
        <button class="btn btn-dark" onclick="clearAllFilters()">Reset All Filters</button>
      </div>`;
    renderPagination(0, 1);
    return;
  }

  grid.innerHTML = pageItems.map(p => {
    const isSoldOut = p.isOutOfStock || (p.stock !== undefined && p.stock <= 0);
    const disc = p.originalPrice && p.showDiscount !== false && p.originalPrice > p.price
      ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
    const inWish = wishlist.includes(p.id);
    const badgeHtml = isSoldOut
      ? `<div class="p-badge"><span class="badge-sold-out">Sold Out</span></div>`
      : (p.badge ? `<div class="p-badge"><span class="${esc(p.badgeType || 'tag-gold')}">${esc(p.badge)}</span></div>` : "");

    const addBtnHtml = isSoldOut
      ? `<button class="p-action-btn add sold-out-btn" disabled>Sold Out</button>`
      : `<button class="p-action-btn add" onclick="event.stopPropagation();addToCart(${p.id})">+ Bag</button>`;

    return `
    <div class="p-card${isSoldOut ? ' is-sold-out' : ''}" data-id="${p.id}" onclick="openProduct(${p.id})">
      <div class="p-card-media">
        ${badgeHtml}
        <button class="heart-btn${inWish ? " active" : ""}" onclick="event.stopPropagation();toggleWish(${p.id});renderShop()" aria-label="Wishlist">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${inWish ? '#fff' : 'none'}" stroke="${inWish ? '#fff' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        ${productPicture(p.image, p.name, "img-main", 600, 750)}
        <div class="p-actions">
          <button class="p-action-btn view" onclick="event.stopPropagation();openProduct(${p.id})">Quick View</button>
          ${addBtnHtml}
        </div>
      </div>
      <div class="p-info">
        <div class="p-info-top">
          <span class="p-cat">${esc(p.category)}</span>
          <span class="p-rating">★ ${esc(p.rating)}</span>
        </div>
        <h3 class="p-name">${esc(p.name)}</h3>
        <p class="p-sub">${esc(p.subtitle || "")}</p>
        <div class="p-colors">${(p.colors || []).slice(0, 3).map(c => `<span class="p-swatch" style="background:${c}"></span>`).join("")}</div>
        <div class="p-prices">
          <span class="p-price">${formatPrice(p.price)}</span>
          ${disc ? `<span class="p-orig">${formatPrice(p.originalPrice)}</span><span class="p-disc">-${disc}%</span>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

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

  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  let buttonsHtml = "";

  // Prev button
  buttonsHtml += `
    <button class="page-btn page-arrow" ${activePage <= 1 ? "disabled" : `onclick="goToPage(${activePage - 1})"`} aria-label="Previous page">
      ‹ Prev
    </button>
  `;

  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    buttonsHtml += `
      <button class="page-btn ${i === activePage ? "active" : ""}" onclick="goToPage(${i})" aria-label="Page ${i}">
        ${i}
      </button>
    `;
  }

  // Next button
  buttonsHtml += `
    <button class="page-btn page-arrow" ${activePage >= totalPages ? "disabled" : `onclick="goToPage(${activePage + 1})"`} aria-label="Next page">
      Next ›
    </button>
  `;

  container.innerHTML = `
    <div class="shop-pagination-wrap">
      <div class="pagination-controls">
        ${buttonsHtml}
      </div>
      <div class="pagination-info">
        Page ${activePage} of ${totalPages}
      </div>
    </div>
  `;
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

