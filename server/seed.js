import db from './db.js';

export const SEED_CATEGORIES = [
  { slug: 'all', name: 'All', emoji: '✨', sort_order: 0 },
  { slug: 'tech', name: 'Tech', emoji: '🎧', sort_order: 1 },
  { slug: 'home', name: 'Home', emoji: '🏠', sort_order: 2 },
  { slug: 'kitchen', name: 'Kitchen', emoji: '🍳', sort_order: 3 },
  { slug: 'beauty', name: 'Beauty', emoji: '🧴', sort_order: 4 },
  { slug: 'fashion', name: 'Fashion', emoji: '👟', sort_order: 5 },
  { slug: 'fitness', name: 'Fitness', emoji: '💪', sort_order: 6 },
];

export const SEED_PRODUCTS = [
  {
    code: '#001',
    title: 'Anker Soundcore R50i NC Wireless Earbuds',
    description:
      '42dB adaptive noise cancelling, 10mm bass drivers, up to 45h battery life, IP54 water-resistant. Huge viral favourite for daily commute & gym.',
    category_slug: 'tech',
    tags: 'earbuds,audio,bluetooth,anker,soundcore,anc,headphone,murah',
    image_url:
      'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=80',
    shopee_url: 'https://shopee.com.my/search?keyword=Anker%20Soundcore%20R50i%20NC',
    shopee_price: 79.9,
    shopee_price_status: 'synced',
    shopee_rating: 4.9,
    tiktok_url: 'https://www.tiktok.com/search?q=Anker%20Soundcore%20R50i%20NC',
    tiktok_price: 74.0,
    tiktok_price_status: 'synced',
    tiktok_rating: 4.9,
    lazada_url: 'https://www.lazada.com.my/catalog/?q=Anker%20Soundcore%20R50i%20NC',
    lazada_price: 76.5,
    lazada_price_status: 'synced',
    lazada_rating: 4.9,
    pinduoduo_url: 'https://mobile.yangkeduo.com/search_result.html?search_key=Anker%20Soundcore%20R50i',
    pinduoduo_price: 69.9,
    pinduoduo_price_status: 'synced',
    pinduoduo_rating: 4.8,
    purchase_count: 14820,
    reliability_score: 4.9,
    reliability_verified: 1,
    is_featured: 1,
    created_at: '2026-11-25 10:00:00',
  },
  {
    code: '#002',
    title: 'Tyeso 900ml Insulated Stainless Tumbler with Straw',
    description:
      'Keeps ice cold up to 18 hours and hot drinks up to 8 hours. Food-grade 304 stainless steel, cup-holder friendly base with leakproof lid.',
    category_slug: 'kitchen',
    tags: 'tumbler,bottle,flask,tyeso,air sejuk,office,viral',
    image_url:
      'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80',
    shopee_url: 'https://shopee.com.my/search?keyword=Tyeso%20900ml%20Tumbler',
    shopee_price: 36.5,
    shopee_price_status: 'synced',
    tiktok_url: 'https://www.tiktok.com/search?q=Tyeso%20900ml%20Tumbler',
    tiktok_price: 39.9,
    tiktok_price_status: 'synced',
    purchase_count: 23450,
    reliability_score: 4.9,
    reliability_verified: 1,
    is_featured: 1,
    created_at: '2026-11-24 14:30:00',
  },
  {
    code: '#003',
    title: 'UGREEN 65W Nexode GaN 3-Port Fast Charger',
    description:
      'Charge MacBook Air, iPad, and phone simultaneously. Compact GaN II thermal protection chip with UK 3-pin Malaysia plug.',
    category_slug: 'tech',
    tags: 'charger,gan,ugreen,65w,usb-c,laptop,fast charge',
    image_url:
      'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80',
    shopee_url: 'https://shopee.com.my/search?keyword=UGREEN%2065W%20Nexode%20GaN',
    shopee_price: 89.0,
    shopee_price_status: 'synced',
    shopee_rating: 5.0,
    tiktok_url: 'https://www.tiktok.com/search?q=UGREEN%2065W%20Charger',
    tiktok_price: 92.5,
    tiktok_price_status: 'synced',
    tiktok_rating: 4.9,
    lazada_url: 'https://www.lazada.com.my/catalog/?q=UGREEN%2065W%20Nexode%20GaN',
    lazada_price: 86.0,
    lazada_price_status: 'synced',
    lazada_rating: 5.0,
    purchase_count: 9640,
    reliability_score: 5.0,
    reliability_verified: 1,
    is_featured: 1,
    created_at: '2026-11-26 08:15:00',
  },
  {
    code: '#004',
    title: 'Minimalist Warm LED Desk Lamp & Wireless Pad',
    description:
      '3-tone dimmable ambient lamp with built-in 15W Qi wireless phone charger. Sleek matte cream finish for aesthetic study or WFH setups.',
    category_slug: 'home',
    tags: 'lamp,desk,aesthetic,wfh,minimalist,bedroom,wireless charger',
    image_url:
      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80',
    shopee_url: 'https://shopee.com.my/search?keyword=Minimalist%20LED%20Desk%20Lamp',
    shopee_price: 54.0,
    shopee_price_status: 'synced',
    tiktok_url: 'https://www.tiktok.com/search?q=Minimalist%20Desk%20Lamp',
    tiktok_price: 49.9,
    tiktok_price_status: 'synced',
    purchase_count: 4210,
    reliability_score: 4.7,
    reliability_verified: 1,
    is_featured: 0,
    created_at: '2026-11-26 11:40:00',
  },
  {
    code: '#005',
    title: 'Skintific 5X Ceramide Barrier Repair Moisture Gel',
    description:
      'Lightweight gel moisturizer formulated with 5 types of ceramides, hyaluronic acid, and centella to calm redness and strengthen skin barrier.',
    category_slug: 'beauty',
    tags: 'skincare,skintific,ceramide,moisturizer,face,glow',
    image_url:
      'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=80',
    shopee_url: 'https://shopee.com.my/search?keyword=Skintific%205X%20Ceramide',
    shopee_price: 38.9,
    shopee_price_status: 'synced',
    tiktok_url: 'https://www.tiktok.com/search?q=Skintific%205X%20Ceramide',
    tiktok_price: 35.5,
    tiktok_price_status: 'synced',
    purchase_count: 31200,
    reliability_score: 4.9,
    reliability_verified: 1,
    is_featured: 1,
    created_at: '2026-11-23 09:20:00',
  },
  {
    code: '#006',
    title: 'Portable Electric Espresso & Coffee Maker USB-C',
    description:
      'Self-heating 20-bar portable espresso brewer compatible with ground coffee and Nespresso capsules. Great for camping, road trips, and office.',
    category_slug: 'kitchen',
    tags: 'coffee,espresso,portable,camping,brewer,usb-c',
    image_url:
      'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80',
    shopee_url: 'https://shopee.com.my/search?keyword=Portable%20Espresso%20Maker',
    shopee_price: 169.0,
    shopee_price_status: 'synced',
    tiktok_url: 'https://www.tiktok.com/search?q=Portable%20Espresso%20Maker',
    tiktok_price: 159.0,
    tiktok_price_status: 'synced',
    purchase_count: 3180,
    reliability_score: 4.6,
    reliability_verified: 1,
    is_featured: 0,
    created_at: '2026-11-26 13:10:00',
  },
  {
    code: '#007',
    title: 'Foldable Magnetic MagSafe Phone Stand & Grip',
    description:
      'Ultra-slim zinc alloy magnetic stand with dual-hinge 360 rotation. Doubles as desk tripod for TikTok filming and video calls.',
    category_slug: 'tech',
    tags: 'magsafe,phone stand,tripod,iphone,gadget,content creator',
    image_url:
      'https://images.unsplash.com/photo-1586953208448-b95a79798f07?auto=format&fit=crop&w=800&q=80',
    shopee_url: 'https://shopee.com.my/search?keyword=Foldable%20MagSafe%20Stand',
    shopee_price: 22.9,
    shopee_price_status: 'synced',
    tiktok_url: 'https://www.tiktok.com/search?q=MagSafe%20Foldable%20Stand',
    tiktok_price: 19.9,
    tiktok_price_status: 'synced',
    purchase_count: 11850,
    reliability_score: 4.8,
    reliability_verified: 1,
    is_featured: 0,
    created_at: '2026-11-22 17:45:00',
  },
  {
    code: '#008',
    title: 'Uniqlo-Style Heavyweight Cotton Boxy Tee 280GSM',
    description:
      'Breathable combed cotton oversized streetwear tee with thick ribbed collar that stays crisp after washing. Unisex cut.',
    category_slug: 'fashion',
    tags: 'shirt,tshirt,oversized,cotton,streetwear,ootd,baju',
    image_url:
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80',
    shopee_url: 'https://shopee.com.my/search?keyword=Heavyweight%20Boxy%20Tee%20280GSM',
    shopee_price: 29.9,
    shopee_price_status: 'synced',
    tiktok_url: 'https://www.tiktok.com/search?q=Heavyweight%20Boxy%20Tee',
    tiktok_price: 27.5,
    tiktok_price_status: 'synced',
    purchase_count: 18400,
    reliability_score: 4.7,
    reliability_verified: 1,
    is_featured: 0,
    created_at: '2026-11-21 12:00:00',
  },
  {
    code: '#009',
    title: 'JISULIFE Ultra-Quiet High-Speed Handheld Fan Pro',
    description:
      '100-level stepless turbo wind dial with digital LED battery display. Essential for Malaysian weather, concerts, and theme parks.',
    category_slug: 'home',
    tags: 'fan,jisulife,portable fan,kipas,cooling,travel',
    image_url:
      'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80',
    shopee_url: 'https://shopee.com.my/search?keyword=JISULIFE%20Handheld%20Fan%20Pro',
    shopee_price: 68.0,
    shopee_price_status: 'synced',
    tiktok_url: 'https://www.tiktok.com/search?q=JISULIFE%20Handheld%20Fan%20Pro',
    tiktok_price: 64.9,
    tiktok_price_status: 'synced',
    purchase_count: 27900,
    reliability_score: 4.9,
    reliability_verified: 1,
    is_featured: 1,
    created_at: '2026-11-25 18:00:00',
  },
  {
    code: '#010',
    title: 'Non-Slip 8mm Eco TPE Yoga & Home Workout Mat',
    description:
      'Dual-texture anti-tear cushioning with alignment markers and carry strap. Ideal for pilates, stretching, and home HIIT sessions.',
    category_slug: 'fitness',
    tags: 'yoga,mat,fitness,workout,exercise,pilates,gym',
    image_url:
      'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?auto=format&fit=crop&w=800&q=80',
    shopee_url: 'https://shopee.com.my/search?keyword=8mm%20TPE%20Yoga%20Mat',
    shopee_price: 45.0,
    shopee_price_status: 'synced',
    tiktok_url: 'https://www.tiktok.com/search?q=TPE%20Yoga%20Mat%208mm',
    tiktok_price: 48.0,
    tiktok_price_status: 'synced',
    purchase_count: 6530,
    reliability_score: 4.5,
    reliability_verified: 0,
    is_featured: 0,
    created_at: '2026-11-20 15:20:00',
  },
];

export function seedIfEmpty({ force = false } = {}) {
  const catCount = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
  if (catCount === 0 || force) {
    const insertCat = db.prepare(`
      INSERT OR REPLACE INTO categories (slug, name, emoji, sort_order)
      VALUES (@slug, @name, @emoji, @sort_order)
    `);
    const txCat = db.transaction((rows) => {
      for (const row of rows) insertCat.run(row);
    });
    txCat(SEED_CATEGORIES);
  }

  const prodCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  if (prodCount === 0 || force) {
    const insertProd = db.prepare(`
      INSERT OR IGNORE INTO products (
        code, title, description, category_slug, tags, image_url,
        shopee_url, shopee_price, shopee_price_status, shopee_rating,
        tiktok_url, tiktok_price, tiktok_price_status, tiktok_rating,
        lazada_url, lazada_price, lazada_price_status, lazada_rating,
        pinduoduo_url, pinduoduo_price, pinduoduo_price_status, pinduoduo_rating,
        purchase_count, reliability_score, reliability_verified,
        is_featured, last_price_sync, created_at
      ) VALUES (
        @code, @title, @description, @category_slug, @tags, @image_url,
        @shopee_url, @shopee_price, @shopee_price_status, @shopee_rating,
        @tiktok_url, @tiktok_price, @tiktok_price_status, @tiktok_rating,
        @lazada_url, @lazada_price, @lazada_price_status, @lazada_rating,
        @pinduoduo_url, @pinduoduo_price, @pinduoduo_price_status, @pinduoduo_rating,
        @purchase_count, @reliability_score, @reliability_verified,
        @is_featured, datetime('now'), @created_at
      )
    `);
    const txProd = db.transaction((rows) => {
      for (const row of rows) {
        const sRate = row.shopee_rating ?? row.reliability_score ?? 4.8;
        const tRate = row.tiktok_rating ?? row.reliability_score ?? 4.8;
        const lRate = row.lazada_url ? (row.lazada_rating ?? 4.8) : null;
        const pRate = row.pinduoduo_url ? (row.pinduoduo_rating ?? 4.8) : null;
        const ratings = [sRate, tRate, lRate, pRate].filter((r) => r !== null);
        const combined = Number(
          (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
        );
        insertProd.run({
          lazada_url: '',
          lazada_price: null,
          lazada_price_status: 'manual',
          lazada_rating: lRate,
          pinduoduo_url: '',
          pinduoduo_price: null,
          pinduoduo_price_status: 'manual',
          pinduoduo_rating: pRate,
          ...row,
          shopee_rating: sRate,
          tiktok_rating: tRate,
          reliability_score: combined,
        });
      }
    });
    txProd(SEED_PRODUCTS);
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedIfEmpty({ force: false });
  console.log('Database seeded successfully.');
}
