import React, { useState, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const VideoUpload: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [ingredients, setIngredients] = useState<{ class: string; confidence: number }[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [isGeneratingRecipes, setIsGeneratingRecipes] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setUploadProgress(0);
      setRecipes([]); // Reset recipes when a new file is selected
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a video file first.');
      return;
    }

    const formData = new FormData();
    formData.append('video', selectedFile);

    setIsLoading(true);
    setIngredients([]);

    try {
      const response = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total ?? 1)
          );
          setUploadProgress(percentCompleted);
        },
      });

      if (response.status === 200) {
        toast.success('Video uploaded successfully!');
        setIngredients(response.data.ingredients);
        // Always send only ingredient names (strings) to /api/recipes
        const ingredientNames = Array.isArray(response.data.ingredients)
          ? response.data.ingredients.map((ing: any) => ing.class || String(ing))
          : [];
        generateRecipes(ingredientNames);
      } else {
        toast.error('Video upload failed.');
      }
    } catch (error) {
      console.error('Error uploading video:', error);
      toast.error('An error occurred during upload.,');
    } finally {
      setIsLoading(false);
    }
  };

  const generateRecipes = async (detectedIngredients: string[]) => {
    setIsGeneratingRecipes(true);
    try {
      const response = await axios.post('/api/recipes', { ingredients: detectedIngredients });
      if (response.status === 200) {
        toast.success('Recipes generated successfully!');
        if (Array.isArray(response.data.recipes)) {
          setRecipes(response.data.recipes);
        } else {
          toast.error('Invalid recipe format received from API.');
          console.error('API response for recipes is not an array:', response.data.recipes);
          setRecipes([response.data.recipes]); // Display raw text if not an array
        }
      } else {
        toast.error('Recipe generation failed.');
      }
    } catch (error) {
      console.error('Error generating recipes:', error);
      toast.error('An error occurred during recipe generation.');
    } finally {
      setIsGeneratingRecipes(false);
    }
  };

  return (
    <div className="video-upload-container">
      <h2>Upload Your Pantry Video</h2>
      <div className="file-input-wrapper">
        <input
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          ref={fileInputRef}
          style={{ display: 'none' }}
          id="video-upload-input"
        />
        <button
          className="btn-select-video"
          onClick={() => fileInputRef.current?.click()}
        >
          Select Video
        </button>
      </div>

      {previewUrl && (
        <div className="video-preview">
          <h3>Preview</h3>
          <video controls src={previewUrl} width="100%" />
        </div>
      )}

      {selectedFile && (
        <div className="submit-wrapper">
          <button className="btn-submit" onClick={handleUpload}>
            Submit
          </button>
          {uploadProgress > 0 && (
            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="loading-spinner">
          <p>Detecting ingredients...</p>
        </div>
      )}

      {ingredients.length > 0 && Array.isArray(ingredients) && (
        <div className="ingredients-list">
          <h3>Detected Ingredients</h3>
          <ul>
            {ingredients.map((ingredient, index) => {
              const name = ingredient?.class || String(ingredient);
              const hasConfidence = typeof ingredient?.confidence === 'number' && !isNaN(ingredient.confidence);
              const confidenceDisplay = hasConfidence ? `${Math.round(ingredient.confidence * 100)}%` : 'N/A';
              return (
                <li key={index}>
                  {name} - Confidence: {confidenceDisplay}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {isGeneratingRecipes && (
        <div className="loading-spinner">
          <p>Generating recipes...</p>
        </div>
      )}

      {recipes.length > 0 && (
        <div className="recipes-list">
          <h3>Suggested Recipes</h3>
          {recipes.map((recipe: any, index) => {
            // If recipe is a string, just display it
            if (typeof recipe === 'string') {
              return (
                <div key={index} className="recipe-card">
                  <pre>{recipe}</pre>
                </div>
              );
            }
            // Otherwise, display structured recipe
            return (
              <div key={index} className="recipe-card">
                <h4>{recipe.name}</h4>
                <h5>Ingredients Used:</h5>
                <ul>
                  {Array.isArray(recipe.ingredients)
                    ? recipe.ingredients.map((ing: string, i: number) => (
                        <li key={i}>{ing}</li>
                      ))
                    : <li>{recipe.ingredients}</li>}
                </ul>
                <h5>Instructions:</h5>
                <ol>
                  {typeof recipe.instructions === 'string'
                    ? recipe.instructions.split('\n').map((step: string, i: number) => (
                        <li key={i}>{step}</li>
                      ))
                    : <li>{recipe.instructions}</li>}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VideoUpload;