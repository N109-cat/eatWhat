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
const FIXTURE_TYPES = ["tape", "pin", "sticker"] as const;
const DISTANCE_FILTERS = [
  { label: "不限", value: "all" },
  { label: "500m", value: "500m" },
  { label: "1km", value: "1km" },
  { label: "自定义", value: "custom" }
] as const;
const TIME_FILTERS = [
  { label: "全部", value: "all" },
  { label: "本周", value: "this-week" },
  { label: "上周", value: "last-week" },
  { label: "自定义", value: "custom" }
] as const;
const ARCHIVE_ANIMATION_MS = 760;

type FixtureType = (typeof FIXTURE_TYPES)[number];
type DistanceFilter = (typeof DISTANCE_FILTERS)[number]["value"];
type TimeFilter = (typeof TIME_FILTERS)[number]["value"];

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
  const [selectedLocation, setSelectedLocation] = useState(ALL);
  const [selectedDistance, setSelectedDistance] = useState<DistanceFilter>("all");
  const [customDistance, setCustomDistance] = useState("");
  const [selectedTime, setSelectedTime] = useState<TimeFilter>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [exitingRecordIds, setExitingRecordIds] = useState<string[]>([]);
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

  const locations = useMemo(() => {
    const values = records.map((record) => record.location).filter(Boolean);
    return [ALL, ...Array.from(new Set(values))];
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const typeMatched = selectedType === ALL || record.shopType === selectedType;
      const tagMatched = selectedTag === ALL || record.customTags.includes(selectedTag);
      const locationMatched = selectedLocation === ALL || record.location === selectedLocation;
      const distanceMatched = matchesDistanceFilter(record, selectedDistance, customDistance);
      const timeMatched = matchesTimeFilter(record.createdAt, selectedTime, customStartDate, customEndDate);
      return typeMatched && tagMatched && locationMatched && distanceMatched && timeMatched;
    });
  }, [
    customDistance,
    customEndDate,
    customStartDate,
    records,
    selectedDistance,
    selectedLocation,
    selectedTag,
    selectedTime,
    selectedType
  ]);

  const archivedTotal = useMemo(() => records.filter((record) => record.status === "visited").length, [records]);

  const boardRecords = useMemo(() => filteredRecords.filter((record) => record.status !== "visited"), [filteredRecords]);

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

  const groupedRecords = useMemo(() => groupByDate(boardRecords), [boardRecords]);

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
      const targetRecord = records.find((record) => record.id === editingId);
      const shouldAnimateArchive = targetRecord?.status !== "visited" && nextDraft.status === "visited";
      const targetId = editingId;

      if (shouldAnimateArchive) {
        setExitingRecordIds((current) => (current.includes(targetId) ? current : [...current, targetId]));
        window.setTimeout(() => {
          setRecords((current) =>
            current.map((record) => (record.id === targetId ? applyDraftToRecord(record, nextDraft, now) : record))
          );
          setExitingRecordIds((current) => current.filter((id) => id !== targetId));
        }, ARCHIVE_ANIMATION_MS);
      } else {
        setRecords((current) =>
          current.map((record) => (record.id === targetId ? applyDraftToRecord(record, nextDraft, now) : record))
        );
      }
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
    setSelectedLocation(ALL);
    setSelectedDistance("all");
    setCustomDistance("");
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
            <h1>想吃便利贴墙</h1>
            <p className="handwritten-line">把刷到的美食，变成一张待销小票贴起来吧！</p>
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
              <h2>按添加日期归档</h2>
            </div>
            <div className="record-count">
              <CircleDot size={16} aria-hidden />
              {boardRecords.length} / {filteredRecords.length} 张待贴小票
            </div>
          </div>

          <div className="canvas-board">
            <p className="scribble-note scribble-top">today finds / keep the good bites</p>
            {groupedRecords.length > 0 ? (
              <div className="date-lanes">
                {groupedRecords.map(([dateKey, items]) => (
                  <section className="date-section" key={dateKey}>
                    <div className="date-label">
                      <CalendarDays size={18} aria-hidden />
                      <span>{formatDateLabel(dateKey)}</span>
                    </div>
                    <div className="note-grid">
                      {items.map((record, index) => (
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
                          onDelete={handleDelete}
                          onEdit={handleEdit}
                          onVisit={handleVisit}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="empty-board">
                <Search size={34} aria-hidden />
                <h2>还没有待销的小票</h2>
                <p>粘贴一条美食笔记，确认解析结果后就会钉到今天的板块里。</p>
              </div>
            )}
            <p className="scribble-note scribble-bottom">rated later, remembered longer.</p>
          </div>
        </section>

        <aside className="tool-rail" aria-label="右侧记录和筛选工具栏">
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
            <FilterGroup label="地点" values={locations} selected={selectedLocation} onSelect={setSelectedLocation} />
            <div className="filter-group">
              <p>附近距离</p>
              <div className="chip-row">
                {DISTANCE_FILTERS.map((filter) => (
                  <button
                    className={`chip ${selectedDistance === filter.value ? "is-active" : ""}`}
                    key={filter.value}
                    onClick={() => setSelectedDistance(filter.value)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              {selectedDistance === "custom" ? (
                <input
                  className="compact-input"
                  inputMode="numeric"
                  onChange={(event) => setCustomDistance(event.target.value)}
                  placeholder="输入距离（米）"
                  value={customDistance}
                />
              ) : null}
            </div>
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

          <ArchiveFolder records={archivedRecords} onDelete={handleDelete} onEdit={handleEdit} />
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
  fixtureType,
  isExiting,
  shiftX,
  shiftY,
  stack,
  tilt,
  onEdit,
  onDelete,
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
  onVisit: (record: FoodRecord) => void;
}) {
  return (
    <article
      className={`food-note ${colorClass} ${isExiting ? "is-exiting" : ""}`}
      style={
        {
          "--shift-x": `${shiftX}px`,
          "--shift-y": `${shiftY}px`,
          "--stack": stack,
          "--tilt": `${tilt}deg`
        } as React.CSSProperties
      }
    >
      <ReceiptFixture type={fixtureType} />
      <span className="archive-stroke" aria-hidden />
      <div className="note-actions">
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
            {record.location || "待补充"}
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
        </div>
      ) : (
        <button className="visit-button" onClick={() => onVisit(record)} type="button">
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

function ArchiveFolder({
  records,
  onEdit,
  onDelete
}: {
  records: FoodRecord[];
  onEdit: (record: FoodRecord) => void;
  onDelete: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (records.length === 0) {
      setSelectedRecordId(null);
      return;
    }

    if (!selectedRecordId || !records.some((record) => record.id === selectedRecordId)) {
      setSelectedRecordId(records[0].id);
    }
  }, [records, selectedRecordId]);

  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? null;
  const stackedTickets = records.slice(0, 8);

  return (
    <section className={`archive-folder ${isOpen ? "is-open" : ""}`} aria-label="已打卡收藏夹">
      <button
        aria-expanded={isOpen}
        className="folder-cover"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="folder-title">已打卡收藏夹</span>
        <span className="folder-subtitle">CHECKED RECEIPTS</span>
        <span className="folder-ticket-stack" aria-hidden>
          {stackedTickets.map((record, index) => (
            <i
              key={record.id}
              style={
                {
                  "--ticket-bottom": `${index * 3}px`,
                  "--ticket-left": `${index * 13}px`,
                  "--ticket-rotate": `${-8 + index * 2}deg`
                } as React.CSSProperties
              }
            />
          ))}
        </span>
        <strong>{records.length}</strong>
      </button>

      {isOpen ? (
        <div className="folder-panel">
          {records.length > 0 ? (
            <>
              <div className="archive-list">
                {records.map((record) => (
                  <button
                    className={`archive-item ${selectedRecordId === record.id ? "is-selected" : ""}`}
                    key={record.id}
                    onClick={() => setSelectedRecordId(record.id)}
                    type="button"
                  >
                    <span>{record.shopName || "未命名店铺"}</span>
                    <small>
                      {record.visitedAt ? formatShortDate(record.visitedAt) : "已打卡"}
                      {record.rating ? ` · ${record.rating}/5` : ""}
                    </small>
                  </button>
                ))}
              </div>

              {selectedRecord ? (
                <article className="archive-detail">
                  <p className="receipt-id">NO. {selectedRecord.id.slice(0, 8).toUpperCase()}</p>
                  <h3>{selectedRecord.shopName || "未命名店铺"}</h3>
                  <dl>
                    <div>
                      <dt>类型</dt>
                      <dd>{selectedRecord.shopType || "未分类"}</dd>
                    </div>
                    <div>
                      <dt>地点</dt>
                      <dd>{selectedRecord.location || "待补充"}</dd>
                    </div>
                    <div>
                      <dt>人均</dt>
                      <dd>{selectedRecord.avgPrice || "--"}</dd>
                    </div>
                    <div>
                      <dt>打卡</dt>
                      <dd>
                        {selectedRecord.visitedAt ? formatShortDate(selectedRecord.visitedAt) : "已打卡"}
                        {selectedRecord.rating ? ` · ${selectedRecord.rating}/5` : ""}
                      </dd>
                    </div>
                  </dl>
                  {selectedRecord.recommendedDishes.length > 0 ? (
                    <p className="archive-detail-line">推荐：{selectedRecord.recommendedDishes.join("、")}</p>
                  ) : null}
                  {selectedRecord.visitNote ? <p className="archive-detail-note">{selectedRecord.visitNote}</p> : null}
                  <div className="archive-actions">
                    <button onClick={() => onEdit(selectedRecord)} type="button">
                      <Pencil size={14} aria-hidden />
                      编辑
                    </button>
                    <button onClick={() => onDelete(selectedRecord.id)} type="button">
                      <Trash2 size={14} aria-hidden />
                      删除
                    </button>
                  </div>
                </article>
              ) : null}
            </>
          ) : (
            <p className="archive-empty">打卡后的小票会收进这里。</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function applyDraftToRecord(record: FoodRecord, draft: FoodRecordDraft, updatedAt: string): FoodRecord {
  return {
    ...record,
    ...draft,
    updatedAt,
    recommendedDishes: cleanList(draft.recommendedDishes),
    customTags: cleanList(draft.customTags)
  };
}

function matchesDistanceFilter(record: FoodRecord, filter: DistanceFilter, customDistance: string) {
  if (filter === "all") return true;

  const requestedMeters =
    filter === "500m" ? 500 : filter === "1km" ? 1000 : Number.parseInt(customDistance.trim(), 10);

  if (!requestedMeters || requestedMeters <= 0) return true;

  return resolveDistanceToCurrentPlace(record) <= requestedMeters;
}

function resolveDistanceToCurrentPlace(_record: FoodRecord) {
  // Future map API integration point: return distance in meters from the user's current place.
  return 0;
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
