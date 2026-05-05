"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, ClipboardEvent, DragEvent, FormEvent, KeyboardEvent } from "react";
import {
  CheckCircle2,
  CircleDot,
  ClipboardPaste,
  ClipboardPenLine,
  Filter,
  FileImage,
  ImagePlus,
  Link2,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Star,
  Tag,
  Trash2,
  Utensils,
  WandSparkles,
  X
} from "lucide-react";
import { extractFoodNote } from "@/lib/extractor";
import type {
  ExtractedFoodNote,
  FoodRecord,
  FoodRecordDraft,
  FoodRecordLocationScope,
  FoodRecordRevisitWish,
  FoodRecordStatus
} from "@/lib/types";

const STORAGE_KEY = "eat-what.food-records.v1";
const ALL = "全部";
const DEFAULT_SHOP_TYPES = ["韩餐", "日料", "火锅", "烧烤", "咖啡", "甜品", "粤菜", "其他"];
const NOTE_COLORS = ["note-yellow", "note-mint", "note-blue", "note-pink", "note-cream", "note-lavender"];
const FIXTURE_TYPES = ["tape", "pin", "sticker"] as const;
const VIEW_MODE_FILTERS = [
  { label: "待打卡墙", value: "want" },
  { label: "已打卡收藏夹", value: "visited" },
  { label: "全部记录", value: "all" }
] as const;
const VIEW_MODE_TITLES: Record<ViewMode, string> = {
  all: "全部记录",
  want: "待打卡墙",
  visited: "已打卡收藏夹"
};
const LOCATION_SCOPE_FILTERS = [
  { label: "全部", value: "all" },
  { label: "附近随吃", value: "nearby" },
  { label: "专门出门", value: "destination" }
] as const;
const LOCATION_SCOPE_OPTIONS = [
  { label: "待补充", value: "" },
  { label: "附近随吃", value: "nearby" },
  { label: "专门出门", value: "destination" }
] as const;
const LOCATION_SCOPE_LABELS: Record<FoodRecordLocationScope, string> = {
  "": "待补充",
  nearby: "附近随吃",
  destination: "专门出门"
};
const REVISIT_WISH_OPTIONS = [
  { label: "想二刷", value: "yes" },
  { label: "看情况", value: "maybe" },
  { label: "不二刷", value: "no" }
] as const;
const REVISIT_WISH_LABELS: Record<FoodRecordRevisitWish, string> = {
  "": "待补充",
  yes: "想二刷",
  maybe: "看情况",
  no: "不二刷"
};
const TIME_FILTERS = [
  { label: "全部", value: "all" },
  { label: "本周", value: "this-week" },
  { label: "上周", value: "last-week" },
  { label: "自定义", value: "custom" }
] as const;
const ARCHIVE_ANIMATION_MS = 760;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_MODEL_IMAGE_EDGE = 1120;
const MAX_MODEL_IMAGE_PIXELS = 900_000;
const MODEL_IMAGE_QUALITY = 0.78;
const FALLBACK_MODEL_IMAGE_EDGE = 768;
const FALLBACK_MODEL_IMAGE_PIXELS = 420_000;
const FALLBACK_MODEL_IMAGE_QUALITY = 0.66;
const MAX_MODEL_IMAGE_BASE64_CHARS = 2_400_000;
const MAX_RAW_TEXT_CHARS = 8000;

type FixtureType = (typeof FIXTURE_TYPES)[number];
type ViewMode = (typeof VIEW_MODE_FILTERS)[number]["value"];
type LocationScopeFilter = (typeof LOCATION_SCOPE_FILTERS)[number]["value"];
type TimeFilter = (typeof TIME_FILTERS)[number]["value"];
type ModelImageVariant = {
  data: string;
  label?: string;
  mediaType: string;
};
type ModelImageInput = ModelImageVariant & {
  variants?: ModelImageVariant[];
};
type ExtractFoodNoteApiResponse = {
  error?: string;
  note?: ExtractedFoodNote;
  provider?: "modelscope" | "local";
  warning?: string;
};

const emptyDraft: FoodRecordDraft = {
  sourceUrl: "",
  rawText: "",
  shopName: "",
  shopType: "",
  locationScope: "",
  location: "",
  avgPrice: "",
  recommendedDishes: [],
  intro: "",
  customTags: [],
  status: "want",
  avoidNotes: "",
  revisitWish: ""
};

export default function Home() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [imageFileName, setImageFileName] = useState("");
  const [imageModelInput, setImageModelInput] = useState<ModelImageInput | null>(null);
  const [imageParseStatus, setImageParseStatus] = useState("");
  const [imageParseProgress, setImageParseProgress] = useState(0);
  const [imageParseError, setImageParseError] = useState("");
  const [isImageParsing, setIsImageParsing] = useState(false);
  const [isImageDropActive, setIsImageDropActive] = useState(false);
  const [isAiExtracting, setIsAiExtracting] = useState(false);
  const [aiExtractNotice, setAiExtractNotice] = useState("");
  const [records, setRecords] = useState<FoodRecord[]>([]);
  const [draft, setDraft] = useState<FoodRecordDraft | null>(null);
  const [inspectingRecord, setInspectingRecord] = useState<FoodRecord | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedViewMode, setSelectedViewMode] = useState<ViewMode>("all");
  const [selectedType, setSelectedType] = useState(ALL);
  const [selectedTag, setSelectedTag] = useState(ALL);
  const [selectedLocationScope, setSelectedLocationScope] = useState<LocationScopeFilter>("all");
  const [selectedLocation, setSelectedLocation] = useState(ALL);
  const [selectedTime, setSelectedTime] = useState<TimeFilter>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [exitingRecordIds, setExitingRecordIds] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageParseRunIdRef = useRef(0);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<FoodRecord>[];
        setRecords(Array.isArray(parsed) ? parsed.map(normalizeStoredRecord) : []);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }
  }, [isLoaded, records]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    return () => {
      imageParseRunIdRef.current += 1;
    };
  }, []);

  const inspectingRecordId = inspectingRecord?.id ?? null;

  useEffect(() => {
    if (!inspectingRecordId) return;

    const nextRecord = records.find((record) => record.id === inspectingRecordId);
    setInspectingRecord(nextRecord ?? null);
  }, [records, inspectingRecordId]);

  const shopTypes = useMemo(() => {
    const values = records.map((record) => record.shopType).filter(Boolean);
    return [ALL, ...Array.from(new Set([...DEFAULT_SHOP_TYPES, ...values]))];
  }, [records]);

  const customTags = useMemo(() => {
    const values = records.flatMap((record) => record.customTags).filter(Boolean);
    return [ALL, ...Array.from(new Set(values))];
  }, [records]);

  const locations = useMemo(() => {
    const values = records.map((record) => record.location).filter(Boolean);
    return [ALL, ...Array.from(new Set(values))];
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const typeMatched = selectedType === ALL || record.shopType === selectedType;
      const tagMatched = selectedTag === ALL || record.customTags.includes(selectedTag);
      const locationScopeMatched = selectedLocationScope === "all" || record.locationScope === selectedLocationScope;
      const locationMatched = selectedLocation === ALL || record.location === selectedLocation;
      const timeMatched = matchesTimeFilter(record.createdAt, selectedTime, customStartDate, customEndDate);
      const queryMatched = matchesSearchQuery(record, searchQuery);

      return typeMatched && tagMatched && locationScopeMatched && locationMatched && timeMatched && queryMatched;
    });
  }, [
    customEndDate,
    customStartDate,
    records,
    selectedLocation,
    selectedLocationScope,
    searchQuery,
    selectedTag,
    selectedTime,
    selectedType
  ]);

  const archivedTotal = useMemo(() => records.filter((record) => record.status === "visited").length, [records]);
  const wantTotal = useMemo(() => records.filter((record) => record.status !== "visited").length, [records]);
  const revisitTotal = useMemo(
    () => records.filter((record) => record.status === "visited" && record.revisitWish === "yes").length,
    [records]
  );
  const recentVisitedRecords = useMemo(
    () =>
      records
        .filter((record) => record.status === "visited")
        .sort((a, b) => {
          const aTime = new Date(a.visitedAt ?? a.updatedAt).getTime();
          const bTime = new Date(b.visitedAt ?? b.updatedAt).getTime();
          return bTime - aTime;
        })
        .slice(0, 2),
    [records]
  );

  const boardRecords = useMemo(
    () =>
      filteredRecords
        .filter((record) => record.status !== "visited")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [filteredRecords]
  );

  const archivedRecords = useMemo(
    () =>
      filteredRecords
        .filter((record) => record.status === "visited")
        .sort((a, b) => {
          const aTime = new Date(a.visitedAt ?? a.updatedAt).getTime();
          const bTime = new Date(b.visitedAt ?? b.updatedAt).getTime();
          return bTime - aTime;
        }),
    [filteredRecords]
  );
  const isCaptureBusy = isImageParsing || isAiExtracting;

  function openDraftFromExtracted(extracted: ExtractedFoodNote) {
    setDraft({
      ...emptyDraft,
      ...extracted,
      status: "want"
    });
    setEditingId(null);
  }

  function openDraftFromText(nextRawText: string) {
    const safeRawText = clampText(nextRawText, MAX_RAW_TEXT_CHARS);
    const extracted = extractFoodNote({ sourceUrl, rawText: safeRawText });
    openDraftFromExtracted(extracted);
  }

  async function handleExtract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const combinedRawText = rawText.trim();
    if (!sourceUrl.trim() && !combinedRawText.trim() && !imageModelInput) return;

    setIsAiExtracting(true);
    setAiExtractNotice("");

    try {
      const response = await fetch("/api/extract-food-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl,
          rawText: combinedRawText,
          image: imageModelInput
        })
      });
      const data = (await response.json()) as ExtractFoodNoteApiResponse;

      if (!response.ok || !data.note) {
        throw new Error(data.error || "AI 整理失败");
      }

      setRawText(data.note.rawText);
      openDraftFromExtracted(data.note);

      if (data.warning) {
        setAiExtractNotice(data.warning);
      }
    } catch (error) {
      setAiExtractNotice(`${getAiExtractErrorMessage(error)}，已先使用本地规则整理。`);
      openDraftFromText(combinedRawText);
    } finally {
      setIsAiExtracting(false);
    }
  }

  function handleImageInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleImageFiles(event.target.files);
    event.target.value = "";
  }

  function handleImagePaste(event: ClipboardEvent<HTMLElement>) {
    const imageFile = getFirstImageFile(event.clipboardData.files) ?? getFirstImageItemFile(event.clipboardData.items);
    if (!imageFile) return;

    event.preventDefault();
    event.stopPropagation();
    void parseImageFile(imageFile);
  }

  function handleImageDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsImageDropActive(hasImageFile(event.dataTransfer.items));
  }

  function handleImageDragLeave(event: DragEvent<HTMLElement>) {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;

    setIsImageDropActive(false);
  }

  function handleImageDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsImageDropActive(false);

    const imageFile = getFirstImageFile(event.dataTransfer.files);
    if (!imageFile) {
      setImageParseError("请拖入图片文件。");
      return;
    }

    void parseImageFile(imageFile);
  }

  function handleImageAreaKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    fileInputRef.current?.click();
  }

  async function handleImageFiles(files: FileList | null) {
    const imageFile = getFirstImageFile(files);
    if (!imageFile) {
      setImageParseError("没有找到可识别的图片文件。");
      return;
    }

    await parseImageFile(imageFile);
  }

  async function parseImageFile(file: File) {
    if (!isImageFile(file)) {
      setImageParseError("请选择 PNG、JPG、WEBP 等图片文件。");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setImageParseError(`图片有点大，建议控制在 ${formatFileSize(MAX_IMAGE_BYTES)} 以内。`);
      return;
    }

    const runId = imageParseRunIdRef.current + 1;
    imageParseRunIdRef.current = runId;

    setImageFileName(file.name || "粘贴图片");
    setImagePreviewUrl(URL.createObjectURL(file));
    setImageModelInput(null);
    setImageParseError("");
    setAiExtractNotice("");
    setImageParseProgress(0);
    setImageParseStatus("正在准备直传给模型的图片");
    setIsImageParsing(true);

    try {
      const preparedImage = await prepareImageForModel(file);

      if (imageParseRunIdRef.current !== runId) return;

      if (!preparedImage) {
        setImageParseError("图片准备失败，请换一张截图再试。");
        return;
      }

      setImageModelInput(preparedImage);
      setImageParseProgress(1);
      setImageParseStatus("图片已准备好，点击 AI 整理会直接发给模型");
    } catch (error) {
      if (imageParseRunIdRef.current !== runId) return;

      setImageParseError(getImagePrepareErrorMessage(error));
      setImageParseStatus("图片准备失败");
    } finally {
      if (imageParseRunIdRef.current === runId) {
        setIsImageParsing(false);
      }
    }
  }

  function clearImageParse() {
    imageParseRunIdRef.current += 1;
    setImagePreviewUrl("");
    setImageFileName("");
    setImageModelInput(null);
    setImageParseStatus("");
    setImageParseProgress(0);
    setImageParseError("");
    setIsImageParsing(false);
    setIsImageDropActive(false);
  }

  function handleSaveDraft(nextDraft: FoodRecordDraft) {
    const now = new Date().toISOString();
    const savedDraft = normalizeDraftForSave(nextDraft);

    if (editingId) {
      const targetRecord = records.find((record) => record.id === editingId);
      const shouldAnimateArchive = targetRecord?.status !== "visited" && savedDraft.status === "visited";
      const targetId = editingId;

      if (shouldAnimateArchive) {
        setExitingRecordIds((current) => (current.includes(targetId) ? current : [...current, targetId]));
        window.setTimeout(() => {
          setRecords((current) =>
            current.map((record) => (record.id === targetId ? applyDraftToRecord(record, savedDraft, now) : record))
          );
          setExitingRecordIds((current) => current.filter((id) => id !== targetId));
        }, ARCHIVE_ANIMATION_MS);
      } else {
        setRecords((current) =>
          current.map((record) => (record.id === targetId ? applyDraftToRecord(record, savedDraft, now) : record))
        );
      }
    } else {
      const newRecord: FoodRecord = {
        id: createId(),
        ...savedDraft,
        createdAt: now,
        updatedAt: now
      };
      setRecords((current) => [newRecord, ...current]);
      setSourceUrl("");
      setRawText("");
    }

    setDraft(null);
    setEditingId(null);
  }

  function handleEdit(record: FoodRecord) {
    setInspectingRecord(null);
    setEditingId(record.id);
    setDraft({
      sourceUrl: record.sourceUrl,
      rawText: record.rawText,
      shopName: record.shopName,
      shopType: record.shopType,
      locationScope: record.locationScope,
      location: record.location,
      avgPrice: record.avgPrice,
      recommendedDishes: record.recommendedDishes,
      intro: record.intro,
      customTags: record.customTags,
      status: record.status,
      visitedAt: record.visitedAt,
      rating: record.rating,
      visitNote: record.visitNote,
      avoidNotes: record.avoidNotes,
      revisitWish: record.revisitWish
    });
  }

  function handleVisit(record: FoodRecord) {
    setInspectingRecord(null);
    setEditingId(record.id);
    setDraft({
      sourceUrl: record.sourceUrl,
      rawText: record.rawText,
      shopName: record.shopName,
      shopType: record.shopType,
      locationScope: record.locationScope,
      location: record.location,
      avgPrice: record.avgPrice,
      recommendedDishes: record.recommendedDishes,
      intro: record.intro,
      customTags: record.customTags,
      status: "visited",
      visitedAt: toDateInputValue(new Date()),
      rating: record.rating ?? 4,
      visitNote: record.visitNote ?? "",
      avoidNotes: record.avoidNotes ?? "",
      revisitWish: record.revisitWish ?? "maybe"
    });
  }

  function handleDelete(id: string) {
    const confirmed = window.confirm("确定要删除这张便利贴吗？");
    if (confirmed) {
      setRecords((current) => current.filter((record) => record.id !== id));
      setInspectingRecord((current) => (current?.id === id ? null : current));
    }
  }

  function clearFilters() {
    setSearchQuery("");
    setSelectedViewMode("all");
    setSelectedType(ALL);
    setSelectedTag(ALL);
    setSelectedLocationScope("all");
    setSelectedLocation(ALL);
    setSelectedTime("all");
    setCustomStartDate("");
    setCustomEndDate("");
  }

  return (
    <main className="app-shell">
      <header className="journal-header">
        <div className="brand-block">
          <div className="brand-mark">
            <Utensils size={24} aria-hidden />
          </div>
          <div>
            <p className="eyebrow">XHS FOOD BOARD</p>
            <h1>饭签</h1>
            <p className="handwritten-line">把刷到的美食，变成一张待打卡小票贴起来吧！</p>
          </div>
        </div>

        <div className="header-ticket">
          <span>LOCAL FIRST</span>
          <strong>{records.length.toString().padStart(2, "0")}</strong>
          <span>RECEIPTS SAVED</span>
        </div>
      </header>

      <div className="workspace-layout">
        <section className="board-frame" aria-label="手账小票拼贴看板">
          <div className="board-toolbar">
            <div>
              <p className="eyebrow">
                已取下{archivedTotal}/{records.length}个贴上的小票
              </p>
              <h2>{VIEW_MODE_TITLES[selectedViewMode]}</h2>
            </div>
            <div className="board-actions">
              <label className="search-field">
                <Search size={16} aria-hidden />
                <input
                  aria-label="搜索店名、菜品、标签、地点或备注"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索店名 / 菜品 / 标签 / 地点"
                  type="search"
                />
              </label>
              <div className="record-count">
                <CircleDot size={16} aria-hidden />
                <span>
                  待打卡 <strong>{wantTotal}</strong> 家
                </span>
                <i aria-hidden />
                <span>
                  已打卡 <strong>{archivedTotal}</strong> 家
                </span>
              </div>
            </div>
          </div>

          <div className="canvas-board">
            <p className="scribble-note scribble-top">today finds / keep the good bites</p>
            {selectedViewMode === "all" ? (
              <AllRecordsBoard
                archivedRecords={archivedRecords}
                boardRecords={boardRecords}
                exitingRecordIds={exitingRecordIds}
                onDelete={handleDelete}
                onEdit={handleEdit}
                onOpenDetail={setInspectingRecord}
                onVisit={handleVisit}
              />
            ) : selectedViewMode === "visited" ? (
              <ArchivedRecordsBoard records={archivedRecords} onDelete={handleDelete} onEdit={handleEdit} />
            ) : boardRecords.length > 0 ? (
              <BoardNoteGrid
                records={boardRecords}
                exitingRecordIds={exitingRecordIds}
                onDelete={handleDelete}
                onEdit={handleEdit}
                onOpenDetail={setInspectingRecord}
                onVisit={handleVisit}
              />
            ) : (
              <div className="empty-board">
                <Search size={34} aria-hidden />
                <h2>还没有待打卡的小票</h2>
                <p>粘贴一条美食笔记，确认解析结果后就会钉到今天的板块里。</p>
              </div>
            )}
            <p className="scribble-note scribble-bottom">rated later, remembered longer.</p>
          </div>
        </section>

        <aside className="tool-rail" aria-label="右侧记录和筛选工具栏">
          <form className="capture-card" onPaste={handleImagePaste} onSubmit={handleExtract}>
            <div className="card-heading">
              <WandSparkles size={20} aria-hidden />
              <h2>AI 整理想吃的店</h2>
            </div>
            <label>
              <span>
                <Link2 size={16} aria-hidden />
                小红书链接
              </span>
              <input
                value={sourceUrl}
                onChange={(event) => {
                  setSourceUrl(event.target.value);
                  setAiExtractNotice("");
                }}
                placeholder="可选，只作为来源备注保存"
                inputMode="url"
                type="text"
              />
            </label>
            <div
              className={`image-parser ${isImageDropActive ? "is-active" : ""} ${isImageParsing ? "is-loading" : ""}`}
              onDragLeave={handleImageDragLeave}
              onDragOver={handleImageDragOver}
              onDrop={handleImageDrop}
              onKeyDown={handleImageAreaKeyDown}
              onPaste={handleImagePaste}
              tabIndex={0}
            >
              <input
                accept="image/*"
                aria-label="选择店铺截图"
                className="visually-hidden-input"
                onChange={handleImageInputChange}
                ref={fileInputRef}
                type="file"
              />
              <div className="image-parser-main">
                <div className="image-parser-icon">
                  <ImagePlus size={22} aria-hidden />
                </div>
                 <div>
                  <span>图片直传模型理解</span>
                  <p>本地选择、拖进来，或直接粘贴截图；只压缩图片，不做本地 OCR。</p>
                </div>
              </div>
              <div className="image-parser-actions">
                <button
                  className="mini-button"
                  disabled={isImageParsing}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <FileImage size={15} aria-hidden />
                  本地选择
                </button>
                <span>
                  <ClipboardPaste size={14} aria-hidden />
                  支持复制粘贴
                </span>
              </div>
              {imagePreviewUrl ? (
                <div className="image-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="待识别店铺截图预览" src={imagePreviewUrl} />
                  <div>
                    <strong>{imageFileName || "店铺截图"}</strong>
                    <span>
                      {isImageParsing
                        ? imageParseStatus || "正在准备图片"
                        : imageModelInput
                          ? "图片已准备好"
                          : "等待准备"}
                    </span>
                  </div>
                  <button aria-label="清除图片" onClick={clearImageParse} type="button">
                    <X size={14} aria-hidden />
                  </button>
                </div>
              ) : null}
              {isImageParsing ? (
                <div className="image-progress" aria-live="polite">
                  <div>
                    <LoaderCircle className="spin-icon" size={14} aria-hidden />
                    <span>{imageParseStatus || "正在准备图片"}</span>
                  </div>
                  <i style={{ width: `${Math.round(imageParseProgress * 100)}%` }} />
                </div>
              ) : null}
              {imageParseError ? <p className="image-parser-error">{imageParseError}</p> : null}
            </div>
            <label>
              <span>
                <ClipboardPenLine size={16} aria-hidden />
                帖子正文
              </span>
              <textarea
                value={rawText}
                onChange={(event) => {
                  setRawText(event.target.value);
                  setAiExtractNotice("");
                }}
                placeholder="粘贴小红书文案、群聊片段，或者随手写下想吃的店。不用填很完整，饭签会先帮你整理成一张小票草稿。"
                rows={5}
              />
            </label>
            {aiExtractNotice ? (
              <p className="ai-extract-notice" aria-live="polite">
                {aiExtractNotice}
              </p>
            ) : null}
            <button
              className="primary-button"
              type="submit"
              disabled={isCaptureBusy || (!sourceUrl.trim() && !rawText.trim() && !imageModelInput)}
            >
              {isCaptureBusy ? <LoaderCircle className="spin-icon" size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
              {isImageParsing ? "图片准备中" : isAiExtracting ? "AI 整理中" : "AI 整理成小票"}
            </button>
          </form>

          <section className="filter-card" aria-label="筛选">
            <div className="card-heading">
              <Filter size={20} aria-hidden />
              <h2>筛选</h2>
            </div>
            <OptionFilterGroup
              label="查看范围"
              options={VIEW_MODE_FILTERS}
              selected={selectedViewMode}
              onSelect={setSelectedViewMode}
            />
            <FilterGroup label="店铺类型" values={shopTypes} selected={selectedType} onSelect={setSelectedType} />
            <OptionFilterGroup
              label="地点范围"
              options={LOCATION_SCOPE_FILTERS}
              selected={selectedLocationScope}
              onSelect={setSelectedLocationScope}
            />
            <FilterGroup label="地点" values={locations} selected={selectedLocation} onSelect={setSelectedLocation} />
            <div className="filter-group">
              <p>记录时间</p>
              <div className="chip-row">
                {TIME_FILTERS.map((filter) => (
                  <button
                    className={`chip ${selectedTime === filter.value ? "is-active" : ""}`}
                    key={filter.value}
                    onClick={() => setSelectedTime(filter.value)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              {selectedTime === "custom" ? (
                <div className="date-range-inputs">
                  <input
                    aria-label="开始日期"
                    onChange={(event) => setCustomStartDate(event.target.value)}
                    type="date"
                    value={customStartDate}
                  />
                  <input
                    aria-label="结束日期"
                    onChange={(event) => setCustomEndDate(event.target.value)}
                    type="date"
                    value={customEndDate}
                  />
                </div>
              ) : null}
            </div>
            <FilterGroup label="自定义标签" values={customTags} selected={selectedTag} onSelect={setSelectedTag} />
            <button className="ghost-button" type="button" onClick={clearFilters}>
              <RotateCcw size={16} aria-hidden />
              全部恢复
            </button>
          </section>

          <FoodStats
            archivedTotal={archivedTotal}
            recentVisitedRecords={recentVisitedRecords}
            revisitTotal={revisitTotal}
            total={records.length}
            wantTotal={wantTotal}
            onViewArchive={() => setSelectedViewMode("visited")}
          />
        </aside>
      </div>

      {draft ? (
        <DraftDialog
          draft={draft}
          isEditing={Boolean(editingId)}
          onClose={() => {
            setDraft(null);
            setEditingId(null);
          }}
          onSave={handleSaveDraft}
        />
      ) : null}

      {inspectingRecord ? (
        <RecordDetailDialog
          record={inspectingRecord}
          onClose={() => setInspectingRecord(null)}
          onDelete={handleDelete}
          onEdit={handleEdit}
        />
      ) : null}
    </main>
  );
}

function getFirstImageFile(files: FileList | null) {
  return Array.from(files ?? []).find(isImageFile) ?? null;
}

function getFirstImageItemFile(items: DataTransferItemList) {
  const imageItem = Array.from(items).find((item) => item.kind === "file" && item.type.startsWith("image/"));
  return imageItem?.getAsFile() ?? null;
}

function hasImageFile(items: DataTransferItemList) {
  return Array.from(items).some((item) => item.kind === "file" && item.type.startsWith("image/"));
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

async function prepareImageForModel(file: File): Promise<ModelImageInput | null> {
  const primary = await prepareImageVariant(file, {
    label: "primary",
    maxEdge: MAX_MODEL_IMAGE_EDGE,
    maxPixels: MAX_MODEL_IMAGE_PIXELS,
    quality: MODEL_IMAGE_QUALITY
  });

  if (!primary) return null;

  const compact = await prepareImageVariant(file, {
    label: "compact",
    maxEdge: FALLBACK_MODEL_IMAGE_EDGE,
    maxPixels: FALLBACK_MODEL_IMAGE_PIXELS,
    quality: FALLBACK_MODEL_IMAGE_QUALITY
  });

  return {
    ...primary,
    variants: compact && compact.data !== primary.data ? [compact] : []
  };
}

async function prepareImageVariant(
  file: File,
  options: {
    label: string;
    maxEdge: number;
    maxPixels: number;
    quality: number;
  }
): Promise<ModelImageVariant | null> {
  const blob = await resizeImage(file, options);
  const target = blob ?? file;
  const data = await blobToBase64Data(target);

  if (!data || data.length > MAX_MODEL_IMAGE_BASE64_CHARS) return null;

  return {
    data,
    label: options.label,
    mediaType: target.type || "image/jpeg"
  };
}

async function resizeImage(
  file: File,
  {
    maxEdge,
    maxPixels,
    quality
  }: {
    maxEdge: number;
    maxPixels: number;
    quality: number;
  }
) {
  if (typeof createImageBitmap !== "function") return null;

  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  try {
    const scale = Math.min(
      1,
      maxEdge / Math.max(bitmap.width, bitmap.height),
      Math.sqrt(maxPixels / (bitmap.width * bitmap.height))
    );

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    return blob;
  } finally {
    bitmap.close();
  }
}

function blobToBase64Data(blob: Blob) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

function clampText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).trimEnd();
}

function formatFileSize(bytes: number) {
  const megabytes = bytes / 1024 / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)}MB`;
}

function getImagePrepareErrorMessage(error: unknown) {
  if (error instanceof Error) return `图片准备失败：${error.message}`;
  return "图片准备失败，请换一张截图再试。";
}

function getAiExtractErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "AI 整理失败";
}

function FilterGroup({
  label,
  values,
  selected,
  onSelect
}: {
  label: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="filter-group">
      <p>{label}</p>
      <div className="chip-row">
        {values.map((value) => (
          <button
            className={`chip ${selected === value ? "is-active" : ""}`}
            key={value}
            onClick={() => onSelect(value)}
            type="button"
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function OptionFilterGroup<T extends string>({
  label,
  options,
  selected,
  onSelect
}: {
  label: string;
  options: readonly { label: string; value: T }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="filter-group">
      <p>{label}</p>
      <div className="chip-row">
        {options.map((option) => (
          <button
            className={`chip ${selected === option.value ? "is-active" : ""}`}
            key={option.value || option.label}
            onClick={() => onSelect(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BoardNoteGrid({
  records,
  exitingRecordIds,
  onEdit,
  onDelete,
  onOpenDetail,
  onVisit
}: {
  records: FoodRecord[];
  exitingRecordIds: string[];
  onEdit: (record: FoodRecord) => void;
  onDelete: (id: string) => void;
  onOpenDetail: (record: FoodRecord) => void;
  onVisit: (record: FoodRecord) => void;
}) {
  return (
    <div className="board-note-grid">
      {records.map((record, index) => (
        <FoodNote
          colorClass={NOTE_COLORS[index % NOTE_COLORS.length]}
          fixtureType={getFixtureType(index)}
          key={record.id}
          record={record}
          isExiting={exitingRecordIds.includes(record.id)}
          shiftX={getShiftX(index)}
          shiftY={getShiftY(index)}
          stack={getStack(index)}
          tilt={getTilt(index)}
          onDelete={onDelete}
          onEdit={onEdit}
          onOpenDetail={onOpenDetail}
          onVisit={onVisit}
        />
      ))}
    </div>
  );
}

function AllRecordsBoard({
  archivedRecords,
  boardRecords,
  exitingRecordIds,
  onEdit,
  onDelete,
  onOpenDetail,
  onVisit
}: {
  archivedRecords: FoodRecord[];
  boardRecords: FoodRecord[];
  exitingRecordIds: string[];
  onEdit: (record: FoodRecord) => void;
  onDelete: (id: string) => void;
  onOpenDetail: (record: FoodRecord) => void;
  onVisit: (record: FoodRecord) => void;
}) {
  return (
    <div className="all-records-board">
      <section className="record-section">
        <div className="record-section-heading">
          <div>
            <p className="eyebrow">WANT TO GO</p>
            <h3>待打卡墙</h3>
          </div>
          <span>{boardRecords.length} 家</span>
        </div>
        {boardRecords.length > 0 ? (
          <BoardNoteGrid
            records={boardRecords}
            exitingRecordIds={exitingRecordIds}
            onDelete={onDelete}
            onEdit={onEdit}
            onOpenDetail={onOpenDetail}
            onVisit={onVisit}
          />
        ) : (
          <EmptyState title="还没有待打卡的小票" description="粘贴一条美食笔记，确认解析结果后就会贴到这里。" />
        )}
      </section>

      <section className="record-section archive-record-section">
        <div className="record-section-heading">
          <div>
            <p className="eyebrow">CHECKED RECEIPTS</p>
            <h3>已打卡列表</h3>
          </div>
          <span>{archivedRecords.length} 家</span>
        </div>
        <ArchivedRecordsBoard records={archivedRecords} onDelete={onDelete} onEdit={onEdit} />
      </section>
    </div>
  );
}

function ArchivedRecordsBoard({
  records,
  onEdit,
  onDelete
}: {
  records: FoodRecord[];
  onEdit: (record: FoodRecord) => void;
  onDelete: (id: string) => void;
}) {
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedRecordId && !records.some((record) => record.id === selectedRecordId)) {
      setSelectedRecordId(null);
    }
  }, [records, selectedRecordId]);

  if (records.length === 0) {
    return <EmptyState title="还没有已打卡记录" description="吃完后给小票打卡，真实评价会沉淀到这里。" />;
  }

  const selectedRecord = selectedRecordId ? records.find((record) => record.id === selectedRecordId) : undefined;

  return (
    <div className="archive-main-list">
      <div className="archive-table" role="list">
        <div className="archive-table-header" aria-hidden>
          <span>店名</span>
          <span>类型</span>
          <span>地点</span>
          <span>打卡</span>
        </div>
        {records.map((record) => (
          <div className="archive-row-group" key={record.id} role="listitem">
            <button
              aria-expanded={selectedRecord?.id === record.id}
              className={`archive-table-row ${selectedRecord?.id === record.id ? "is-selected" : ""}`}
              onClick={() => setSelectedRecordId((current) => (current === record.id ? null : record.id))}
              type="button"
            >
              <span>{record.shopName || "未命名店铺"}</span>
              <span>{record.shopType || "未分类"}</span>
              <span>{formatLocationSummary(record)}</span>
              <span>
                {record.visitedAt ? formatShortDate(record.visitedAt) : "已打卡"}
                {record.rating ? ` · ${record.rating}/5` : ""}
              </span>
            </button>
            {selectedRecord?.id === record.id ? (
              <ArchiveDetail
                className="archive-inline-detail"
                record={record}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-board">
      <Search size={34} aria-hidden />
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function FoodStats({
  archivedTotal,
  recentVisitedRecords,
  revisitTotal,
  total,
  wantTotal,
  onViewArchive
}: {
  archivedTotal: number;
  recentVisitedRecords: FoodRecord[];
  revisitTotal: number;
  total: number;
  wantTotal: number;
  onViewArchive: () => void;
}) {
  return (
    <section className="stats-card" aria-label="饭签统计">
      <div className="card-heading">
        <CircleDot size={20} aria-hidden />
        <h2>饭签统计</h2>
      </div>
      <dl className="stats-list">
        <div>
          <dt>全部</dt>
          <dd>{total} 家</dd>
        </div>
        <div>
          <dt>待打卡</dt>
          <dd>{wantTotal} 家</dd>
        </div>
        <div>
          <dt>已打卡</dt>
          <dd>{archivedTotal} 家</dd>
        </div>
        <div>
          <dt>可二刷</dt>
          <dd>{revisitTotal} 家</dd>
        </div>
      </dl>

      <div className="recent-visited">
        <p>最近打卡</p>
        {recentVisitedRecords.length > 0 ? (
          recentVisitedRecords.map((record) => (
            <span key={record.id}>
              {record.shopName || "未命名店铺"}｜{record.rating ? record.rating : "未评分"}
            </span>
          ))
        ) : (
          <span>还没有打卡记录</span>
        )}
      </div>

      <button className="ghost-button" onClick={onViewArchive} type="button">
        查看全部归档
      </button>
    </section>
  );
}

function FoodNote({
  record,
  colorClass,
  fixtureType,
  isExiting,
  shiftX,
  shiftY,
  stack,
  tilt,
  onEdit,
  onDelete,
  onOpenDetail,
  onVisit
}: {
  record: FoodRecord;
  colorClass: string;
  fixtureType: FixtureType;
  isExiting: boolean;
  shiftX: number;
  shiftY: number;
  stack: number;
  tilt: number;
  onEdit: (record: FoodRecord) => void;
  onDelete: (id: string) => void;
  onOpenDetail: (record: FoodRecord) => void;
  onVisit: (record: FoodRecord) => void;
}) {
  function handleKeyboardOpen(event: KeyboardEvent<HTMLElement>) {
    if (event.currentTarget !== event.target) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenDetail(record);
    }
  }

  return (
    <article
      aria-label={`查看${record.shopName || "未命名店铺"}完整信息`}
      className={`food-note ${colorClass} ${isExiting ? "is-exiting" : ""}`}
      onClick={() => onOpenDetail(record)}
      onKeyDown={handleKeyboardOpen}
      role="button"
      style={
        {
          "--shift-x": `${shiftX}px`,
          "--shift-y": `${shiftY}px`,
          "--stack": stack,
          "--tilt": `${tilt}deg`
        } as CSSProperties
      }
      tabIndex={0}
    >
      <ReceiptFixture type={fixtureType} />
      <span className="archive-stroke" aria-hidden />
      <div className="note-actions" onClick={(event) => event.stopPropagation()}>
        <button aria-label="编辑" onClick={() => onEdit(record)} type="button">
          <Pencil size={15} aria-hidden />
        </button>
        <button aria-label="删除" onClick={() => onDelete(record.id)} type="button">
          <Trash2 size={15} aria-hidden />
        </button>
      </div>

      <header className="receipt-header">
        <span className={`status-pill ${record.status === "visited" ? "visited" : ""}`}>
          {record.status === "visited" ? "已打卡" : "待打卡"}
        </span>
        <p>FOOD RECEIPT</p>
        <h3>{record.shopName || "未命名店铺"}</h3>
        <span className="receipt-id">NO. {record.id.slice(0, 8).toUpperCase()}</span>
      </header>

      <div className="receipt-divider" aria-hidden />

      <div className="receipt-data">
        <div>
          <span>TYPE</span>
          <strong>
            <Tag size={13} aria-hidden />
            {record.shopType || "未分类"}
          </strong>
        </div>
        <div>
          <span>PLACE</span>
          <strong>
            <MapPin size={13} aria-hidden />
            {formatLocationSummary(record)}
          </strong>
        </div>
        <div>
          <span>AVG</span>
          <strong>{record.avgPrice || "--"}</strong>
        </div>
        <div>
          <span>TIME</span>
          <strong>{formatReceiptTimestamp(record.createdAt)}</strong>
        </div>
      </div>

      {record.recommendedDishes.length > 0 ? (
        <p className="dish-line">ITEMS / {record.recommendedDishes.join(" + ")}</p>
      ) : null}
      {record.intro ? <p className="intro-line">{record.intro}</p> : null}
      {record.sourceUrl ? <p className="source-line">SOURCE / 小红书链接</p> : null}

      {record.customTags.length > 0 ? (
        <div className="tag-list">
          {record.customTags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}
      {record.status === "visited" ? (
        <div className="visited-box">
          <span>
            <Star size={14} aria-hidden />
            {record.rating ? `${record.rating}/5` : "已去"}
            {record.visitedAt ? ` · ${formatShortDate(record.visitedAt)}` : ""}
          </span>
          {record.visitNote ? <p>{record.visitNote}</p> : null}
          {record.avoidNotes ? <p>避雷：{record.avoidNotes}</p> : null}
          {record.revisitWish ? <p>二刷：{formatRevisitWish(record.revisitWish)}</p> : null}
        </div>
      ) : (
        <button
          className="visit-button"
          onClick={(event) => {
            event.stopPropagation();
            onVisit(record);
          }}
          type="button"
        >
          <CheckCircle2 size={16} aria-hidden />
          标记已打卡
        </button>
      )}

      <div className="barcode" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}

function ReceiptFixture({ type }: { type: FixtureType }) {
  return <span className={`receipt-fixture fixture-${type}`} aria-hidden />;
}

function ArchiveDetail({
  className = "",
  record,
  onDelete,
  onEdit
}: {
  className?: string;
  record: FoodRecord;
  onDelete: (id: string) => void;
  onEdit: (record: FoodRecord) => void;
}) {
  return (
    <article className={`archive-detail archive-full-detail ${className}`.trim()}>
      <p className="receipt-id">NO. {record.id.slice(0, 8).toUpperCase()}</p>
      <h3>{record.shopName || "未命名店铺"}</h3>
      <dl>
        <div>
          <dt>状态</dt>
          <dd>{record.status === "visited" ? "已打卡" : "待打卡"}</dd>
        </div>
        <div>
          <dt>类型</dt>
          <dd>{record.shopType || "未分类"}</dd>
        </div>
        <div>
          <dt>范围</dt>
          <dd>{formatLocationScope(record.locationScope)}</dd>
        </div>
        <div>
          <dt>地点</dt>
          <dd>{record.location || "地点待补充"}</dd>
        </div>
        <div>
          <dt>人均</dt>
          <dd>{record.avgPrice || "--"}</dd>
        </div>
        <div>
          <dt>推荐</dt>
          <dd>{record.recommendedDishes.length > 0 ? record.recommendedDishes.join("、") : "未填写"}</dd>
        </div>
        <div>
          <dt>标签</dt>
          <dd>{record.customTags.length > 0 ? record.customTags.map((tag) => `#${tag}`).join(" ") : "未填写"}</dd>
        </div>
        <div>
          <dt>来源</dt>
          <dd>
            {record.sourceUrl ? (
              <a href={record.sourceUrl} rel="noreferrer" target="_blank">
                {record.sourceUrl}
              </a>
            ) : (
              "未填写"
            )}
          </dd>
        </div>
        <div>
          <dt>加入</dt>
          <dd>{formatReceiptTimestamp(record.createdAt)}</dd>
        </div>
        <div>
          <dt>更新</dt>
          <dd>{formatReceiptTimestamp(record.updatedAt)}</dd>
        </div>
        <div>
          <dt>打卡</dt>
          <dd>
            {record.visitedAt ? formatShortDate(record.visitedAt) : "已打卡"}
            {record.rating ? ` · ${record.rating}/5` : ""}
          </dd>
        </div>
        <div>
          <dt>二刷</dt>
          <dd>{record.revisitWish ? formatRevisitWish(record.revisitWish) : "未填写"}</dd>
        </div>
      </dl>
      {record.intro ? <p className="archive-detail-line">备注：{record.intro}</p> : null}
      {record.visitNote ? <p className="archive-detail-note">评价：{record.visitNote}</p> : null}
      {record.avoidNotes ? <p className="archive-detail-line">避雷点：{record.avoidNotes}</p> : null}
      {record.rawText ? <p className="archive-detail-line archive-raw-text">原始文本：{record.rawText}</p> : null}
      <div className="archive-actions">
        <button onClick={() => onEdit(record)} type="button">
          <Pencil size={14} aria-hidden />
          编辑
        </button>
        <button onClick={() => onDelete(record.id)} type="button">
          <Trash2 size={14} aria-hidden />
          删除
        </button>
      </div>
    </article>
  );
}

function RecordDetailDialog({
  record,
  onClose,
  onDelete,
  onEdit
}: {
  record: FoodRecord;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: (record: FoodRecord) => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div aria-labelledby="record-detail-title" aria-modal="true" className="draft-dialog detail-dialog" role="dialog">
        <div className="dialog-title">
          <div>
            <p className="eyebrow">RECEIPT DETAIL</p>
            <h2 id="record-detail-title">完整小票信息</h2>
          </div>
          <button aria-label="关闭" className="icon-button" onClick={onClose} type="button">
            <X size={18} aria-hidden />
          </button>
        </div>
        <ArchiveDetail className="detail-dialog-receipt" record={record} onDelete={onDelete} onEdit={onEdit} />
      </div>
    </div>
  );
}

function applyDraftToRecord(record: FoodRecord, draft: FoodRecordDraft, updatedAt: string): FoodRecord {
  return {
    ...record,
    ...normalizeDraftForSave(draft),
    updatedAt,
  };
}

function normalizeStoredRecord(record: Partial<FoodRecord>): FoodRecord {
  const now = new Date().toISOString();
  const status = normalizeStatus(record.status);

  return {
    id: record.id || createId(),
    sourceUrl: record.sourceUrl ?? "",
    rawText: clampText(record.rawText ?? "", MAX_RAW_TEXT_CHARS),
    shopName: record.shopName ?? "",
    shopType: record.shopType ?? "",
    locationScope: normalizeLocationScope(record.locationScope, `${record.location ?? ""} ${record.rawText ?? ""}`),
    location: record.location ?? "",
    avgPrice: record.avgPrice ?? "",
    recommendedDishes: Array.isArray(record.recommendedDishes) ? cleanList(record.recommendedDishes) : [],
    intro: record.intro ?? "",
    customTags: Array.isArray(record.customTags) ? cleanList(record.customTags) : [],
    status,
    createdAt: record.createdAt ?? now,
    updatedAt: record.updatedAt ?? record.createdAt ?? now,
    visitedAt: status === "visited" ? record.visitedAt : undefined,
    rating: typeof record.rating === "number" ? record.rating : undefined,
    visitNote: status === "visited" ? record.visitNote : undefined,
    avoidNotes: status === "visited" ? record.avoidNotes : undefined,
    revisitWish: status === "visited" ? normalizeRevisitWish(record.revisitWish) : undefined
  };
}

function normalizeDraftForSave(draft: FoodRecordDraft): FoodRecordDraft {
  const isVisited = draft.status === "visited";

  return {
    ...draft,
    sourceUrl: draft.sourceUrl.trim(),
    rawText: clampText(draft.rawText, MAX_RAW_TEXT_CHARS),
    shopName: draft.shopName.trim(),
    shopType: draft.shopType.trim(),
    locationScope: normalizeLocationScope(draft.locationScope),
    location: draft.location.trim(),
    avgPrice: draft.avgPrice.trim(),
    recommendedDishes: cleanList(draft.recommendedDishes),
    intro: draft.intro.trim(),
    customTags: cleanList(draft.customTags),
    visitedAt: isVisited ? draft.visitedAt || toDateInputValue(new Date()) : undefined,
    rating: isVisited ? draft.rating : undefined,
    visitNote: isVisited ? draft.visitNote?.trim() : undefined,
    avoidNotes: isVisited ? draft.avoidNotes?.trim() : undefined,
    revisitWish: isVisited ? normalizeRevisitWish(draft.revisitWish) : undefined
  };
}

function normalizeStatus(value: unknown): FoodRecordStatus {
  return value === "visited" ? "visited" : "want";
}

function normalizeLocationScope(value: unknown, source = ""): FoodRecordLocationScope {
  if (value === "nearby" || value === "附近随吃") return "nearby";
  if (value === "destination" || value === "专门出门") return "destination";

  if (/专门|特意|出门|周末|打车|地铁|商圈|体育西|东山口|北京路|珠江新城|客村|江南西|天河|海珠|越秀/i.test(source)) {
    return "destination";
  }

  if (/附近|顺路|下课|课后|学校|宿舍|大学城|南亭|北亭|gogo|穗石/i.test(source)) {
    return "nearby";
  }

  return "";
}

function normalizeRevisitWish(value: unknown): FoodRecordRevisitWish {
  if (value === "yes" || value === "maybe" || value === "no") return value;
  if (value === "想二刷") return "yes";
  if (value === "看情况") return "maybe";
  if (value === "不二刷") return "no";
  return "";
}

function formatLocationScope(value: FoodRecordLocationScope | undefined) {
  return LOCATION_SCOPE_LABELS[normalizeLocationScope(value)];
}

function formatLocationSummary(record: FoodRecord) {
  const location = record.location || "地点待补充";
  return record.locationScope ? `${formatLocationScope(record.locationScope)} - ${location}` : location;
}

function formatRevisitWish(value: FoodRecordRevisitWish | undefined) {
  return REVISIT_WISH_LABELS[normalizeRevisitWish(value)];
}

function matchesSearchQuery(record: FoodRecord, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    record.shopName,
    record.shopType,
    formatLocationScope(record.locationScope),
    record.location,
    record.avgPrice,
    record.recommendedDishes.join(" "),
    record.customTags.join(" "),
    record.intro,
    record.visitNote,
    record.avoidNotes,
    record.revisitWish ? formatRevisitWish(record.revisitWish) : "",
    record.sourceUrl,
    record.rawText
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function matchesTimeFilter(value: string, filter: TimeFilter, customStart: string, customEnd: string) {
  if (filter === "all") return true;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  if (filter === "this-week") {
    const { start, end } = getWeekRange(new Date());
    return date >= start && date <= end;
  }

  if (filter === "last-week") {
    const today = new Date();
    today.setDate(today.getDate() - 7);
    const { start, end } = getWeekRange(today);
    return date >= start && date <= end;
  }

  const start = customStart ? new Date(`${customStart}T00:00:00`) : null;
  const end = customEnd ? new Date(`${customEnd}T23:59:59`) : null;

  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function getWeekRange(reference: Date) {
  const start = new Date(reference);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function DraftDialog({
  draft,
  isEditing,
  onClose,
  onSave
}: {
  draft: FoodRecordDraft;
  isEditing: boolean;
  onClose: () => void;
  onSave: (draft: FoodRecordDraft) => void;
}) {
  const [localDraft, setLocalDraft] = useState<FoodRecordDraft>(draft);
  const [dishText, setDishText] = useState(draft.recommendedDishes.join("、"));
  const [tagText, setTagText] = useState(draft.customTags.join("、"));

  function updateField<K extends keyof FoodRecordDraft>(key: K, value: FoodRecordDraft[K]) {
    setLocalDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      ...localDraft,
      recommendedDishes: splitList(dishText),
      customTags: splitList(tagText),
      visitedAt: localDraft.status === "visited" ? localDraft.visitedAt || toDateInputValue(new Date()) : undefined,
      rating: localDraft.status === "visited" ? localDraft.rating : undefined,
      visitNote: localDraft.status === "visited" ? localDraft.visitNote : undefined,
      avoidNotes: localDraft.status === "visited" ? localDraft.avoidNotes : undefined,
      revisitWish: localDraft.status === "visited" ? localDraft.revisitWish : undefined
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="draft-dialog" onSubmit={handleSubmit}>
        <div className="dialog-title">
          <div>
            <p className="eyebrow">{isEditing ? "EDIT NOTE" : "PARSE PREVIEW"}</p>
            <h2>{isEditing ? "编辑便利贴" : "AI 已帮你整理出一张待打卡小票"}</h2>
          </div>
          <button aria-label="关闭" className="icon-button" onClick={onClose} type="button">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="form-grid">
          <label>
            <span>店铺名称</span>
            <input
              value={localDraft.shopName}
              onChange={(event) => updateField("shopName", event.target.value)}
              placeholder="例如：阿婆牛杂"
            />
          </label>
          <label>
            <span>店铺类型</span>
            <input
              value={localDraft.shopType}
              onChange={(event) => updateField("shopType", event.target.value)}
              placeholder="例如：火锅、咖啡、甜品"
            />
          </label>
          <div className="field-control">
            <span>地点范围</span>
            <div className="segmented scope-segmented">
              {LOCATION_SCOPE_OPTIONS.map((option) => (
                <button
                  className={localDraft.locationScope === option.value ? "is-active" : ""}
                  key={option.value || option.label}
                  onClick={() => updateField("locationScope", option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span>地点名称</span>
            <input
              value={localDraft.location}
              onChange={(event) => updateField("location", event.target.value)}
              placeholder="例如：南亭、GOGO、体育西"
            />
          </label>
          <label>
            <span>人均</span>
            <input
              value={localDraft.avgPrice}
              onChange={(event) => updateField("avgPrice", event.target.value)}
              placeholder="例如：¥80"
            />
          </label>
        </div>

        <label>
          <span>推荐菜品</span>
          <input value={dishText} onChange={(event) => setDishText(event.target.value)} placeholder="用顿号或逗号分隔" />
        </label>
        <label>
          <span>自定义标签</span>
          <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="例如：周末、约会、想二刷" />
        </label>
        <label>
          <span>简介</span>
          <textarea
            value={localDraft.intro}
            onChange={(event) => updateField("intro", event.target.value)}
            rows={3}
            placeholder="这家店吸引你的地方"
          />
        </label>
        <label>
          <span>来源链接 / 备注</span>
          <input
            value={localDraft.sourceUrl}
            onChange={(event) => updateField("sourceUrl", event.target.value)}
            placeholder="小红书链接、群聊来源或朋友推荐"
          />
        </label>

        <div className="status-editor">
          <span>状态</span>
          <div className="segmented">
            <button
              className={localDraft.status === "want" ? "is-active" : ""}
              onClick={() => updateField("status", "want")}
              type="button"
            >
              待打卡
            </button>
            <button
              className={localDraft.status === "visited" ? "is-active" : ""}
              onClick={() => updateField("status", "visited")}
              type="button"
            >
              已打卡
            </button>
          </div>
        </div>

        {localDraft.status === "visited" ? (
          <div className="visited-editor">
            <label>
              <span>打卡日期</span>
              <input
                type="date"
                value={localDraft.visitedAt ?? toDateInputValue(new Date())}
                onChange={(event) => updateField("visitedAt", event.target.value)}
              />
            </label>
            <label>
              <span>评分</span>
              <input
                max={5}
                min={1}
                step={0.5}
                type="number"
                value={localDraft.rating ?? 4}
                onChange={(event) => updateField("rating", Number(event.target.value))}
              />
            </label>
            <label className="full-span">
              <span>评价</span>
              <textarea
                rows={3}
                value={localDraft.visitNote ?? ""}
                onChange={(event) => updateField("visitNote", event.target.value)}
                placeholder="一句话记录味道、环境或是否想二刷"
              />
            </label>
            <label className="full-span">
              <span>避雷点</span>
              <textarea
                rows={2}
                value={localDraft.avoidNotes ?? ""}
                onChange={(event) => updateField("avoidNotes", event.target.value)}
                placeholder="不好吃、排队久、踩雷菜品等可以留空"
              />
            </label>
            <div className="field-control full-span">
              <span>二刷意愿</span>
              <div className="segmented revisit-segmented">
                {REVISIT_WISH_OPTIONS.map((option) => (
                  <button
                    className={localDraft.revisitWish === option.value ? "is-active" : ""}
                    key={option.value}
                    onClick={() => updateField("revisitWish", option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="dialog-footer">
          <button className="ghost-button" onClick={onClose} type="button">
            取消
          </button>
          <button className="primary-button" type="submit">
            <Save size={17} aria-hidden />
            {isEditing ? "保存便利贴" : "加入待打卡墙"}
          </button>
        </div>
      </form>
    </div>
  );
}

function groupByDate(items: FoodRecord[]) {
  const groups = new Map<string, FoodRecord[]>();
  items
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .forEach((record) => {
      const key = toDateInputValue(new Date(record.createdAt));
      groups.set(key, [...(groups.get(key) ?? []), record]);
    });

  return Array.from(groups.entries());
}

function splitList(value: string) {
  return value
    .split(/[、，,;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanList(value: string[]) {
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  const today = toDateInputValue(new Date());
  if (dateKey === today) return "今天";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function formatReceiptTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  const year = `${date.getFullYear()}`.slice(2);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${month}.${day}`;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTilt(index: number) {
  const tilts = [-2.4, 1.7, -0.9, 2.2, -1.5, 0.8];
  return tilts[index % tilts.length];
}

function getFixtureType(index: number): FixtureType {
  return FIXTURE_TYPES[index % FIXTURE_TYPES.length];
}

function getShiftX(index: number) {
  const shifts = [-8, 10, -3, 16, -14, 5];
  return shifts[index % shifts.length];
}

function getShiftY(index: number) {
  const shifts = [4, 22, -6, 14, 30, 0];
  return shifts[index % shifts.length];
}

function getStack(index: number) {
  const stacks = [3, 5, 4, 6, 2, 7];
  return stacks[index % stacks.length];
}
