export type FoodRecordStatus = "want" | "visited";
export type FoodRecordLocationScope = "" | "nearby" | "destination";
export type FoodRecordRevisitWish = "" | "yes" | "maybe" | "no";

export type FoodRecord = {
  id: string;
  sourceUrl: string;
  rawText: string;
  shopName: string;
  shopType: string;
  locationScope: FoodRecordLocationScope;
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
  avoidNotes?: string;
  revisitWish?: FoodRecordRevisitWish;
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
  | "locationScope"
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
  avoidNotes?: string;
  revisitWish?: FoodRecordRevisitWish;
};
