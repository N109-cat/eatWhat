import type { ExtractFoodNoteInput, ExtractedFoodNote, FoodRecordLocationScope } from "./types";

const SHOP_TYPES = [
  { type: "火锅", keywords: ["火锅", "涮肉", "牛油锅", "椰子鸡"] },
  { type: "咖啡", keywords: ["咖啡", "拿铁", "手冲", "dirty", "美式"] },
  { type: "甜品", keywords: ["甜品", "蛋糕", "面包", "烘焙", "布丁", "冰淇淋"] },
  { type: "韩餐", keywords: ["韩餐", "韩国", "韩式", "首尔", "明洞", "部队锅", "炸鸡", "拌饭", "泡菜", "大酱汤", "烤肉"] },
  { type: "日料", keywords: ["日料", "寿司", "刺身", "拉面", "居酒屋"] },
  { type: "烧烤", keywords: ["烧烤", "烤串", "烤肉", "烤鱼"] },
  { type: "粤菜", keywords: ["粤菜", "早茶", "点心", "茶餐厅", "烧腊", "牛杂", "煲仔饭", "肠粉"] },
  { type: "川湘菜", keywords: ["川菜", "湘菜", "辣子鸡", "水煮鱼", "小炒黄牛肉"] },
  { type: "西餐", keywords: ["西餐", "牛排", "意面", "披萨", "brunch"] },
  { type: "面馆", keywords: ["面馆", "拉面", "拌面", "牛肉面", "米线", "粉"] },
  { type: "小吃", keywords: ["小吃", "夜市", "炸串", "煎饼", "包子", "馄饨"] },
  { type: "酒吧", keywords: ["酒吧", "精酿", "鸡尾酒", "bistro", "小酒馆"] }
];

const NEARBY_LOCATION_NAMES = ["南亭", "北亭", "GOGO", "穗石", "大学城", "学校东门", "学校附近", "宿舍附近"];
const DESTINATION_LOCATION_NAMES = ["体育西", "东山口", "北京路", "珠江新城", "客村", "江南西", "天河", "海珠", "越秀"];

const KNOWN_DISHES = [
  "肥牛拌饭",
  "小炒黄牛肉",
  "椰子鸡",
  "猪五花",
  "牛五花",
  "大酱汤",
  "部队锅",
  "煲仔饭",
  "辣子鸡",
  "水煮鱼",
  "鸡尾酒",
  "肥牛",
  "牛杂",
  "肠粉",
  "烧腊",
  "炸鸡",
  "泡菜",
  "寿司",
  "刺身",
  "拉面",
  "披萨",
  "意面",
  "牛排",
  "蛋糕",
  "布丁",
  "拿铁",
  "萝卜"
];

const FIELD_PATTERNS = {
  shopName: [
    /(?:店名|店铺|餐厅|名字|名称)\s*[:：]\s*([^\n#，,。]+)/i,
    /(?:打卡|推荐)\s*[:：]\s*([^\n#，,。]+)/i
  ],
  location: [
    /(?:地点名称|地点|地址|位置|坐标|定位|商圈|区域)\s*[:：]\s*([^\n#，,。]+)/i,
    /(?:在|位于|开在)\s*([^\n，,。]{2,28}?)(?:附近|旁边|周边|一带)/i,
    /(?:📍|🏠)\s*([^\n#]+)/
  ],
  avgPrice: [
    /(?:人均|均价|价格)\s*[:：]?\s*(?:约|大概)?\s*([¥￥]?\s*\d+(?:\s*[-~至]\s*\d+)?\s*(?:元|\/人|每人)?)/i,
    /([¥￥]\s*\d+(?:\s*[-~至]\s*\d+)?\s*(?:\/人|每人)?)/i,
    /(\d+(?:\s*[-~至]\s*\d+)?\s*元\s*\/?\s*人)/i
  ],
  dishes: [
    /(?:推荐菜|必点|招牌|菜品|点单|点了)\s*[:：]\s*([^\n。]+)/i,
    /(?:推荐(?!指数)|必吃)\s*[:：]?\s*([^\n。]{2,80})/i
  ]
};

export function extractFoodNote(input: ExtractFoodNoteInput): ExtractedFoodNote {
  return ruleBasedExtractor(input);
}

export function ruleBasedExtractor(input: ExtractFoodNoteInput): ExtractedFoodNote {
  const cleanedText = normalizeText(input.rawText);
  const lines = cleanedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const shopName = pickShopName(cleanedText, lines);
  const shopType = pickShopType(cleanedText);
  const location = pickLocationName(cleanedText, lines);
  const locationScope = pickLocationScope(cleanedText, location);
  const avgPrice = pickAvgPrice(cleanedText);
  const recommendedDishes = pickDishes(cleanedText);
  const customTags: string[] = [];
  const intro = buildIntro(cleanedText, lines);

  return {
    sourceUrl: input.sourceUrl.trim(),
    rawText: input.rawText,
    shopName,
    shopType,
    locationScope,
    location,
    avgPrice,
    recommendedDishes,
    intro,
    customTags
  };
}

function normalizeText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[【】]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function pickShopName(text: string, lines: string[]) {
  const explicit = pickByPatterns(text, FIELD_PATTERNS.shopName);
  if (explicit) return tidyShopName(explicit);

  const leadingName = pickLeadingShopName(text);
  if (leadingName) return leadingName;

  const hashTags = Array.from(text.matchAll(/#([^#\n\r，,。]+)/g))
    .map((match) => tidyValue(match[1]))
    .filter((tag) => tag.length >= 2 && tag.length <= 20);
  const shopLikeTag = hashTags.find((tag) => /店|餐厅|咖啡|火锅|酒馆|面馆|烘焙|食堂/.test(tag));
  if (shopLikeTag) return tidyShopName(shopLikeTag);

  const firstUsefulLine = lines.find((line) => {
    const stripped = tidyValue(line.replace(/^[-*\d.、\s]+/, ""));
    return stripped.length >= 2 && stripped.length <= 28 && !/^#/.test(stripped) && !/小红书|复制|打开|http/i.test(stripped);
  });

  return firstUsefulLine ? tidyShopName(firstUsefulLine) : "";
}

function pickShopType(text: string) {
  const lowered = text.toLowerCase();
  const scored = SHOP_TYPES.map(({ type, keywords }) => ({
    type,
    score: keywords.filter((keyword) => lowered.includes(keyword.toLowerCase())).length
  }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.type ?? "";
}

function pickLocationName(text: string, lines: string[]) {
  const explicit = pickByPatterns(text, FIELD_PATTERNS.location);
  if (explicit) return simplifyLocationName(explicit);

  const knownLocation = pickKnownLocation(text);
  if (knownLocation) return knownLocation;

  return pickLocationLine(lines);
}

function pickLocationScope(text: string, location: string): FoodRecordLocationScope {
  const source = `${text} ${location}`;

  if (/专门|特意|出门|周末|打车|地铁|商圈|体育西|东山口|北京路|珠江新城|客村|江南西|天河|海珠|越秀/i.test(source)) {
    return "destination";
  }

  if (/附近|顺路|下课|课后|学校|宿舍|大学城|南亭|北亭|gogo|穗石/i.test(source)) {
    return "nearby";
  }

  return "";
}

function pickLocationLine(lines: string[]) {
  const line = lines.find((item) => /路|街|号|巷|广场|商场|中心|地铁|区|市/.test(item) && item.length <= 60);
  return line ? simplifyLocationName(line.replace(/^(地点名称|地点|地址|位置|坐标|定位|商圈|区域)\s*[:：]\s*/, "")) : "";
}

function simplifyLocationName(value: string) {
  const knownLocation = pickKnownLocation(value);
  if (knownLocation) return knownLocation;

  return tidyValue(value)
    .replace(/^(在|位于|开在)\s*/, "")
    .replace(/(附近|旁边|周边|一带).*$/, "")
    .trim();
}

function pickKnownLocation(text: string) {
  const locations = [...NEARBY_LOCATION_NAMES, ...DESTINATION_LOCATION_NAMES];
  const lowered = text.toLowerCase();
  return locations.find((location) => lowered.includes(location.toLowerCase())) ?? "";
}

function pickAvgPrice(text: string) {
  const packagePrice = pickPackagePerPersonPrice(text);
  if (packagePrice) return packagePrice;

  return normalizePrice(pickByPatterns(text, FIELD_PATTERNS.avgPrice));
}

function pickPackagePerPersonPrice(text: string) {
  const matched = text.match(/([一二两双三四五六七八九十\d])\s*人(?:套餐|餐)?\s*[:：]?\s*([¥￥]?\s*\d+(?:\.\d+)?)\s*(?:r|R|元|块)?/i);
  if (!matched) return "";

  const people = parsePeopleCount(matched[1]);
  const price = Number.parseFloat(matched[2].replace(/[¥￥]/g, ""));
  if (!people || !Number.isFinite(price)) return "";

  const perPerson = price / people;
  const formatted = Number.isInteger(perPerson) ? `${perPerson}` : perPerson.toFixed(1).replace(/\.0$/, "");
  return `约¥${formatted}/人`;
}

function parsePeopleCount(value: string) {
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    双: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };
  return map[value] ?? 0;
}

function normalizePrice(value: string) {
  if (!value) return "";
  const normalized = tidyValue(value.replace(/\s+/g, "").replace(/^￥/, "¥").replace(/r$/i, "元"));
  return /^\d/.test(normalized) ? normalized : normalized;
}

function pickDishes(text: string) {
  const explicit = pickByPatterns(text, FIELD_PATTERNS.dishes);
  const explicitCandidates = /推荐指数/.test(explicit) ? [] : splitDishCandidates(explicit);
  const knownCandidates = KNOWN_DISHES.filter((dish) => text.includes(dish));
  const semanticCandidates = pickSemanticDishCandidates(text);

  const candidates = Array.from(
    new Set(
      [...explicitCandidates, ...knownCandidates, ...semanticCandidates]
        .map(cleanDishName)
        .filter((item) => item.length >= 2 && item.length <= 14)
        .filter((item) => !isDishStopWord(item))
    )
  );

  return removeContainedDishes(candidates)
    .sort((a, b) => text.indexOf(a) - text.indexOf(b))
    .slice(0, 6);
}

function splitDishCandidates(source: string) {
  if (!source) return [];
  return source
    .split(/[、，,\/｜|；;+和与及\s]+/)
    .map((item) => tidyValue(item))
    .filter((item) => item.length >= 2 && item.length <= 14)
    .filter((item) => !isDishStopWord(item));
}

function pickSemanticDishCandidates(text: string) {
  const candidates: string[] = [];
  const patterns = [
    /([\u4e00-\u9fa5A-Za-z0-9、和与及\s]{2,30}?)(?:都)?(?:很|超|特别|真的)?好吃/g,
    /([\u4e00-\u9fa5A-Za-z0-9]{2,12})(?:呀米|好香|不错|不会很咸)/g
  ];

  patterns.forEach((pattern) => {
    Array.from(text.matchAll(pattern)).forEach((match) => {
      candidates.push(...splitDishCandidates(match[1]));
    });
  });

  return candidates;
}

function cleanDishName(value: string) {
  return tidyValue(value)
    .replace(/^(推荐|必点|招牌|菜品|点单|点了|指数)+[:：]?/, "")
    .replace(/^(也|都|很|超|特别|真的)+/, "")
    .replace(/呀米.*$/, "")
    .replace(/(也|都|很|超|特别|真的|肉质新鲜)+$/, "")
    .trim();
}

function removeContainedDishes(values: string[]) {
  return values;
}

function isDishStopWord(value: string) {
  return /推荐|指数|星|🌟|人均|价格|地址|位置|地点|服务员|高峰期|排队|肉质新鲜|套餐|\d/.test(value);
}

function buildIntro(text: string, lines: string[]) {
  const useful = lines
    .filter((line) => !/^(店名|店铺|地址|位置|坐标|人均|推荐菜|必点)\s*[:：]/.test(line))
    .join(" ");
  return tidyValue((useful || text).slice(0, 120));
}

function pickByPatterns(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return tidyValue(match[1]);
  }
  return "";
}

function tidyValue(value: string) {
  return value
    .replace(/^\s*(?:\d+|[一二三四五六七八九十]+)[.、)）]\s*/, "")
    .replace(/^[：:，,\s#]+/, "")
    .replace(/[。；;，,]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tidyShopName(value: string) {
  return tidyValue(value)
    .replace(/\s*(?:推荐指数|人均|均价|价格|双人套餐|单人套餐|套餐|地址|地点|位置)[:：]?.*$/, "")
    .trim();
}

function pickLeadingShopName(text: string) {
  const firstLine = text.split("\n").find(Boolean);
  if (!firstLine) return "";

  const normalized = tidyValue(firstLine);
  const match = normalized.match(/^(.{2,36}?)(?:\s+(?:推荐指数|人均|均价|价格|双人套餐|单人套餐|套餐|地址|地点|位置)|$)/);
  return match?.[1] ? tidyShopName(match[1]) : "";
}
