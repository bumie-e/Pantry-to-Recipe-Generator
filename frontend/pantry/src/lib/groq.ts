import type { Ingredient, Recipe } from '../types';

const KEY_STORAGE = 'groq_api_key';
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODELS_ENDPOINT = 'https://api.groq.com/openai/v1/models';
// Groq retires models often, so ask the account what is available instead of hard-coding one.
const VISION_PREFERENCE = ['qwen3.8', 'qwen3.6', 'llama-4-scout', 'llama-4-maverick', 'vision'];
const TEXT_PREFERENCE = ['llama-3.3-70b-versatile', 'gpt-oss-120b', 'llama-3.1-70b', 'gpt-oss-20b', 'llama-3.1-8b-instant'];
const FRAMES_PER_REQUEST = 4;

// The key lives only in this module's memory: it is gone on refresh or tab close and is never
// written to disk. Older versions used localStorage/sessionStorage, so clear those leftovers.
let memoryKey = '';
const clearStoredKey = () => {
  try { localStorage.removeItem(KEY_STORAGE); sessionStorage.removeItem(KEY_STORAGE); } catch { /* storage unavailable */ }
};
export const isValidGroqKey = (key: string): boolean => /^gsk_[A-Za-z0-9]{20,}$/.test(key.trim());
export const getGroqKey = (): string => {
  clearStoredKey();
  return memoryKey;
};
export const saveGroqKey = (key: string) => { memoryKey = key.trim(); };
export const removeGroqKey = () => { memoryKey = ''; clearStoredKey(); };

const modelCache = new Map<string, Promise<string[]>>();

function listModels(apiKey: string): Promise<string[]> {
  let cached = modelCache.get(apiKey);
  if (!cached) {
    cached = fetch(MODELS_ENDPOINT, { headers: { Authorization: `Bearer ${apiKey}` } })
      .then(async (res) => {
        if (res.status === 401) throw new Error('Groq rejected this API key. Check it and try again.');
        if (!res.ok) throw new Error(`Could not list Groq models (${res.status}).`);
        const json = await res.json();
        return (json.data as { id: string }[]).map((m) => m.id);
      })
      .catch((err: unknown) => {
        modelCache.delete(apiKey);
        throw err;
      });
    modelCache.set(apiKey, cached);
  }
  return cached;
}

async function pickModel(apiKey: string, preference: string[], kind: string): Promise<string> {
  const ids = await listModels(apiKey);
  for (const wanted of preference) {
    const match = ids.find((id) => id.toLowerCase().includes(wanted));
    if (match) return match;
  }
  throw new Error(`Your Groq account has no ${kind} model available. It offers: ${ids.join(', ')}`);
}

async function post(apiKey: string, body: Record<string, unknown>): Promise<Response> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('Groq rejected this API key. Check it and try again.');
  if (res.status === 429) throw new Error('Groq rate limit reached. Wait a moment and retry.');
  if (!res.ok) {
    const detail = await res.json().then((j) => j?.error?.message as string | undefined).catch(() => undefined);
    throw new Error(`Groq request failed (${res.status})${detail ? `: ${detail}` : '.'}`);
  }
  return res;
}

async function chat(apiKey: string, body: Record<string, unknown>): Promise<string> {
  const json = await (await post(apiKey, body)).json();
  return json.choices?.[0]?.message?.content ?? '';
}

/** Streams a completion, reporting the number of characters received so far. */
async function chatStream(
  apiKey: string,
  body: Record<string, unknown>,
  onChars: (total: number) => void,
): Promise<string> {
  const res = await post(apiKey, { ...body, stream: true });
  if (!res.body) throw new Error('Groq returned no data. Try again.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
      try {
        text += JSON.parse(line.slice(6)).choices?.[0]?.delta?.content ?? '';
      } catch { /* ignore partial line */ }
    }
    onChars(text.length);
  }
  return text;
}

/** Models sometimes wrap JSON in code fences or add text around it. */
function parseJson<T>(text: string): T {
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Groq returned an unexpected answer. Try again.');
  return JSON.parse(text.slice(start, end + 1)) as T;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Tiles frames into one 2-column image, since Groq's Qwen vision models accept a single image per request. */
async function makeCollage(frames: Blob[]): Promise<string> {
  const bitmaps = await Promise.all(frames.map((f) => createImageBitmap(f)));
  const tileW = bitmaps[0].width;
  const tileH = bitmaps[0].height;
  const cols = Math.min(2, bitmaps.length);
  const rows = Math.ceil(bitmaps.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = tileW * cols;
  canvas.height = tileH * rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');
  bitmaps.forEach((bmp, i) => {
    ctx.drawImage(bmp, (i % cols) * tileW, Math.floor(i / cols) * tileH, tileW, tileH);
    bmp.close();
  });
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
  if (!blob) throw new Error('Could not prepare frames for Groq.');
  return blobToDataUrl(blob);
}

const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? [...v].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').trim().slice(0, max) : '';
const cleanList = (v: unknown, count: number, max: number): string[] =>
  Array.isArray(v) ? v.map((x) => clean(x, max)).filter(Boolean).slice(0, count) : [];

/** Model output is untrusted: keep only the expected fields, types and lengths. */
function sanitiseRecipes(raw: unknown): Recipe[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 5)
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        name: clean(o.name, 120),
        dish: clean(o.dish, 80),
        ingredients_used: cleanList(o.ingredients_used, 30, 80),
        steps: cleanList(o.steps, 30, 500),
      };
    })
    .filter((r) => r.name && r.steps.length > 0);
}

const normalise = (name: string) => name.trim().replace(/\.$/, '').toLowerCase();

/** Detects ingredients with Groq vision: a few frames per request, requests in parallel. */
export async function detectIngredientsGroq(
  frames: Blob[],
  apiKey: string,
  onProgress?: (fraction: number, label: string) => void,
): Promise<Ingredient[]> {
  onProgress?.(0, 'Connecting to Groq');
  const model = await pickModel(apiKey, VISION_PREFERENCE, 'vision');
  const batches: Blob[][] = [];
  for (let i = 0; i < frames.length; i += FRAMES_PER_REQUEST) {
    batches.push(frames.slice(i, i + FRAMES_PER_REQUEST));
  }

  let done = 0;
  const results = await Promise.all(
    batches.map(async (batch) => {
      const collage = await makeCollage(batch);
      const text = await chat(apiKey, {
        model,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'This image is a grid of frames from a video of a kitchen pantry or fridge. List every distinct food ingredient you can clearly see, using short singular names (for example "tomato", "rice", "olive oil"). Skip brands and non-food items. For each, give the quantity: the largest number of that item visible in any single frame (count packages, bottles, cans or pieces; do not add counts across frames). Reply with JSON only: {"ingredients": [{"name": "...", "quantity": 1}]}',
              },
              { type: 'image_url', image_url: { url: collage } },
            ],
          },
        ],
      });
      const parsed = parseJson<{ ingredients?: (string | { name?: string; quantity?: number })[] }>(text);
      onProgress?.(++done / batches.length, `Groq has read ${done} of ${batches.length} image sets`);
      return (parsed.ingredients ?? []).map((item) =>
        typeof item === 'string'
          ? { name: item, quantity: 1 }
          : { name: item.name ?? '', quantity: Math.max(1, Math.round(Number(item.quantity) || 1)) },
      );
    }),
  );

  // Batches can show the same shelf, so keep the highest count per item rather than summing.
  const quantities = new Map<string, number>();
  for (const { name, quantity } of results.flat()) {
    const key = clean(normalise(name), 40);
    if (key) quantities.set(key, Math.max(quantities.get(key) ?? 0, quantity));
  }
  return [...quantities].map(([name, quantity]) => ({ class: name, quantity }));
}

/** Generates recipes from the ingredient list, returned as structured data. */
// Three recipes in this JSON shape are roughly this many characters; used only to estimate progress.
const EXPECTED_RECIPE_CHARS = 2600;

export async function generateRecipes(
  ingredients: Ingredient[],
  apiKey: string,
  onProgress?: (fraction: number, label: string) => void,
): Promise<Recipe[]> {
  onProgress?.(0, 'Connecting to Groq');
  const model = await pickModel(apiKey, TEXT_PREFERENCE, 'text');
  onProgress?.(0.05, 'Writing your recipes');
  const text = await chatStream(apiKey, {
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: `Suggest 3 recipes that can be made mostly from these ingredients (quantities in brackets, when known; do not use more than are available): ${ingredients
      .slice(0, 50)
      .map((i) => { const n = clean(i.class, 40); return i.quantity ? `${n} (${i.quantity})` : n; })
      .join(', ')}.
Assume basic staples (salt, pepper, oil, water) are available. Reply with JSON only in this shape:
{"recipes":[{"name":"...","dish":"a well-known dish this resembles, such as omelette or fried rice","ingredients_used":["..."],"steps":["..."]}]}`,
      },
    ],
  }, (chars) => onProgress?.(Math.min(0.05 + (chars / EXPECTED_RECIPE_CHARS) * 0.9, 0.95), 'Writing your recipes'));
  const recipes = sanitiseRecipes(parseJson<{ recipes?: unknown }>(text).recipes);
  if (recipes.length === 0) throw new Error('No recipes came back. Try again.');
  return recipes;
}
