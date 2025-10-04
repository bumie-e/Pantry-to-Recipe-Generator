from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import uvicorn
from roboflow import Roboflow
import ffmpeg
import os
import tempfile
import shutil
from dotenv import load_dotenv
from groq import Groq
from pydantic import BaseModel
from typing import List
import base64
import re
import json

load_dotenv()
app = FastAPI()

def extract_frames(video_path: str, output_dir: str):
    """
    Extracts frames from a video file using ffmpeg.
    """
    try:
        (
            ffmpeg
            .input(video_path)
            .filter('fps', fps='1')
            .output(os.path.join(output_dir, 'frame-%d.png'))
            .run(capture_stdout=True, capture_stderr=True)
        )
        return len(os.listdir(output_dir))
    except ffmpeg.Error as e:
        print('stdout:', e.stdout.decode('utf8'))
        print('stderr:', e.stderr.decode('utf8'))
        raise e

def detect_ingredients(frames_dir: str):
    """
    Detects ingredients from a directory of frames using a Roboflow model.
    """
    rf = Roboflow(api_key=os.getenv("ROBOFLOW_API_KEY"))
    project = rf.workspace("test-model-rqcm2").project("ingredients-detection-yolov8")
    model = project.version(1).model

    detected_ingredients = {}

    for frame_file in os.listdir(frames_dir):
        frame_path = os.path.join(frames_dir, frame_file)
        results = model.predict(frame_path, confidence=40, overlap=30).json()
        for prediction in results['predictions']:
            ingredient_name = prediction['class']
            confidence = prediction['confidence']
            if ingredient_name not in detected_ingredients or confidence > detected_ingredients[ingredient_name]:
                detected_ingredients[ingredient_name] = confidence

    ingredients = [{"class": name, "confidence": conf} for name, conf in detected_ingredients.items()]
    return ingredients

def detect_ingredients_groq(frames_dir: str):
    """
    Detects ingredients from a directory of frames using a Groq vision model.
    """
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    
    ingredients = set()

    for frame_file in os.listdir(frames_dir):
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
        for item in detected:
            ingredients.add(item.strip())

        detected_ingredients = [{"class": name, "confidence": 0.70} for name in list(ingredients)]
    

    return detected_ingredients #list(ingredients)


@app.post("/upload")
async def upload_video(video: UploadFile = File(...), model: str = "groq"):
    """
    Uploads a video, extracts frames, detects ingredients, and returns the ingredients.
    """
    temp_dir = tempfile.mkdtemp()
    video_path = os.path.join(temp_dir, video.filename)

    with open(video_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)

    frames_dir = os.path.join(temp_dir, "frames")
    os.makedirs(frames_dir)

    try:
        extract_frames(video_path, frames_dir)
        if model == "groq":
            ingredients = detect_ingredients_groq(frames_dir)
        else:
            ingredients = detect_ingredients(frames_dir)
        print("Detected ingredients:", ingredients)  # Log the ingredients
        return JSONResponse(content={"ingredients": ingredients}, status_code=200)
    except Exception as e:
        print(f"Error processing video: {e}")
        return JSONResponse(content={"ingredients": [], "message": f"An error occurred: {e}"}, status_code=500)
    finally:
        shutil.rmtree(temp_dir)
        # shutil.rmtree(temp_dir)

class IngredientsRequest(BaseModel):
    ingredients: List[str]

with open("backend/prompt.txt", "r") as f:
    prompt_template = f.read()

def generate_recipes(ingredients: List[str]):
    """
    Generates recipes from a list of ingredients using the Groq API.
    """
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    
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


    # Get the LLM response
    import re
    llm_content = chat_completion.choices[0].message.content
    # Regex to capture the first JSON array/object inside the string
    match = re.search(r"```json\s*(\{.*?\}|\[.*?\])\s*```", llm_content, re.DOTALL)

    if match:
        json_block = match.group(1)  # extract just the JSON portion
        # data = json.loads(json_str)  # convert to Python object
        # print(data[0]["name"])  # Example access: prints "Classic Macaroni"
    else:
        # Fallback: try to remove code fences if present
        code_fence_pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
        match = re.search(code_fence_pattern, llm_content)
        json_block = match.group(1).strip() if match else llm_content
    
    # Parse the JSON response from the LLM
    try:
        recipes_json = json.loads(json_block)
        return recipes_json
    except json.JSONDecodeError:
        # Handle cases where the LLM doesn't return valid JSON
        print("Warning: LLM did not return valid JSON. Returning raw text.")
        return llm_content

@app.post("/recipes")
async def get_recipes(request: IngredientsRequest):
    """
    Generates recipes from a list of ingredients.
    """
    try:
        recipes = generate_recipes(request.ingredients)
        print(recipes)
        return JSONResponse(content={"recipes": recipes}, status_code=200)
    except Exception as e:
        return JSONResponse(content={"message": f"An error occurred: {e}"}, status_code=500)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3003)