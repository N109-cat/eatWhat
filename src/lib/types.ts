export type FoodRecordStatus = "want" | "visited";

export type FoodRecord = {
  id: string;
  sourceUrl: string;
  rawText: string;
  shopName: string;
  shopType: string;
  location: string;
  avgPrice: string;
  recommendedDishes: string[];
  intro: string;
  customTags: string[];
  status: FoodRecordStatus;
  createdAt: string;
  updatedAt: string;
  visitedAt?: string;
  rating?: number;
  visitNote?: string;
};

export type ExtractFoodNoteInput = {
  sourceUrl: string;
  rawText: string;
};

export type ExtractedFoodNote = Pick<
  FoodRecord,
  | "sourceUrl"
  | "rawText"
  | "shopName"
  | "shopType"
  | "location"
  | "avgPrice"
  | "recommendedDishes"
  | "intro"
  | "customTags"
>;

export type FoodRecordDraft = ExtractedFoodNote & {
  status: FoodRecordStatus;
  visitedAt?: string;
  rating?: number;
  visitNote?: string;
};
