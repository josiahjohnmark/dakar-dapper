-- ==========================================================================
-- DAKAR DAPPER — SUPABASE DATABASE SCHEMA
-- Run this script in the Supabase Dashboard -> SQL Editor -> Click "RUN"
-- ==========================================================================

-- 1. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.dd_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.dd_products (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT,
  category TEXT NOT NULL REFERENCES public.dd_categories(id) ON UPDATE CASCADE ON DELETE SET DEFAULT DEFAULT 'wears',
  badge TEXT,
  badge_type TEXT DEFAULT 'tag-gold',
  price NUMERIC NOT NULL,
  original_price NUMERIC,
  show_discount BOOLEAN DEFAULT TRUE,
  stock INTEGER DEFAULT 10,
  is_out_of_stock BOOLEAN DEFAULT FALSE,
  image TEXT,
  sizes JSONB DEFAULT '["S", "M", "L", "XL"]'::jsonb,
  colors JSONB DEFAULT '["#1A1A1A", "#E5E5E5"]'::jsonb,
  color_names JSONB DEFAULT '["Noir", "Bone"]'::jsonb,
  rating NUMERIC DEFAULT 5.0,
  reviews INTEGER DEFAULT 1,
  description TEXT,
  details JSONB DEFAULT '["100% Premium Material", "Designed for Dakar Dapper", "Cold machine wash"]'::jsonb,
  care TEXT DEFAULT 'Machine wash cold inside-out. Do not tumble dry.',
  is_new BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SITE CONTENT & CMS TABLE
CREATE TABLE IF NOT EXISTS public.dd_content (
  id TEXT PRIMARY KEY DEFAULT 'main',
  hero_badge TEXT,
  hero_title TEXT,
  hero_desc TEXT,
  hero_btn1_text TEXT,
  hero_btn2_text TEXT,
  banner_notice TEXT,
  story_kicker TEXT,
  story_title TEXT,
  story_desc TEXT,
  phone TEXT,
  phone_display TEXT,
  popup_delay_sec INTEGER DEFAULT 30,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ORDERS TABLE (Captured at checkout)
CREATE TABLE IF NOT EXISTS public.dd_orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_city TEXT,
  customer_state TEXT,
  items JSONB NOT NULL,
  subtotal NUMERIC NOT NULL,
  shipping NUMERIC DEFAULT 0,
  total NUMERIC NOT NULL,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. NEWSLETTER SUBSCRIBERS TABLE
CREATE TABLE IF NOT EXISTS public.dd_subscribers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT DEFAULT 'popup',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Allows public storefront to read catalog and submit orders/subscribers
-- ==========================================================================

ALTER TABLE public.dd_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_subscribers ENABLE ROW LEVEL SECURITY;

-- Allow public read access to categories, products, content
CREATE POLICY "Allow public read categories" ON public.dd_categories FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update categories" ON public.dd_categories FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read products" ON public.dd_products FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update products" ON public.dd_products FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read content" ON public.dd_content FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update content" ON public.dd_content FOR ALL USING (true) WITH CHECK (true);

-- Allow public to place orders and subscribe
CREATE POLICY "Allow public insert orders" ON public.dd_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read orders" ON public.dd_orders FOR SELECT USING (true);

CREATE POLICY "Allow public insert subscribers" ON public.dd_subscribers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read subscribers" ON public.dd_subscribers FOR SELECT USING (true);

-- ==========================================================================
-- SEED DEFAULT DATA (Only inserted if table is empty)
-- ==========================================================================

INSERT INTO public.dd_categories (id, name, display_order)
VALUES 
  ('wears', 'Wears', 1),
  ('accessories', 'Accessories', 2),
  ('footwear', 'Footwear', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dd_content (
  id, hero_badge, hero_title, hero_desc, hero_btn1_text, hero_btn2_text,
  banner_notice, story_kicker, story_title, story_desc, phone, phone_display, popup_delay_sec
)
VALUES (
  'main',
  'Old Money. Premium Quality. Timeless Quality',
  'The Art of Dressing Well',
  'We let you have the best pieces—our quality is uncompromised and universally admired. At Dakar Dapper. Located in the Mainland Lagos and serving beyond Borders.',
  'Shop Collection',
  'Our Story',
  'Free Express Shipping Nationwide On Orders Over ₦150,000',
  'The Dakar Dapper Story',
  'Curated for the Modern Gentleman',
  'We believe great style isn''t about following trends — it''s about defining them. Every piece is hand-selected from the world''s finest makers to deliver the perfect balance of comfort, sophistication, and individuality.',
  '2349019603621',
  '09019603621',
  30
)
ON CONFLICT (id) DO NOTHING;

-- Seed Default Products
INSERT INTO public.dd_products (
  id, name, subtitle, category, badge, badge_type, price, original_price, show_discount, stock, is_out_of_stock, image, sizes, colors, color_names, rating, reviews, description, is_new
)
VALUES
  (1, 'Metanoia Oversized Heavyweight Tee', '450GSM Vintage Washed French Cotton', 'wears', 'Trending', 'tag-gold', 42000, 55000, true, 10, false, 'assets/graphic-tee.jpg', '["S", "M", "L", "XL", "XXL"]'::jsonb, '["#1A1A1A", "#E5E5E5", "#3C3C3C"]'::jsonb, '["Vintage Washed Black", "Chalk White", "Charcoal"]'::jsonb, 4.9, 38, 'Heavyweight 450GSM luxury cotton with a subtle vintage wash and custom distorted typography.', false),
  (2, 'Riviera Printed Cuban Silk Shirt', 'Silk-Viscose Blend, Hand-Drawn Resort Print', 'wears', 'New', 'tag-dark', 68000, 85000, true, 10, false, 'assets/cuban-shirt.jpg', '["S", "M", "L", "XL"]'::jsonb, '["#E5B842", "#2B4C7E", "#C45B3E"]'::jsonb, '["Golden Palms", "Mediterranean Navy", "Terracotta"]'::jsonb, 4.8, 24, 'Crafted from a fluid silk-viscose blend with an open camp collar and bespoke Dakar resort print.', true),
  (3, 'Avant-Garde Chenille Varsity Jacket', 'Wool Blend Body, Nappa Leather Sleeves', 'wears', 'Exclusive', 'tag-gold', 145000, 180000, true, 10, false, 'assets/varsity-jacket.jpg', '["M", "L", "XL", "XXL"]'::jsonb, '["#1E3A2F", "#1A1A1A"]'::jsonb, '["Forest Green / Cream", "Midnight Noir / Shadow"]'::jsonb, 5.0, 42, 'Heavyweight Melton wool body paired with buttery genuine Nappa leather sleeves and custom chenille embroidery.', false),
  (4, 'Architectural Double-Knee Cargos', 'Heavy Twill, Relaxed Wide-Leg Cut', 'wears', null, null, 58000, 72000, true, 10, false, 'assets/cargos.jpg', '["S (30)", "M (32)", "L (34)", "XL (36)"]'::jsonb, '["#1A1A1A", "#8B7355", "#4A5043"]'::jsonb, '["Noir", "Raw Sandstone", "Olive Drab"]'::jsonb, 4.7, 19, 'Constructed from Japanese heavy cotton twill with reinforced double-knee panels and eight functional pockets.', false),
  (5, 'The Monarch 14mm Cuban Link Chain', '925 Sterling Silver / 18K Micro-Gold Plated', 'accessories', 'Bestseller', 'tag-gold', 95000, 120000, true, 10, false, 'assets/cuban-chain.jpg', '["20 inch", "22 inch", "24 inch"]'::jsonb, '["#C0C0C0", "#D4AF37"]'::jsonb, '["High-Polish Silver", "18K Gold Finish"]'::jsonb, 4.9, 67, 'A heavyweight 14mm custom-engineered Cuban chain with laser-cut geometric links and dual safety clasp.', false),
  (6, 'Solaris Geometric Rimless Sunglasses', 'Titanium Frame, UV400 Gradient Nylon Lenses', 'accessories', 'New', 'tag-dark', 38000, 48000, true, 10, false, 'assets/sunglasses.jpg', '["One Size"]'::jsonb, '["#2A2A3A", "#C4A882", "#111111"]'::jsonb, '["Cosmic Silver", "Bronze Dusk", "Obsidian"]'::jsonb, 4.8, 31, 'Futuristic rimless eyewear featuring ultra-lightweight titanium bridge and gradient nylon UV400 lenses.', true),
  (7, 'Apex Chunky Runner Sneakers', 'Italian Calf Leather, Vibram Lug Outsole', 'footwear', 'Popular', 'tag-gold', 115000, 140000, true, 10, false, 'assets/sneakers.jpg', '["40", "41", "42", "43", "44", "45"]'::jsonb, '["#F5F5F0", "#1A1A1A"]'::jsonb, '["Bone White / Grey", "Triple Black"]'::jsonb, 4.9, 53, 'Statement luxury chunky silhouette constructed with premium full-grain Italian calf leather and sculpted Vibram lug sole.', false)
ON CONFLICT (id) DO NOTHING;
