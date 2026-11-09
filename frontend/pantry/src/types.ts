export interface Ingredient {
  class: string;
  /** 0-1. Only present for the keyless (Roboflow) detector. */
  confidence?: number;
  /** How many of this item are visible (most seen in a single frame). */
  quantity?: number;
}

export interface Recipe {
  name: string;
  /** A well-known dish this resembles (e.g. "shakshuka"); used to find a photo and video. */
  dish: string;
  ingredients_used: string[];
  steps: string[];
}
