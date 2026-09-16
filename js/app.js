/* ==========================================================================
   APP.JS — Dakar Dapper Main Application
   ========================================================================== */

/* ── STATE ─────────────────────────────────────────────────────────── */
let cart = JSON.parse(localStorage.getItem("dd_cart") || "[]");
let wishlist = JSON.parse(localStorage.getItem("dd_wish") || "[]");
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

  grid.innerHTML = items.map(p => {
    const disc = p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
    const inWish = wishlist.includes(p.id);
    return `
    <div class="p-card" data-id="${p.id}" onclick="openProduct(${p.id})">
      <div class="p-card-media">
        ${p.badge ? `<div class="p-badge"><span class="${p.badgeType}">${p.badge}</span></div>` : ""}
        <button class="heart-btn${inWish ? " active" : ""}" onclick="event.stopPropagation();toggleWish(${p.id})" aria-label="Wishlist">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${inWish ? '#fff' : 'none'}" stroke="${inWish ? '#fff' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <img class="img-main" src="${p.image}" alt="${p.name}" loading="lazy">
        <div class="p-actions">
          <button class="p-action-btn view" onclick="event.stopPropagation();openProduct(${p.id})">Quick View</button>
          <button class="p-action-btn add" onclick="event.stopPropagation();addToCart(${p.id})">+ Bag</button>
        </div>
      </div>
      <div class="p-info">
        <div class="p-info-top">
          <span class="p-cat">${p.category}</span>
          <span class="p-rating">★ ${p.rating}</span>
        </div>
        <h3 class="p-name">${p.name}</h3>
        <p class="p-sub">${p.subtitle}</p>
        <div class="p-colors">${p.colors.slice(0, 3).map(c => `<span class="p-swatch" style="background:${c}"></span>`).join("")}</div>
        <div class="p-prices">
          <span class="p-price">${formatPrice(p.price)}</span>
          ${p.originalPrice ? `<span class="p-orig">${formatPrice(p.originalPrice)}</span><span class="p-disc">-${disc}%</span>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

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
  const s = size || p.sizes[0];
  const c = color || p.colorNames[0];
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

  let total = 0;
  container.innerHTML = cart.map((item, i) => {
    const p = PRODUCTS.find(x => x.id === item.id);
    const lineTotal = p.price * item.qty;
    total += lineTotal;
    return `
    <div class="cart-item">
      <div class="cart-item-img"><img src="${p.image}" alt="${p.name}"></div>
      <div class="cart-item-body">
        <div class="cart-item-top"><span class="cat">${p.category}</span><button class="cart-item-del" onclick="removeFromCart(${i})">✕</button></div>
        <h4>${p.name}</h4>
        <span class="cart-item-meta">${item.size} · ${item.color}</span>
        <div class="cart-item-bot">
          <div class="qty"><button onclick="updateQty(${i},-1)">−</button><span>${item.qty}</span><button onclick="updateQty(${i},1)">+</button></div>
          <span class="cart-item-price">${formatPrice(lineTotal)}</span>
        </div>
      </div>
    </div>`;
  }).join("");

  footer.style.display = "block";
  document.getElementById("cart-total").textContent = formatPrice(total);

  // Shipping meter
  const thresh = 150000;
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
  const p = PRODUCTS.find(x => x.id === id);
  if (i < 0) showToast(`${p.name} saved to wishlist`);
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
    return `
    <div class="wish-item">
      <div class="wish-item-img" onclick="closeAllDrawers();openProduct(${p.id})"><img src="${p.image}" alt="${p.name}"></div>
      <div class="wish-item-info">
        <h4 onclick="closeAllDrawers();openProduct(${p.id})">${p.name}</h4>
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
  currentModal = p;
  galleryIndex = 0;
  hasViewedCollections = true;

  // Gallery
  document.getElementById("modal-img").src = p.image;
  document.getElementById("modal-thumbs").innerHTML = `<div class="modal-thumb active" onclick="setGallery(0)"><img src="${p.image}" alt=""></div>`;

  // Info
  const disc = p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
  const inWish = wishlist.includes(p.id);
  const starsStr = "★".repeat(Math.floor(p.rating)) + (p.rating % 1 >= .5 ? "½" : "");

  document.getElementById("modal-info").innerHTML = `
    <div class="modal-tags">
      <span class="t-light">${p.category}</span>
      ${p.badge ? `<span class="t-dark">${p.badge}</span>` : ""}
    </div>
    <h2 class="modal-title">${p.name}</h2>
    <p class="modal-subtitle">${p.subtitle}</p>
    <div class="modal-stars">
      <span class="stars">${starsStr}</span>
      <span>${p.rating} (${p.reviews} reviews)</span>
      <span class="in-stock">• In Stock</span>
    </div>
    <div class="modal-price-row">
      <span class="modal-price">${formatPrice(p.price)}</span>
      ${p.originalPrice ? `<span class="modal-strike">${formatPrice(p.originalPrice)}</span><span class="p-disc">-${disc}%</span>` : ""}
    </div>
    <p class="modal-desc">${p.description}</p>
    <div class="select-group">
      <div class="select-label">Color — <span id="sel-color-name">${p.colorNames[0]}</span></div>
      <div class="color-opts">${p.colors.map((c, i) => `<div class="color-opt${i === 0 ? ' active' : ''}" onclick="selectColor(this,${i})" data-index="${i}"><span class="color-dot" style="background:${c}"></span></div>`).join("")}</div>
    </div>
    <div class="select-group">
      <div class="select-label">Size <button class="size-guide-btn" onclick="openSizeGuide()">📏 Size Guide</button></div>
      <div class="size-opts">${p.sizes.map((s, i) => `<button class="size-opt${i === 0 ? ' active' : ''}" onclick="selectSize(this)">${s}</button>`).join("")}</div>
    </div>
    <div class="modal-actions">
      <div class="qty qty-lg"><button onclick="modalQty(-1)">−</button><span id="modal-qty">1</span><button onclick="modalQty(1)">+</button></div>
      <button class="btn btn-dark" onclick="addModalToCart()">Add to Bag</button>
      <button class="wish-circle${inWish ? ' active' : ''}" onclick="toggleWish(${p.id});refreshModalWish(${p.id})">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${inWish ? '#fff' : 'none'}" stroke="${inWish ? '#fff' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </button>
    </div>
    <button class="btn btn-gold buy-full" onclick="addModalToCart();closeModal();openDrawer('cart-drawer')">Buy Now</button>
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
      <ul class="detail-list">${p.details.map(d => `<li><span class="check">✓</span>${d}</li>`).join("")}</ul>
    </div>
    <div class="tab-pane" id="tab-care"><p style="font-size:.9rem;color:var(--text-sub);line-height:1.6">${p.care}</p></div>
    <div class="tab-pane" id="tab-shipping"><p style="font-size:.9rem;color:var(--text-sub);line-height:1.6">Free standard shipping on orders over ₦150,000. Standard delivery takes 3-5 business days within Lagos and 5-7 days nationwide. Express delivery available at checkout. All orders are tracked and insured.</p></div>
  `;

  // Related
  const related = PRODUCTS.filter(x => x.id !== p.id && x.category === p.category).slice(0, 3);
  if (related.length) {
    document.getElementById("related-section").innerHTML = `
      <h3>You May Also Like</h3>
      <div class="related-grid">${related.map(r => `
        <div class="related-item" onclick="openProduct(${r.id})">
          <div class="related-img"><img src="${r.image}" alt="${r.name}"></div>
          <div><h4>${r.name}</h4><span class="price">${formatPrice(r.price)}</span></div>
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

function openSizeGuide() { document.getElementById("size-modal").classList.add("open"); }
function closeSizeGuide() { document.getElementById("size-modal").classList.remove("open"); }

/* ── CHECKOUT ──────────────────────────────────────────────────────── */
function openCheckout() {
  closeAllDrawers();
  const total = cart.reduce((s, item) => {
    const p = PRODUCTS.find(x => x.id === item.id);
    return s + p.price * item.qty;
  }, 0);
  document.getElementById("checkout-total").textContent = formatPrice(total);
  document.getElementById("checkout-content").querySelector(".form-grid").style.display = "flex";
  const orderDone = document.querySelector(".order-done");
  if (orderDone) orderDone.remove();
  document.getElementById("checkout-modal").classList.add("open");
  document.body.classList.add("no-scroll");
}

function closeCheckout() {
  const wasOrderDone = document.querySelector(".order-done");
  document.getElementById("checkout-modal").classList.remove("open");
  document.body.classList.remove("no-scroll");
  if (wasOrderDone) {
    cart = [];
    saveCart();
    renderCart();
    setTimeout(() => {
      openNewsletterModal("postshop");
    }, 450);
  }
}

function placeOrder() {
  const emailField = document.querySelector("#checkout-content input[type='email']");
  if (emailField && emailField.value) {
    userEmailFromCheckout = emailField.value.trim();
  }

  const card = document.getElementById("checkout-content");
  card.innerHTML = `
    <div class="order-done">
      <div class="check-circle">✓</div>
      <h2 style="font-family:var(--font-serif);font-size:1.6rem;margin-bottom:8px">Order Confirmed!</h2>
      <p style="color:var(--text-sub);margin-bottom:20px">Thank you for shopping with Dakar Dapper. We'll send you a confirmation email and WhatsApp message shortly.</p>
      <button class="btn btn-dark" onclick="handleOrderDoneContinue()">Continue Shopping</button>
    </div>`;
  showToast("Order placed successfully! 🎉");
}

function handleOrderDoneContinue() {
  closeCheckout();
  cart = [];
  saveCart();
  renderCart();
  setTimeout(() => {
    openNewsletterModal("postshop");
  }, 450);
}

/* ── AUTH MODAL ─────────────────────────────────────────────────────── */
function bindAuth() {
  const authToggle = document.getElementById("auth-toggle");
  if (authToggle) {
    authToggle.addEventListener("click", openAuth);
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
  if (signinForm) {
    signinForm.addEventListener("submit", e => {
      e.preventDefault();
      showToast("Welcome back! 👋");
      closeAuth();
    });
  }
  const signupForm = document.getElementById("signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", e => {
      e.preventDefault();
      showToast("Account created successfully! 🎉");
      closeAuth();
    });
  }
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
function bindSearch() {
  const searchToggle = document.getElementById("search-toggle");
  if (!searchToggle) return;
  searchToggle.addEventListener("click", () => {
    document.getElementById("search-overlay").classList.add("open");
    document.getElementById("search-input").focus();
  });
  document.getElementById("search-close").addEventListener("click", () => {
    document.getElementById("search-overlay").classList.remove("open");
    document.getElementById("search-input").value = "";
    renderProducts();
  });
  document.getElementById("search-input").addEventListener("input", e => {
    renderProducts("all", e.target.value);
  });
  document.querySelectorAll(".search-tag").forEach(tag => {
    tag.addEventListener("click", () => {
      document.getElementById("search-input").value = tag.dataset.q;
      renderProducts("all", tag.dataset.q);
    });
  });
}

/* ── WHATSAPP ──────────────────────────────────────────────────────── */
function bindWhatsApp() {
  const btn = document.getElementById("wa-btn");
  const popup = document.getElementById("wa-popup");
  const close = document.getElementById("wa-close");
  if (!btn || !popup) return;

  btn.addEventListener("click", () => {
    waOpen = !waOpen;
    popup.classList.toggle("open", waOpen);
  });
  if (close) {
    close.addEventListener("click", () => {
      waOpen = false;
      popup.classList.remove("open");
    });
  }
  // Chips
  document.querySelectorAll(".wa-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const msg = chip.dataset.msg;
      window.open(`https://wa.me/${PHONE}?text=${encodeURIComponent(msg)}`, "_blank");
    });
  });
  // Send
  const waSend = document.getElementById("wa-send");
  if (waSend) waSend.addEventListener("click", sendWaMsg);
  const waMsg = document.getElementById("wa-msg");
  if (waMsg) {
    waMsg.addEventListener("keypress", e => {
      if (e.key === "Enter") sendWaMsg();
    });
  }
}

function sendWaMsg() {
  const input = document.getElementById("wa-msg");
  const msg = input.value.trim();
  if (!msg) return;
  window.open(`https://wa.me/${PHONE}?text=${encodeURIComponent(msg)}`, "_blank");
  input.value = "";
}

/* ── NEWSLETTER (FOOTER & VIP MODAL) ──────────────────────────────── */
function handleNewsletter(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.querySelector("input").value;
  if (email) {
    localStorage.setItem("dd_subscribed", "true");
    sessionStorage.setItem("dd_preshop_popup_shown", "true");
    showToast("Welcome to the Dakar Dapper family! 💌");
    form.reset();
  }
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

  // 2. Browsing timer: popup appears after user has worked through website (~1 min / 60s)
  setTimeout(() => {
    preShopTimerPassed = true;
    checkPreShopPopup();
  }, 60000);
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
  const perk = document.getElementById("nl-modal-perk");
  const btn = document.getElementById("nl-modal-btn");
  const dismiss = document.getElementById("nl-modal-dismiss");
  const emailInput = document.getElementById("nl-modal-email");

  if (type === "postshop") {
    if (badge) badge.textContent = "VIP ACCESS · INNER CIRCLE";
    if (title) title.textContent = "Thank You for Your Order!";
    if (desc) desc.textContent = "You're now eligible for Dakar Dapper VIP Inner Circle membership. Enjoy secret drops, private sales, and an exclusive discount on your next order.";
    if (perk) perk.innerHTML = "<span>👑</span> VIP Perk: Extra 10% Off Next Order";
    if (btn) btn.textContent = "CLAIM VIP MEMBERSHIP";
    if (dismiss) dismiss.textContent = "No thanks, continue browsing";
    if (emailInput && userEmailFromCheckout) {
      emailInput.value = userEmailFromCheckout;
    }
  } else {
    if (badge) badge.textContent = "STAY IN STYLE";
    if (title) title.textContent = "Be the First to Know";
    if (desc) desc.textContent = "Get exclusive access to new streetwear drops, private sales and styling tips from our Dakar Dapper team.";
    if (perk) perk.innerHTML = "<span>✦</span> 10% Off Your First Order";
    if (btn) btn.textContent = "SUBSCRIBE & GET 10% OFF";
    if (dismiss) dismiss.textContent = "No thanks, I'll pay full price";
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

function handleModalNewsletter(e) {
  if (e && e.preventDefault) e.preventDefault();
  const emailInput = document.getElementById("nl-modal-email");
  const email = emailInput ? emailInput.value.trim() : "";
  if (!email) return false;

  localStorage.setItem("dd_subscribed", "true");
  sessionStorage.setItem("dd_preshop_popup_shown", "true");

  if (currentNlModalType === "postshop") {
    showToast("VIP membership activated! Welcome to the Inner Circle 👑");
  } else {
    showToast("Welcome to Dakar Dapper! Check your inbox for code: DAPPER10 🎁");
  }

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
