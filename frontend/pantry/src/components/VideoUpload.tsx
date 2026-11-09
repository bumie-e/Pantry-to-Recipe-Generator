import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { extractFrames } from '../lib/frames';
import { detectIngredients } from '../lib/roboflow';
import {
  detectIngredientsGroq,
  generateRecipes,
  getGroqKey,
  isValidGroqKey,
  saveGroqKey,
  removeGroqKey,
} from '../lib/groq';
import RecipeCard from './RecipeCard';
import ProgressTracker from './ProgressTracker';
import { findRecipeMedia } from '../lib/media';
import type { Ingredient, Recipe } from '../types';

const HOW_STEPS = [
  { title: 'Film your shelves', text: 'Pan slowly across your pantry or fridge for 10 to 30 seconds.' },
  { title: 'Check the list', text: 'We list what we see and how many. Add or remove anything we got wrong.' },
  { title: 'Pick a recipe', text: 'Get three ideas with photos and a video. This step needs a free Groq key.' },
];

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

const VideoUpload: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ stage: 0 | 1; label: string; fraction: number } | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [newIngredient, setNewIngredient] = useState<string>('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [groqKey, setGroqKey] = useState<string>(getGroqKey());
  const [keyDraft, setKeyDraft] = useState<string>('');
  const [keyOpen, setKeyOpen] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!keyOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (keyRef.current && !keyRef.current.contains(e.target as Node)) setKeyOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setKeyOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [keyOpen]);

  const [recipeProgress, setRecipeProgress] = useState<{ stage: 0 | 1; label: string; fraction: number } | null>(null);
  const isAnalysing = progress !== null;
  const currentStep = recipes.length > 0 ? 3 : ingredients.length > 0 ? 2 : 1;
  // Writing is 0-75%, finding photos and videos is 75-100%.
  const recipePercent = recipeProgress ? Math.round((recipeProgress.stage === 0 ? recipeProgress.fraction * 0.75 : 0.75 + recipeProgress.fraction * 0.25) * 100) : 0;
  // Reading the video is the first 30%; detection is the rest.
  const percent = progress ? Math.round((progress.stage === 0 ? progress.fraction * 0.3 : 0.3 + progress.fraction * 0.7) * 100) : 0;

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast.error('That file is not a video. Choose an MP4 or MOV.');
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setIngredients([]);
    setRecipes([]);
  };

  const handleSaveKey = () => {
    if (!keyDraft.trim()) return;
    if (!isValidGroqKey(keyDraft)) {
      toast.error('That does not look like a Groq key. It starts with "gsk_".');
      return;
    }
    saveGroqKey(keyDraft);
    setGroqKey(keyDraft.trim());
    setKeyDraft('');
    setKeyOpen(false);
    toast.success('Groq key loaded. It will be forgotten when you refresh.');
  };

  const handleRemoveKey = () => {
    removeGroqKey();
    setGroqKey('');
  };

  const handleAnalyse = async () => {
    if (!selectedFile) return;
    setIngredients([]);
    setRecipes([]);
    try {
      setProgress({ stage: 0, label: 'Reading your video', fraction: 0 });
      const frames = await extractFrames(selectedFile, undefined, (fraction) =>
        setProgress({ stage: 0, label: 'Reading your video', fraction }),
      );
      const onDetect = (fraction: number, label: string) => setProgress({ stage: 1, label, fraction });
      onDetect(0, groqKey ? 'Connecting to Groq' : 'Starting detection');
      let found: Ingredient[];
      if (groqKey) {
        try {
          found = await detectIngredientsGroq(frames, groqKey, onDetect);
        } catch (groqError) {
          // Don't lose the run if Groq vision is unavailable: use the built-in detector.
          toast.warn(`${errorMessage(groqError, 'Groq detection failed.')} Using the built-in detector instead.`);
          found = await detectIngredients(frames, onDetect);
        }
      } else {
        found = await detectIngredients(frames, onDetect);
      }
      setIngredients(found);
      if (found.length === 0) toast.info('No ingredients found. Try a slower, brighter video.');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not analyse that video. Try again.'));
    } finally {
      setProgress(null);
    }
  };

  const handleGenerateRecipes = async () => {
    setIsGenerating(true);
    setRecipes([]);
    try {
      setRecipeProgress({ stage: 0, label: 'Connecting to Groq', fraction: 0 });
      const written = await generateRecipes(ingredients, groqKey, (fraction, label) =>
        setRecipeProgress({ stage: 0, label, fraction }),
      );
      setRecipes(written);
      // Cards show right away; the tracker follows the photo and video lookups.
      let found = 0;
      setRecipeProgress({ stage: 1, label: `Finding photos and videos (0 of ${written.length})`, fraction: 0 });
      await Promise.all(
        written.map((r) =>
          findRecipeMedia(r).then(() => {
            found += 1;
            setRecipeProgress({ stage: 1, label: `Finding photos and videos (${found} of ${written.length})`, fraction: found / written.length });
          }),
        ),
      );
    } catch (error) {
      toast.error(errorMessage(error, 'Could not generate recipes. Try again.'));
    } finally {
      setRecipeProgress(null);
      setIsGenerating(false);
    }
  };

  const removeIngredient = (name: string) =>
    setIngredients((prev) => prev.filter((i) => i.class !== name));

  const addIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newIngredient.trim().toLowerCase();
    if (name && !ingredients.some((i) => i.class === name)) {
      setIngredients((prev) => [...prev, { class: name }]);
    }
    setNewIngredient('');
  };

  return (
    <div className="shell">
      <header className="top">
        <span className="brand">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width="40" height="40" />
          <span className="wordmark">Pantry to Recipe</span>
        </span>
        <div className="key" ref={keyRef}>
          <button
            className={`key-toggle ${groqKey ? 'key-on' : ''}`}
            aria-expanded={keyOpen}
            aria-controls="key-panel"
            onClick={() => setKeyOpen((o) => !o)}
          >
            {groqKey ? 'Groq connected' : 'Add Groq key'}
          </button>
          {keyOpen && (
          <div className="key-panel" id="key-panel">
            <button className="key-close" onClick={() => setKeyOpen(false)} aria-label="Close">×</button>
            {groqKey ? (
              <>
                <p>Detection and recipes use Groq. The key is kept in memory only and is forgotten when you refresh or close the page.</p>
                <button className="btn btn-ghost" onClick={handleRemoveKey}>Remove key</button>
              </>
            ) : (
              <>
                <p>A free Groq key finds more ingredients and unlocks recipes. It is kept in memory only and is forgotten when you refresh or close the page. Video frames are sent to Groq to find ingredients.</p>
                <label htmlFor="groq-key">Groq API key</label>
                <input
                  id="groq-key"
                  type="password"
                  autoComplete="off"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                />
                <div className="row">
                  <button className="btn btn-blue" onClick={handleSaveKey}>Save key</button>
                  <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Get a free key</a>
                </div>
              </>
            )}
          </div>
          )}
        </div>
      </header>

      <section className="hero">
        <h1>Film your shelves. Find something to cook.</h1>
        <p>Pan across your pantry or fridge for a few seconds. We list what we see and suggest recipes.</p>
      </section>

      <ol className="how" aria-label="How it works">
        {HOW_STEPS.map((step, i) => (
          <li
            key={step.title}
            className={i + 1 < currentStep ? 'done' : i + 1 === currentStep ? 'current' : ''}
            aria-current={i + 1 === currentStep ? 'step' : undefined}
          >
            <span className="how-num" aria-hidden="true">{i + 1 < currentStep ? '✓' : i + 1}</span>
            <div>
              <h2>{step.title}</h2>
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="stage">
        <section className="panel panel-upload" aria-label="Your video">
          <input
            ref={inputRef}
            id="video-input"
            className="sr-only"
            type="file"
            accept="video/*"
            onChange={(e) => chooseFile(e.target.files?.[0])}
          />
          {previewUrl ? (
            <video className="preview" controls src={previewUrl} />
          ) : (
            <label
              htmlFor="video-input"
              className={`drop ${isDragging ? 'drop-active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                chooseFile(e.dataTransfer.files?.[0]);
              }}
            >
              <strong>Choose a video</strong>
              <span>or drop one here. Up to 30 seconds works best.</span>
            </label>
          )}
          <div className="row">
            <button
              className="btn btn-blue"
              onClick={handleAnalyse}
              disabled={!selectedFile || isAnalysing}
            >
              {isAnalysing ? 'Working...' : 'Find ingredients'}
            </button>
            {selectedFile && (
              <button className="btn btn-ghost" onClick={() => inputRef.current?.click()} disabled={isAnalysing}>
                Change video
              </button>
            )}
          </div>
          {progress && (
            <ProgressTracker
              name="Analysis progress"
              steps={['Read video', 'Find ingredients']}
              stage={progress.stage}
              label={progress.label}
              percent={percent}
            />
          )}
          {!groqKey && (
            <p className="tip">
              <strong>Want better results?</strong> Add a free Groq key to spot more ingredients and get recipe suggestions.{' '}
              <button className="link" onClick={() => setKeyOpen(true)}>Add Groq key</button>
            </p>
          )}
        </section>

        <section className="panel panel-ingredients" aria-label="Ingredients">
          <h2>In your pantry</h2>
          {ingredients.length === 0 ? (
            <p className="empty">
              {isAnalysing ? 'Looking through your frames...' : 'Ingredients we find will appear here. You can edit the list before cooking.'}
            </p>
          ) : (
            <>
              <ul className="chips">
                {ingredients.map((ing, i) => (
                  <li key={ing.class} className={`chip chip-${i % 3}`} style={{ animationDelay: `${i * 40}ms` }}>
                    <span>{ing.class}</span>
                    {ing.quantity !== undefined && <small className="qty">×{ing.quantity}</small>}
                    {ing.confidence !== undefined && (
                      <small>{Math.round(ing.confidence * 100)}%</small>
                    )}
                    <button onClick={() => removeIngredient(ing.class)} aria-label={`Remove ${ing.class}`}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <form className="add" onSubmit={addIngredient}>
                <label htmlFor="add-ingredient" className="sr-only">Add an ingredient</label>
                <input
                  id="add-ingredient"
                  placeholder="Missed something? Add it"
                  value={newIngredient}
                  onChange={(e) => setNewIngredient(e.target.value)}
                />
                <button className="btn btn-ghost" type="submit">Add</button>
              </form>
              {groqKey ? (
                <button className="btn btn-pink" onClick={handleGenerateRecipes} disabled={isGenerating}>
                  {isGenerating ? 'Working...' : 'Suggest recipes'}
                </button>
              ) : (
                <p className="hint">Recipes need a Groq key. <button className="link" onClick={() => setKeyOpen(true)}>Add one</button> to continue.</p>
              )}
              {recipeProgress && (
                <ProgressTracker
                  name="Recipe progress"
                  steps={['Write recipes', 'Find photos and videos']}
                  stage={recipeProgress.stage}
                  label={recipeProgress.label}
                  percent={recipePercent}
                />
              )}
            </>
          )}
        </section>
      </div>

      {recipes.length > 0 && (
        <section className="recipes" aria-label="Recipe suggestions">
          <h2>Tonight's options</h2>
          <div className="recipe-grid">
            {recipes.map((r, i) => (
              <RecipeCard key={r.name} recipe={r} tint={i % 3} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default VideoUpload;
