/* ==========================================================================
   PRODUCTS CATALOG — Dakar Dapper
   Curated Luxury Streetwear, Men's Fashion & Accessories
   ========================================================================== */

const DEFAULT_PRODUCTS = [
  {
    id: 1,
    name: "Metanoia Oversized Heavyweight Tee",
    subtitle: "450GSM Vintage Washed French Cotton",
    category: "wears",
    price: 42000,
    originalPrice: 55000,
    image: "assets/graphic-tee.jpg",
    badge: "Trending",
    badgeType: "tag-gold",
    isNew: true,
    colors: ["#1A1A1A", "#E5E5E5", "#3A3D40"],
    colorNames: ["Washed Noir", "Bone White", "Slate Grey"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    rating: 4.9,
    reviews: 64,
    description: "Ultra-heavyweight 450GSM combed cotton t-shirt with a boxy, dropped-shoulder silhouette. Features custom high-density archival graphic screenprint, distressed ribbed collar, and double-needle stitching built for effortless luxury street styling.",
    details: [
      "450GSM 100% heavyweight combed cotton",
      "Vintage garment-washed finish for soft drape",
      "Boxy streetwear cut with dropped shoulders",
      "Durable high-density screenprint on front and back",
      "Reinforced ribbed collar that never sags",
      "Cold machine wash inside out"
    ],
    care: "Machine wash cold inside-out. Do not tumble dry. Do not iron directly on graphic."
  },
  {
    id: 2,
    name: "Riviera Printed Cuban Silk Shirt",
    subtitle: "Silk-Viscose Blend, Hand-Drawn Motif",
    category: "wears",
    price: 68000,
    originalPrice: 85000,
    image: "assets/cuban-shirt.jpg",
    badge: "New",
    badgeType: "tag-gold",
    isNew: true,
    colors: ["#E8A838", "#2E5B88", "#C45B3E"],
    colorNames: ["Sunlit Ochre", "Azure Coast", "Terracotta"],
    sizes: ["S", "M", "L", "XL"],
    rating: 4.8,
    reviews: 38,
    description: "An homage to tropical coastlines and vibrant lounge culture. Crafted from an ultra-breathable silk-viscose blend with an open camp collar, mother-of-pearl buttons, and hand-painted coastal architectural graphics.",
    details: [
      "70% Viscose, 30% Mulberry Silk",
      "Relaxed camp/Cuban collar with notch lapel",
      "Genuine mother-of-pearl engraved buttons",
      "Straight hem with side seam vents",
      "Ultra-lightweight and breathable for warm climates",
      "Dry clean or hand wash delicate"
    ],
    care: "Dry clean recommended or gentle hand wash in cool water with silk detergent. Hang to dry."
  },
  {
    id: 3,
    name: "Aether Orbit Chunky Luxury Sneakers",
    subtitle: "Calfskin Leather, Vibram Lug Platform Sole",
    category: "footwear",
    price: 145000,
    originalPrice: 175000,
    image: "assets/sneakers.jpg",
    badge: "Hot Drop",
    badgeType: "tag-dark",
    isNew: true,
    colors: ["#111111", "#4ADE80", "#EAE6DF"],
    colorNames: ["Onyx/Neon", "Volt Accent", "Off-White"],
    sizes: ["40", "41", "42", "43", "44", "45"],
    rating: 5.0,
    reviews: 51,
    description: "Next-generation chunky runner handcrafted in Italy. Features panelled Italian calfskin, high-tenacity technical mesh, and an architectural sculpted shock-absorbing rubber lug sole. Engineered for maximum streetwear clout and cloud-like comfort.",
    details: [
      "Full-grain Italian calfskin & breathable technical mesh",
      "Sculpted architectural EVA midsole with rubber lug outsole",
      "Padded memory-foam collar and tongue",
      "Reflective piping and neon precision accents",
      "Includes extra waxed rope laces & signature dust bag",
      "True to size fit"
    ],
    care: "Clean with specialized sneaker foam cleaner and soft brush. Keep away from direct heat."
  },
  {
    id: 4,
    name: "Tactical Parachute Multi-Pocket Cargo",
    subtitle: "Water-Repellent Ripstop, Quick-Release Straps",
    category: "wears",
    price: 78000,
    originalPrice: null,
    image: "assets/cargo-pants.jpg",
    badge: "Bestseller",
    badgeType: "tag-dark",
    isNew: true,
    colors: ["#181818", "#3B4237", "#4A4036"],
    colorNames: ["Black Tactical", "Military Olive", "Earth Umber"],
    sizes: ["28", "30", "32", "34", "36"],
    rating: 4.9,
    reviews: 77,
    description: "The definitive urban utility pant. Engineered from lightweight, durable water-repellent nylon ripstop with eight functional cargo pockets, tactical strap details, matte hardware, and adjustable bungee cuffs that can be tapered or worn wide.",
    details: [
      "Technical water-repellent nylon ripstop",
      "8 functional utility pockets with YKK zip closures",
      "Detachable tactical modular straps with quick-release buckles",
      "Elasticated waistband with metal-tipped drawstring",
      "Adjustable bungee toggle cuffs at ankle",
      "Relaxed articulated knee construction"
    ],
    care: "Machine wash cold on gentle cycle. Do not bleach. Air dry."
  },
  {
    id: 5,
    name: "Solid 925 Silver Iced Cuban Chain (14mm)",
    subtitle: "Hand-Set VVS Simulant Clasp, 50cm Length",
    category: "accessories",
    price: 195000,
    originalPrice: 230000,
    image: "assets/cuban-chain.jpg",
    badge: "Luxury",
    badgeType: "tag-gold",
    isNew: true,
    colors: ["#C0C0C0", "#E5E4E2"],
    colorNames: ["Sterling Silver", "White Gold Plated"],
    sizes: ["One Size"],
    rating: 5.0,
    reviews: 29,
    description: "Heavyweight 14mm Miami Cuban link chain cast in solid 925 sterling silver with a triple-locking box clasp micro-paved with hand-set brilliant-cut lab stones. A bold statement piece designed for artists and tastemakers.",
    details: [
      "Solid 925 Sterling Silver core with rhodium anti-tarnish coating",
      "14mm width, 50cm (20-inch) length",
      "Micro-paved custom box clasp with dual safety latches",
      "Weight: approx. 185 grams of solid silver",
      "Hallmarked 925 for authenticity",
      "Delivered in custom velvet Dakar Dapper presentation box"
    ],
    care: "Store in included velvet pouch. Clean with provided silver polishing cloth. Avoid swimming pools and perfumes."
  },
  {
    id: 6,
    name: "Atelier Wool & Leather Varsity Jacket",
    subtitle: "Heavy Melton Wool, Grained Leather Sleeves",
    category: "wears",
    price: 165000,
    originalPrice: 195000,
    image: "assets/varsity-jacket.jpg",
    badge: "Limited",
    badgeType: "tag-dark",
    isNew: true,
    colors: ["#1B4332", "#111111", "#4A2810"],
    colorNames: ["Forest Green", "Stealth Black", "Vintage Oxblood"],
    sizes: ["M", "L", "XL", "XXL"],
    rating: 4.9,
    reviews: 42,
    description: "Classic high-school nostalgia reimagined as luxury streetwear. Built with heavyweight 24oz Melton wool body, buttery top-grain cowhide leather sleeves, tactile chenille letterman patches, and silky quilted satin thermal lining.",
    details: [
      "24oz Melton wool torso, 100% genuine cowhide leather sleeves",
      "Custom Dakar Dapper chenille crest and embroidery patches",
      "Diamond-quilted satin thermal interior lining",
      "Heavy gauge striped ribbed collar, cuffs, and hem",
      "Enamelled snap button front closure",
      "Two leather-trimmed welt hand pockets and interior chest pocket"
    ],
    care: "Specialist leather and wool dry clean only."
  },
  {
    id: 7,
    name: "Futura Wrap-Around Shield Sunglasses",
    subtitle: "UV400 Polarized, Aerodynamic Rimless Frame",
    category: "accessories",
    price: 55000,
    originalPrice: 70000,
    image: "assets/shield-sunglasses.jpg",
    badge: "Trending",
    badgeType: "tag-gold",
    isNew: true,
    colors: ["#111111", "#3B82F6", "#8B5CF6"],
    colorNames: ["Midnight Black", "Iridescent Blue", "Prism Violet"],
    sizes: ["One Size"],
    rating: 4.7,
    reviews: 63,
    description: "Futuristic wraparound monoshield sunglasses engineered with shatterproof polycarbonate mirrored lenses and flexible matte TR90 temples. Provides 100% UV400 protection while completing any avant-garde youth fit.",
    details: [
      "One-piece toric shield polycarbonate lens",
      "100% UV400 protection with anti-scratch & anti-reflective coating",
      "Ultralight TR90 matte black ergonomic arms",
      "Silicone comfort nose pads with non-slip grip",
      "Comes with protective hard shell case & lens cleaning bag",
      "Unisex fit designed for all face structures"
    ],
    care: "Rinse with lukewarm water and wipe with microfiber pouch."
  },
  {
    id: 8,
    name: "Distressed High-Top Skate Sneaker",
    subtitle: "Hand-Distressed Full Grain Leather, Gum Outsole",
    category: "footwear",
    price: 130000,
    originalPrice: 155000,
    image: "assets/skate-sneakers.jpg",
    badge: "Staff Pick",
    badgeType: "tag-gold",
    isNew: true,
    colors: ["#EBE6DD", "#1A1A1A"],
    colorNames: ["Distressed Chalk", "Black Ink"],
    sizes: ["40", "41", "42", "43", "44", "45"],
    rating: 4.8,
    reviews: 35,
    description: "Artisanal hand-distressed high-top skate shoe channeling retro court aesthetics. Made from premium Italian tumbled leather with deliberate vintage patina, vulcanized gum rubber sole, and padded ankle support.",
    details: [
      "Italian tumbled leather with individual artisanal distressing",
      "Vulcanized gum rubber cupsole for durability and traction",
      "Cushioned leather insole with arch support",
      "Padded collar and reinforced toe bumper",
      "Gold foil Dakar Dapper stamping at heel",
      "Made in Portugal"
    ],
    care: "Wipe with damp cloth. Embrace the natural wear and patina."
  },
  {
    id: 9,
    name: "Charcoal Utility Overshirt",
    subtitle: "Heavyweight Cotton Twill Layering Piece",
    category: "wears",
    price: 72000,
    originalPrice: null,
    image: "assets/overshirt.jpg",
    badge: "Essential",
    badgeType: "tag-gold",
    isNew: false,
    colors: ["#2C2C2C", "#4A5043", "#5C4B3A"],
    colorNames: ["Charcoal", "Olive", "Tobacco"],
    sizes: ["S", "M", "L", "XL"],
    rating: 4.7,
    reviews: 23,
    description: "A versatile utility overshirt in heavyweight cotton twill. Designed with dual chest flap pockets and a relaxed modern fit, perfect as a layering piece over graphic tees or standalone jacket.",
    details: [
      "100% heavyweight cotton twill",
      "Dual flap chest pockets with hidden snaps",
      "Button-front closure with horn buttons",
      "Relaxed fit designed for layering",
      "Interior welt pocket for smartphone",
      "Machine wash cold"
    ],
    care: "Machine wash cold, tumble dry low. Iron on medium heat if needed."
  },
  {
    id: 10,
    name: "Oversized Washed Hoodie",
    subtitle: "Garment-Dyed 450GSM French Terry",
    category: "wears",
    price: 48000,
    originalPrice: 62000,
    image: "assets/hoodie.jpg",
    badge: null,
    badgeType: null,
    isNew: false,
    colors: ["#1C1C1C", "#5B5B5B", "#E8E4DF"],
    colorNames: ["Washed Black", "Storm Grey", "Bone"],
    sizes: ["M", "L", "XL", "XXL"],
    rating: 4.8,
    reviews: 89,
    description: "Premium oversized hoodie in garment-dyed French terry cotton. Features a heavy weight, roomy kangaroo pocket, double-layer hood without drawstrings, and a vintage washed finish for an effortlessly cool aesthetic.",
    details: [
      "450gsm garment-dyed French terry cotton",
      "Oversized relaxed streetwear fit",
      "Kangaroo front pocket with reinforced bar tacks",
      "Clean double-layer hood without drawstrings",
      "Heavy ribbed cuffs and hem",
      "Machine wash cold"
    ],
    care: "Machine wash cold inside-out. Hang dry for best results."
  },
  {
    id: 11,
    name: "Chronograph Rose Gold Watch",
    subtitle: "Automatic Movement, Leather Strap",
    category: "accessories",
    price: 320000,
    originalPrice: null,
    image: "assets/watch.jpg",
    badge: "Limited",
    badgeType: "tag-dark",
    isNew: false,
    colors: ["#8B6914", "#C0C0C0", "#1A1A1A"],
    colorNames: ["Rose Gold", "Silver", "Noir"],
    sizes: ["One Size"],
    rating: 5.0,
    reviews: 12,
    description: "A stunning automatic chronograph timepiece featuring a rose gold case, dark sunray dial with three sub-dials, and a genuine alligator leather strap. Swiss-inspired movement with 42-hour power reserve.",
    details: [
      "Rose gold-plated stainless steel case (42mm)",
      "Genuine textured leather strap with butterfly deployant clasp",
      "Automatic mechanical movement with 42hr reserve",
      "Scratch-resistant sapphire crystal glass",
      "100m water resistance",
      "Serial numbered — limited edition drop"
    ],
    care: "Avoid contact with harsh chemicals. Store in included watch box."
  },
  {
    id: 12,
    name: "Heritage Leather Duffle Bag",
    subtitle: "Full-Grain Vegetable-Tanned Leather",
    category: "accessories",
    price: 245000,
    originalPrice: 280000,
    image: "assets/bag.jpg",
    badge: "Staff Pick",
    badgeType: "tag-gold",
    isNew: false,
    colors: ["#8B4513", "#1A1A1A", "#C4A882"],
    colorNames: ["Cognac", "Black", "Sand"],
    sizes: ["One Size"],
    rating: 4.9,
    reviews: 34,
    description: "A timeless weekend duffle crafted from full-grain vegetable-tanned leather. Features solid brass hardware, detachable shoulder strap, and an interior canvas lining. Designed to develop a rich, personal patina over years of travel.",
    details: [
      "Full-grain vegetable-tanned Italian leather",
      "Solid brass hardware & heavy-duty YKK zippers",
      "Detachable padded leather shoulder strap",
      "Interior canvas lining with zippered laptop compartment",
      "Reinforced bottom with protective brass studs",
      "Dimensions: 50 × 28 × 26 cm (carry-on approved)"
    ],
    care: "Apply leather conditioner every 3-6 months. Avoid prolonged moisture."
  },
  {
    id: 13,
    name: "Pleated Wool Relaxed Trousers",
    subtitle: "Super 120s Italian Wool, Wide Taper",
    category: "wears",
    price: 95000,
    originalPrice: null,
    image: "assets/trousers.jpg",
    badge: null,
    badgeType: null,
    isNew: false,
    colors: ["#2C2C3A", "#1A1A1A", "#4A4A4A"],
    colorNames: ["Charcoal", "Black", "Slate"],
    sizes: ["28", "30", "32", "34", "36"],
    rating: 4.6,
    reviews: 31,
    description: "Contemporary pleated trousers in Super 120s Italian wool. Relaxed through the thigh with a clean taper towards the ankle, combining old-money tailoring with current youth street elegance.",
    details: [
      "Super 120s Italian merino wool",
      "High-rise with double front pleats",
      "Relaxed taper with neat ankle break",
      "Side slash pockets, single back welt pocket",
      "Half-lined to the knee for friction-free movement",
      "Dry clean recommended"
    ],
    care: "Dry clean for best results. Press with steam on wool setting."
  },
  {
    id: 14,
    name: "Tortoiseshell Aviator Sunglasses",
    subtitle: "UV400 Polarized, Acetate Frame",
    category: "accessories",
    price: 65000,
    originalPrice: 78000,
    image: "assets/sunglasses.jpg",
    badge: null,
    badgeType: null,
    isNew: false,
    colors: ["#8B4513", "#1A1A1A"],
    colorNames: ["Tortoiseshell", "Gloss Black"],
    sizes: ["One Size"],
    rating: 4.5,
    reviews: 56,
    description: "Classic aviator sunglasses in premium hand-polished acetate with UV400 polarized lenses. Lightweight yet durable with five-barrel spring hinges for a comfortable fit on any face shape.",
    details: [
      "Hand-polished Italian cellulose acetate frame",
      "UV400 polarized CR-39 lenses",
      "Stainless steel 5-barrel spring hinges",
      "Comes with leather case & microfiber cloth",
      "Lens width: 56mm, Bridge: 18mm, Temple: 145mm"
    ],
    care: "Clean with microfiber cloth. Store in included protective case."
  },
  {
    id: 15,
    name: "Italian Suede Chelsea Boots",
    subtitle: "Blake-Stitched Construction, Pull-Tab",
    category: "footwear",
    price: 155000,
    originalPrice: null,
    image: "assets/boots.jpg",
    badge: null,
    badgeType: null,
    isNew: false,
    colors: ["#A0522D", "#1A1A1A", "#3C3C3C"],
    colorNames: ["Tobacco Suede", "Black Leather", "Dark Grey"],
    sizes: ["40", "41", "42", "43", "44", "45"],
    rating: 4.8,
    reviews: 28,
    description: "Premium Chelsea boots in velvety Italian suede with Blake-stitched construction for a sleek, refined profile. Features flexible elastic side panels, woven pull tab, and a durable rubber-injected leather sole.",
    details: [
      "Italian calf suede upper with water-resistant treatment",
      "Blake-stitched construction",
      "Leather sole with durable rubber traction insert",
      "Elastic side gussets for easy slip-on",
      "Cushioned leather insole with memory foam",
      "Made in Portugal"
    ],
    care: "Apply suede protector spray. Brush regularly with suede brush. Store with shoe trees."
  },
  {
    id: 16,
    name: "Lavender Double-Breasted Blazer",
    subtitle: "Premium Italian Wool Blend, Pearl Buttons",
    category: "wears",
    price: 185000,
    originalPrice: 225000,
    image: "assets/blazer.jpg",
    badge: null,
    badgeType: null,
    isNew: false,
    colors: ["#C8A2C8", "#1A1A2E", "#3C3C3C"],
    colorNames: ["Lavender", "Navy", "Charcoal"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    rating: 4.9,
    reviews: 47,
    description: "Our statement double-breasted jacket crafted from a premium Italian wool blend. Features pearl buttons, peak lapels, and a softly structured shoulder that pairs effortlessly over graphic tees or knitwear for high-end night-out styling.",
    details: [
      "Italian wool blend with light natural stretch",
      "Pearlized contrast buttons",
      "Soft shoulder construction (Neapolitan cut)",
      "Peak lapel, double-breasted closure",
      "Dual interior pockets and double back vents",
      "Dry clean only"
    ],
    care: "Dry clean only. Store on a padded hanger. Steam to remove wrinkles."
  }
];

// ── DEFAULT CATEGORIES ──────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: "wears", name: "Wears" },
  { id: "accessories", name: "Accessories" },
  { id: "footwear", name: "Footwear" }
];

// ── DEFAULT EDITABLE SITE CONTENT ───────────────────────────────────
const DEFAULT_CONTENT = {
  heroBadge: "NEW DROP // SENEGALESE HERITAGE // OVERSIZED FIT",
  heroTitle: "The Art of Dressing Well",
  heroDesc: "We tell you how the best pieces can look and feel. Curated luxury menswear and universally admired dapper silhouettes made in Senegal, Dakar. Located in the Mainland Lagos and delivering beyond borders.",
  heroBtn1Text: "SHOP COLLECTION",
  heroBtn1Link: "shop.html",
  heroBtn2Text: "OUR STORY",
  heroBtn2Link: "#editorial",
  bannerNotice: "✦ FREE EXPRESS DELIVERY ON ORDERS OVER ₦150,000 WITHIN LAGOS ✦",
  storyBadge: "EDITORIAL",
  storyTitle: "Modern Lagos Streetwear, Reimagined",
  storyDesc: "Dakar Dapper was born at the vibrant intersection of West African textile craftsmanship and global contemporary streetwear. Each piece in our limited-batch collections is intentionally engineered for modern tastemakers — combining rich cultural roots, relaxed tailoring, and premium materials designed to age with distinction.",
  quoteText: "“Clothing is the silent introduction to who you are. Dakar Dapper crafts that first impression with uncompromising poise.”",
  quoteAuthor: "Creative Director, Dakar Dapper",
  phone: "2349019603621",
  phoneDisplay: "09019603621",
  popupDelaySec: 30
};

// ── STORAGE ACCESSORS ───────────────────────────────────────────────
/* The bundled products and older cached copies carry made-up ratings.
   Ratings only come from approved reviews in the database. */
function withoutInventedRating(p) {
  return (p && p.reviewsVerified) ? p : { ...p, rating: null, reviews: 0 };
}

function getStoredProducts() {
  try {
    const raw = localStorage.getItem("dd_products_data");
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
    localStorage.setItem("dd_products_data", JSON.stringify(products));
    PRODUCTS = products;
  } catch (e) {
    console.error("Error saving products:", e);
  }
}

function getStoredCategories() {
  try {
    const raw = localStorage.getItem("dd_categories_data");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (e) {}
  return [...DEFAULT_CATEGORIES];
}

function saveStoredCategories(cats) {
  try {
    localStorage.setItem("dd_categories_data", JSON.stringify(cats));
    CATEGORIES = cats;
  } catch (e) {}
}

function getStoredContent() {
  try {
    const raw = localStorage.getItem("dd_site_content");
    if (raw) {
      return { ...DEFAULT_CONTENT, ...JSON.parse(raw) };
    }
  } catch (e) {}
  return { ...DEFAULT_CONTENT };
}

function saveStoredContent(content) {
  try {
    localStorage.setItem("dd_site_content", JSON.stringify(content));
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
      localStorage.setItem("dd_categories_data", JSON.stringify(cloudCats));
    }

    if (cloudProducts !== null) {
      PRODUCTS = cloudProducts.filter(p => p.isActive !== false);
      localStorage.setItem("dd_products_data", JSON.stringify(PRODUCTS));
      cloudSynced = true;
    }

    if (cloudContent) {
      SITE_CONTENT = { ...DEFAULT_CONTENT, ...cloudContent };
      PHONE = SITE_CONTENT.phone || "2349019603621";
      PHONE_DISPLAY = SITE_CONTENT.phoneDisplay || "09019603621";
      localStorage.setItem("dd_site_content", JSON.stringify(SITE_CONTENT));
    }

    if (Array.isArray(rates) && rates.length && typeof shippingRates !== "undefined") {
      shippingRates = rates;
    }

    if (typeof hydratePageContent === "function") hydratePageContent();
    if (typeof renderCategoryFilters === "function") renderCategoryFilters();
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

