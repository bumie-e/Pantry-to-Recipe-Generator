import React, { useEffect, useState } from 'react';
import { findRecipeMedia, type RecipeMedia } from '../lib/media';
import type { Recipe } from '../types';

const RecipeCard: React.FC<{ recipe: Recipe; tint: number }> = ({ recipe, tint }) => {
  const [media, setMedia] = useState<RecipeMedia | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let active = true;
    findRecipeMedia(recipe).then((m) => active && setMedia(m));
    return () => { active = false; };
  }, [recipe]);

  return (
    <article className={`recipe recipe-${tint}`}>
      <div className="recipe-media">
        {media === null ? (
          <div className="media-skeleton" aria-label="Finding a photo" />
        ) : playing && media.youtubeId ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${media.youtubeId}?autoplay=1`}
            title={`How to make ${recipe.name}`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : media.imageUrl ? (
          <>
            <img src={media.imageUrl} alt={recipe.name} loading="lazy" />
            {media.youtubeId && (
              <button className="play" onClick={() => setPlaying(true)} aria-label={`Play video: how to make ${recipe.name}`}>
                <span aria-hidden="true">▶</span> Watch how it's made
              </button>
            )}
          </>
        ) : (
          <div className="media-empty">No photo found for this dish</div>
        )}
        {media && !media.youtubeId && (
          <a className="video-link" href={media.videoSearchUrl} target="_blank" rel="noreferrer">
            Find a video tutorial
          </a>
        )}
      </div>

      <div className="recipe-body">
        <h3>{recipe.name}</h3>
        <ul className="uses" aria-label="Ingredients used">
          {recipe.ingredients_used.map((u) => <li key={u}>{u}</li>)}
        </ul>
        <ol>
          {recipe.steps.map((step, j) => <li key={j}>{step}</li>)}
        </ol>
      </div>
    </article>
  );
};

export default RecipeCard;
