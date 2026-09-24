/* ==========================================================================
   APP.JS — Dakar Dapper Main Application
   ========================================================================== */

/* ── SECURITY HELPERS ──────────────────────────────────────────────────
   Every value that reaches innerHTML passes through esc(). Product copy is
   owner-editable, so it must never be trusted as markup.
   ────────────────────────────────────────────────────────────────────── */
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/* Safe for src/href: blocks javascript: and data: payloads. */
function escUrl(v) {
  const s = String(v == null ? "" : v).trim();
  if (/^(javascript|data|vbscript):/i.test(s)) return "";
  return esc(s);
}
/* Only allow known-good CSS colour values into style attributes. */
function escColor(v) {
  const s = String(v == null ? "" : v).trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i.test(s) ? s : "transparent";
}

/* Headline copy may use a few decorative tags. Everything else is escaped,
   so CMS text can never introduce script or event handlers. */
function safeRichText(v) {
  return esc(v)
    .replace(/&lt;(\/?)(em|strong|b|i|br)\s*\/?&gt;/gi, (m, slash, tag) =>
      "<" + slash + tag.toLowerCase() + ">");
}

/* Local assets all have a WebP sibling (~60% smaller). Uploaded images from
   Supabase Storage do not, so those fall back to a plain <img>. */
const IMG_FALLBACK = "/assets/dakar-dapper-dd.png";

/* Product pages live at /product/<slug>, so a stored path like
   "assets/tee.jpg" would resolve to "/product/assets/tee.jpg". Root-relative
   paths are correct from every URL depth. */
function assetUrl(src) {
  const s = String(src || "").trim();
  if (!s || /^(https?:)?\/\//i.test(s) || s.startsWith("/")) return s;
  return "/" + s.replace(/^\.?\//, "");
}

function productPicture(src, alt, cls, w, h, eager) {
  const resolved = assetUrl(src);
  const url = escUrl(resolved);
  const loading = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  // A product whose image path is wrong should still show the brand mark,
  // never a broken-image icon.
  const onerr = `this.onerror=null;this.src='${IMG_FALLBACK}';this.classList.add('img-fallback');` +
                `if(this.parentElement.tagName==='PICTURE'){const s=this.parentElement.querySelector('source');if(s)s.remove();}`;
  const img = `<img class="${cls}" src="${url}" alt="${esc(alt)}" ${loading} decoding="async" ` +
              `width="${w}" height="${h}" onerror="${onerr}">`;
  if (!/^\/assets\/.+\.jpe?g$/i.test(resolved)) return img;
  const webp = escUrl(resolved.replace(/\.jpe?g$/i, ".webp"));
  return `<picture><source type="image/webp" srcset="${webp}">${img}</picture>`;
}

/* ── Shared product card ──────────────────────────────────────────────
   One renderer for the homepage, the shop grid and "you may also like".
   The card is a real <a> to the product page, so it is crawlable, opens in
   a new tab on middle-click, and works before JavaScript has finished. The
   quick-view button keeps the fast in-place preview for browsing. */
function productSlug(p) {
  return p.slug || String(p.name || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function productHref(p) {
  return `/product/${encodeURIComponent(productSlug(p))}`;
}

function productCardHtml(p) {
  const disc = p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
  const hasDisc = p.showDiscount !== false && p.originalPrice && disc > 0;
  const soldOut = p.isOutOfStock || (p.stock !== undefined && p.stock <= 0);
  const lowStock = !soldOut && p.stock > 0 && p.stock <= 3;
  const inWish = wishlist.includes(p.id);

  // "Stretched link": the <a> wraps only the title, but its ::after covers the
  // whole card. That keeps the markup valid (no buttons nested inside a link),
  // gives crawlers a real href, and still makes the entire card clickable.
  return `
  <article class="p-card${soldOut ? " is-sold-out" : ""}" data-id="${p.id}">
    <div class="p-card-media">
      ${soldOut ? `<div class="p-badge"><span class="badge-sold-out">SOLD OUT</span></div>`
        : lowStock ? `<div class="p-badge"><span class="tag-low">Only ${p.stock} left</span></div>`
        : p.badge ? `<div class="p-badge"><span class="${esc(p.badgeType)}">${esc(p.badge)}</span></div>` : ""}
      ${productPicture(p.thumb || p.image, p.name, "img-main", 600, 750)}
      <button class="heart-btn${inWish ? " active" : ""}" onclick="toggleWish(${p.id})"
              aria-label="${inWish ? "Remove from" : "Add to"} wishlist" aria-pressed="${inWish}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${inWish ? "#fff" : "none"}" stroke="${inWish ? "#fff" : "currentColor"}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </button>
      <div class="p-actions">
        <button class="p-action-btn view" onclick="openProduct(${p.id})">Quick View</button>
        <button class="p-action-btn add" onclick="${soldOut ? "" : `addToCart(${p.id})`}"${soldOut ? " disabled" : ""}>
          ${soldOut ? "Sold Out" : "+ Bag"}
        </button>
      </div>
    </div>
    <div class="p-info">
      <div class="p-info-top">
        <span class="p-cat">${esc(p.category)}</span>
        ${p.reviews > 0 && p.rating ? `<span class="p-rating">★ ${esc(p.rating)}</span>` : ""}
      </div>
      <h3 class="p-name"><a class="p-card-link" href="${productHref(p)}">${esc(p.name)}</a></h3>
      <p class="p-sub">${esc(p.subtitle)}</p>
      <div class="p-colors">${(p.colors || []).slice(0, 3).map(c =>
        `<span class="p-swatch" style="background:${escColor(c)}"></span>`).join("")}</div>
      <div class="p-prices">
        <span class="p-price">${formatPrice(p.price)}</span>
        ${hasDisc ? `<span class="p-orig">${formatPrice(p.originalPrice)}</span><span class="p-disc">-${disc}%</span>` : ""}
      </div>
    </div>
  </article>`;
}

/* ── Social icons ──────────────────────────────────────────────────────
   The list comes from Admin -> More -> Social links. Until the database has
   answered (or if migration 007 has not been run) the built-in list shows. */
function currentSocials() {
  if (typeof SOCIAL_PLATFORMS === "undefined") return [];
  const list = (typeof SITE_CONTENT !== "undefined" && SITE_CONTENT && Array.isArray(SITE_CONTENT.socials))
    ? SITE_CONTENT.socials
    : DEFAULT_SOCIALS;
  return list.filter(s => s && SOCIAL_PLATFORMS[s.platform] && safeSocialHref(s.url));
}

function renderSocials() {
  const boxes = document.querySelectorAll("[data-socials]");
  if (!boxes.length) return;
  const list = currentSocials();

  boxes.forEach(box => {
    const labelled = box.dataset.socials === "labelled";
    box.innerHTML = list.map(s => {
      const p = SOCIAL_PLATFORMS[s.platform];
      const href = safeSocialHref(s.url);
      const external = !/^mailto:/i.test(href);
      return `<a class="social-link${labelled ? " labelled" : ""}" href="${esc(href)}"
                 ${external ? 'target="_blank" rel="noopener me"' : ""}
                 aria-label="Dakar Dapper on ${esc(p.label)}" title="${esc(p.label)}"
                 style="--brand:${escColor(p.color)};--brand-fg:${escColor(p.fg)}">
                ${socialIconSvg(s.platform, labelled ? 22 : 18)}
                ${labelled ? `<span>${esc(p.label)}</span>` : ""}
              </a>`;
    }).join("");
    box.hidden = !list.length;
  });
}

function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(v) || (v && typeof v === "object") ? v : fallback;
  } catch { return fallback; }
}

/* ── STATE ─────────────────────────────────────────────────────────── */
let cart = readJSON("dd_cart", []);
let wishlist = readJSON("dd_wish", []);
let currentUser = null;
let shippingRates = [];
let activeFilter = "all";
let currentModal = null;
let galleryIndex = 0;
let waOpen = false;
let preShopTimerPassed = false;
let hasViewedCollections = false;
let currentNlModalType = "preshop";
let userEmailFromCheckout = "";

/* ── INIT ──────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  hydratePageContent();
  renderCatalogChrome();
  renderProducts();
  bindHeader();
  bindFilters();
  bindDrawers();
  bindSearch();
  bindWhatsApp();
  bindModalClose();
  bindAuth();
  bindHeroScroll();
  bindCardReveal();
  renderCart();
  renderWishlist();
  initNewsletterTriggers();

  // Pull live data from Supabase, then keep it live.
  if (typeof syncFromSupabase === "function") syncFromSupabase();
  if (typeof startRealtimeCatalog === "function") startRealtimeCatalog();
});

/* ── PERSIST ───────────────────────────────────────────────────────── */
function saveCart() { localStorage.setItem("dd_cart", JSON.stringify(cart)); }
function saveWish() { localStorage.setItem("dd_wish", JSON.stringify(wishlist)); }

/* ── HERO SCROLL ANIMATION ─────────────────────────────────────────── */
function bindHeroScroll() {
  const hero = document.getElementById("home");
  if (!hero) return;
  const heroBgImg = hero.querySelector(".hero-bg img");
  const heroFade = document.getElementById("hero-fade-out");
  const heroVignette = document.getElementById("hero-vignette");
  const heroContent = hero.querySelector(".hero-content");
  const heroOverlay = hero.querySelector(".hero-overlay");
  if (!heroBgImg) return;

  let ticking = false;

  /* Smooth cinematic easing curves */
  function easeOutQuad(t) { return t * (2 - t); }
  function easeInCubic(t) { return t * t * t; }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const heroH = hero.offsetHeight;
        if (heroH <= 0) { ticking = false; return; }

        // scrollProgress: 0 when hero top is at top, 1 when hero has completely exited
        const scrollProgress = Math.max(0, Math.min(1, -rect.top / heroH));

        // ── 1. Cinematic Dolly Zoom (Soft & increased slightly) ─────────────
        const zoomFactor = 0.16;
        const scale = 1 + easeOutQuad(scrollProgress) * zoomFactor;
        heroBgImg.style.transform = `scale(${scale.toFixed(4)}) translateZ(0)`;

        // ── 2. Cinematic Dissolve as user moves to next page ────────────────
        const fadeStart = 0.50;
        if (scrollProgress <= fadeStart) {
          if (heroFade) heroFade.style.opacity = 0;
          heroBgImg.style.opacity = 0.55;
        } else {
          const fadeProgress = Math.min(1, (scrollProgress - fadeStart) / (0.95 - fadeStart));
          const easedFade = easeInOutCubic(fadeProgress);
          if (heroFade) heroFade.style.opacity = easedFade.toFixed(3);

          // Softly dissolve the background image itself for seamless film transition
          const imgFade = 0.55 * (1 - easeInOutCubic(fadeProgress) * 0.75);
          heroBgImg.style.opacity = imgFade.toFixed(3);
        }

        // ── 3. Subtle Dramatic Overlay Shift ────────────────────────────────
        if (heroOverlay) {
          const darken = Math.min(scrollProgress * 0.2, 0.18);
          heroOverlay.style.background = `linear-gradient(to right,
            rgba(0,0,0,${(0.72 + darken).toFixed(2)}) 0%,
            rgba(0,0,0,${(0.25 + darken).toFixed(2)}) 60%,
            rgba(0,0,0,${darken.toFixed(2)}) 100%)`;
        }

        // ── 4. Content Lift & Dissolve ──────────────────────────────────────
        // Keeps text crisp and readable, then smoothly lifts up and dissolves
        // as the next section rolls in
        if (heroContent) {
          const textDissolveStart = 0.52;
          const textDissolveEnd = 0.90;
          if (scrollProgress <= textDissolveStart) {
            heroContent.style.opacity = 1;
            heroContent.style.transform = "translateY(0px)";
          } else {
            const textProgress = Math.min(1,
              (scrollProgress - textDissolveStart) / (textDissolveEnd - textDissolveStart));
            const textOpacity = Math.max(0, 1 - easeInOutCubic(textProgress));
            const textShift = -45 * easeOutQuad(textProgress);
            heroContent.style.opacity = textOpacity.toFixed(3);
            heroContent.style.transform = `translateY(${textShift.toFixed(1)}px)`;
          }
        }

        ticking = false;
      });
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll(); // Initial call
}

/* ── CARD REVEAL ANIMATION ─────────────────────────────────────────── */
function bindCardReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger the reveal
        const card = entry.target;
        const idx = Array.from(card.parentElement.children).indexOf(card);
        setTimeout(() => card.classList.add("revealed"), idx * 80);
        observer.unobserve(card);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });

  document.querySelectorAll(".p-card").forEach(card => observer.observe(card));
}

/* ── PRODUCTS RENDERING ────────────────────────────────────────────── */
function renderProducts(filter, query) {
  const f = filter || activeFilter;
  const grid = document.getElementById("product-grid");
  if (!grid) return;
  let items = [...PRODUCTS];

  if (f === "new") items = items.filter(p => p.isNew);
  else if (f !== "all") items = items.filter(p => p.category === f);

  if (query) {
    const q = query.toLowerCase();
    items = items.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.subtitle.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.badge && p.badge.toLowerCase().includes(q))
    );
  } else if (f === "all") {
    // Show top 8 items on homepage curated showcase
    items = items.slice(0, 8);
  }

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><h3>No products found</h3><p>Try a different filter or search term.</p><button class="btn btn-dark" onclick="filterProducts('all')">View All</button></div>`;
    return;
  }

  grid.innerHTML = items.map(productCardHtml).join("");

  // Re-bind card reveal for newly rendered cards
  bindCardReveal();
}

/* ── FILTERS ───────────────────────────────────────────────────────── */
function bindFilters() {
  const bar = document.getElementById("filter-bar");
  if (!bar) return;
  bar.addEventListener("click", e => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    filterProducts(btn.dataset.filter);
  });
}

function filterProducts(f) {
  activeFilter = f;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === f));
  renderProducts(f);
  hasViewedCollections = true;
  checkPreShopPopup();
}

/* ── HEADER ────────────────────────────────────────────────────────── */
function bindHeader() {
  const header = document.getElementById("header");
  window.addEventListener("scroll", () => {
    header.classList.toggle("scrolled", window.scrollY > 40);
  });
  // Hamburger
  document.getElementById("hamburger").addEventListener("click", () => {
    document.getElementById("mobile-drawer").classList.add("open");
    document.getElementById("overlay").classList.add("active");
    document.body.classList.add("no-scroll");
  });
  document.getElementById("mobile-close").addEventListener("click", closeAllDrawers);
  // Mobile nav links (only close if it's a hash link)
  document.querySelectorAll(".mob-link").forEach(a => {
    a.addEventListener("click", () => {
      if (a.getAttribute("href").startsWith("#")) closeAllDrawers();
    });
  });
}

/* ── DRAWERS ───────────────────────────────────────────────────────── */
function bindDrawers() {
  document.getElementById("cart-toggle").addEventListener("click", () => openDrawer("cart-drawer"));
  document.getElementById("cart-close").addEventListener("click", closeAllDrawers);
  document.getElementById("wishlist-toggle").addEventListener("click", () => openDrawer("wish-drawer"));
  document.getElementById("wish-close").addEventListener("click", closeAllDrawers);
  document.getElementById("overlay").addEventListener("click", closeAllDrawers);
  document.getElementById("checkout-btn").addEventListener("click", openCheckout);
}

function openDrawer(id) {
  closeAllDrawers();
  document.getElementById(id).classList.add("open");
  document.getElementById("overlay").classList.add("active");
  document.body.classList.add("no-scroll");
}

function closeAllDrawers() {
  document.querySelectorAll(".drawer, .mobile-drawer").forEach(d => d.classList.remove("open"));
  document.getElementById("overlay").classList.remove("active");
  const searchOverlay = document.getElementById("search-overlay");
  if (searchOverlay) searchOverlay.classList.remove("open");
  document.body.classList.remove("no-scroll");
}

/* ── CART ───────────────────────────────────────────────────────────── */
function addToCart(id, size, color, qty) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const isSoldOut = p.isOutOfStock || (p.stock !== undefined && p.stock <= 0);
  if (isSoldOut) {
    showToast(`${p.name} is currently out of stock`);
    return;
  }
  const s = size || (p.sizes && p.sizes[0]) || "Standard";
  const c = color || (p.colorNames && p.colorNames[0]) || "Default";
  const q = qty || 1;
  const existing = cart.find(i => i.id === id && i.size === s && i.color === c);
  if (existing) existing.qty += q;
  else cart.push({ id, size: s, color: c, qty: q });
  saveCart();
  renderCart();
  showToast(`${p.name} added to bag`);
}

function removeFromCart(idx) {
  cart.splice(idx, 1);
  saveCart();
  renderCart();
}

function updateQty(idx, delta) {
  cart[idx].qty += delta;
  if (cart[idx].qty < 1) cart.splice(idx, 1);
  saveCart();
  renderCart();
}

function renderCart() {
  const container = document.getElementById("cart-items");
  const footer = document.getElementById("cart-footer");
  const badge = document.getElementById("cart-count");
  if (!container || !footer || !badge) return;
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  badge.textContent = totalItems;
  badge.style.display = totalItems > 0 ? "flex" : "none";

  if (!cart.length) {
    container.innerHTML = `<div class="empty-state"><h3>Your bag is empty</h3><p>Explore our collection and find something you love.</p><button class="btn btn-dark" onclick="closeAllDrawers();window.location.href='shop.html'">Browse Collection</button></div>`;
    footer.style.display = "none";
    return;
  }

  // Drop any cart line whose product has since been removed from the catalogue.
  const missing = cart.filter(item => !PRODUCTS.find(x => x.id === item.id));
  if (missing.length) {
    cart = cart.filter(item => PRODUCTS.find(x => x.id === item.id));
    saveCart();
    if (!cart.length) return renderCart();
  }

  let total = 0;
  container.innerHTML = cart.map((item, i) => {
    const p = PRODUCTS.find(x => x.id === item.id);
    const lineTotal = p.price * item.qty;
    total += lineTotal;
    const atMax = p.stock > 0 && item.qty >= p.stock;
    return `
    <div class="cart-item">
      <div class="cart-item-img">${productPicture(p.image, p.name, "", 80, 100)}</div>
      <div class="cart-item-body">
        <div class="cart-item-top"><span class="cat">${esc(p.category)}</span><button class="cart-item-del" onclick="removeFromCart(${i})" aria-label="Remove ${esc(p.name)} from bag">✕</button></div>
        <h4>${esc(p.name)}</h4>
        <span class="cart-item-meta">${esc(item.size)} · ${esc(item.color)}</span>
        <div class="cart-item-bot">
          <div class="qty"><button onclick="updateQty(${i},-1)" aria-label="Decrease quantity">−</button><span>${item.qty}</span><button onclick="updateQty(${i},1)"${atMax ? ' disabled title="No more in stock"' : ''} aria-label="Increase quantity">+</button></div>
          <span class="cart-item-price">${formatPrice(lineTotal)}</span>
        </div>
      </div>
    </div>`;
  }).join("");

  footer.style.display = "block";
  document.getElementById("cart-total").textContent = formatPrice(total);

  // Shipping meter
  const thresh = freeShipMin();
  const pct = Math.min(total / thresh * 100, 100);
  document.getElementById("ship-fill").style.width = pct + "%";
  document.getElementById("ship-fill").classList.toggle("done", total >= thresh);
  document.getElementById("ship-msg").textContent = total >= thresh ? "🎉 You qualify for free shipping!" : `Add ${formatPrice(thresh - total)} for free shipping`;
}

/* ── WISHLIST ──────────────────────────────────────────────────────── */
function toggleWish(id) {
  const i = wishlist.indexOf(id);
  if (i >= 0) wishlist.splice(i, 1);
  else wishlist.push(id);
  saveWish();
  renderProducts();
  renderWishlist();
  if (currentUser && typeof dbWishlistAdd === "function") {
    if (i < 0) dbWishlistAdd(id); else dbWishlistRemove(id);
  }
  const p = PRODUCTS.find(x => x.id === id);
  if (i < 0 && p) showToast(`${p.name} saved to wishlist`);
}

function renderWishlist() {
  const container = document.getElementById("wish-items");
  const badge = document.getElementById("wish-count");
  if (!container || !badge) return;
  badge.textContent = wishlist.length;
  badge.style.display = wishlist.length > 0 ? "flex" : "none";

  if (!wishlist.length) {
    container.innerHTML = `<div class="empty-state"><h3>No saved items</h3><p>Heart products you love to save them here.</p></div>`;
    return;
  }

  container.innerHTML = wishlist.map(id => {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return "";
    return `
    <div class="wish-item">
      <div class="wish-item-img" onclick="closeAllDrawers();openProduct(${p.id})">${productPicture(p.image, p.name, "", 80, 100)}</div>
      <div class="wish-item-info">
        <h4 onclick="closeAllDrawers();openProduct(${p.id})">${esc(p.name)}</h4>
        <div class="wish-item-price">${formatPrice(p.price)}</div>
        <div class="wish-item-actions">
          <button class="btn btn-sm btn-dark" onclick="addToCart(${p.id});toggleWish(${p.id})">Add to Bag</button>
          <button class="wish-remove" onclick="toggleWish(${p.id})">Remove</button>
        </div>
      </div>
    </div>`;
  }).join("");
}

/* ── PRODUCT MODAL ─────────────────────────────────────────────────── */
function openProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  recordViewed(p.id);
  currentModal = p;
  galleryIndex = 0;
  hasViewedCollections = true;

  // Gallery
  document.getElementById("modal-img").src = assetUrl(p.image);
  document.getElementById("modal-img").alt = p.name;
  document.getElementById("modal-thumbs").innerHTML = `<div class="modal-thumb active" onclick="setGallery(0)"><img src="${escUrl(assetUrl(p.image))}" alt="" loading="lazy"></div>`;

  // Info
  const disc = p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
  const hasDisc = (p.showDiscount !== false) && p.originalPrice && disc > 0;
  const inWish = wishlist.includes(p.id);
  const isSoldOut = p.isOutOfStock || (p.stock !== undefined && p.stock <= 0);
  const hasReviews = p.reviews > 0 && p.rating;
  const starsStr = hasReviews ? "★".repeat(Math.round(p.rating)) : "";

  document.getElementById("modal-info").innerHTML = `
    <div class="modal-tags">
      <span class="t-light">${esc(p.category)}</span>
      ${isSoldOut ? `<span class="badge-sold-out">SOLD OUT</span>` : (p.badge ? `<span class="t-dark">${esc(p.badge)}</span>` : "")}
    </div>
    <h2 class="modal-title">${esc(p.name)}</h2>
    <p class="modal-subtitle">${esc(p.subtitle)}</p>
    <div class="modal-stars">
      ${hasReviews
        ? `<span class="stars">${starsStr}</span><span>${esc(p.rating)} (${esc(p.reviews)} review${p.reviews === 1 ? "" : "s"})</span>`
        : `<a href="${productHref(p)}#pdp-reviews" style="color:inherit">No reviews yet</a>`}
      <span class="${isSoldOut ? 'out-of-stock' : 'in-stock'}" style="${isSoldOut ? 'color:#ef4444;font-weight:600' : ''}">• ${isSoldOut ? 'Sold Out' : 'In Stock'}</span>
    </div>
    <div class="modal-price-row">
      <span class="modal-price">${formatPrice(p.price)}</span>
      ${hasDisc ? `<span class="modal-strike">${formatPrice(p.originalPrice)}</span><span class="p-disc">-${disc}%</span>` : ""}
    </div>
    <p class="modal-desc">${esc(p.description)}</p>
    <div class="select-group">
      <div class="select-label">Color — <span id="sel-color-name">${esc((p.colorNames && p.colorNames[0]) || 'Standard')}</span></div>
      <div class="color-opts">${(p.colors || ['#111']).map((c, i) => `<div class="color-opt${i === 0 ? ' active' : ''}" onclick="selectColor(this,${i})" data-index="${i}"><span class="color-dot" style="background:${escColor(c)}"></span></div>`).join("")}</div>
    </div>
    <div class="select-group">
      <div class="select-label">Size <button class="size-guide-btn" onclick="openSizeGuide()">📏 Size Guide</button></div>
      <div class="size-opts">${(p.sizes || ['One Size']).map((s, i) => `<button class="size-opt${i === 0 ? ' active' : ''}" onclick="selectSize(this)">${esc(s)}</button>`).join("")}</div>
    </div>
    <div class="modal-actions">
      <div class="qty qty-lg"><button onclick="modalQty(-1)">−</button><span id="modal-qty">1</span><button onclick="modalQty(1)">+</button></div>
      <button class="btn btn-dark" onclick="${isSoldOut ? '' : 'addModalToCart()'}"${isSoldOut ? ' disabled style="opacity:0.6;cursor:not-allowed"' : ''}>${isSoldOut ? 'Sold Out' : 'Add to Bag'}</button>
      <button class="wish-circle${inWish ? ' active' : ''}" onclick="toggleWish(${p.id});refreshModalWish(${p.id})">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${inWish ? '#fff' : 'none'}" stroke="${inWish ? '#fff' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </button>
    </div>
    <button class="btn btn-gold buy-full" onclick="${isSoldOut ? '' : "addModalToCart();closeModal();openDrawer('cart-drawer')"}"${isSoldOut ? ' disabled style="opacity:0.6;cursor:not-allowed"' : ''}>${isSoldOut ? 'Sold Out' : 'Buy Now'}</button>
    <div class="reassure">
      <div class="reassure-row"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><div><strong>Secure Checkout</strong><span>SSL encrypted payment</span></div></div>
      <div class="reassure-row"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 17H5a2 2 0 0 0-2 2 2 2 0 0 0 2 2h14a2 2 0 0 0 2-2 2 2 0 0 0-2-2h-4M9 17V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v12M9 17h6"/></svg><div><strong>Free Shipping</strong><span>On orders over ₦150,000</span></div></div>
      <div class="reassure-row"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg><div><strong>Easy Returns</strong><span>14-day hassle-free returns</span></div></div>
    </div>
  `;

  // Tabs
  document.getElementById("tabs-section").innerHTML = `
    <div class="tabs-nav">
      <button class="tab-btn active" onclick="switchTab('details',this)">Details</button>
      <button class="tab-btn" onclick="switchTab('care',this)">Care</button>
      <button class="tab-btn" onclick="switchTab('shipping',this)">Shipping</button>
    </div>
    <div class="tab-pane active" id="tab-details">
      <ul class="detail-list">${(p.details||[]).map(d => `<li><span class="check">✓</span>${esc(d)}</li>`).join("")}</ul>
    </div>
    <div class="tab-pane" id="tab-care"><p style="font-size:.9rem;color:var(--text-sub);line-height:1.6">${esc(p.care)}</p></div>
    <div class="tab-pane" id="tab-shipping"><p style="font-size:.9rem;color:var(--text-sub);line-height:1.6">Free standard shipping on orders over ₦150,000. Standard delivery takes 3-5 business days within Lagos and 5-7 days nationwide. Express delivery available at checkout. All orders are tracked and insured.</p></div>
  `;

  // Related
  const related = PRODUCTS.filter(x => x.id !== p.id && x.category === p.category).slice(0, 3);
  if (related.length) {
    document.getElementById("related-section").innerHTML = `
      <h3>You May Also Like</h3>
      <div class="related-grid">${related.map(r => `
        <div class="related-item" onclick="openProduct(${r.id})">
          <div class="related-img">${productPicture(r.image, r.name, "", 200, 250)}</div>
          <div><h4>${esc(r.name)}</h4><span class="price">${formatPrice(r.price)}</span></div>
        </div>`).join("")}</div>`;
  } else {
    document.getElementById("related-section").innerHTML = "";
  }

  // Show
  const modal = document.getElementById("product-modal");
  modal.classList.add("open");
  document.body.classList.add("no-scroll");
}

function closeModal() {
  document.getElementById("product-modal").classList.remove("open");
  document.body.classList.remove("no-scroll");
  currentModal = null;
  setTimeout(checkPreShopPopup, 900);
}

function bindModalClose() {
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("product-modal").addEventListener("click", e => {
    if (e.target.id === "product-modal") closeModal();
  });
  // Size guide
  document.getElementById("size-modal").addEventListener("click", e => {
    if (e.target.id === "size-modal") closeSizeGuide();
  });
  // Checkout modal
  document.getElementById("checkout-modal").addEventListener("click", e => {
    if (e.target.id === "checkout-modal") closeCheckout();
  });
  // Auth modal
  const authModal = document.getElementById("auth-modal");
  if (authModal) {
    authModal.addEventListener("click", e => {
      if (e.target.id === "auth-modal") closeAuth();
    });
  }
  // Newsletter VIP modal
  const nlModal = document.getElementById("newsletter-modal");
  if (nlModal) {
    nlModal.addEventListener("click", e => {
      if (e.target.id === "newsletter-modal") closeNewsletterModal();
    });
  }

  // Escape key closes all modals
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (document.getElementById("newsletter-modal")?.classList.contains("open")) closeNewsletterModal();
      else if (document.getElementById("product-modal").classList.contains("open")) closeModal();
      else if (document.getElementById("auth-modal")?.classList.contains("open")) closeAuth();
      else if (document.getElementById("size-modal").classList.contains("open")) closeSizeGuide();
      else if (document.getElementById("checkout-modal").classList.contains("open")) closeCheckout();
      else closeAllDrawers();
    }
  });
}

function setGallery(i) {
  galleryIndex = i;
  document.getElementById("modal-img").src = currentModal.image;
  document.querySelectorAll(".modal-thumb").forEach((t, idx) => t.classList.toggle("active", idx === i));
}

function selectColor(el, i) {
  document.querySelectorAll(".color-opt").forEach(o => o.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("sel-color-name").textContent = currentModal.colorNames[i];
}

function selectSize(el) {
  document.querySelectorAll(".size-opt").forEach(o => o.classList.remove("active"));
  el.classList.add("active");
}

function modalQty(delta) {
  const el = document.getElementById("modal-qty");
  let v = parseInt(el.textContent) + delta;
  if (v < 1) v = 1;
  if (v > 10) v = 10;
  el.textContent = v;
}

function addModalToCart() {
  if (!currentModal) return;
  const size = document.querySelector(".size-opt.active")?.textContent || currentModal.sizes[0];
  const colorIdx = document.querySelector(".color-opt.active")?.dataset.index || 0;
  const color = currentModal.colorNames[colorIdx];
  const qty = parseInt(document.getElementById("modal-qty").textContent);
  addToCart(currentModal.id, size, color, qty);
}

function refreshModalWish(id) {
  const inWish = wishlist.includes(id);
  const btn = document.querySelector(".wish-circle");
  if (btn) {
    btn.classList.toggle("active", inWish);
    btn.querySelector("svg").setAttribute("fill", inWish ? "#fff" : "none");
    btn.querySelector("svg").setAttribute("stroke", inWish ? "#fff" : "currentColor");
  }
}

function switchTab(name, btn) {
  document.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("tab-" + name).classList.add("active");
}

/* Whichever product the visitor is looking at: the product page, or the one
   open in the quick-view modal. */
function activeProduct() {
  if (typeof PDP !== "undefined" && PDP) return PDP;
  if (typeof currentModal !== "undefined" && currentModal) return currentModal;
  return null;
}

function categoryName(id) {
  const c = (typeof CATEGORIES !== "undefined" ? CATEGORIES : []).find(x => x.id === id);
  return c ? c.name : (id || "Shop");
}

/* ══════════════════════════════════════════════════════════════════════
   SIZE GUIDE — per category, not one chart for everything
   The single chart showed chest/waist/hips for sneakers and chains.
   ══════════════════════════════════════════════════════════════════════ */

let sizeCharts = null;

async function openSizeGuide() {
  const modal = document.getElementById("size-modal");
  const card = modal.querySelector(".modal-card");

  modal.classList.add("open");
  document.body.classList.add("no-scroll");

  if (sizeCharts === null) {
    card.innerHTML = `<button class="modal-x" onclick="closeSizeGuide()" aria-label="Close">✕</button>
                      <p style="padding:24px 0;color:var(--text-sub)">Loading size guide…</p>`;
    sizeCharts = await dbFetchSizeCharts();
  }

  const active = activeProduct();
  const chart = active ? sizeCharts[active.category] : null;
  const askUrl = `https://wa.me/${esc(PHONE)}?text=` +
    encodeURIComponent(`Hello Dakar Dapper, I need help with sizing for the ${(active && active.name) || "product"}.`);

  card.innerHTML = chart ? `
    <button class="modal-x" onclick="closeSizeGuide()" aria-label="Close">✕</button>
    <h2 class="size-modal-title">Size Guide</h2>
    <p class="size-modal-sub">${esc(categoryName(active.category))} · measurements in ${esc(chart.unit || "cm")}</p>
    <div class="size-table-wrap">
      <table class="size-table">
        <thead><tr>${(chart.columns || []).map(c => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>
          ${(chart.rows || []).map(r => `<tr>${r.map((cell, i) =>
            i === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
    ${chart.note ? `<p class="size-modal-note">${esc(chart.note)}</p>` : ""}
    <p class="size-modal-help">Still unsure? <a href="${askUrl}" target="_blank" rel="noopener">Ask us on WhatsApp</a> and we will help you pick.</p>`
  : `
    <button class="modal-x" onclick="closeSizeGuide()" aria-label="Close">✕</button>
    <h2 class="size-modal-title">Size Guide</h2>
    <p class="size-modal-sub">No chart has been added for this category yet.</p>
    <p class="size-modal-help"><a href="${askUrl}" target="_blank" rel="noopener">Ask us on WhatsApp</a> and we will advise on fit.</p>`;
}

function closeSizeGuide() {
  document.getElementById("size-modal").classList.remove("open");
  document.body.classList.remove("no-scroll");
}

/* -- CHECKOUT ----------------------------------------------------------
   The browser collects details and shows an ESTIMATE. The authoritative
   prices, shipping and total are recomputed by place_order() on the server,
   so a tampered cart cannot change what is charged.
   ---------------------------------------------------------------------- */

const NG_STATES = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue",
  "Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT - Abuja","Gombe",
  "Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa",
  "Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];

function freeShipMin() {
  return (typeof SITE_CONTENT !== "undefined" && SITE_CONTENT && SITE_CONTENT.freeShipMin)
    ? Number(SITE_CONTENT.freeShipMin) : 150000;
}

function cartSubtotal() {
  return cart.reduce((s, item) => {
    const p = PRODUCTS.find(x => x.id === item.id);
    return s + (p ? p.price * item.qty : 0);
  }, 0);
}

function shippingFor(state, subtotal) {
  if (subtotal >= freeShipMin()) return 0;
  const hit = shippingRates.find(r => r.state === state);
  return hit ? Number(hit.fee) : 5000;
}

function openCheckout() {
  if (!cart.length) { showToast("Your bag is empty."); return; }
  closeAllDrawers();

  const d = readJSON("dd_customer", {});
  const subtotal = cartSubtotal();

  document.getElementById("checkout-content").innerHTML = `
    <h2 class="checkout-heading">Checkout</h2>
    <p class="checkout-sub">Delivery details &mdash; we will confirm your order on WhatsApp.</p>
    <form class="form-grid" id="checkout-form" novalidate autocomplete="on">
      <div class="form-row">
        <div class="form-grp">
          <label for="co-first">First Name</label>
          <input id="co-first" name="firstName" type="text" autocomplete="given-name" required value="${esc(d.firstName || "")}">
          <span class="field-err" data-for="co-first"></span>
        </div>
        <div class="form-grp">
          <label for="co-last">Last Name</label>
          <input id="co-last" name="lastName" type="text" autocomplete="family-name" required value="${esc(d.lastName || "")}">
          <span class="field-err" data-for="co-last"></span>
        </div>
      </div>
      <div class="form-grp">
        <label for="co-email">Email</label>
        <input id="co-email" name="email" type="email" inputmode="email" autocomplete="email" required value="${esc(d.email || "")}">
        <span class="field-err" data-for="co-email"></span>
      </div>
      <div class="form-grp">
        <label for="co-phone">Phone (WhatsApp)</label>
        <input id="co-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(d.phone || "")}">
        <span class="field-err" data-for="co-phone"></span>
      </div>
      <div class="form-grp">
        <label for="co-address">Delivery Address</label>
        <input id="co-address" name="address" type="text" autocomplete="street-address" required value="${esc(d.address || "")}">
        <span class="field-err" data-for="co-address"></span>
      </div>
      <div class="form-row">
        <div class="form-grp">
          <label for="co-city">City</label>
          <input id="co-city" name="city" type="text" autocomplete="address-level2" required value="${esc(d.city || "")}">
          <span class="field-err" data-for="co-city"></span>
        </div>
        <div class="form-grp">
          <label for="co-state">State</label>
          <select id="co-state" name="state" autocomplete="address-level1" required>
            ${NG_STATES.map(st => `<option value="${esc(st)}"${(d.state || "Lagos") === st ? " selected" : ""}>${esc(st)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-grp">
        <label for="co-note">Delivery note <span class="opt">(optional)</span></label>
        <input id="co-note" name="note" type="text" placeholder="Landmark, gate colour, best time to call">
      </div>

      <label class="optin">
        <input type="checkbox" id="co-marketing" name="marketing"${d.marketing ? " checked" : ""}>
        <span>Email me new arrivals and private offers. <small>Unsubscribe anytime.</small></span>
      </label>

      <div class="checkout-summary">
        <div class="sum-row"><span>Subtotal</span><span id="co-subtotal">${formatPrice(subtotal)}</span></div>
        <div class="sum-row"><span>Delivery</span><span id="co-shipping">&mdash;</span></div>
        <div class="sum-row sum-total"><span>Total</span><span id="checkout-total">${formatPrice(subtotal)}</span></div>
        <p class="sum-note">Your final total is confirmed by our server when you place the order.</p>
      </div>

      <div class="checkout-error" id="checkout-error" role="alert" hidden></div>
      <button class="btn btn-dark buy-full" type="submit" id="place-order-btn">Place Order</button>
      <p class="checkout-trust">Your details are sent over an encrypted connection.</p>
    </form>`;

  document.getElementById("checkout-form").addEventListener("submit", placeOrder);
  document.getElementById("co-state").addEventListener("change", refreshCheckoutTotals);
  refreshCheckoutTotals();

  document.getElementById("checkout-modal").classList.add("open");
  document.body.classList.add("no-scroll");
}

function refreshCheckoutTotals() {
  const stateEl = document.getElementById("co-state");
  if (!stateEl) return;
  const subtotal = cartSubtotal();
  const ship = shippingFor(stateEl.value, subtotal);
  const sEl = document.getElementById("co-subtotal");
  const hEl = document.getElementById("co-shipping");
  const tEl = document.getElementById("checkout-total");
  if (sEl) sEl.textContent = formatPrice(subtotal);
  if (hEl) hEl.textContent = ship === 0 ? "FREE" : formatPrice(ship);
  if (tEl) tEl.textContent = formatPrice(subtotal + ship);
}

function closeCheckout() {
  document.getElementById("checkout-modal").classList.remove("open");
  document.body.classList.remove("no-scroll");
}

function setFieldError(id, message) {
  const span = document.querySelector('.field-err[data-for="' + id + '"]');
  const input = document.getElementById(id);
  if (span) span.textContent = message || "";
  if (input) input.classList.toggle("invalid", !!message);
}

function validateCheckout(v) {
  let firstBad = null;
  const fail = (id, msg) => { setFieldError(id, msg); if (!firstBad) firstBad = id; };

  ["co-first","co-last","co-email","co-phone","co-address","co-city"].forEach(id => setFieldError(id, ""));

  if (v.firstName.length < 2) fail("co-first", "Please enter your first name.");
  if (v.lastName.length < 2) fail("co-last", "Please enter your last name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) fail("co-email", "Enter a valid email address.");
  if (v.phone.replace(/\D/g, "").length < 10) fail("co-phone", "Enter a valid phone number.");
  if (v.address.length < 6) fail("co-address", "Enter your full delivery address.");
  if (v.city.length < 2) fail("co-city", "Enter your city.");

  return firstBad;
}

async function placeOrder(e) {
  if (e && e.preventDefault) e.preventDefault();

  const btn = document.getElementById("place-order-btn");
  const errBox = document.getElementById("checkout-error");
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };

  const v = {
    firstName: val("co-first"), lastName: val("co-last"),
    email: val("co-email"), phone: val("co-phone"),
    address: val("co-address"), city: val("co-city"),
    state: val("co-state"), note: val("co-note"),
    marketing: !!(document.getElementById("co-marketing") || {}).checked
  };

  const bad = validateCheckout(v);
  if (bad) {
    const el = document.getElementById(bad);
    el.focus();
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  if (!cart.length) { showToast("Your bag is empty."); return false; }

  // Remember the customer for next time. We never hold card details.
  localStorage.setItem("dd_customer", JSON.stringify(v));
  userEmailFromCheckout = v.email;

  errBox.hidden = true;
  btn.disabled = true;
  btn.textContent = "Placing your order...";

  const result = await dbPlaceOrder({
    name: v.firstName + " " + v.lastName,
    email: v.email, phone: v.phone, address: v.address,
    city: v.city, state: v.state, note: v.note,
    marketing: v.marketing,
    items: cart
  });

  if (!result.ok) {
    btn.disabled = false;
    btn.textContent = "Place Order";
    errBox.hidden = false;
    errBox.textContent = result.message || "We could not place your order. Please try again.";
    errBox.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof syncFromSupabase === "function") syncFromSupabase();
    return false;
  }

  const o = result.order || {};
  const waText = encodeURIComponent(
    "Hello Dakar Dapper, I just placed order " + o.order_number + ". Total: " + formatPrice(o.total) + ".");

  document.getElementById("checkout-content").innerHTML = `
    <div class="order-done">
      <div class="check-circle">&#10003;</div>
      <h2 class="checkout-heading">Order Confirmed</h2>
      <p class="order-ref">Your reference<strong>${esc(o.order_number || "")}</strong></p>
      <div class="order-totals">
        <div class="sum-row"><span>Subtotal</span><span>${formatPrice(o.subtotal)}</span></div>
        <div class="sum-row"><span>Delivery</span><span>${Number(o.shipping) === 0 ? "FREE" : formatPrice(o.shipping)}</span></div>
        <div class="sum-row sum-total"><span>Total</span><span>${formatPrice(o.total)}</span></div>
      </div>
      <p class="order-next">Please save your reference. We will confirm delivery and payment with you on WhatsApp.</p>
      <a class="btn btn-gold buy-full" href="https://wa.me/${esc(PHONE)}?text=${waText}" target="_blank" rel="noopener">Confirm on WhatsApp</a>
      <button class="btn btn-dark buy-full" onclick="handleOrderDoneContinue()" style="margin-top:10px">Continue Shopping</button>
    </div>`;

  cart = [];
  saveCart();
  renderCart();
  showToast("Order " + o.order_number + " placed");
  if (typeof syncFromSupabase === "function") syncFromSupabase();
  return false;
}

function handleOrderDoneContinue() {
  closeCheckout();
  setTimeout(() => openNewsletterModal("postshop"), 450);
}

/* ── AUTH MODAL ─────────────────────────────────────────────────────── */
function bindAuth() {
  const authToggle = document.getElementById("auth-toggle");
  if (authToggle) {
    authToggle.addEventListener("click", () => {
      if (currentUser) window.location.href = "/account.html";
      else openAuth();
    });
  }
  const authClose = document.getElementById("auth-close");
  if (authClose) {
    authClose.addEventListener("click", closeAuth);
  }

  // Tab switching
  const tabSignin = document.getElementById("tab-signin");
  const tabSignup = document.getElementById("tab-signup");
  if (tabSignin && tabSignup) {
    tabSignin.addEventListener("click", () => switchAuthTab("signin"));
    tabSignup.addEventListener("click", () => switchAuthTab("signup"));
  }

  // Form submissions
  const signinForm = document.getElementById("signin-form");
  if (signinForm) signinForm.addEventListener("submit", handleCustomerSignIn);

  // Mobile menu "Sign in / My account"
  document.querySelectorAll("[data-account-link]").forEach(a => a.addEventListener("click", e => {
    if (!currentUser) { e.preventDefault(); closeAllDrawers(); openAuth(); }
  }));

  // Forgot password: email a reset link that opens the account page
  document.querySelectorAll("[data-forgot]").forEach(a => a.addEventListener("click", async e => {
    e.preventDefault();
    const email = (document.querySelector('#signin-form input[type="email"]')?.value || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return authError("signin-form", "Type your email above, then tap “Forgot password?” again.");
    }
    await customerSendReset(email);
    authError("signin-form", "");
    showToast("If that email has an account, a reset link is on its way.");
  }));
  const signupForm = document.getElementById("signup-form");
  if (signupForm) signupForm.addEventListener("submit", handleCustomerSignUp);

  refreshAuthState();
}

function authError(formId, message) {
  // The message box sits just above its form, not inside it.
  const form = document.getElementById(formId);
  const prev = form && form.previousElementSibling;
  const box = (prev && prev.classList.contains("auth-error")) ? prev
            : document.querySelector(`#${formId} .auth-error`);
  if (!box) return;
  box.textContent = message || "";
  box.hidden = !message;
}

async function handleCustomerSignIn(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const email = form.querySelector('input[type="email"]').value.trim();
  const password = form.querySelector('input[type="password"]').value;

  authError("signin-form", "");
  if (!email || !password) return authError("signin-form", "Enter your email and password.");

  btn.disabled = true; btn.textContent = "Signing in…";
  const res = await customerSignIn(email, password);
  btn.disabled = false; btn.textContent = "Sign In";

  if (!res.ok) return authError("signin-form", res.message);
  showToast("Welcome back 👋");
  closeAuth();
  refreshAuthState();
}

async function handleCustomerSignUp(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const name = form.querySelector('input[type="text"]').value.trim();
  const email = form.querySelector('input[type="email"]').value.trim();
  const password = form.querySelector('input[type="password"]').value;

  authError("signup-form", "");
  if (name.length < 2) return authError("signup-form", "Please enter your full name.");
  if (password.length < 8) return authError("signup-form", "Password must be at least 8 characters.");

  btn.disabled = true; btn.textContent = "Creating account…";
  const res = await customerSignUp(email, password, name);
  btn.disabled = false; btn.textContent = "Create Account";

  if (!res.ok) return authError("signup-form", res.message);
  showToast(res.needsConfirm ? "Check your email to confirm your account." : "Account created 🎉");
  closeAuth();
  refreshAuthState();
}

async function refreshAuthState() {
  if (typeof customerCurrent !== "function") return;
  const before = currentUser ? currentUser.id : null;
  currentUser = await customerCurrent();
  if (currentUser && currentUser.id !== before) syncPersonalData();
  document.querySelectorAll("[data-account-link]").forEach(a => {
    a.querySelector("[data-account-label]").textContent = currentUser ? "My account" : "Sign In / Sign Up";
  });
  const btn = document.getElementById("auth-toggle");
  if (!btn) return;
  const name = currentUser?.user_metadata?.full_name || currentUser?.email || "";
  btn.setAttribute("aria-label", currentUser ? `Account — ${name}` : "Account");
  btn.classList.toggle("signed-in", !!currentUser);
}

async function handleSignOut() {
  await customerSignOut();
  currentUser = null;
  refreshAuthState();
  closeAuth();
  showToast("Signed out.");
}

function openAuth() {
  document.getElementById("auth-modal").classList.add("open");
  document.body.classList.add("no-scroll");
}

function closeAuth() {
  document.getElementById("auth-modal").classList.remove("open");
  document.body.classList.remove("no-scroll");
}

function switchAuthTab(tab) {
  document.getElementById("tab-signin").classList.toggle("active", tab === "signin");
  document.getElementById("tab-signup").classList.toggle("active", tab === "signup");
  document.getElementById("signin-form").style.display = tab === "signin" ? "flex" : "none";
  document.getElementById("signup-form").style.display = tab === "signup" ? "flex" : "none";
  document.getElementById("auth-title").textContent = tab === "signin" ? "Welcome Back" : "Create Account";
  document.getElementById("auth-subtitle").textContent = tab === "signin"
    ? "Sign in to your Dakar Dapper account"
    : "Join the Dakar Dapper family";
}

/* ── SEARCH ────────────────────────────────────────────────────────── */

/* ── WHATSAPP ──────────────────────────────────────────────────────── */
function bindWhatsApp() {
  const link = document.getElementById("wa-btn");
  if (!link) return;

  // The client asked for a straight redirect rather than an in-page chat
  // mock-up. The anchor already works on its own; this keeps the number and
  // the opening line current as the page changes.
  const refresh = () => {
    link.href = `https://wa.me/${PHONE}?text=${encodeURIComponent(whatsappOpener())}`;
  };
  refresh();
  link.addEventListener("mouseenter", refresh);
  link.addEventListener("touchstart", refresh, { passive: true });
  link.addEventListener("focus", refresh);
}

/* A sensible opening line for wherever the visitor happens to be. */
function whatsappOpener() {
  if (typeof PDP !== "undefined" && PDP) {
    return `Hello Dakar Dapper, I'd like to ask about the ${PDP.name} (${formatPrice(PDP.price)}).`;
  }
  if (cart.length) {
    return "Hello Dakar Dapper, I have some items in my bag and would like help checking out.";
  }
  return "Hello Dakar Dapper, I'd like to ask about your collection.";
}



/* ── NEWSLETTER (FOOTER & VIP MODAL) ──────────────────────────────── */
async function handleNewsletter(e) {
  e.preventDefault();
  const form = e.target;
  const input = form.querySelector("input");
  const btn = form.querySelector("button");
  const email = input.value.trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    showToast("Please enter a valid email address.");
    input.focus();
    return false;
  }

  btn.disabled = true;
  const ok = await dbAddSubscriber(email, "footer");
  btn.disabled = false;

  if (!ok) { showToast("Could not subscribe right now. Please try again."); return false; }

  localStorage.setItem("dd_subscribed", "true");
  sessionStorage.setItem("dd_preshop_popup_shown", "true");
  showToast("Welcome to the Dakar Dapper family 💌");
  form.reset();
  return false;
}

function initNewsletterTriggers() {
  // If user is directly on the shop page, they are already exploring collections
  if (window.location.pathname.includes("shop.html")) {
    hasViewedCollections = true;
  }

  // 1. Observe when user scrolls into and browses the collection sections
  const collectionTargets = [
    document.getElementById("collection"),
    document.getElementById("product-grid"),
    document.querySelector(".categories"),
    document.querySelector(".shop-layout"),
    document.querySelector(".shop-product-grid")
  ].filter(Boolean);

  if (collectionTargets.length && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          hasViewedCollections = true;
          checkPreShopPopup();
        }
      });
    }, { threshold: 0.15 });

    collectionTargets.forEach(el => observer.observe(el));
  }

  // Fallback scroll check (e.g. user scrolled past hero into collections)
  window.addEventListener("scroll", () => {
    if (window.scrollY > 400 && !hasViewedCollections) {
      const coll = document.getElementById("collection") || document.getElementById("product-grid") || document.querySelector(".shop-layout");
      if (coll) {
        const rect = coll.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          hasViewedCollections = true;
          checkPreShopPopup();
        }
      }
    }
  }, { passive: true });

  // 2. Browsing timer: popup appears after user has worked through website (~30 seconds)
  const delaySec = (typeof SITE_CONTENT !== "undefined" && SITE_CONTENT.popupDelaySec) ? SITE_CONTENT.popupDelaySec : 30;
  setTimeout(() => {
    preShopTimerPassed = true;
    checkPreShopPopup();
  }, delaySec * 1000);
}

function checkPreShopPopup() {
  // User must satisfy BOTH conditions:
  // 1. Worked through site for ~1 min (preShopTimerPassed)
  // 2. Explored and checked the collections first (hasViewedCollections)
  if (!preShopTimerPassed || !hasViewedCollections) return;

  // Do not show if already subscribed or dismissed this browsing session
  if (sessionStorage.getItem("dd_preshop_popup_shown")) return;
  if (localStorage.getItem("dd_subscribed")) return;

  // Do not interrupt active modals (product view, checkout, auth)
  if (document.getElementById("product-modal")?.classList.contains("open")) return;
  if (document.getElementById("checkout-modal")?.classList.contains("open")) return;
  if (document.getElementById("auth-modal")?.classList.contains("open")) return;

  openNewsletterModal("preshop");
}

function openNewsletterModal(type = "preshop") {
  currentNlModalType = type;
  const modal = document.getElementById("newsletter-modal");
  if (!modal) return;

  const badge = document.getElementById("nl-modal-badge");
  const title = document.getElementById("nl-modal-title");
  const desc = document.getElementById("nl-modal-desc");
  const btn = document.getElementById("nl-modal-btn");
  const emailInput = document.getElementById("nl-modal-email");

  if (type === "postshop") {
    if (badge) badge.textContent = "STAY IN STYLE";
    if (title) title.textContent = "Thank You for Shopping!";
    if (desc) desc.textContent = "Get exclusive access to new collections, private drops and styling tips from our Dakar Dapper team.";
    if (btn) btn.textContent = "SUBSCRIBE";
    if (emailInput && userEmailFromCheckout) {
      emailInput.value = userEmailFromCheckout;
    }
  } else {
    if (badge) badge.textContent = "STAY IN STYLE";
    if (title) title.textContent = "Be the First to Know";
    if (desc) desc.textContent = "Get exclusive access to new collections, private sales and styling tips from our team.";
    if (btn) btn.textContent = "SUBSCRIBE";
    if (emailInput) emailInput.value = "";
  }

  modal.classList.add("open");
  document.body.classList.add("no-scroll");

  if (type === "preshop") {
    sessionStorage.setItem("dd_preshop_popup_shown", "true");
  }
}

function closeNewsletterModal() {
  const modal = document.getElementById("newsletter-modal");
  if (modal) modal.classList.remove("open");
  document.body.classList.remove("no-scroll");
  if (currentNlModalType === "preshop") {
    sessionStorage.setItem("dd_preshop_popup_shown", "true");
  }
}

async function handleModalNewsletter(e) {
  if (e && e.preventDefault) e.preventDefault();
  const emailInput = document.getElementById("nl-modal-email");
  const btn = document.getElementById("nl-modal-btn");
  const email = emailInput ? emailInput.value.trim() : "";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    showToast("Please enter a valid email address.");
    if (emailInput) emailInput.focus();
    return false;
  }

  if (btn) { btn.disabled = true; btn.textContent = "SUBSCRIBING…"; }
  const ok = await dbAddSubscriber(email, currentNlModalType || "popup");
  if (btn) { btn.disabled = false; btn.textContent = "SUBSCRIBE"; }

  if (!ok) { showToast("Could not subscribe right now. Please try again."); return false; }

  localStorage.setItem("dd_subscribed", "true");
  sessionStorage.setItem("dd_preshop_popup_shown", "true");
  showToast("Welcome to the Dakar Dapper family 💌");
  closeNewsletterModal();
  if (emailInput) emailInput.value = "";
  return false;
}

// Global test hook for developer and UI verification
window.testNewsletterModal = openNewsletterModal;

/* ── TOAST ──────────────────────────────────────────────────────────── */
function showToast(msg) {
  const box = document.getElementById("toast-box");
  if (!box) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span class="toast-icon">✦</span>${msg}`;
  box.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ── SCROLL ────────────────────────────────────────────────────────── */
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth" });
  closeAllDrawers();
}

/* ── LOGO SCROLL TO TOP ───────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  const logoLink = document.getElementById("logo-link");
  if (logoLink) {
    logoLink.addEventListener("click", e => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
});

/* ── DYNAMIC CATEGORY FILTERS ──────────────────────────────────────── */

/* ── CMS PAGE CONTENT HYDRATION ────────────────────────────────────── */
function hydratePageContent() {
  if (typeof SITE_CONTENT === "undefined") return;
  const c = SITE_CONTENT;

  // Hero badge
  const heroBadge = document.querySelector(".hero-badge");
  if (heroBadge && c.heroBadge) heroBadge.textContent = c.heroBadge;

  // Hero Title (preserve italic or HTML if provided)
  const heroTitle = document.querySelector(".hero-title");
  if (heroTitle && c.heroTitle) heroTitle.innerHTML = safeRichText(c.heroTitle);

  // Hero Description
  const heroDesc = document.querySelector(".hero-desc");
  if (heroDesc && c.heroDesc) heroDesc.textContent = c.heroDesc;

  // Hero Buttons
  const heroBtns = document.querySelectorAll(".hero-btns .btn");
  if (heroBtns.length >= 1 && c.heroBtn1Text) heroBtns[0].textContent = c.heroBtn1Text;
  if (heroBtns.length >= 2 && c.heroBtn2Text) heroBtns[1].textContent = c.heroBtn2Text;

  // Editorial Story
  const kicker = document.querySelector(".editorial-kicker");
  if (kicker && c.storyKicker) kicker.textContent = c.storyKicker;

  const storyTitle = document.querySelector(".editorial-title");
  if (storyTitle && c.storyTitle) storyTitle.innerHTML = safeRichText(c.storyTitle);

  const storyDesc = document.querySelector(".editorial-desc");
  if (storyDesc && c.storyDesc) storyDesc.textContent = c.storyDesc;

  // Top Notice Bar (if present)
  const notice = document.querySelector(".top-notice-bar");
  if (notice && c.bannerNotice) notice.textContent = c.bannerNotice;

  // Footer year — never let a stale copyright ship
  const yearEl = document.getElementById("footer-year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Email link(s): shown only once an address is set in the admin
  const email = String(c.emailAddress || "").trim();
  document.querySelectorAll('[data-social="email"]').forEach(a => {
    if (email) {
      a.href = "mailto:" + email;
      if (!a.textContent.trim()) a.textContent = email;
      a.style.display = "";
    } else {
      a.style.display = "none";
    }
  });
  document.querySelectorAll('[data-contact-row="email"]').forEach(li => { li.hidden = !email; });

  // WhatsApp and phone follow the number set in the admin
  document.querySelectorAll('[data-contact="whatsapp"]').forEach(a => {
    a.href = `https://wa.me/${PHONE}?text=${encodeURIComponent("Hello Dakar Dapper")}`;
  });
  document.querySelectorAll('[data-contact="phone"]').forEach(a => { a.href = "tel:+" + PHONE; });
  document.querySelectorAll('[data-contact-text="phone"]').forEach(el => {
    el.textContent = PHONE_DISPLAY || PHONE;
  });

  renderSocials();

  // Free-shipping copy follows the threshold the owner set
  document.querySelectorAll("[data-free-ship]").forEach(el => {
    el.textContent = "On orders over " + formatPrice(freeShipMin());
  });
}

/* ══════════════════════════════════════════════════════════════════════
   REAL CATEGORIES ONLY
   Everything below is built from the live catalogue. A category with no
   products is not shown to shoppers (it still exists in the admin).
   ══════════════════════════════════════════════════════════════════════ */

function liveCategories() {
  const cats = (typeof CATEGORIES !== "undefined" && Array.isArray(CATEGORIES)) ? CATEGORIES : [];
  return cats.filter(c => PRODUCTS.some(p => p.category === c.id && p.isActive !== false));
}

function renderCategoryFilters() {
  const bar = document.getElementById("filter-bar");
  if (!bar) return;
  const cats = liveCategories();
  bar.innerHTML = `
    <button class="filter-btn${activeFilter === 'all' ? ' active' : ''}" data-filter="all">All</button>
    ${cats.map(c => `<button class="filter-btn${activeFilter === c.id ? ' active' : ''}" data-filter="${esc(c.id)}">${esc(c.name)}</button>`).join("")}
    ${PRODUCTS.some(p => p.isNew) ? `<button class="filter-btn${activeFilter === 'new' ? ' active' : ''}" data-filter="new">New Arrivals</button>` : ""}
  `;
}

/* Homepage "Browse by categories": one card per category that has stock,
   pictured with one of its own products. */
function renderHomeCategories() {
  const grid = document.getElementById("cat-grid");
  if (!grid) return;
  const cats = liveCategories().slice(0, 6);
  const section = grid.closest("section");
  if (section) section.hidden = !cats.length;
  grid.innerHTML = cats.map(c => {
    const items = PRODUCTS.filter(p => p.category === c.id && p.isActive !== false);
    const cover = items.find(p => p.stock > 0 && (p.thumb || p.image)) || items.find(p => p.thumb || p.image);
    return `
      <a href="/shop.html?cat=${encodeURIComponent(c.id)}" class="cat-card" data-cat="${esc(c.id)}">
        ${cover ? productPicture(cover.thumb || cover.image, c.name, "", 600, 750) : ""}
        <div class="cat-card-overlay">
          <h3>${esc(c.name)}</h3>
          <p>${items.length} piece${items.length === 1 ? "" : "s"}</p>
          <span class="btn btn-sm btn-outline-light">Shop ${esc(c.name)} →</span>
        </div>
      </a>`;
  }).join("");
}

/* The story section shows a real piece from the collection. */
function renderEditorialImage() {
  const img = document.getElementById("editorial-img");
  if (!img || !PRODUCTS.length) return;
  const pick = [...PRODUCTS].filter(p => p.isActive !== false && p.image).sort((a, b) => b.id - a.id)[0];
  if (pick) { img.src = assetUrl(pick.image); img.alt = pick.name; }
}

function renderFooterCategories() {
  document.querySelectorAll("[data-footer-cats]").forEach(box => {
    box.innerHTML = liveCategories().slice(0, 5).map(c =>
      `<a href="/shop.html?cat=${encodeURIComponent(c.id)}">${esc(c.name)}</a>`).join("");
  });
}

function renderCatalogChrome() {
  renderCategoryFilters();
  renderHomeCategories();
  renderEditorialImage();
  renderFooterCategories();
  renderSearchPanel();
}

/* ══════════════════════════════════════════════════════════════════════
   PERSONAL HISTORY — search, recently viewed, wishlist
   Kept on the device for guests. For a signed-in customer it is also saved
   to their account (private to them), so it follows them across devices and
   shows in their profile.
   ══════════════════════════════════════════════════════════════════════ */

const LOCAL_SEARCHES = "dd_recent_searches";
const LOCAL_VIEWED = "dd_recently_viewed";

function localList(key) { return readJSON(key, []).filter(Boolean); }
function saveLocalList(key, list) { try { localStorage.setItem(key, JSON.stringify(list)); } catch {} }

function recordSearch(q) {
  const query = String(q || "").trim();
  if (query.length < 2) return;
  const list = localList(LOCAL_SEARCHES).filter(x => x.toLowerCase() !== query.toLowerCase());
  list.unshift(query);
  saveLocalList(LOCAL_SEARCHES, list.slice(0, 12));
  if (currentUser && typeof dbSearchAdd === "function") dbSearchAdd(query);
}

function clearRecentSearches() {
  saveLocalList(LOCAL_SEARCHES, []);
  if (currentUser && typeof dbSearchClear === "function") dbSearchClear();
  renderSearchPanel();
}

function recordViewed(productId) {
  const id = Number(productId);
  if (!id) return;
  const list = localList(LOCAL_VIEWED).filter(x => x !== id);
  list.unshift(id);
  saveLocalList(LOCAL_VIEWED, list.slice(0, 20));
  if (currentUser && typeof dbViewedAdd === "function") dbViewedAdd(id);
}

/* When someone signs in, bring what they did as a guest into their account
   and pull their saved wishlist onto this device. */
async function syncPersonalData() {
  if (!currentUser || typeof dbMyList !== "function") return;
  try {
    const [serverWish] = await Promise.all([dbMyList("dd_wishlist", "created_at")]);
    const serverIds = serverWish.map(w => Number(w.product_id));
    const localOnly = wishlist.filter(id => !serverIds.includes(id));
    await Promise.all(localOnly.map(id => dbWishlistAdd(id)));
    wishlist = [...new Set([...serverIds, ...wishlist])].filter(id => PRODUCTS.length === 0 || PRODUCTS.some(p => p.id === id));
    saveWish();
    renderWishlist();
    if (typeof renderProducts === "function") renderProducts();
    for (const id of localList(LOCAL_VIEWED).slice(0, 10).reverse()) await dbViewedAdd(id);
  } catch (err) {
    console.warn("sync:", err);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   HEADER SEARCH
   Live suggestions as you type, Enter for full results in the shop, and
   recent searches when the box is empty. Works on every page (it used to
   render into a grid that only exists on the homepage).
   ══════════════════════════════════════════════════════════════════════ */

function searchMatches(q) {
  const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const cats = typeof CATEGORIES !== "undefined" ? CATEGORIES : [];
  return PRODUCTS.filter(p => p.isActive !== false).filter(p => {
    const catName = (cats.find(c => c.id === p.category) || {}).name || "";
    const hay = [p.name, p.subtitle, catName, p.badge, ...(p.colorNames || [])].filter(Boolean).join(" ").toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

function goToSearch(q) {
  const query = String(q || "").trim();
  if (!query) return;
  recordSearch(query);
  window.location.href = `/shop.html?q=${encodeURIComponent(query)}`;
}

function renderSearchPanel(query) {
  const tags = document.querySelectorAll("[data-search-tags]");
  if (!tags.length) return;
  const q = String(query ?? (document.getElementById("search-input")?.value || "")).trim();

  let html = "";
  if (q) {
    const hits = searchMatches(q);
    html = hits.length ? `
      <ul class="search-results" role="listbox" aria-label="Matching products">
        ${hits.slice(0, 6).map(p => `
          <li role="option">
            <a class="search-hit" href="${productHref(p)}" data-search-q="${esc(q)}">
              ${productPicture(p.thumb || p.image, "", "", 56, 70)}
              <span class="search-hit-text">
                <strong>${esc(p.name)}</strong>
                <span>${formatPrice(p.price)}${p.stock <= 0 ? " · Sold out" : ""}</span>
              </span>
            </a>
          </li>`).join("")}
      </ul>
      <a class="search-all" href="/shop.html?q=${encodeURIComponent(q)}" data-search-q="${esc(q)}">
        See all ${hits.length} result${hits.length === 1 ? "" : "s"} for “${esc(q)}” →
      </a>`
    : `<p class="search-none">Nothing matches “${esc(q)}”. Try a shorter word, or browse below.</p>`;
  }

  const recent = localList(LOCAL_SEARCHES);
  if (!q && recent.length) {
    html += `
      <div class="search-block">
        <div class="search-block-head">
          <span>Recent searches</span>
          <button type="button" class="search-clear" data-clear-searches>Clear</button>
        </div>
        <div class="search-chips">
          ${recent.slice(0, 8).map(r => `<button type="button" class="search-tag" data-q="${esc(r)}">${esc(r)}</button>`).join("")}
        </div>
      </div>`;
  }

  const cats = liveCategories();
  if (!q && cats.length) {
    html += `
      <div class="search-block">
        <div class="search-block-head"><span>Browse</span></div>
        <div class="search-chips">
          ${cats.map(c => `<a class="search-tag" href="/shop.html?cat=${encodeURIComponent(c.id)}">${esc(c.name)}</a>`).join("")}
          ${PRODUCTS.some(p => p.isNew) ? `<a class="search-tag" href="/shop.html?cat=new">New Arrivals</a>` : ""}
        </div>
      </div>`;
  }

  tags.forEach(t => { t.innerHTML = html; });
}

function bindSearch() {
  const toggle = document.getElementById("search-toggle");
  const overlay = document.getElementById("search-overlay");
  const input = document.getElementById("search-input");
  if (!toggle || !overlay || !input) return;

  input.setAttribute("enterkeyhint", "search");
  input.setAttribute("aria-label", "Search products");

  toggle.addEventListener("click", () => {
    overlay.classList.add("open");
    renderSearchPanel("");
    setTimeout(() => input.focus(), 60);
  });
  document.getElementById("search-close").addEventListener("click", () => {
    overlay.classList.remove("open");
    input.value = "";
  });
  input.addEventListener("input", () => renderSearchPanel(input.value));
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); goToSearch(input.value); }
    if (e.key === "Escape") document.getElementById("search-close").click();
  });

  overlay.addEventListener("click", e => {
    const chip = e.target.closest("button.search-tag[data-q]");
    if (chip) { input.value = chip.dataset.q; renderSearchPanel(chip.dataset.q); input.focus(); return; }
    if (e.target.closest("[data-clear-searches]")) { clearRecentSearches(); return; }
    const link = e.target.closest("[data-search-q]");
    if (link) recordSearch(link.dataset.searchQ);
  });
}
