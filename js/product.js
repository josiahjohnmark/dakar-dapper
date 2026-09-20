/* ==========================================================================
   PRODUCT.JS — the product detail page
   --------------------------------------------------------------------------
   Resolves /product/<slug> (or ?slug= / ?id=), renders the page, and keeps the
   URL, title, share metadata and structured data in step with what is shown.
   ========================================================================== */

let PDP = null;
let pdpImages = [];
let pdpIndex = 0;
let pdpSize = null;
let pdpColor = 0;
let pdpQty = 1;

/* ── Which product? ──────────────────────────────────────────────────── */
function pdpSlugFromUrl() {
  const params = new URLSearchParams(location.search);
  if (params.get("slug")) return { slug: params.get("slug") };
  if (params.get("id")) return { id: Number(params.get("id")) };

  // /product/<slug> — served by the Vercel rewrite
  const m = location.pathname.match(/\/product\/([^/?#]+)/);
  if (m) return { slug: decodeURIComponent(m[1]) };
  return {};
}

function slugFor(p) {
  return p.slug || String(p.name || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function productUrl(p) {
  return `/product/${encodeURIComponent(slugFor(p))}`;
}

/* ── Boot ────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  const ref = pdpSlugFromUrl();

  // Try the catalogue already in memory first so the page paints immediately.
  let found = null;
  if (ref.id) found = PRODUCTS.find(p => p.id === ref.id);
  else if (ref.slug) found = PRODUCTS.find(p => slugFor(p) === ref.slug);

  if (found) renderPdp(found);

  // Then confirm against the database, which is the source of truth for stock.
  const fresh = await loadPdpProduct(ref);
  if (fresh) renderPdp(fresh);
  else if (!found) renderPdpNotFound();
});

async function loadPdpProduct(ref) {
  if (typeof dbFetchProductBySlug === "function" && ref.slug) {
    const p = await dbFetchProductBySlug(ref.slug);
    if (p) return p;
  }
  // Fall back to a full catalogue sync, then match locally.
  if (typeof syncFromSupabase === "function") await syncFromSupabase();
  if (ref.id) return PRODUCTS.find(p => p.id === ref.id) || null;
  if (ref.slug) return PRODUCTS.find(p => slugFor(p) === ref.slug) || null;
  return null;
}

/* ── Render ──────────────────────────────────────────────────────────── */
function renderPdp(p) {
  PDP = p;
  pdpImages = [p.image, ...(p.images || [])].filter(Boolean);
  if (!pdpImages.length) pdpImages = [""];
  pdpIndex = 0;
  pdpQty = 1;
  pdpColor = 0;
  pdpSize = (p.sizes && p.sizes[0]) || null;

  const soldOut = p.isOutOfStock || p.stock <= 0;
  const lowStock = !soldOut && p.stock > 0 && p.stock <= 3;
  const disc = p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
  const hasDisc = p.showDiscount !== false && p.originalPrice && disc > 0;
  const inWish = wishlist.includes(p.id);

  document.getElementById("crumb-name").textContent = p.name;
  const crumbCat = document.getElementById("crumb-cat");
  crumbCat.textContent = categoryName(p.category);
  crumbCat.href = `/shop.html?cat=${encodeURIComponent(p.category)}`;

  document.getElementById("pdp-mount").innerHTML = `
    <div class="pdp-grid">
      <div class="pdp-gallery">
        <div class="pdp-stage">
          ${soldOut ? `<span class="pdp-flag sold">Sold out</span>`
            : lowStock ? `<span class="pdp-flag low">Only ${p.stock} left</span>`
            : p.badge ? `<span class="pdp-flag">${esc(p.badge)}</span>` : ""}
          <button class="pdp-wish${inWish ? " active" : ""}" id="pdp-wish"
                  aria-label="${inWish ? "Remove from" : "Add to"} wishlist" aria-pressed="${inWish}">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="${inWish ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          <div class="pdp-stage-img" id="pdp-stage-img">
            ${productPicture(pdpImages[0], p.name, "pdp-main-img", 900, 1125, true)}
          </div>
          ${pdpImages.length > 1 ? `
            <button class="pdp-nav prev" id="pdp-prev" aria-label="Previous image">‹</button>
            <button class="pdp-nav next" id="pdp-next" aria-label="Next image">›</button>` : ""}
        </div>
        ${pdpImages.length > 1 ? `
          <div class="pdp-thumbs" id="pdp-thumbs" role="tablist" aria-label="Product images">
            ${pdpImages.map((src, i) => `
              <button class="pdp-thumb${i === 0 ? " active" : ""}" data-i="${i}"
                      role="tab" aria-selected="${i === 0}" aria-label="Image ${i + 1}">
                ${productPicture(src, "", "", 120, 150)}
              </button>`).join("")}
          </div>` : ""}
      </div>

      <div class="pdp-info">
        <span class="pdp-cat">${esc(categoryName(p.category))}</span>
        <h1 class="pdp-title serif">${esc(p.name)}</h1>
        ${p.subtitle ? `<p class="pdp-sub">${esc(p.subtitle)}</p>` : ""}

        <div class="pdp-meta">
          <span class="pdp-stars" aria-label="Rated ${esc(p.rating)} out of 5">
            ${"★".repeat(Math.round(p.rating || 5))}<span class="num">${esc(p.rating)}</span>
          </span>
          ${p.reviews > 0 ? `<span class="pdp-reviews">${esc(p.reviews)} reviews</span>` : ""}
          <span class="pdp-stock ${soldOut ? "out" : "in"}">
            ${soldOut ? "✕ Sold out" : lowStock ? `▲ Only ${p.stock} left` : "● In stock"}
          </span>
        </div>

        <div class="pdp-price-row">
          <span class="pdp-price">${formatPrice(p.price)}</span>
          ${hasDisc ? `<span class="pdp-was">${formatPrice(p.originalPrice)}</span>
                       <span class="pdp-off">−${disc}%</span>` : ""}
        </div>

        ${p.description ? `<p class="pdp-desc">${esc(p.description)}</p>` : ""}

        ${(p.colors && p.colors.length > 1) ? `
          <div class="pdp-field">
            <div class="pdp-field-head">
              <span>Colour</span>
              <strong id="pdp-color-name">${esc((p.colorNames || [])[0] || "")}</strong>
            </div>
            <div class="pdp-colors" id="pdp-colors">
              ${p.colors.map((c, i) => `
                <button class="pdp-color${i === 0 ? " active" : ""}" data-i="${i}"
                        aria-label="${esc((p.colorNames || [])[i] || "Colour " + (i + 1))}"
                        aria-pressed="${i === 0}">
                  <span style="background:${escColor(c)}"></span>
                </button>`).join("")}
            </div>
          </div>` : ""}

        ${(p.sizes && p.sizes.length) ? `
          <div class="pdp-field">
            <div class="pdp-field-head">
              <span>Size</span>
              <button class="pdp-size-guide" onclick="openSizeGuide()">Size guide</button>
            </div>
            <div class="pdp-sizes" id="pdp-sizes">
              ${p.sizes.map((s, i) => `
                <button class="pdp-size${i === 0 ? " active" : ""}" data-size="${esc(s)}"
                        aria-pressed="${i === 0}">${esc(s)}</button>`).join("")}
            </div>
          </div>` : ""}

        <div class="pdp-buy">
          <div class="qty qty-lg">
            <button id="pdp-minus" aria-label="Decrease quantity">−</button>
            <span id="pdp-qty">1</span>
            <button id="pdp-plus" aria-label="Increase quantity">+</button>
          </div>
          <button class="btn btn-dark pdp-add" id="pdp-add"${soldOut ? " disabled" : ""}>
            ${soldOut ? "Sold out" : "Add to Bag"}
          </button>
        </div>
        <button class="btn btn-gold buy-full" id="pdp-buy"${soldOut ? " disabled" : ""}>
          ${soldOut ? "Notify me when back" : "Buy it now"}
        </button>

        <button class="pdp-share" id="pdp-share">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4M12 2v13"/></svg>
          Share this piece
        </button>

        <div class="pdp-assure">
          <div><strong>Free delivery</strong><span data-free-ship>On qualifying orders</span></div>
          <div><strong>14-day returns</strong><span>Unworn, tags attached</span></div>
          <div><strong>Nationwide</strong><span>All 36 states + FCT</span></div>
        </div>

        <details class="pdp-acc" open>
          <summary>Details</summary>
          <ul class="pdp-list">
            ${(p.details || []).length
              ? p.details.map(d => `<li>${esc(d)}</li>`).join("")
              : `<li>${esc(p.subtitle || "Premium materials, made to last.")}</li>`}
          </ul>
        </details>
        <details class="pdp-acc">
          <summary>Care</summary>
          <p>${esc(p.care || "Cold machine wash inside out. Do not tumble dry.")}</p>
        </details>
        <details class="pdp-acc">
          <summary>Delivery &amp; returns</summary>
          <p>Delivery is priced by state at checkout — 1–2 working days in Lagos,
             3–7 days nationwide. Returns accepted within 14 days, unworn with tags.
             <a href="/shipping.html">Full policy</a>.</p>
        </details>
      </div>
    </div>`;

  bindPdp();
  updatePdpHead(p);
  renderPdpRelated(p);
  renderBuyBar(p, soldOut);
  if (typeof hydratePageContent === "function") hydratePageContent();
}

function categoryName(id) {
  const c = (typeof CATEGORIES !== "undefined" ? CATEGORIES : []).find(x => x.id === id);
  return c ? c.name : (id || "Shop");
}

/* ── Interaction ─────────────────────────────────────────────────────── */
function bindPdp() {
  const setImage = i => {
    pdpIndex = (i + pdpImages.length) % pdpImages.length;
    document.getElementById("pdp-stage-img").innerHTML =
      productPicture(pdpImages[pdpIndex], PDP.name, "pdp-main-img", 900, 1125, true);
    document.querySelectorAll(".pdp-thumb").forEach((t, n) => {
      t.classList.toggle("active", n === pdpIndex);
      t.setAttribute("aria-selected", String(n === pdpIndex));
    });
  };

  document.querySelectorAll(".pdp-thumb").forEach(t =>
    t.addEventListener("click", () => setImage(Number(t.dataset.i))));
  document.getElementById("pdp-prev")?.addEventListener("click", () => setImage(pdpIndex - 1));
  document.getElementById("pdp-next")?.addEventListener("click", () => setImage(pdpIndex + 1));

  // Swipe between images on touch devices
  const stage = document.querySelector(".pdp-stage");
  if (stage && pdpImages.length > 1) {
    let x0 = null;
    stage.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener("touchend", e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 45) setImage(pdpIndex + (dx < 0 ? 1 : -1));
      x0 = null;
    }, { passive: true });
  }

  document.querySelectorAll(".pdp-color").forEach(btn =>
    btn.addEventListener("click", () => {
      pdpColor = Number(btn.dataset.i);
      document.querySelectorAll(".pdp-color").forEach((b, i) => {
        b.classList.toggle("active", i === pdpColor);
        b.setAttribute("aria-pressed", String(i === pdpColor));
      });
      const label = document.getElementById("pdp-color-name");
      if (label) label.textContent = (PDP.colorNames || [])[pdpColor] || "";
    }));

  document.querySelectorAll(".pdp-size").forEach(btn =>
    btn.addEventListener("click", () => {
      pdpSize = btn.dataset.size;
      document.querySelectorAll(".pdp-size").forEach(b => {
        const on = b.dataset.size === pdpSize;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      updateBuyBarMeta();
    }));

  const qtyEl = document.getElementById("pdp-qty");
  const maxQty = () => Math.max(1, Math.min(20, PDP.stock || 1));
  document.getElementById("pdp-minus")?.addEventListener("click", () => {
    pdpQty = Math.max(1, pdpQty - 1); qtyEl.textContent = pdpQty; updateBuyBarMeta();
  });
  document.getElementById("pdp-plus")?.addEventListener("click", () => {
    if (pdpQty >= maxQty()) return showToast(`Only ${PDP.stock} in stock`);
    pdpQty += 1; qtyEl.textContent = pdpQty; updateBuyBarMeta();
  });

  document.getElementById("pdp-add")?.addEventListener("click", () => pdpAddToCart(false));
  document.getElementById("pdp-buy")?.addEventListener("click", () => pdpAddToCart(true));

  document.getElementById("pdp-wish")?.addEventListener("click", () => {
    toggleWish(PDP.id);
    const btn = document.getElementById("pdp-wish");
    const on = wishlist.includes(PDP.id);
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.querySelector("svg").setAttribute("fill", on ? "currentColor" : "none");
  });

  document.getElementById("pdp-share")?.addEventListener("click", sharePdp);
}

function pdpAddToCart(thenCheckout) {
  if (PDP.isOutOfStock || PDP.stock <= 0) return showToast("This piece is sold out.");
  addToCart(PDP.id, pdpSize, (PDP.colorNames || [])[pdpColor], pdpQty);
  if (thenCheckout) { closeAllDrawers(); openCheckout(); }
  else openDrawer("cart-drawer");
}

async function sharePdp() {
  const url = location.origin + productUrl(PDP);
  const shareData = {
    title: PDP.name,
    text: `${PDP.name} — ${formatPrice(PDP.price)} at Dakar Dapper`,
    url
  };
  if (navigator.share) {
    try { await navigator.share(shareData); return; } catch { /* dismissed */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast("Link copied — paste it anywhere");
  } catch {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareData.text + " " + url)}`, "_blank");
  }
}

/* ── Sticky buy bar (mobile) ─────────────────────────────────────────── */
function renderBuyBar(p, soldOut) {
  const bar = document.getElementById("buy-bar");
  bar.hidden = false;
  document.getElementById("buy-bar-price").textContent = formatPrice(p.price);
  updateBuyBarMeta();

  const btn = document.getElementById("buy-bar-btn");
  btn.textContent = soldOut ? "Sold out" : "Add to Bag";
  btn.disabled = soldOut;
  btn.onclick = () => pdpAddToCart(false);

  // Only show it once the main button has scrolled away.
  const addBtn = document.getElementById("pdp-add");
  if (addBtn && "IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => {
      bar.classList.toggle("show", !e.isIntersecting);
    }, { rootMargin: "-80px 0px 0px 0px" }).observe(addBtn);
  }
}

function updateBuyBarMeta() {
  const el = document.getElementById("buy-bar-meta");
  if (el) el.textContent = [pdpSize, pdpQty > 1 ? `×${pdpQty}` : ""].filter(Boolean).join(" · ");
}

/* ── Head: title, share cards, structured data ───────────────────────── */
function updatePdpHead(p) {
  const url = location.origin + productUrl(p);
  const img = /^https?:/i.test(p.image || "") ? p.image : location.origin + assetUrl(p.image);
  const desc = (p.description || p.subtitle || "Premium menswear from Dakar Dapper.").slice(0, 200);

  document.title = `${p.name} — Dakar Dapper`;

  const meta = (sel, val) => {
    const el = document.querySelector(sel);
    if (el) el.setAttribute("content", val);
  };
  meta('meta[name="description"]', desc);
  meta('meta[property="og:title"]', p.name);
  meta('meta[property="og:description"]', desc);
  meta('meta[property="og:image"]', img);
  meta('meta[name="twitter:title"]', p.name);
  meta('meta[name="twitter:description"]', desc);

  let ogUrl = document.querySelector('meta[property="og:url"]');
  if (!ogUrl) {
    ogUrl = document.createElement("meta");
    ogUrl.setAttribute("property", "og:url");
    document.head.appendChild(ogUrl);
  }
  ogUrl.setAttribute("content", url);

  let canon = document.querySelector('link[rel="canonical"]');
  if (!canon) {
    canon = document.createElement("link");
    canon.rel = "canonical";
    document.head.appendChild(canon);
  }
  canon.href = url;

  // Keep the address bar on the clean URL even when reached via ?slug=
  if (location.pathname !== productUrl(p)) {
    history.replaceState({}, "", productUrl(p));
  }

  document.getElementById("pdp-schema").textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: desc,
    image: [img],
    sku: String(p.id),
    category: categoryName(p.category),
    brand: { "@type": "Brand", name: "Dakar Dapper" },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "NGN",
      price: String(p.price),
      availability: (p.isOutOfStock || p.stock <= 0)
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
      seller: { "@type": "Organization", name: "Dakar Dapper" }
    }
  });
}

/* ── Related ─────────────────────────────────────────────────────────── */
function renderPdpRelated(p) {
  const pool = PRODUCTS.filter(x => x.id !== p.id);
  const sameCat = pool.filter(x => x.category === p.category);
  const items = (sameCat.length >= 4 ? sameCat : [...sameCat, ...pool.filter(x => x.category !== p.category)])
    .slice(0, 4);

  const section = document.getElementById("pdp-related");
  if (!items.length) { section.hidden = true; return; }
  section.hidden = false;
  document.getElementById("related-grid").innerHTML = items.map(productCardHtml).join("");
}

/* ── Not found ───────────────────────────────────────────────────────── */
function renderPdpNotFound() {
  document.getElementById("crumb-name").textContent = "Not found";
  document.getElementById("pdp-mount").innerHTML = `
    <div class="empty-state" style="padding:60px 20px">
      <h3>This piece is no longer available</h3>
      <p>It may have sold out or been retired from the collection.</p>
      <a class="btn btn-dark" href="/shop.html" style="margin-top:14px;display:inline-flex">Browse the shop</a>
    </div>`;
  document.getElementById("buy-bar").hidden = true;
}
