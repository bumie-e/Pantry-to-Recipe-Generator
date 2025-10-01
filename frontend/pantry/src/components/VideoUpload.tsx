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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setUploadProgress(0);
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
      } else {
        toast.error('Video upload failed.');
      }
    } catch (error) {
      console.error('Error uploading video:', error);
      toast.error('An error occurred during upload.');
    } finally {
      setIsLoading(false);
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

      {ingredients.length > 0 && (
        <div className="ingredients-list">
          <h3>Detected Ingredients</h3>
          <ul>
            {ingredients.map((ingredient, index) => (
              <li key={index}>
                {ingredient.class} - Confidence: {Math.round(ingredient.confidence * 100)}%
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default VideoUpload;