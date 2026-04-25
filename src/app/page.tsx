"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleDot,
  ClipboardPenLine,
  Filter,
  Link2,
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
import type { FoodRecord, FoodRecordDraft, FoodRecordStatus } from "@/lib/types";

const STORAGE_KEY = "eat-what.food-records.v1";
const ALL = "全部";
const NOTE_COLORS = ["note-yellow", "note-mint", "note-blue", "note-pink", "note-cream", "note-lavender"];

const emptyDraft: FoodRecordDraft = {
  sourceUrl: "",
  rawText: "",
  shopName: "",
  shopType: "",
  location: "",
  avgPrice: "",
  recommendedDishes: [],
  intro: "",
  customTags: [],
  status: "want"
};

export default function Home() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [records, setRecords] = useState<FoodRecord[]>([]);
  const [draft, setDraft] = useState<FoodRecordDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState(ALL);
  const [selectedTag, setSelectedTag] = useState(ALL);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as FoodRecord[];
        setRecords(parsed);
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

  const shopTypes = useMemo(() => {
    const values = records.map((record) => record.shopType).filter(Boolean);
    return [ALL, ...Array.from(new Set(values))];
  }, [records]);

  const customTags = useMemo(() => {
    const values = records.flatMap((record) => record.customTags).filter(Boolean);
    return [ALL, ...Array.from(new Set(values))];
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const typeMatched = selectedType === ALL || record.shopType === selectedType;
      const tagMatched = selectedTag === ALL || record.customTags.includes(selectedTag);
      return typeMatched && tagMatched;
    });
  }, [records, selectedTag, selectedType]);

  const groupedRecords = useMemo(() => groupByDate(filteredRecords), [filteredRecords]);

  function handleExtract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const extracted = extractFoodNote({ sourceUrl, rawText });
    setDraft({
      ...emptyDraft,
      ...extracted,
      status: "want"
    });
    setEditingId(null);
  }

  function handleSaveDraft(nextDraft: FoodRecordDraft) {
    const now = new Date().toISOString();

    if (editingId) {
      setRecords((current) =>
        current.map((record) =>
          record.id === editingId
            ? {
                ...record,
                ...nextDraft,
                updatedAt: now,
                recommendedDishes: cleanList(nextDraft.recommendedDishes),
                customTags: cleanList(nextDraft.customTags)
              }
            : record
        )
      );
    } else {
      const newRecord: FoodRecord = {
        id: createId(),
        ...nextDraft,
        recommendedDishes: cleanList(nextDraft.recommendedDishes),
        customTags: cleanList(nextDraft.customTags),
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
    setEditingId(record.id);
    setDraft({
      sourceUrl: record.sourceUrl,
      rawText: record.rawText,
      shopName: record.shopName,
      shopType: record.shopType,
      location: record.location,
      avgPrice: record.avgPrice,
      recommendedDishes: record.recommendedDishes,
      intro: record.intro,
      customTags: record.customTags,
      status: record.status,
      visitedAt: record.visitedAt,
      rating: record.rating,
      visitNote: record.visitNote
    });
  }

  function handleVisit(record: FoodRecord) {
    setEditingId(record.id);
    setDraft({
      sourceUrl: record.sourceUrl,
      rawText: record.rawText,
      shopName: record.shopName,
      shopType: record.shopType,
      location: record.location,
      avgPrice: record.avgPrice,
      recommendedDishes: record.recommendedDishes,
      intro: record.intro,
      customTags: record.customTags,
      status: "visited",
      visitedAt: toDateInputValue(new Date()),
      rating: record.rating ?? 4,
      visitNote: record.visitNote ?? ""
    });
  }

  function handleDelete(id: string) {
    const confirmed = window.confirm("确定要删除这张便利贴吗？");
    if (confirmed) {
      setRecords((current) => current.filter((record) => record.id !== id));
    }
  }

  function clearFilters() {
    setSelectedType(ALL);
    setSelectedTag(ALL);
  }

  return (
    <main className="app-shell">
      <section className="top-panel" aria-label="记录和筛选">
        <div className="brand-block">
          <div className="brand-mark">
            <Utensils size={24} aria-hidden />
          </div>
          <div>
            <p className="eyebrow">XHS FOOD BOARD</p>
            <h1>想吃便利贴墙</h1>
          </div>
        </div>

        <form className="capture-card" onSubmit={handleExtract}>
          <div className="card-heading">
            <WandSparkles size={20} aria-hidden />
            <h2>解析记录</h2>
          </div>
          <label>
            <span>
              <Link2 size={16} aria-hidden />
              小红书链接
            </span>
            <input
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="粘贴小红书笔记链接"
              inputMode="url"
              type="text"
            />
          </label>
          <label>
            <span>
              <ClipboardPenLine size={16} aria-hidden />
              帖子正文
            </span>
            <textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="粘贴标题、正文、地址、人均、推荐菜等内容"
              rows={5}
            />
          </label>
          <button className="primary-button" type="submit" disabled={!sourceUrl.trim() && !rawText.trim()}>
            <Plus size={18} aria-hidden />
            记录
          </button>
        </form>

        <section className="filter-card" aria-label="筛选">
          <div className="card-heading">
            <Filter size={20} aria-hidden />
            <h2>筛选</h2>
          </div>
          <FilterGroup label="店铺类型" values={shopTypes} selected={selectedType} onSelect={setSelectedType} />
          <FilterGroup label="自定义标签" values={customTags} selected={selectedTag} onSelect={setSelectedTag} />
          <button className="ghost-button" type="button" onClick={clearFilters}>
            <RotateCcw size={16} aria-hidden />
            全部恢复
          </button>
        </section>
      </section>

      <section className="board-frame" aria-label="便利贴墙">
        <div className="board-toolbar">
          <div>
            <p className="eyebrow">LOCAL FIRST</p>
            <h2>按添加日期归档</h2>
          </div>
          <div className="record-count">
            <CircleDot size={16} aria-hidden />
            {filteredRecords.length} / {records.length} 张便利贴
          </div>
        </div>

        <div className="cork-board">
          {groupedRecords.length > 0 ? (
            groupedRecords.map(([dateKey, items]) => (
              <section className="date-section" key={dateKey}>
                <div className="date-label">
                  <CalendarDays size={18} aria-hidden />
                  <span>{formatDateLabel(dateKey)}</span>
                </div>
                <div className="note-grid">
                  {items.map((record, index) => (
                    <FoodNote
                      colorClass={NOTE_COLORS[index % NOTE_COLORS.length]}
                      key={record.id}
                      record={record}
                      tilt={getTilt(index)}
                      onDelete={handleDelete}
                      onEdit={handleEdit}
                      onVisit={handleVisit}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className="empty-board">
              <Search size={34} aria-hidden />
              <h2>还没有匹配的便利贴</h2>
              <p>粘贴一条美食笔记，确认解析结果后就会钉到今天的板块里。</p>
            </div>
          )}
        </div>
      </section>

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
    </main>
  );
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

function FoodNote({
  record,
  colorClass,
  tilt,
  onEdit,
  onDelete,
  onVisit
}: {
  record: FoodRecord;
  colorClass: string;
  tilt: number;
  onEdit: (record: FoodRecord) => void;
  onDelete: (id: string) => void;
  onVisit: (record: FoodRecord) => void;
}) {
  return (
    <article className={`food-note ${colorClass}`} style={{ "--tilt": `${tilt}deg` } as React.CSSProperties}>
      <span className="pin" aria-hidden />
      <div className="note-actions">
        <button aria-label="编辑" onClick={() => onEdit(record)} type="button">
          <Pencil size={15} aria-hidden />
        </button>
        <button aria-label="删除" onClick={() => onDelete(record.id)} type="button">
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
      <div className="status-row">
        <span className={`status-pill ${record.status === "visited" ? "visited" : ""}`}>
          {record.status === "visited" ? "已打卡" : "待打卡"}
        </span>
        {record.avgPrice ? <span className="price-pill">{record.avgPrice}</span> : null}
      </div>
      <h3>{record.shopName || "未命名店铺"}</h3>
      <div className="note-meta">
        {record.shopType ? (
          <span>
            <Tag size={14} aria-hidden />
            {record.shopType}
          </span>
        ) : null}
        {record.location ? (
          <span>
            <MapPin size={14} aria-hidden />
            {record.location}
          </span>
        ) : null}
      </div>
      {record.recommendedDishes.length > 0 ? (
        <p className="dish-line">推荐：{record.recommendedDishes.join("、")}</p>
      ) : null}
      {record.intro ? <p className="intro-line">{record.intro}</p> : null}
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
          </span>
          {record.visitNote ? <p>{record.visitNote}</p> : null}
        </div>
      ) : (
        <button className="visit-button" onClick={() => onVisit(record)} type="button">
          <CheckCircle2 size={16} aria-hidden />
          标记已打卡
        </button>
      )}
    </article>
  );
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
      visitNote: localDraft.status === "visited" ? localDraft.visitNote : undefined
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="draft-dialog" onSubmit={handleSubmit}>
        <div className="dialog-title">
          <div>
            <p className="eyebrow">{isEditing ? "EDIT NOTE" : "PARSE PREVIEW"}</p>
            <h2>{isEditing ? "编辑便利贴" : "确认解析结果"}</h2>
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
          <label>
            <span>位置</span>
            <input
              value={localDraft.location}
              onChange={(event) => updateField("location", event.target.value)}
              placeholder="区域、商圈或详细地址"
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
              <span>体验备注</span>
              <textarea
                rows={3}
                value={localDraft.visitNote ?? ""}
                onChange={(event) => updateField("visitNote", event.target.value)}
                placeholder="一句话记录味道、环境或是否想二刷"
              />
            </label>
          </div>
        ) : null}

        <div className="dialog-footer">
          <button className="ghost-button" onClick={onClose} type="button">
            取消
          </button>
          <button className="primary-button" type="submit">
            <Save size={17} aria-hidden />
            保存便利贴
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

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTilt(index: number) {
  const tilts = [-1.6, 1.2, -0.7, 1.8, -1.1, 0.6];
  return tilts[index % tilts.length];
}
