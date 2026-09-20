/* ==========================================================================
   ADMIN.JS — Dakar Dapper Luxury Control Suite Logic
   5-Tap Activation, Inventory & Stock Engine, Dynamic Categories & CMS
   ========================================================================== */

let adminClickCount = 0;
let adminClickTimer = null;
let editingProductId = null;
let currentAdminTab = "products";

/* ── 1. INITIALIZATION & 5-TAP LOGO TRIGGER ───────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  initLogoAdminTrigger();
  injectAdminDom();
  bindAdminEvents();
});

function initLogoAdminTrigger() {
  const logoElements = document.querySelectorAll(".logo, #logo-link, .logo-img, .logo-text");
  logoElements.forEach(el => {
    el.addEventListener("click", e => {
      // If user clicks logo 5 times within 2.5 seconds, trigger admin PIN modal
      adminClickCount++;
      clearTimeout(adminClickTimer);

      if (adminClickCount >= 5) {
        adminClickCount = 0;
        e.preventDefault();
        e.stopPropagation();
        openAdminPinModal();
      } else {
        adminClickTimer = setTimeout(() => {
          adminClickCount = 0;
        }, 2500);
      }
    });
  });
}

/* ── 2. DOM INJECTION FOR ADMIN SUITE & PIN MODAL ─────────────────── */
function injectAdminDom() {
  if (document.getElementById("admin-pin-modal")) return;

  const adminHtml = `
  <!-- ═══ Admin PIN Gate Modal ═══ -->
  <div class="admin-pin-modal" id="admin-pin-modal">
    <div class="admin-pin-card">
      <div class="admin-pin-icon">
        <img src="assets/dakar-dapper-dd.png" alt="Dakar Dapper">
      </div>
      <h2 class="admin-pin-title">Owner Suite</h2>
      <p class="admin-pin-sub">Enter your 4-digit security PIN to access the Dakar Dapper Management Suite.</p>
      <form id="admin-pin-form" onsubmit="return handleAdminPinSubmit(event)">
        <div class="admin-pin-input-wrap">
          <input type="password" id="admin-pin-input" class="admin-pin-input" maxlength="8" placeholder="••••" autocomplete="off" required>
        </div>
        <div class="admin-pin-btns">
          <button type="submit" class="btn btn-gold admin-pin-submit">UNLOCK SUITE</button>
          <button type="button" class="admin-pin-cancel" onclick="closeAdminPinModal()">Cancel & Exit</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ═══ Full Screen Admin Control Suite ═══ -->
  <div class="admin-suite-wrap" id="admin-suite-wrap">
    <!-- Header -->
    <header class="admin-suite-header">
      <div class="admin-brand">
        <div class="admin-brand-icon">
          <img src="assets/dakar-dapper-dd.png" alt="DD">
        </div>
        <div>
          <div class="admin-brand-title">Dakar Dapper</div>
          <div class="admin-brand-tag">Management Control Suite</div>
        </div>
      </div>
      <div class="admin-header-stats" id="admin-stats-bar">
        <!-- Stats populated dynamically -->
      </div>
      <button class="admin-exit-btn" onclick="closeAdminSuite()">
        <span>✕</span> Exit Suite
      </button>
    </header>

    <!-- Navigation Tabs -->
    <nav class="admin-suite-nav">
      <button class="admin-tab-btn active" data-pane="products" onclick="switchAdminTab('products')">
        📦 Products & Inventory
      </button>
      <button class="admin-tab-btn" data-pane="categories" onclick="switchAdminTab('categories')">
        🏷️ Category Manager
      </button>
      <button class="admin-tab-btn" data-pane="content" onclick="switchAdminTab('content')">
        ✏️ Page Content & CMS
      </button>
      <button class="admin-tab-btn" data-pane="settings" onclick="switchAdminTab('settings')">
        ⚙️ Settings & Backup
      </button>
    </nav>

    <!-- Content Body -->
    <main class="admin-suite-body">
      <!-- ── PANE 1: PRODUCTS ── -->
      <section class="admin-pane active" id="pane-products">
        <div class="admin-toolbar">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <div class="admin-search-box">
              <span>🔍</span>
              <input type="text" id="admin-search" placeholder="Search catalog…" oninput="renderAdminProducts()">
            </div>
            <select id="admin-cat-filter" class="admin-filter-select" onchange="renderAdminProducts()">
              <option value="all">All Categories</option>
            </select>
          </div>
          <button class="btn btn-gold" onclick="openProductEditor()">+ Add New Product</button>
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Price & Discount</th>
                <th>Stock (Private)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="admin-products-table">
              <!-- Rendered via JS -->
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── PANE 2: CATEGORIES ── -->
      <section class="admin-pane" id="pane-categories">
        <div class="admin-category-card">
          <h3 class="admin-cms-head">Product Categories</h3>
          <p class="admin-cms-sub">Manage the categories available across your store. Categories automatically update in shop navigation, filter tabs, and the product editor.</p>
          <div class="admin-cat-list" id="admin-cat-list">
            <!-- Rendered via JS -->
          </div>
          <div class="admin-cat-add-row">
            <input type="text" id="new-cat-name" placeholder="New Category Name (e.g. Hoodies, Caps, Jewelry)">
            <button class="btn btn-gold" onclick="handleAddCategory()">Add Category</button>
          </div>
        </div>
      </section>

      <!-- ── PANE 3: PAGE CONTENT & CMS ── -->
      <section class="admin-pane" id="pane-content">
        <div class="admin-cms-card">
          <h3 class="admin-cms-head">Hero & Headline Copy</h3>
          <p class="admin-cms-sub">Edit the primary headline, tagline, and badges displayed on the homepage.</p>
          <div class="admin-form-grid">
            <div class="admin-field admin-form-full">
              <label>Hero Badge Tagline</label>
              <input type="text" id="cms-hero-badge">
            </div>
            <div class="admin-field admin-form-full">
              <label>Hero Main Title</label>
              <input type="text" id="cms-hero-title">
            </div>
            <div class="admin-field admin-form-full">
              <label>Hero Description</label>
              <textarea id="cms-hero-desc" rows="3"></textarea>
            </div>
            <div class="admin-field">
              <label>Button 1 Text</label>
              <input type="text" id="cms-hero-btn1">
            </div>
            <div class="admin-field">
              <label>Button 2 Text</label>
              <input type="text" id="cms-hero-btn2">
            </div>
          </div>
        </div>

        <div class="admin-cms-card">
          <h3 class="admin-cms-head">Brand Story & Announcements</h3>
          <div class="admin-form-grid">
            <div class="admin-field admin-form-full">
              <label>Top Announcement Notice Bar</label>
              <input type="text" id="cms-banner-notice">
            </div>
            <div class="admin-field admin-form-full">
              <label>Editorial Heading</label>
              <input type="text" id="cms-story-title">
            </div>
            <div class="admin-field admin-form-full">
              <label>Editorial Description</label>
              <textarea id="cms-story-desc" rows="4"></textarea>
            </div>
          </div>
        </div>

        <div class="admin-cms-card">
          <h3 class="admin-cms-head">Concierge & Popup Settings</h3>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label>WhatsApp Number (Country code format: 234...)</label>
              <input type="text" id="cms-phone">
            </div>
            <div class="admin-field">
              <label>Display Phone Number (e.g. 09019603621)</label>
              <input type="text" id="cms-phone-display">
            </div>
            <div class="admin-field admin-form-full">
              <label>Newsletter Popup Browsing Delay (Seconds)</label>
              <input type="number" id="cms-popup-delay" min="5" max="300" placeholder="30">
              <small style="color:rgba(255,255,255,.5); font-size:.74rem; margin-top:3px">Time user spends browsing before popup triggers (default: 30 seconds).</small>
            </div>
          </div>
          <div style="margin-top:20px; display:flex; justify-content:flex-end;">
            <button class="btn btn-gold" onclick="handleSaveContent()">Save All Page Changes</button>
          </div>
        </div>
      </section>

      <!-- ── PANE 4: SETTINGS & BACKUP ── -->
      <section class="admin-pane" id="pane-settings">
        <div class="admin-cms-card">
          <h3 class="admin-cms-head">Security & Admin PIN</h3>
          <p class="admin-cms-sub">Change your 4-digit secret PIN for unlocking the Dakar Dapper Suite.</p>
          <div style="display:flex; gap:12px; max-width:420px; align-items:flex-end;">
            <div class="admin-field" style="flex:1">
              <label>New PIN (4 digits)</label>
              <input type="password" id="admin-new-pin" maxlength="8" placeholder="••••">
            </div>
            <button class="btn btn-dark" onclick="handleChangePin()">Update PIN</button>
          </div>
        </div>

        <div class="admin-cms-card">
          <h3 class="admin-cms-head">Catalog Backup & Data Portability</h3>
          <p class="admin-cms-sub">Export your full store configuration (products, stock levels, categories, and content) as a JSON file or restore from a backup.</p>
          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:18px;">
            <button class="btn btn-dark" onclick="handleExportData()">📥 Export Store Backup (JSON)</button>
            <button class="btn btn-dark" onclick="handleImportPrompt()">📤 Import Store Backup (JSON)</button>
            <button class="btn btn-action-sm delete" style="padding:11px 20px" onclick="handleResetDefaults()">⚠️ Reset to Factory Defaults</button>
          </div>
        </div>
      </section>
    </main>
  </div>

  <!-- ═══ Product Editor Modal (Add / Edit) ═══ -->
  <div class="admin-modal-wrap" id="admin-product-modal">
    <div class="admin-modal-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
        <h2 id="admin-prod-modal-title" style="font-family:var(--font-serif); font-size:1.45rem">Edit Product</h2>
        <button class="modal-x" onclick="closeProductEditor()" style="position:static">✕</button>
      </div>
      <form id="admin-product-form" onsubmit="return handleSaveProduct(event)">
        <div class="admin-form-grid">
          <div class="admin-field admin-form-full">
            <label>Product Title *</label>
            <input type="text" id="pedit-name" required placeholder="e.g. Sovereign Heavyweight Hoodie">
          </div>
          <div class="admin-field admin-form-full">
            <label>Subtitle / Fabric Spec</label>
            <input type="text" id="pedit-sub" placeholder="e.g. 500GSM Terry Cotton, Relaxed Cut">
          </div>
          <div class="admin-field">
            <label>Category *</label>
            <select id="pedit-category" required></select>
          </div>
          <div class="admin-field">
            <label>Badge / Tag (Optional)</label>
            <input type="text" id="pedit-badge" placeholder="e.g. New, Trending, Limited">
          </div>
          <div class="admin-field">
            <label>Current Price (₦) *</label>
            <input type="number" id="pedit-price" required min="0" oninput="updateDiscountPreview()">
          </div>
          <div class="admin-field">
            <label>Previous Price (₦) (Optional)</label>
            <input type="number" id="pedit-orig-price" min="0" oninput="updateDiscountPreview()">
          </div>
          <div class="admin-field admin-form-full">
            <div id="pedit-discount-preview" style="font-size:.8rem; color:var(--gold-light); font-weight:600; min-height:20px;"></div>
          </div>
          <div class="admin-checkbox-row admin-form-full">
            <input type="checkbox" id="pedit-show-discount" checked>
            <label for="pedit-show-discount" style="cursor:pointer">Show discount percentage badge on product card</label>
          </div>
          <div class="admin-field">
            <label>Stock Quantity (Backend only) *</label>
            <input type="number" id="pedit-stock" min="0" required placeholder="10">
          </div>
          <div class="admin-checkbox-row" style="align-self:flex-end">
            <input type="checkbox" id="pedit-out-of-stock">
            <label for="pedit-out-of-stock" style="cursor:pointer">Mark as Out of Stock immediately</label>
          </div>
          <div class="admin-field admin-form-full">
            <label>Image Source / URL *</label>
            <input type="text" id="pedit-image" required placeholder="assets/graphic-tee.jpg or image URL">
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px" id="pedit-image-presets">
              <!-- Quick image presets -->
            </div>
          </div>
          <div class="admin-field admin-form-full">
            <label>Available Sizes (comma separated)</label>
            <input type="text" id="pedit-sizes" placeholder="S, M, L, XL, XXL">
          </div>
          <div class="admin-field admin-form-full">
            <label>Description</label>
            <textarea id="pedit-desc" rows="3" placeholder="Detailed product narrative…"></textarea>
          </div>
        </div>
        <div class="admin-modal-foot">
          <button type="button" class="btn btn-action-sm" onclick="closeProductEditor()">Cancel</button>
          <button type="submit" class="btn btn-gold">Save Product</button>
        </div>
      </form>
    </div>
  </div>
  `;

  document.body.insertAdjacentHTML("beforeend", adminHtml);
}

function bindAdminEvents() {
  // Close modals on escape
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (document.getElementById("admin-product-modal")?.classList.contains("open")) {
        closeProductEditor();
      } else if (document.getElementById("admin-pin-modal")?.classList.contains("open")) {
        closeAdminPinModal();
      }
    }
  });
}

/* ── 3. PIN SECURITY & SUITE OPEN/CLOSE ────────────────────────────── */
function openAdminPinModal() {
  const modal = document.getElementById("admin-pin-modal");
  if (!modal) return;
  modal.classList.add("open");
  const input = document.getElementById("admin-pin-input");
  if (input) {
    input.value = "";
    input.focus();
  }
}

function closeAdminPinModal() {
  const modal = document.getElementById("admin-pin-modal");
  if (modal) modal.classList.remove("open");
}

function handleAdminPinSubmit(e) {
  e.preventDefault();
  const input = document.getElementById("admin-pin-input");
  const enteredPin = input ? input.value.trim() : "";
  const storedPin = localStorage.getItem("dd_admin_pin") || "1234";

  if (enteredPin === storedPin) {
    closeAdminPinModal();
    openAdminSuite();
    if (typeof showToast === "function") {
      showToast("Welcome to Dakar Dapper Control Suite ✨");
    }
  } else {
    alert("Incorrect PIN. Access Denied.");
    if (input) {
      input.value = "";
      input.focus();
    }
  }
  return false;
}

function openAdminSuite() {
  const suite = document.getElementById("admin-suite-wrap");
  if (!suite) return;
  suite.classList.add("open");
  document.body.classList.add("no-scroll");
  refreshAdminStats();
  renderAdminProducts();
  renderAdminCategories();
  populateCmsForm();
}

function closeAdminSuite() {
  const suite = document.getElementById("admin-suite-wrap");
  if (suite) suite.classList.remove("open");
  document.body.classList.remove("no-scroll");
}

function switchAdminTab(tabName) {
  currentAdminTab = tabName;
  document.querySelectorAll(".admin-tab-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.pane === tabName);
  });
  document.querySelectorAll(".admin-pane").forEach(p => {
    p.classList.toggle("active", p.id === "pane-" + tabName);
  });

  if (tabName === "products") renderAdminProducts();
  if (tabName === "categories") renderAdminCategories();
  if (tabName === "content") populateCmsForm();
}

function refreshAdminStats() {
  const statsBar = document.getElementById("admin-stats-bar");
  if (!statsBar) return;
  const total = PRODUCTS.length;
  const outOfStock = PRODUCTS.filter(p => p.isOutOfStock || (p.stock !== undefined && p.stock <= 0)).length;
  const lowStock = PRODUCTS.filter(p => !p.isOutOfStock && p.stock > 0 && p.stock <= 2).length;

  statsBar.innerHTML = `
    <div class="admin-stat-pill"><strong>${total}</strong> Total Products</div>
    <div class="admin-stat-pill"><strong>${CATEGORIES.length}</strong> Categories</div>
    <div class="admin-stat-pill"><strong>${outOfStock}</strong> Sold Out</div>
    ${lowStock > 0 ? `<div class="admin-stat-pill" style="border-color:#ED8936; color:#ED8936"><strong>${lowStock}</strong> Low Stock</div>` : ""}
  `;
}

/* ── 4. PRODUCTS & INVENTORY MANAGEMENT ───────────────────────────── */
function renderAdminProducts() {
  const tbody = document.getElementById("admin-products-table");
  const catFilter = document.getElementById("admin-cat-filter");
  const searchInput = document.getElementById("admin-search");
  if (!tbody) return;

  // Sync category filter dropdown
  if (catFilter) {
    const currentVal = catFilter.value;
    catFilter.innerHTML = `<option value="all">All Categories</option>` +
      CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
    catFilter.value = currentVal || "all";
  }

  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const selectedCat = catFilter ? catFilter.value : "all";

  let filtered = [...PRODUCTS];
  if (selectedCat !== "all") {
    filtered = filtered.filter(p => p.category === selectedCat);
  }
  if (query) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.subtitle && p.subtitle.toLowerCase().includes(query)) ||
      p.category.toLowerCase().includes(query)
    );
  }

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:#888;">No products found matching criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const isSoldOut = p.isOutOfStock || (p.stock !== undefined && p.stock <= 0);
    const isLow = !isSoldOut && p.stock > 0 && p.stock <= 2;
    const stockBadgeClass = isSoldOut ? "sold-out" : (isLow ? "low-stock" : "in-stock");
    const stockBadgeText = isSoldOut ? "Sold Out" : (isLow ? `Low Stock (${p.stock})` : `In Stock (${p.stock || 10})`);
    const disc = p.originalPrice && p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;

    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:12px">
            <img src="${p.image}" class="admin-p-thumb" alt="${p.name}">
            <div class="admin-p-info">
              <strong>${p.name}</strong>
              <span>${p.subtitle || ""}</span>
            </div>
          </div>
        </td>
        <td><span class="admin-stat-pill" style="text-transform:capitalize">${p.category}</span></td>
        <td>
          <div style="font-weight:600; color:#fff">${formatPrice(p.price)}</div>
          ${p.originalPrice ? `<div style="font-size:.74rem; color:#888; text-decoration:line-through">${formatPrice(p.originalPrice)}</div>` : ""}
          ${disc && p.showDiscount ? `<span class="badge-disc-pill">-${disc}%</span>` : ""}
        </td>
        <td>
          <span class="badge-stock ${stockBadgeClass}">${stockBadgeText}</span>
        </td>
        <td>
          <span style="font-size:.76rem; color:${isSoldOut ? '#E53E3E' : '#48BB78'}">${isSoldOut ? '● Out of Stock' : '● Available'}</span>
        </td>
        <td>
          <div class="admin-actions">
            <button class="btn-action-sm edit" onclick="openProductEditor(${p.id})">Edit</button>
            <button class="btn-action-sm restock" onclick="quickRestock(${p.id}, 5)" title="Add 5 items to stock">+5 Stock</button>
            <button class="btn-action-sm delete" onclick="deleteProduct(${p.id})" title="Delete Product">✕</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  refreshAdminStats();
}

function quickRestock(id, qty = 5) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  p.stock = (p.stock || 0) + qty;
  p.isOutOfStock = false;
  saveStoredProducts(PRODUCTS);
  if (typeof dbSaveProduct === "function") {
    dbSaveProduct(p);
  }
  renderAdminProducts();
  triggerStorefrontUpdate();
  if (typeof showToast === "function") {
    showToast(`Restocked ${p.name} (+${qty})`);
  }
}

function deleteProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Are you sure you want to delete "${p.name}"?`)) return;

  PRODUCTS = PRODUCTS.filter(x => x.id !== id);
  saveStoredProducts(PRODUCTS);
  if (typeof dbDeleteProduct === "function") {
    dbDeleteProduct(id);
  }
  renderAdminProducts();
  triggerStorefrontUpdate();
  if (typeof showToast === "function") {
    showToast(`Deleted ${p.name}`);
  }
}

/* ── 5. PRODUCT ADD / EDIT MODAL ──────────────────────────────────── */
function openProductEditor(id = null) {
  editingProductId = id;
  const modal = document.getElementById("admin-product-modal");
  const modalTitle = document.getElementById("admin-prod-modal-title");
  const catSelect = document.getElementById("pedit-category");
  const presetBox = document.getElementById("pedit-image-presets");

  // Populate category options
  catSelect.innerHTML = CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join("");

  // Preset image thumbnails for easy selection
  const defaultImages = [
    "assets/graphic-tee.jpg",
    "assets/cuban-shirt.jpg",
    "assets/varsity-jacket.jpg",
    "assets/cargo-pants.jpg",
    "assets/streetwear-sneakers.jpg",
    "assets/cuban-chain.jpg",
    "assets/shield-sunglasses.jpg",
    "assets/skate-sneakers.jpg"
  ];
  if (presetBox) {
    presetBox.innerHTML = defaultImages.map(img => `
      <img src="${img}" style="width:34px;height:42px;object-fit:cover;border-radius:3px;cursor:pointer;border:1px solid #444"
        onclick="document.getElementById('pedit-image').value='${img}'" title="Use ${img}">
    `).join("");
  }

  if (id) {
    modalTitle.textContent = "Edit Product";
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    document.getElementById("pedit-name").value = p.name || "";
    document.getElementById("pedit-sub").value = p.subtitle || "";
    document.getElementById("pedit-category").value = p.category || CATEGORIES[0].id;
    document.getElementById("pedit-badge").value = p.badge || "";
    document.getElementById("pedit-price").value = p.price || 0;
    document.getElementById("pedit-orig-price").value = p.originalPrice || "";
    document.getElementById("pedit-show-discount").checked = p.showDiscount !== false;
    document.getElementById("pedit-stock").value = p.stock !== undefined ? p.stock : 10;
    document.getElementById("pedit-out-of-stock").checked = !!p.isOutOfStock;
    document.getElementById("pedit-image").value = p.image || "";
    document.getElementById("pedit-sizes").value = (p.sizes || ["S", "M", "L", "XL"]).join(", ");
    document.getElementById("pedit-desc").value = p.description || "";
  } else {
    modalTitle.textContent = "Add New Product";
    document.getElementById("admin-product-form").reset();
    document.getElementById("pedit-stock").value = 10;
    document.getElementById("pedit-show-discount").checked = true;
    document.getElementById("pedit-sizes").value = "S, M, L, XL, XXL";
    document.getElementById("pedit-category").value = CATEGORIES[0]?.id || "wears";
  }

  updateDiscountPreview();
  modal.classList.add("open");
}

function closeProductEditor() {
  const modal = document.getElementById("admin-product-modal");
  if (modal) modal.classList.remove("open");
  editingProductId = null;
}

function updateDiscountPreview() {
  const price = parseFloat(document.getElementById("pedit-price")?.value || 0);
  const orig = parseFloat(document.getElementById("pedit-orig-price")?.value || 0);
  const preview = document.getElementById("pedit-discount-preview");
  if (!preview) return;

  if (orig && orig > price) {
    const pct = Math.round((1 - price / orig) * 100);
    preview.innerHTML = `✦ Auto-Calculated Discount: <strong>-${pct}%</strong> (Saved: ${formatPrice(orig - price)})`;
  } else {
    preview.textContent = "No discount (Current price is standard)";
  }
}

function handleSaveProduct(e) {
  e.preventDefault();
  const name = document.getElementById("pedit-name").value.trim();
  const subtitle = document.getElementById("pedit-sub").value.trim();
  const category = document.getElementById("pedit-category").value;
  const badge = document.getElementById("pedit-badge").value.trim();
  const price = parseFloat(document.getElementById("pedit-price").value) || 0;
  const origVal = document.getElementById("pedit-orig-price").value.trim();
  const originalPrice = origVal ? parseFloat(origVal) : null;
  const showDiscount = document.getElementById("pedit-show-discount").checked;
  const stock = parseInt(document.getElementById("pedit-stock").value) || 0;
  const isOutOfStock = document.getElementById("pedit-out-of-stock").checked || stock <= 0;
  const image = document.getElementById("pedit-image").value.trim();
  const sizesRaw = document.getElementById("pedit-sizes").value.trim();
  const sizes = sizesRaw ? sizesRaw.split(",").map(s => s.trim()).filter(Boolean) : ["S", "M", "L", "XL"];
  const description = document.getElementById("pedit-desc").value.trim();

  if (editingProductId) {
    // Update
    const idx = PRODUCTS.findIndex(x => x.id === editingProductId);
    if (idx !== -1) {
      PRODUCTS[idx] = {
        ...PRODUCTS[idx],
        name, subtitle, category, badge,
        price, originalPrice, showDiscount,
        stock, isOutOfStock, image, sizes, description
      };
    }
  } else {
    // Create new
    const newId = Date.now();
    const newProduct = {
      id: newId,
      name, subtitle, category, badge,
      badgeType: badge ? "tag-gold" : null,
      price, originalPrice, showDiscount,
      stock, isOutOfStock, image,
      isNew: true,
      colors: ["#1A1A1A", "#E5E5E5"],
      colorNames: ["Noir", "Bone"],
      sizes,
      rating: 5.0,
      reviews: 1,
      description: description || "Curated limited-edition piece tailored for modern streetwear aesthetics.",
      details: ["100% Premium Material", "Designed for Dakar Dapper", "Cold machine wash"],
      care: "Machine wash cold inside-out. Do not tumble dry."
    };
    PRODUCTS.unshift(newProduct);
  }

  saveStoredProducts(PRODUCTS);
  const savedItem = editingProductId ? PRODUCTS.find(x => x.id === editingProductId) : PRODUCTS[0];
  if (typeof dbSaveProduct === "function" && savedItem) {
    dbSaveProduct(savedItem);
  }
  closeProductEditor();
  renderAdminProducts();
  triggerStorefrontUpdate();

  if (typeof showToast === "function") {
    showToast("Product saved successfully! 📦");
  }
  return false;
}

/* ── 6. CATEGORY MANAGEMENT ───────────────────────────────────────── */
function renderAdminCategories() {
  const list = document.getElementById("admin-cat-list");
  if (!list) return;

  list.innerHTML = CATEGORIES.map(c => {
    const count = PRODUCTS.filter(p => p.category === c.id).length;
    return `
      <div class="admin-cat-item">
        <div>
          <span class="admin-cat-item-name">${c.name}</span>
          <span class="admin-cat-item-count">(${count} items)</span>
        </div>
        <div>
          <button class="btn-action-sm delete" onclick="handleDeleteCategory('${c.id}')" title="Delete Category">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

function handleAddCategory() {
  const input = document.getElementById("new-cat-name");
  const name = input ? input.value.trim() : "";
  if (!name) return;

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (!id) return;

  if (CATEGORIES.some(c => c.id === id)) {
    alert("Category already exists!");
    return;
  }

  const newCat = { id, name };
  CATEGORIES.push(newCat);
  saveStoredCategories(CATEGORIES);
  if (typeof dbSaveCategory === "function") {
    dbSaveCategory(newCat, CATEGORIES.length);
  }
  input.value = "";
  renderAdminCategories();
  renderAdminProducts();
  triggerStorefrontUpdate();

  if (typeof showToast === "function") {
    showToast(`Added category "${name}" 🏷️`);
  }
}

function handleDeleteCategory(id) {
  if (CATEGORIES.length <= 1) {
    alert("At least one category must remain.");
    return;
  }
  const count = PRODUCTS.filter(p => p.category === id).length;
  if (count > 0) {
    if (!confirm(`There are ${count} products in this category. Deleting it will reassign them to "${CATEGORIES[0].name}". Proceed?`)) {
      return;
    }
    // Reassign
    PRODUCTS.forEach(p => {
      if (p.category === id) {
        p.category = CATEGORIES[0].id;
        if (typeof dbSaveProduct === "function") dbSaveProduct(p);
      }
    });
    saveStoredProducts(PRODUCTS);
  }

  CATEGORIES = CATEGORIES.filter(c => c.id !== id);
  saveStoredCategories(CATEGORIES);
  if (typeof dbDeleteCategory === "function") {
    dbDeleteCategory(id);
  }
  renderAdminCategories();
  renderAdminProducts();
  triggerStorefrontUpdate();

  if (typeof showToast === "function") {
    showToast("Category deleted");
  }
}

/* ── 7. PAGE CONTENT CMS ───────────────────────────────────────────── */
function populateCmsForm() {
  const c = SITE_CONTENT;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined ? val : "";
  };

  setVal("cms-hero-badge", c.heroBadge);
  setVal("cms-hero-title", c.heroTitle);
  setVal("cms-hero-desc", c.heroDesc);
  setVal("cms-hero-btn1", c.heroBtn1Text);
  setVal("cms-hero-btn2", c.heroBtn2Text);
  setVal("cms-banner-notice", c.bannerNotice);
  setVal("cms-story-title", c.storyTitle);
  setVal("cms-story-desc", c.storyDesc);
  setVal("cms-phone", c.phone);
  setVal("cms-phone-display", c.phoneDisplay);
  setVal("cms-popup-delay", c.popupDelaySec || 30);
}

function handleSaveContent() {
  const getVal = id => document.getElementById(id)?.value?.trim() || "";

  SITE_CONTENT = {
    ...SITE_CONTENT,
    heroBadge: getVal("cms-hero-badge"),
    heroTitle: getVal("cms-hero-title"),
    heroDesc: getVal("cms-hero-desc"),
    heroBtn1Text: getVal("cms-hero-btn1"),
    heroBtn2Text: getVal("cms-hero-btn2"),
    bannerNotice: getVal("cms-banner-notice"),
    storyTitle: getVal("cms-story-title"),
    storyDesc: getVal("cms-story-desc"),
    phone: getVal("cms-phone") || "2349019603621",
    phoneDisplay: getVal("cms-phone-display") || "09019603621",
    popupDelaySec: parseInt(document.getElementById("cms-popup-delay")?.value) || 30
  };

  saveStoredContent(SITE_CONTENT);
  if (typeof dbSaveContent === "function") {
    dbSaveContent(SITE_CONTENT);
  }
  triggerStorefrontUpdate();

  if (typeof showToast === "function") {
    showToast("Page content updated live! ✏️");
  }
}

/* ── 8. SETTINGS, BACKUP & SECURITY ───────────────────────────────── */
function handleChangePin() {
  const input = document.getElementById("admin-new-pin");
  const newPin = input ? input.value.trim() : "";
  if (!newPin || newPin.length < 4) {
    alert("PIN must be at least 4 digits.");
    return;
  }
  localStorage.setItem("dd_admin_pin", newPin);
  input.value = "";
  if (typeof showToast === "function") {
    showToast("Admin PIN updated successfully! 🔒");
  }
}

function handleExportData() {
  const backup = {
    version: 1,
    exportDate: new Date().toISOString(),
    products: PRODUCTS,
    categories: CATEGORIES,
    content: SITE_CONTENT
  };
  const jsonStr = JSON.stringify(backup, null, 2);

  // Copy to clipboard & trigger download
  navigator.clipboard?.writeText(jsonStr);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dakar-dapper-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();

  if (typeof showToast === "function") {
    showToast("Store backup exported & copied to clipboard! 📥");
  }
}

function handleImportPrompt() {
  const raw = prompt("Paste your Dakar Dapper JSON backup data below:");
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    if (data.products && Array.isArray(data.products)) {
      saveStoredProducts(data.products);
    }
    if (data.categories && Array.isArray(data.categories)) {
      saveStoredCategories(data.categories);
    }
    if (data.content) {
      saveStoredContent(data.content);
    }
    renderAdminProducts();
    renderAdminCategories();
    populateCmsForm();
    triggerStorefrontUpdate();
    if (typeof showToast === "function") {
      showToast("Store data restored successfully! 📤");
    }
  } catch (err) {
    alert("Invalid JSON format. Restore aborted.");
  }
}

function handleResetDefaults() {
  if (!confirm("Are you sure you want to reset all products, categories and content to factory defaults? Any custom items will be replaced.")) {
    return;
  }
  localStorage.removeItem("dd_products_data");
  localStorage.removeItem("dd_categories_data");
  localStorage.removeItem("dd_site_content");

  PRODUCTS = getStoredProducts();
  CATEGORIES = getStoredCategories();
  SITE_CONTENT = getStoredContent();

  renderAdminProducts();
  renderAdminCategories();
  populateCmsForm();
  triggerStorefrontUpdate();

  if (typeof showToast === "function") {
    showToast("Restored factory catalog defaults 🔄");
  }
}

/* ── 9. TRIGGER STOREFRONT RE-RENDER ──────────────────────────────── */
function triggerStorefrontUpdate() {
  // 1. Live update text content
  if (typeof hydratePageContent === "function") {
    hydratePageContent();
  }
  // 2. Re-render storefront products
  if (typeof renderProducts === "function") {
    renderProducts();
  }
  // 3. Re-render shop page if present
  if (typeof renderShop === "function") {
    renderShop();
  }
  // 4. Re-render filter buttons dynamically
  if (typeof renderCategoryFilters === "function") {
    renderCategoryFilters();
  }
}
