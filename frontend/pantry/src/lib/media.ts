import type { Recipe } from '../types';

export interface RecipeMedia {
  imageUrl?: string;
  youtubeId?: string;
  /** Always available: a YouTube search for this recipe. */
  videoSearchUrl: string;
}

const cache = new Map<string, Promise<RecipeMedia>>();

interface Meal { strMeal: string; strMealThumb: string; strYoutube: string }

async function fromMealDb(query: string): Promise<{ imageUrl?: string; youtubeId?: string } | null> {
  const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`);
  if (!res.ok) return null;
  const meal = ((await res.json()).meals as Meal[] | null)?.[0];
  if (!meal) return null;
  const youtubeId = meal.strYoutube ? new URL(meal.strYoutube).searchParams.get('v') ?? undefined : undefined;
  return { imageUrl: meal.strMealThumb, youtubeId };
}

/** YouTube's oEmbed endpoint answers 200 only for public, embeddable videos (private/removed ones give 401/404). */
async function isPublicVideo(id: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function fromWikipedia(query: string): Promise<string | null> {
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=3&prop=pageimages' +
    `&piprop=thumbnail&pithumbsize=800&format=json&origin=*&gsrsearch=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const pages = Object.values((await res.json()).query?.pages ?? {}) as {
    index: number;
    thumbnail?: { source: string };
  }[];
  return pages.sort((a, b) => a.index - b.index).find((p) => p.thumbnail)?.thumbnail?.source ?? null;
}

async function lookup(recipe: Recipe): Promise<RecipeMedia> {
  const videoSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`how to make ${recipe.name}`)}`;
  const candidates = [...new Set([recipe.dish, recipe.name].filter(Boolean))];
  const media: RecipeMedia = { videoSearchUrl };

  try {
    for (const q of candidates) {
      const hit = await fromMealDb(q);
      if (hit) {
        media.imageUrl = hit.imageUrl;
        if (hit.youtubeId && (await isPublicVideo(hit.youtubeId))) media.youtubeId = hit.youtubeId;
        break;
      }
    }
    if (!media.imageUrl) {
      for (const q of candidates) {
        const img = await fromWikipedia(q);
        if (img) {
          media.imageUrl = img;
          break;
        }
      }
    }
  } catch {
    // Media is a nice-to-have: the recipe still shows without it.
  }
  return media;
}

/** Finds a photo and tutorial video for a recipe; results are cached per recipe. */
export function findRecipeMedia(recipe: Recipe): Promise<RecipeMedia> {
  const key = `${recipe.dish}|${recipe.name}`;
  let cached = cache.get(key);
  if (!cached) {
    cached = lookup(recipe);
    cache.set(key, cached);
  }
  return cached;
}
