from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from roboflow import Roboflow
import ffmpeg
import os
import tempfile
import shutil
import logging
import base64
from functools import lru_cache
from pathlib import Path
from dotenv import load_dotenv
from groq import Groq
from pydantic import BaseModel
from typing import List

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pantry")

BASE_DIR = Path(__file__).resolve().parent
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "50")) * 1024 * 1024
MAX_VIDEO_SECONDS = int(os.getenv("MAX_VIDEO_SECONDS", "30"))
MAX_FRAMES = int(os.getenv("MAX_FRAMES", "15"))
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def get_roboflow_model():
    rf = Roboflow(api_key=os.getenv("ROBOFLOW_API_KEY"))
    return rf.workspace("test-model-rqcm2").project("ingredients-detection-yolov8").version(1).model


@lru_cache(maxsize=1)
def get_groq_client():
    return Groq(api_key=os.getenv("GROQ_API_KEY"))

def extract_frames(video_path: str, output_dir: str):
    """
    Extracts frames from a video file using ffmpeg.
    """
    try:
        (
            ffmpeg
            .input(video_path, t=MAX_VIDEO_SECONDS)
            .filter('fps', fps='1')
            .output(os.path.join(output_dir, 'frame-%d.png'), vframes=MAX_FRAMES)
            .run(capture_stdout=True, capture_stderr=True)
        )
        return len(os.listdir(output_dir))
    except ffmpeg.Error as e:
        logger.error("ffmpeg failed: %s", e.stderr.decode('utf8', errors='replace'))
        raise

def detect_ingredients(frames_dir: str):
    """
    Detects ingredients from a directory of frames using a Roboflow model.
    """
    model = get_roboflow_model()

    detected_ingredients = {}

    for frame_file in sorted(os.listdir(frames_dir)):
        frame_path = os.path.join(frames_dir, frame_file)
        results = model.predict(frame_path, confidence=40, overlap=30).json()
        for prediction in results['predictions']:
            ingredient_name = prediction['class'].strip().lower()
            confidence = prediction['confidence']
            if ingredient_name not in detected_ingredients or confidence > detected_ingredients[ingredient_name]:
                detected_ingredients[ingredient_name] = confidence

    ingredients = [{"class": name, "confidence": conf} for name, conf in detected_ingredients.items()]
    return ingredients

def detect_ingredients_groq(frames_dir: str):
    """
    Detects ingredients from a directory of frames using a Groq vision model.
    """
    client = get_groq_client()

    frames = sorted(os.listdir(frames_dir))
    counts = {}

    for frame_file in frames:
        frame_path = os.path.join(frames_dir, frame_file)
        
        with open(frame_path, "rb") as image_file:
            encoded_image = base64.b64encode(image_file.read()).decode('utf-8')

        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Identify the food ingredients in this image. Respond with a comma-separated list of the ingredients you see.",
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{encoded_image}"
                            },
                        },
                    ],
                }
            ],
            model="meta-llama/llama-4-scout-17b-16e-instruct",
        )
        
        detected = chat_completion.choices[0].message.content.split(',')
        seen_in_frame = {i.strip().strip('.').lower() for i in detected if i.strip()}
        for item in seen_in_frame:
            counts[item] = counts.get(item, 0) + 1

    # Same shape as the Roboflow path; confidence = share of frames the item appeared in.
    total = max(len(frames), 1)
    return [{"class": name, "confidence": n / total} for name, n in counts.items()]


@app.post("/upload")
def upload_video(video: UploadFile = File(...), model: str = "roboflow"):
    """
    Uploads a video, extracts frames, detects ingredients, and returns the ingredients.
    Declared as a plain `def` so FastAPI runs it in a threadpool (the work is blocking).
    """
    if not (video.content_type or "").startswith("video/"):
        raise HTTPException(status_code=415, detail="Please upload a video file.")

    temp_dir = tempfile.mkdtemp()
    try:
        # Never use the client-supplied filename for the path.
        video_path = os.path.join(temp_dir, "upload.mp4")
        written = 0
        with open(video_path, "wb") as buffer:
            while chunk := video.file.read(1024 * 1024):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail=f"Video exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.")
                buffer.write(chunk)

        frames_dir = os.path.join(temp_dir, "frames")
        os.makedirs(frames_dir)

        extract_frames(video_path, frames_dir)
        if model == "groq":
            ingredients = detect_ingredients_groq(frames_dir)
        else:
            ingredients = detect_ingredients(frames_dir)

        logger.info("Detected %d ingredients via %s", len(ingredients), model)
        return {"message": "Video processed successfully", "ingredients": ingredients}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Video processing failed")
        raise HTTPException(status_code=500, detail="We couldn't process that video. Please try again.")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

class IngredientsRequest(BaseModel):
    ingredients: List[str]

prompt_template = (BASE_DIR / "prompt.txt").read_text()

def generate_recipes(ingredients: List[str]):
    """
    Generates recipes from a list of ingredients using the Groq API.
    """
    client = get_groq_client()

    prompt = prompt_template.replace("[List of ingredients]", ", ".join(ingredients))

    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
        model="llama-3.3-70b-versatile",
    )

    return chat_completion.choices[0].message.content

@app.post("/recipes")
def get_recipes(request: IngredientsRequest):
    """
    Generates recipes from a list of ingredients.
    """
    ingredients = [i.strip() for i in request.ingredients if i.strip()][:50]
    if not ingredients:
        raise HTTPException(status_code=422, detail="Provide at least one ingredient.")
    try:
        return {"recipes": generate_recipes(ingredients)}
    except Exception:
        logger.exception("Recipe generation failed")
        raise HTTPException(status_code=500, detail="We couldn't generate recipes. Please try again.")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3003)