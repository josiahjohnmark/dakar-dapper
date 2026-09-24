/* ==========================================================================
   PRODUCTS CATALOG — Dakar Dapper
   Curated Luxury Streetwear, Men's Fashion & Accessories
   ========================================================================== */

// Nothing is bundled: the catalogue, categories and homepage words all come
// from the database. Until it answers, grids show a loading shimmer and the
// homepage keeps the wording written into the HTML, so no placeholder or
// demo content ever flashes up on the live site.
const DEFAULT_PRODUCTS = [];
const DEFAULT_CATEGORIES = [];
const DEFAULT_CONTENT = {
  phone: "2349019603621",
  phoneDisplay: "09019603621",
  freeShipMin: 150000,
  popupDelaySec: 30
};

// Cached copies from before launch may hold demo data; new keys ignore them.
const CACHE_KEYS = { products: "dd_products_v2", categories: "dd_categories_v2", content: "dd_content_v2" };
try {
  ["dd_products_data", "dd_categories_data", "dd_site_content"].forEach(k => localStorage.removeItem(k));
} catch {}

// ── STORAGE ACCESSORS ───────────────────────────────────────────────
/* The bundled products and older cached copies carry made-up ratings.
   Ratings only come from approved reviews in the database. */
function withoutInventedRating(p) {
  return (p && p.reviewsVerified) ? p : { ...p, rating: null, reviews: 0 };
}

function getStoredProducts() {
  try {
    const raw = localStorage.getItem(CACHE_KEYS.products);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed.map(withoutInventedRating);
    }
  } catch (e) {
    console.error("Error reading stored products:", e);
  }
  return DEFAULT_PRODUCTS.map(withoutInventedRating).map(p => ({
    ...p,
    stock: p.stock !== undefined ? p.stock : 10,
    showDiscount: p.showDiscount !== undefined ? p.showDiscount : true,
    isOutOfStock: p.isOutOfStock !== undefined ? p.isOutOfStock : false
  }));
}

function saveStoredProducts(products) {
  try {
    localStorage.setItem(CACHE_KEYS.products, JSON.stringify(products));
    PRODUCTS = products;
  } catch (e) {
    console.error("Error saving products:", e);
  }
}

function getStoredCategories() {
  try {
    const raw = localStorage.getItem(CACHE_KEYS.categories);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (e) {}
  return [...DEFAULT_CATEGORIES];
}

function saveStoredCategories(cats) {
  try {
    localStorage.setItem(CACHE_KEYS.categories, JSON.stringify(cats));
    CATEGORIES = cats;
  } catch (e) {}
}

function getStoredContent() {
  try {
    const raw = localStorage.getItem(CACHE_KEYS.content);
    if (raw) {
      return { ...DEFAULT_CONTENT, ...JSON.parse(raw) };
    }
  } catch (e) {}
  return { ...DEFAULT_CONTENT };
}

function saveStoredContent(content) {
  try {
    localStorage.setItem(CACHE_KEYS.content, JSON.stringify(content));
    SITE_CONTENT = content;
    PHONE = content.phone || "2349019603621";
    PHONE_DISPLAY = content.phoneDisplay || "09019603621";
    if (typeof dbSaveContent === "function") {
      dbSaveContent(content);
    }
  } catch (e) {}
}

// ── CLOUD DATABASE SYNC ─────────────────────────────────────────────
// The database is the single source of truth. The bundled DEFAULT_PRODUCTS
// exist only as a first-paint placeholder and an offline fallback; once the
// cloud answers, whatever it says wins — including deletions.
let cloudSynced = false;

async function syncFromSupabase() {
  if (typeof dbReady === "function" && !dbReady()) return;
  try {
    const [cloudCats, cloudProducts, cloudContent, rates] = await Promise.all([
      typeof dbFetchCategories === "function" ? dbFetchCategories() : null,
      typeof dbFetchProducts === "function" ? dbFetchProducts() : null,
      typeof dbFetchContent === "function" ? dbFetchContent() : null,
      typeof dbFetchShippingRates === "function" ? dbFetchShippingRates() : []
    ]);

    // null means the request failed — keep the cache. An empty array is a
    // real answer ("the shop has nothing"), so we honour it.
    if (cloudCats !== null) {
      CATEGORIES = cloudCats;
      localStorage.setItem(CACHE_KEYS.categories, JSON.stringify(cloudCats));
    }

    if (cloudProducts !== null) {
      PRODUCTS = cloudProducts.filter(p => p.isActive !== false);
      localStorage.setItem(CACHE_KEYS.products, JSON.stringify(PRODUCTS));
      cloudSynced = true;
    }

    if (cloudContent) {
      SITE_CONTENT = { ...DEFAULT_CONTENT, ...cloudContent };
      PHONE = SITE_CONTENT.phone || "2349019603621";
      PHONE_DISPLAY = SITE_CONTENT.phoneDisplay || "09019603621";
      localStorage.setItem(CACHE_KEYS.content, JSON.stringify(SITE_CONTENT));
    }

    if (Array.isArray(rates) && rates.length && typeof shippingRates !== "undefined") {
      shippingRates = rates;
    }

    if (typeof hydratePageContent === "function") hydratePageContent();
    if (typeof renderCatalogChrome === "function") renderCatalogChrome();
    if (typeof renderProducts === "function") renderProducts();
    if (typeof renderShop === "function") renderShop();
    if (typeof renderCart === "function") renderCart();
    document.body.classList.add("catalog-ready");
  } catch (err) {
    console.warn("Dakar Dapper: showing cached catalogue.", err);
    document.body.classList.add("catalog-ready");
  }
}

// Keep every open storefront current when the owner edits from the admin.
function startRealtimeCatalog() {
  if (typeof dbSubscribeToCatalog !== "function") return;
  let pending = null;
  dbSubscribeToCatalog(() => {
    clearTimeout(pending);
    pending = setTimeout(syncFromSupabase, 400); // coalesce bursts of edits
  });
}

// ── ACTIVE APPLICATION STATE ─────────────────────────────────────────
let PRODUCTS = getStoredProducts();
let CATEGORIES = getStoredCategories();
let SITE_CONTENT = getStoredContent();
let PHONE = SITE_CONTENT.phone || "2349019603621";
let PHONE_DISPLAY = SITE_CONTENT.phoneDisplay || "09019603621";

function formatPrice(n) {
  return "₦" + Number(n || 0).toLocaleString("en-NG");
}

