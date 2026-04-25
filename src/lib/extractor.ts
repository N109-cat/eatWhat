import type { ExtractFoodNoteInput, ExtractedFoodNote } from "./types";

const SHOP_TYPES = [
  { type: "火锅", keywords: ["火锅", "涮肉", "牛油锅", "椰子鸡"] },
  { type: "咖啡", keywords: ["咖啡", "拿铁", "手冲", "dirty", "美式"] },
  { type: "甜品", keywords: ["甜品", "蛋糕", "面包", "烘焙", "布丁", "冰淇淋"] },
  { type: "烧烤", keywords: ["烧烤", "烤串", "烤肉", "烤鱼"] },
  { type: "日料", keywords: ["日料", "寿司", "刺身", "拉面", "居酒屋"] },
  { type: "韩餐", keywords: ["韩餐", "部队锅", "炸鸡", "拌饭", "泡菜"] },
  { type: "粤菜", keywords: ["粤菜", "早茶", "点心", "茶餐厅", "烧腊"] },
  { type: "川湘菜", keywords: ["川菜", "湘菜", "辣子鸡", "水煮鱼", "小炒黄牛肉"] },
  { type: "西餐", keywords: ["西餐", "牛排", "意面", "披萨", "brunch"] },
  { type: "面馆", keywords: ["面馆", "拉面", "拌面", "牛肉面", "米线", "粉"] },
  { type: "小吃", keywords: ["小吃", "夜市", "炸串", "煎饼", "包子", "馄饨"] },
  { type: "酒吧", keywords: ["酒吧", "精酿", "鸡尾酒", "bistro", "小酒馆"] }
];

const FIELD_PATTERNS = {
  shopName: [
    /(?:店名|店铺|餐厅|名字|名称)\s*[:：]\s*([^\n#，,。]+)/i,
    /(?:打卡|推荐)\s*[:：]\s*([^\n#，,。]+)/i
  ],
  location: [
    /(?:地址|位置|坐标|定位)\s*[:：]\s*([^\n#]+)/i,
    /(?:📍|🏠)\s*([^\n#]+)/
  ],
  avgPrice: [
    /(?:人均|均价|价格)\s*[:：]?\s*(?:约|大概)?\s*([¥￥]?\s*\d+(?:\s*[-~至]\s*\d+)?\s*(?:元|\/人|每人)?)/i,
    /([¥￥]\s*\d+(?:\s*[-~至]\s*\d+)?\s*(?:\/人|每人)?)/i,
    /(\d+(?:\s*[-~至]\s*\d+)?\s*元\s*\/?\s*人)/i
  ],
  dishes: [
    /(?:推荐菜|必点|招牌|菜品|点单|点了)\s*[:：]\s*([^\n。]+)/i,
    /(?:推荐|必吃)\s*([^\n。]{2,80})/i
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
  const location = pickByPatterns(cleanedText, FIELD_PATTERNS.location) || pickLocationLine(lines);
  const avgPrice = normalizePrice(pickByPatterns(cleanedText, FIELD_PATTERNS.avgPrice));
  const recommendedDishes = pickDishes(cleanedText);
  const customTags = pickHashTags(cleanedText, shopName, shopType);
  const intro = buildIntro(cleanedText, lines);

  return {
    sourceUrl: input.sourceUrl.trim(),
    rawText: input.rawText,
    shopName,
    shopType,
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
  if (explicit) return tidyValue(explicit);

  const hashTags = Array.from(text.matchAll(/#([^#\n\r，,。]+)/g))
    .map((match) => tidyValue(match[1]))
    .filter((tag) => tag.length >= 2 && tag.length <= 20);
  const shopLikeTag = hashTags.find((tag) => /店|餐厅|咖啡|火锅|酒馆|面馆|烘焙|食堂/.test(tag));
  if (shopLikeTag) return shopLikeTag;

  const firstUsefulLine = lines.find((line) => {
    const stripped = tidyValue(line.replace(/^[-*\d.、\s]+/, ""));
    return stripped.length >= 2 && stripped.length <= 28 && !/^#/.test(stripped) && !/小红书|复制|打开|http/i.test(stripped);
  });

  return firstUsefulLine ? tidyValue(firstUsefulLine) : "";
}

function pickShopType(text: string) {
  const lowered = text.toLowerCase();
  const matched = SHOP_TYPES.find(({ keywords }) =>
    keywords.some((keyword) => lowered.includes(keyword.toLowerCase()))
  );
  return matched?.type ?? "";
}

function pickLocationLine(lines: string[]) {
  const line = lines.find((item) => /路|街|号|巷|广场|商场|中心|地铁|区|市/.test(item) && item.length <= 60);
  return line ? tidyValue(line.replace(/^(地址|位置|坐标|定位)\s*[:：]\s*/, "")) : "";
}

function normalizePrice(value: string) {
  if (!value) return "";
  return tidyValue(value.replace(/\s+/g, "").replace(/^￥/, "¥"));
}

function pickDishes(text: string) {
  const explicit = pickByPatterns(text, FIELD_PATTERNS.dishes);
  const source = explicit || "";
  const candidates = source
    .split(/[、，,\/｜|；;+\s]+/)
    .map((item) => tidyValue(item))
    .filter((item) => item.length >= 2 && item.length <= 14)
    .filter((item) => !/推荐|必点|招牌|菜品|人均|地址|位置/.test(item));

  return Array.from(new Set(candidates)).slice(0, 6);
}

function pickHashTags(text: string, shopName: string, shopType: string) {
  const tags = Array.from(text.matchAll(/#([^#\n\r，,。]+)/g))
    .map((match) => tidyValue(match[1]))
    .filter((tag) => tag.length >= 2 && tag.length <= 12)
    .filter((tag) => tag !== shopName && tag !== shopType);

  return Array.from(new Set(tags)).slice(0, 6);
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
    .replace(/^[：:，,\s#]+/, "")
    .replace(/[。；;，,]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}
