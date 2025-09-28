from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI()

@app.post("/upload")
async def upload_video(video: UploadFile = File(...)):
    # For now, we'll just return a dummy response
    # In the future, we'll process the video here
    return JSONResponse(content={"message": "Video uploaded successfully", "filename": video.filename}, status_code=200)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3003)
