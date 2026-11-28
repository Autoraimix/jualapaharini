export const CATEGORY_SMART_KEYWORDS = {
  tech: ['tech', 'gadget', 'elektronik', 'device', 'smart'],
  home: ['home', 'rumah', 'living', 'bilik', 'decor'],
  kitchen: ['kitchen', 'dapur', 'cooking', 'masak', 'dining'],
  beauty: ['beauty', 'skincare', 'kecantikan', 'makeup', 'glow'],
  fashion: ['fashion', 'fesyen', 'pakaian', 'ootd', 'style'],
  fitness: ['fitness', 'gym', 'workout', 'sukan', 'senaman'],
  'mobile-accessories': ['phone', 'telefon', 'smartphone', 'case', 'aksesori'],
  'computer-laptop': ['laptop', 'computer', 'pc', 'komputer', 'workspace'],
  gaming: ['gaming', 'game', 'gamer', 'console', 'rgb'],
  audio: ['audio', 'sound', 'speaker', 'earbuds', 'headphone'],
  cameras: ['camera', 'kamera', 'photo', 'video', 'drone'],
  'smart-home': ['smarthome', 'iot', 'wifi', 'automation', 'sensor'],
  appliances: ['appliance', 'elektrik', 'mesin', 'home', 'rumah'],
  furniture: ['furniture', 'perabot', 'desk', 'chair', 'meja'],
  bedding: ['bedding', 'cadar', 'pillow', 'bantal', 'towel'],
  groceries: ['food', 'makanan', 'snack', 'minuman', 'pantry'],
  'health-supplements': ['health', 'kesihatan', 'vitamin', 'supplement', 'wellness'],
  'baby-kids': ['baby', 'bayi', 'kids', 'kanak', 'anak'],
  'toys-hobbies': ['toy', 'mainan', 'hobby', 'hobi', 'lego'],
  pets: ['pet', 'haiwan', 'kucing', 'cat', 'dog'],
  automotive: ['automotive', 'kereta', 'car', 'motor', 'aksesori kereta'],
  'travel-luggage': ['travel', 'luggage', 'bagasi', 'cuti', 'trip'],
  'stationery-office': ['office', 'pejabat', 'stationery', 'alat tulis', 'study'],
  'books-media': ['book', 'buku', 'reading', 'learning', 'study'],
  'watches-jewelry': ['watch', 'jam', 'jewelry', 'aksesori', 'bracelet'],
  'bags-wallets': ['bag', 'beg', 'backpack', 'wallet', 'dompet'],
  'shoes-footwear': ['shoes', 'kasut', 'sneakers', 'sandal', 'footwear'],
  'outdoor-camping': ['outdoor', 'camping', 'khemah', 'hiking', 'nature'],
  'tools-hardware': ['tools', 'hardware', 'diy', 'drill', 'repair'],
  'gifts-festive': ['gift', 'hadiah', 'raya', 'festive', 'hamper'],
};

const WORD_SYNONYMS = {
  earbuds: ['earphone', 'audio', 'bluetooth', 'wireless'],
  earphone: ['earbuds', 'audio', 'bluetooth', 'headphone'],
  headphone: ['audio', 'wireless', 'earbuds'],
  charger: ['fast charge', 'usb-c', 'adapter', 'power'],
  powerbank: ['battery', 'portable', 'charger', 'travel'],
  kipas: ['fan', 'cooling', 'portable'],
  fan: ['kipas', 'cooling', 'portable'],
  tumbler: ['bottle', 'botol', 'flask', 'drinkware'],
  bottle: ['tumbler', 'botol', 'flask'],
  lamp: ['lampu', 'led', 'lighting'],
  lampu: ['lamp', 'led', 'lighting'],
  coffee: ['kopi', 'espresso', 'brewer'],
  kopi: ['coffee', 'espresso', 'drink'],
  shirt: ['baju', 'tee', 'top', 'fashion'],
  baju: ['shirt', 'tee', 'fashion'],
  skincare: ['serum', 'moisturizer', 'face', 'beauty'],
  serum: ['skincare', 'face', 'glow'],
  sunscreen: ['spf', 'skincare', 'uv', 'face'],
  mouse: ['wireless', 'pc', 'gaming', 'desk'],
  keyboard: ['mechanical', 'pc', 'gaming', 'desk'],
  vacuum: ['cleaner', 'home', 'rumah', 'appliances'],
  blender: ['kitchen', 'dapur', 'juicer', 'cooking'],
  watch: ['jam', 'smartwatch', 'strap'],
  bag: ['beg', 'backpack', 'tote', 'carry'],
  shoes: ['kasut', 'sneakers', 'running'],
  cat: ['kucing', 'pet', 'pets'],
  kucing: ['cat', 'pet', 'pets'],
  car: ['kereta', 'automotive', 'dashcam'],
  kereta: ['car', 'automotive', 'accessories'],
  baby: ['bayi', 'kids', 'diaper', 'stroller'],
  yoga: ['fitness', 'mat', 'workout', 'gym'],
};

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'our', 'are', 'was',
  'were', 'has', 'have', 'had', 'not', 'but', 'all', 'any', 'can', 'will', 'just',
  'into', 'over', 'under', 'per', 'pcs', 'set', 'pack', 'new', 'hot', 'sale', 'best',
  'top', 'free', 'shipping', 'ready', 'stock', 'malaysia', 'original', 'authentic',
  'official', 'store', 'shop', 'online', 'quality', 'high', 'super', 'ultra', 'pro',
  'max', 'mini', 'plus', 'edition', 'series', 'version', 'model', 'type', 'size',
  'color', 'colour', 'dan', 'untuk', 'yang', 'dengan', 'dari', 'pada', 'atau', 'ini',
  'itu', 'ada', 'lagi', 'paling', 'murah', 'promo', 'rm', 'myr',
]);

const FALLBACK_TAGS = ['deal', 'trusted', 'compare', 'budget', 'viral', 'trending', 'value'];

export function parseTagList(raw = '') {
  const seen = new Set();
  const out = [];
  for (const part of String(raw || '').split(',')) {
    const clean = part.trim().toLowerCase();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

export function generateSmartSearchTags({
  title = '',
  description = '',
  categorySlug = 'tech',
  categoryName = '',
  existingTags = '',
  minTags = 5,
  maxTags = 9,
} = {}) {
  const tags = [];
  const seen = new Set();

  const addTag = (raw) => {
    const clean = String(raw || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean || clean.length < 2 || /^\d+$/.test(clean) || seen.has(clean)) return false;
    seen.add(clean);
    tags.push(clean);
    return true;
  };

  // 1. Preserve any existing user-entered tags first
  for (const t of parseTagList(existingTags)) {
    if (tags.length >= maxTags) break;
    addTag(t);
  }

  // 2. Extract informative words from title and description
  const tokenize = (text) =>
    String(text || '')
      .toLowerCase()
      .replace(/\[[^\]]*\]|【[^】]*】/g, ' ')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/^-+|-+$/g, ''))
      .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOPWORDS.has(w));

  const titleWords = tokenize(title);
  const descWords = tokenize(description);

  for (const w of titleWords) {
    if (tags.length >= maxTags) break;
    addTag(w);
  }

  // 3. Add synonym tags matched from title words
  for (const w of titleWords) {
    if (tags.length >= maxTags) break;
    const syns = WORD_SYNONYMS[w] || [];
    for (const s of syns) {
      if (tags.length >= maxTags) break;
      addTag(s);
    }
  }

  // 4. Add category keywords and category name words
  const catKeywords = CATEGORY_SMART_KEYWORDS[categorySlug] || [];
  for (const kw of catKeywords) {
    if (tags.length >= maxTags) break;
    addTag(kw);
  }
  for (const cw of tokenize(categoryName || categorySlug.replace(/-/g, ' '))) {
    if (tags.length >= maxTags) break;
    addTag(cw);
  }

  // 5. Pull extra context from description if still under minTags
  for (const w of descWords) {
    if (tags.length >= Math.max(minTags, 7)) break;
    addTag(w);
  }

  // 6. Guarantee at least minTags
  for (const fb of FALLBACK_TAGS) {
    if (tags.length >= minTags) break;
    addTag(fb);
  }

  return tags.slice(0, maxTags).join(', ');
}

export function filterCategoriesSmart(categories = [], query = '') {
  const list = categories.filter((c) => c.slug !== 'all');
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list;

  const tokens = q.split(/\s+/).filter(Boolean);
  return list
    .map((cat) => {
      const name = String(cat.name || '').toLowerCase();
      const slug = String(cat.slug || '').toLowerCase();
      const keywords = (CATEGORY_SMART_KEYWORDS[cat.slug] || []).join(' ').toLowerCase();
      const haystack = `${name} ${slug} ${keywords}`;

      let score = 0;
      for (const t of tokens) {
        if (name.startsWith(t)) score += 30;
        else if (name.includes(t)) score += 20;
        else if (keywords.includes(t) || slug.includes(t)) score += 12;
        else return { cat, score: 0 };
      }
      return { cat, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.cat);
}
