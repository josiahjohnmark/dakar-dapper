/* ==========================================================================
   SUPABASE-CONFIG.JS — Dakar Dapper Cloud Database Integration
   ========================================================================== */

const SUPABASE_URL = "https://cqcyxiqsxcuqikvbkcrs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxY3l4aXFzeGN1cWlrdmJrY3JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NTY3NTIsImV4cCI6MjEwNTQzMjc1Mn0.pnnfzVRNvTAN_cvpEsSm5GhNhGMjNwudXlLPuJIyn54";

let supabaseClient = null;

// Initialize Supabase Client
function initSupabase() {
  if (window.supabase && typeof window.supabase.createClient === "function") {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log("✦ Dakar Dapper: Connected to Supabase Cloud Database");
    } catch (err) {
      console.warn("Dakar Dapper: Could not initialize Supabase client", err);
    }
  } else {
    console.warn("Dakar Dapper: Supabase library not loaded yet");
  }
}

initSupabase();

// ── 1. PRODUCTS DB METHODS ───────────────────────────────────────────

function mapDbToProduct(row) {
  return {
    id: Number(row.id),
    name: row.name,
    subtitle: row.subtitle || "",
    category: row.category,
    badge: row.badge,
    badgeType: row.badge_type || "tag-gold",
    price: Number(row.price),
    originalPrice: row.original_price ? Number(row.original_price) : null,
    showDiscount: row.show_discount !== false,
    stock: row.stock !== undefined && row.stock !== null ? Number(row.stock) : 10,
    isOutOfStock: Boolean(row.is_out_of_stock),
    image: row.image,
    sizes: Array.isArray(row.sizes) ? row.sizes : ["S", "M", "L", "XL"],
    colors: Array.isArray(row.colors) ? row.colors : ["#1A1A1A", "#E5E5E5"],
    colorNames: Array.isArray(row.color_names) ? row.color_names : ["Noir", "Bone"],
    rating: Number(row.rating) || 5.0,
    reviews: Number(row.reviews) || 1,
    description: row.description || "",
    details: Array.isArray(row.details) ? row.details : ["100% Premium Material"],
    care: row.care || "Machine wash cold inside-out.",
    isNew: Boolean(row.is_new)
  };
}

function mapProductToDb(p) {
  return {
    id: p.id,
    name: p.name,
    subtitle: p.subtitle,
    category: p.category,
    badge: p.badge || null,
    badge_type: p.badgeType || "tag-gold",
    price: p.price,
    original_price: p.originalPrice || null,
    show_discount: p.showDiscount !== false,
    stock: p.stock !== undefined ? p.stock : 10,
    is_out_of_stock: p.isOutOfStock || (p.stock !== undefined && p.stock <= 0),
    image: p.image,
    sizes: p.sizes,
    colors: p.colors,
    color_names: p.colorNames,
    rating: p.rating || 5.0,
    reviews: p.reviews || 1,
    description: p.description,
    details: p.details,
    care: p.care,
    is_new: Boolean(p.isNew),
    updated_at: new Date().toISOString()
  };
}

async function dbFetchProducts() {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from("dd_products")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.warn("Supabase fetch products error:", error.message);
      return null;
    }
    if (data && data.length > 0) {
      return data.map(mapDbToProduct);
    }
    return [];
  } catch (err) {
    console.warn("Failed to fetch products from Supabase:", err);
    return null;
  }
}

async function dbSaveProduct(product) {
  if (!supabaseClient) return false;
  try {
    const row = mapProductToDb(product);
    const { error } = await supabaseClient
      .from("dd_products")
      .upsert(row, { onConflict: "id" });

    if (error) {
      console.warn("Supabase save product error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Failed to save product to Supabase:", err);
    return false;
  }
}

async function dbDeleteProduct(id) {
  if (!supabaseClient) return false;
  try {
    const { error } = await supabaseClient
      .from("dd_products")
      .delete()
      .eq("id", id);

    if (error) {
      console.warn("Supabase delete product error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Failed to delete product from Supabase:", err);
    return false;
  }
}

async function dbDecrementStock(id, qtyPurchased) {
  if (!supabaseClient) return;
  try {
    const { data: current } = await supabaseClient
      .from("dd_products")
      .select("stock")
      .eq("id", id)
      .single();

    if (current) {
      const newStock = Math.max(0, (current.stock || 10) - qtyPurchased);
      await supabaseClient
        .from("dd_products")
        .update({
          stock: newStock,
          is_out_of_stock: newStock <= 0,
          updated_at: new Date().toISOString()
        })
        .eq("id", id);
    }
  } catch (err) {
    console.warn("Failed to decrement stock in Supabase:", err);
  }
}

// ── 2. CATEGORIES DB METHODS ─────────────────────────────────────────

async function dbFetchCategories() {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from("dd_categories")
      .select("id, name, display_order")
      .order("display_order", { ascending: true });

    if (error) {
      console.warn("Supabase fetch categories error:", error.message);
      return null;
    }
    if (data && data.length > 0) {
      return data.map(c => ({ id: c.id, name: c.name }));
    }
    return [];
  } catch (err) {
    console.warn("Failed to fetch categories from Supabase:", err);
    return null;
  }
}

async function dbSaveCategory(cat, order = 99) {
  if (!supabaseClient) return false;
  try {
    const { error } = await supabaseClient
      .from("dd_categories")
      .upsert({ id: cat.id, name: cat.name, display_order: order }, { onConflict: "id" });

    if (error) {
      console.warn("Supabase save category error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Failed to save category to Supabase:", err);
    return false;
  }
}

async function dbDeleteCategory(id) {
  if (!supabaseClient) return false;
  try {
    const { error } = await supabaseClient
      .from("dd_categories")
      .delete()
      .eq("id", id);

    if (error) {
      console.warn("Supabase delete category error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Failed to delete category from Supabase:", err);
    return false;
  }
}

// ── 3. SITE CONTENT & CMS DB METHODS ────────────────────────────────

async function dbFetchContent() {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from("dd_content")
      .select("*")
      .eq("id", "main")
      .single();

    if (error) {
      console.warn("Supabase fetch content error:", error.message);
      return null;
    }
    if (data) {
      return {
        heroBadge: data.hero_badge,
        heroTitle: data.hero_title,
        heroDesc: data.hero_desc,
        heroBtn1Text: data.hero_btn1_text,
        heroBtn2Text: data.hero_btn2_text,
        bannerNotice: data.banner_notice,
        storyKicker: data.story_kicker,
        storyTitle: data.story_title,
        storyDesc: data.story_desc,
        phone: data.phone,
        phoneDisplay: data.phone_display,
        popupDelaySec: data.popup_delay_sec || 30
      };
    }
    return null;
  } catch (err) {
    console.warn("Failed to fetch content from Supabase:", err);
    return null;
  }
}

async function dbSaveContent(c) {
  if (!supabaseClient) return false;
  try {
    const row = {
      id: "main",
      hero_badge: c.heroBadge,
      hero_title: c.heroTitle,
      hero_desc: c.heroDesc,
      hero_btn1_text: c.heroBtn1Text,
      hero_btn2_text: c.heroBtn2Text,
      banner_notice: c.bannerNotice,
      story_kicker: c.storyKicker,
      story_title: c.storyTitle,
      story_desc: c.storyDesc,
      phone: c.phone,
      phone_display: c.phoneDisplay,
      popup_delay_sec: c.popupDelaySec || 30,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabaseClient
      .from("dd_content")
      .upsert(row, { onConflict: "id" });

    if (error) {
      console.warn("Supabase save content error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Failed to save content to Supabase:", err);
    return false;
  }
}

// ── 4. ORDERS & CHECKOUT DB METHODS ─────────────────────────────────

async function dbCreateOrder(orderData) {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from("dd_orders")
      .insert([
        {
          customer_name: orderData.name || "Customer",
          customer_email: orderData.email || "",
          customer_phone: orderData.phone || "",
          customer_address: orderData.address || "",
          customer_city: orderData.city || "",
          customer_state: orderData.state || "",
          items: orderData.items || [],
          subtotal: orderData.subtotal || 0,
          shipping: orderData.shipping || 0,
          total: orderData.total || 0,
          status: "confirmed"
        }
      ])
      .select()
      .single();

    if (error) {
      console.warn("Supabase create order error:", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn("Failed to insert order into Supabase:", err);
    return null;
  }
}

// ── 5. NEWSLETTER SUBSCRIBERS DB METHODS ────────────────────────────

async function dbAddSubscriber(email, source = "popup") {
  if (!supabaseClient || !email) return false;
  try {
    const { error } = await supabaseClient
      .from("dd_subscribers")
      .insert([{ email: email.trim().toLowerCase(), source }]);

    if (error && error.code !== "23505") { // 23505 is unique violation (already subscribed)
      console.warn("Supabase subscriber error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Failed to add subscriber to Supabase:", err);
    return false;
  }
}
