import { NextResponse } from "next/server";
import { extractFoodNote } from "@/lib/extractor";
import type { ExtractedFoodNote, FoodRecordLocationScope } from "@/lib/types";

const DEFAULT_MODELSCOPE_BASE_URL = "https://api-inference.modelscope.cn";
const DEFAULT_MODELSCOPE_MODEL_ID = "Qwen/Qwen3.5-397B-A17B";
const MAX_INPUT_CHARS = 12000;
const MAX_FIELD_CHARS = 160;
const MAX_INTRO_CHARS = 120;
const MAX_LIST_ITEMS = 6;
const MAX_IMAGE_BASE64_CHARS = 3_500_000;
const MODEL_TIMEOUT_MS = 180_000;
const MODEL_MAX_TOKENS = 1200;

type ExtractFoodNoteRequest = {
  sourceUrl?: unknown;
  rawText?: unknown;
  image?: unknown;
  images?: unknown;
};

type AnthropicContentBlock = {
  type?: string;
  text?: string;
};

type ModelImageInput = {
  mediaType: string;
  data: string;
  label?: string;
};

type ModelCallResult =
  | { ok: true; text: string; label?: string }
  | { ok: false; status?: number; statusText?: string; detail?: string; label?: string };

type AnthropicMessagesResponse = {
  content?: AnthropicContentBlock[] | string;
};

export async function POST(request: Request) {
  let body: ExtractFoodNoteRequest;

  try {
    body = (await request.json()) as ExtractFoodNoteRequest;
  } catch {
    return NextResponse.json({ error: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const sourceUrl = limitText(asString(body.sourceUrl), MAX_FIELD_CHARS * 3);
  const bodyText = limitText(asString(body.rawText), MAX_INPUT_CHARS);
  const rawText = bodyText;
  const images = normalizeImageInputs(body.images ?? body.image);

  if (!sourceUrl && !rawText && images.length === 0) {
    return NextResponse.json({ error: "请先提供帖子正文、图片或来源链接。" }, { status: 400 });
  }

  const fallbackNote = extractFoodNote({ sourceUrl, rawText });
  const apiKey = process.env.MODELSCOPE_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json({
      note: fallbackNote,
      provider: "local",
      warning: "未配置 MODELSCOPE_API_KEY，已先使用本地规则整理。"
    });
  }

  const model = process.env.MODELSCOPE_MODEL_ID?.trim() || DEFAULT_MODELSCOPE_MODEL_ID;
  const endpoint = buildMessagesEndpoint(process.env.MODELSCOPE_BASE_URL?.trim() || DEFAULT_MODELSCOPE_BASE_URL);

  try {
    const imagePrompt = buildExtractionPrompt({ sourceUrl, bodyText, rawText, hasImage: images.length > 0 });
    const textPrompt = buildExtractionPrompt({ sourceUrl, bodyText, rawText, hasImage: false });
    let imageWarning = "";
    const imageResult = images.length > 0
      ? await callModelWithImageVariants({ apiKey, endpoint, images, model, prompt: imagePrompt })
      : null;

    if (imageResult?.ok) {
      const note = await buildNoteFromModelText({
        apiKey,
        endpoint,
        fallbackNote,
        model,
        rawText,
        sourceUrl,
        text: imageResult.text
      });
      if (note && hasMeaningfulNote(note)) return NextResponse.json({ note, provider: "modelscope" });

      imageWarning = "图片模型已返回，但没有识别出可用店铺信息";
    } else if (imageResult) {
      imageWarning = `图片直传模型失败（${formatModelStatus(imageResult)}）`;
    }

    if (imageResult && !bodyText) {
      return NextResponse.json({
        note: fallbackNote,
        provider: "local",
        warning: `${imageWarning}；当前没有帖子正文可作为备用，所以无法整理。`
      });
    }

    const textResult = await callModelWithRetry({ apiKey, endpoint, model, prompt: textPrompt });

    if (textResult.ok) {
      const note = await buildNoteFromModelText({
        apiKey,
        endpoint,
        fallbackNote,
        model,
        rawText,
        sourceUrl,
        text: textResult.text
      });
      if (note) {
        return NextResponse.json({
          note,
          provider: "modelscope",
          warning: imageWarning ? `${imageWarning}，已改用正文整理。` : undefined
        });
      }

      return NextResponse.json({
        note: fallbackNote,
        provider: "local",
        warning: "模型已返回，但返回内容不是可解析的小票 JSON；已先使用本地规则整理。"
      });
    }

    if (!textResult.ok) {
      return NextResponse.json({
        note: fallbackNote,
        provider: "local",
        warning: `${imageWarning ? `${imageWarning}；` : ""}模型接口请求失败（${formatModelStatus(textResult)}），已先使用本地规则整理。5xx 通常是 ModelScope 网关、模型繁忙或当前模型不支持该请求格式。`
      });
    }
  } catch {
    return NextResponse.json({
      note: fallbackNote,
      provider: "local",
      warning: "模型接口暂时不可用，已先使用本地规则整理。"
    });
  }
}

async function buildNoteFromModelText({
  apiKey,
  endpoint,
  fallbackNote,
  model,
  rawText,
  sourceUrl,
  text
}: {
  apiKey: string;
  endpoint: string;
  fallbackNote: ExtractedFoodNote;
  model: string;
  rawText: string;
  sourceUrl: string;
  text: string;
}) {
  const parsed = parseJsonObjectSafe(text);
  if (parsed) return normalizeExtractedFoodNote(parsed, fallbackNote, sourceUrl, rawText);

  const repaired = await repairModelJson({ apiKey, endpoint, model, text });
  if (!repaired.ok) return null;

  const repairedParsed = parseJsonObjectSafe(repaired.text);
  return repairedParsed ? normalizeExtractedFoodNote(repairedParsed, fallbackNote, sourceUrl, rawText) : null;
}

function buildExtractionPrompt({
  sourceUrl,
  bodyText,
  rawText,
  hasImage
}: {
  sourceUrl: string;
  bodyText: string;
  rawText: string;
  hasImage: boolean;
}) {
  const originalText = bodyText || rawText;

  return `请把下面的美食帖子整理成一张「单店」小票草稿。

只返回一个 JSON 对象，不要 Markdown，不要解释。字段必须完整：
{
  "sourceUrl": "来源链接或备注，优先使用输入的来源链接",
  "rawText": "合并后的原始文本",
  "shopName": "店铺名称",
  "shopType": "店铺类型，例如 火锅/咖啡/甜品/日料/韩餐/粤菜/小吃/西餐/面馆/酒吧/其他",
  "locationScope": "只能是 nearby、destination 或空字符串。附近/顺路/学校/宿舍/下课后填 nearby；专门出门/商圈/打车/地铁/周末填 destination；不确定填空字符串",
  "location": "地点名称、商圈或地址",
  "avgPrice": "人均价格，例如 ¥45 或 45元/人。若出现双人套餐137r、2人餐137元，需要计算为约¥68.5/人",
  "recommendedDishes": ["推荐菜品，最多 6 个"],
  "intro": "一句话简介，120 字以内",
  "customTags": []
}

抽取规则：
- 只能输出一张小票。若文案包含多家店，优先抽取第一个编号/第一个出现且信息最完整的店；不要输出店铺数组，不要等待用户选择。
- 如果模型误认为有多家店，也必须只返回第一家店的 JSON 对象。
- 店铺名称去掉编号、序号和符号，例如“1.明洞GOGO首尔炭火烤肉”应输出“明洞GOGO首尔炭火烤肉”。
- “推荐指数”“评分”“星星”“🌟”不是推荐菜，不要放进 recommendedDishes。
- 推荐菜品要根据语义理解：例如“肥牛和猪五花都很好吃，肥牛拌饭呀米，大酱汤也不会很咸”应提取“肥牛、猪五花、肥牛拌饭、大酱汤”。
- customTags 是用户手动字段，始终返回空数组。
- 不确定就留空或空数组。
- 推荐菜品只放菜名，不要放完整句子。
- 简介要像小票备注，短而具体。
- rawText 请保留下面合并后的原始文本，不要自行扩写。
${hasImage ? "- 已附带图片，请直接理解图片中的店名、菜单、价格、定位和备注；图片内容优先，正文只作为补充。" : ""}

来源链接 / 备注：
${sourceUrl || "无"}

帖子正文：
${originalText || "无"}`;
}

async function callModel({
  apiKey,
  endpoint,
  image,
  model,
  prompt
}: {
  apiKey: string;
  endpoint: string;
  image?: ModelImageInput;
  model: string;
  prompt: string;
}): Promise<ModelCallResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        model,
        max_tokens: MODEL_MAX_TOKENS,
        temperature: 0,
        system:
          "你是一个严谨的美食探店笔记结构化助手。你只根据用户提供的帖子正文、图片内容和来源链接抽取信息；不确定的字段留空，不要编造。",
        messages: [
          {
            role: "user",
            content: image
              ? [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: image.mediaType,
                      data: image.data
                    }
                  },
                  { type: "text", text: prompt }
                ]
              : prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const detail = limitText(stripHtml(await response.text()), 500);
      console.info(
        `[extract-food-note] ModelScope request failed (${image?.label ?? "text"}): ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`
      );

      return {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        detail,
        label: image?.label
      };
    }

    const data = (await response.json()) as AnthropicMessagesResponse;
    return { ok: true, text: getResponseText(data), label: image?.label };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, statusText: `请求超时（${MODEL_TIMEOUT_MS / 1000}秒）`, label: image?.label };
    }

    return { ok: false, statusText: error instanceof Error ? error.message : "unknown error", label: image?.label };
  } finally {
    clearTimeout(timeout);
  }
}

async function callModelWithImageVariants({
  apiKey,
  endpoint,
  images,
  model,
  prompt
}: {
  apiKey: string;
  endpoint: string;
  images: ModelImageInput[];
  model: string;
  prompt: string;
}) {
  const failures: ModelCallResult[] = [];

  for (const image of images) {
    const result = await callModelWithRetry({ apiKey, endpoint, image, model, prompt });
    if (result.ok) return result;

    failures.push(result);
  }

  return mergeModelFailures(failures);
}

async function callModelWithRetry(args: {
  apiKey: string;
  endpoint: string;
  image?: ModelImageInput;
  model: string;
  prompt: string;
}) {
  const first = await callModel(args);
  if (first.ok || (first.status && first.status < 500)) return first;

  return callModel(args);
}

function mergeModelFailures(failures: ModelCallResult[]): ModelCallResult {
  return {
    ok: false,
    statusText: failures.map(formatModelStatus).join("；") || "unknown error"
  };
}

async function repairModelJson({
  apiKey,
  endpoint,
  model,
  text
}: {
  apiKey: string;
  endpoint: string;
  model: string;
  text: string;
}) {
  return callModel({
    apiKey,
    endpoint,
    model,
    prompt: `下面是模型刚刚输出的内容，但它可能不是严格 JSON。请只返回一个可被 JSON.parse 解析的 JSON 对象，不要 Markdown，不要解释。如果字段缺失就补空字符串或空数组。\n\n原始输出：\n${limitText(text, 6000)}`
  });
}

function buildMessagesEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/v1") ? `${normalized}/messages` : `${normalized}/v1/messages`;
}

function getResponseText(data: AnthropicMessagesResponse) {
  if (typeof data.content === "string") return data.content;
  if (!Array.isArray(data.content)) return "";

  return data.content
    .map((block) => (block.type === "text" || block.text ? block.text ?? "" : ""))
    .join("")
    .trim();
}

function parseJsonObject(text: string) {
  const withoutFence = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const candidates = [withoutFence];
  const arrayStart = withoutFence.indexOf("[");
  const arrayEnd = withoutFence.lastIndexOf("]");
  const objectStart = withoutFence.indexOf("{");
  const objectEnd = withoutFence.lastIndexOf("}");

  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(withoutFence.slice(arrayStart, arrayEnd + 1));
  }

  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(withoutFence.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const picked = pickFirstRecord(JSON.parse(candidate));
      if (picked) return picked;
    } catch {
      // Try the next candidate; model output can include prose before/after JSON.
    }
  }

  throw new Error("No JSON object found");
}

function parseJsonObjectSafe(text: string) {
  try {
    return parseJsonObject(text);
  } catch {
    return null;
  }
}

function normalizeExtractedFoodNote(
  value: Record<string, unknown>,
  fallback: ExtractedFoodNote,
  sourceUrl: string,
  rawText: string
): ExtractedFoodNote {
  return {
    sourceUrl: limitText(getStringField(value, ["sourceUrl", "来源链接", "来源", "备注"]) || sourceUrl || fallback.sourceUrl, MAX_FIELD_CHARS * 3),
    rawText: rawText || getStringField(value, ["rawText", "原始文本", "正文"]) || fallback.rawText,
    shopName: cleanShopName(getStringField(value, ["shopName", "店名", "店铺名称", "名称"]) || fallback.shopName),
    shopType: limitText(getStringField(value, ["shopType", "店铺类型", "类型"]) || fallback.shopType, MAX_FIELD_CHARS),
    locationScope: normalizeLocationScope(value.locationScope ?? value["地点范围"] ?? value["位置范围"] ?? fallback.locationScope),
    location: limitText(getStringField(value, ["location", "地点", "地点名称", "位置", "地址"]) || fallback.location, MAX_FIELD_CHARS),
    avgPrice: normalizeAvgPrice(getStringField(value, ["avgPrice", "人均", "人均价格", "价格"]), fallback.avgPrice, rawText),
    recommendedDishes: normalizeDishList(value.recommendedDishes ?? value["推荐菜品"] ?? value["推荐菜"], fallback.recommendedDishes),
    intro: limitText(getStringField(value, ["intro", "简介", "备注"]) || fallback.intro, MAX_INTRO_CHARS),
    customTags: []
  };
}

function getStringField(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const nextValue = asString(value[key]);
    if (nextValue) return nextValue;
  }

  return "";
}

function pickFirstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickFirstRecord(item);
      if (picked) return picked;
    }

    return null;
  }

  if (!isRecord(value)) return null;
  if (hasReceiptField(value)) return value;

  for (const key of ["note", "receipt", "foodNote", "result", "data", "shop", "shops", "items", "records", "notes"]) {
    const picked = pickFirstRecord(value[key]);
    if (picked) return picked;
  }

  return value;
}

function hasReceiptField(value: Record<string, unknown>) {
  return ["shopName", "shopType", "location", "avgPrice", "recommendedDishes", "intro"].some((key) => key in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeDishList(value: unknown, fallback: string[]) {
  const modelList = Array.isArray(value) ? value : [];
  const cleanedModelList = cleanDishList(modelList);
  const list = cleanedModelList.length > 0 ? cleanedModelList : cleanDishList(fallback);

  return Array.from(
    new Set(
      list
        .map((item) => limitText(item, MAX_FIELD_CHARS))
        .filter(Boolean)
    )
  ).slice(0, MAX_LIST_ITEMS);
}

function cleanDishList(value: unknown[]) {
  return value
    .flatMap((item) => asString(item).split(/[、，,;；\n]+/))
    .map(cleanDishName)
    .filter(isValidDishName);
}

function cleanDishName(value: string) {
  return value
    .replace(/^#+/, "")
    .replace(/^\s*(?:第?[一二三四五六七八九十\d]+[.)、.：:-]+)\s*/, "")
    .replace(/^(?:推荐|必点|招牌|菜品)\s*[:：]?\s*/, "")
    .replace(/都很好吃|很好吃|好吃|呀米呀米|也不会很咸|不会很咸|肉质新鲜|很新鲜/g, "")
    .trim();
}

function isValidDishName(value: string) {
  if (!value) return false;
  if (/推荐指数|评分|星星|星级|指数|人均|套餐价格|排队|服务员|高峰期/.test(value)) return false;
  if (/^[🌟⭐★☆\s:：]+$/.test(value)) return false;
  if (/^[\d\s.,，:：%分rR¥￥元/-]+$/.test(value)) return false;
  return value.length <= 24;
}

function cleanShopName(value: string) {
  return limitText(
    value
      .replace(/^\s*(?:第?[一二三四五六七八九十\d]+[.)、.：:-]+)\s*/, "")
      .replace(/^店铺名称\s*[:：]\s*/, "")
      .trim(),
    MAX_FIELD_CHARS
  );
}

function normalizeAvgPrice(value: string, fallback: string, rawText: string) {
  const computed = computePerPersonPrice(value) || computePerPersonPrice(rawText);
  if (computed && (!value || /双人|两人|二人|2人|套餐|餐/.test(value))) return computed;

  return limitText(value || fallback, MAX_FIELD_CHARS);
}

function computePerPersonPrice(value: string) {
  const match =
    value.match(/(?:双人|两人|二人|2人)\s*(?:套餐|餐)?\s*[^\d￥¥]*(?:￥|¥)?\s*(\d+(?:\.\d+)?)\s*(?:r|R|元|块)?/) ||
    value.match(/(?:￥|¥)?\s*(\d+(?:\.\d+)?)\s*(?:r|R|元|块)?\s*(?:双人|两人|二人|2人)\s*(?:套餐|餐)?/);

  if (!match) return "";

  const price = Number(match[1]);
  if (!Number.isFinite(price) || price <= 0) return "";

  const perPerson = price / 2;
  const formatted = Number.isInteger(perPerson) ? perPerson.toFixed(0) : perPerson.toFixed(1);
  return `约¥${formatted}/人`;
}

function normalizeLocationScope(value: unknown): FoodRecordLocationScope {
  if (value === "nearby" || value === "附近随吃") return "nearby";
  if (value === "destination" || value === "专门出门") return "destination";
  return "";
}

function hasMeaningfulNote(note: ExtractedFoodNote) {
  return Boolean(
    note.shopName ||
      note.shopType ||
      note.location ||
      note.avgPrice ||
      note.recommendedDishes.length > 0 ||
      note.intro
  );
}

function normalizeImageInputs(value: unknown) {
  const images: ModelImageInput[] = [];

  function collect(candidate: unknown) {
    const normalized = normalizeImageInput(candidate);
    if (normalized) images.push(normalized);

    if (isRecord(candidate) && Array.isArray(candidate.variants)) {
      candidate.variants.forEach(collect);
    }
  }

  if (Array.isArray(value)) {
    value.forEach(collect);
  } else {
    collect(value);
  }

  const uniqueImages = new Map<string, ModelImageInput>();
  for (const image of images) {
    uniqueImages.set(`${image.mediaType}:${image.data.slice(0, 80)}:${image.data.length}`, image);
  }

  return Array.from(uniqueImages.values()).slice(0, 3);
}

function normalizeImageInput(value: unknown): ModelImageInput | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const mediaType = asString(record.mediaType);
  const data = asString(record.data);
  const label = limitText(asString(record.label), 40);

  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(data)) return null;
  if (data.length === 0 || data.length > MAX_IMAGE_BASE64_CHARS) return null;

  return { mediaType, data, label: label || undefined };
}

function formatModelStatus(result: ModelCallResult) {
  if (result.ok) return "ok";

  const label = result.label ? `${result.label}: ` : "";
  const status = result.status ? `${result.status}${result.statusText ? ` ${result.statusText}` : ""}` : result.statusText || "unknown error";
  const detail = result.detail ? ` - ${limitText(result.detail, 180)}` : "";
  return `${label}${status}${detail}`;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function limitText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).trimEnd();
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
