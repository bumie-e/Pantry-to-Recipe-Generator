from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import uvicorn
import ffmpeg
import os
import tempfile
import shutil

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

@app.post("/upload")
async def upload_video(video: UploadFile = File(...)):
    """
    Uploads a video, extracts frames, and returns the number of frames.
    """
    temp_dir = tempfile.mkdtemp()
    video_path = os.path.join(temp_dir, video.filename)

    with open(video_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)

    frames_dir = os.path.join(temp_dir, "frames")
    os.makedirs(frames_dir)

    try:
        num_frames = extract_frames(video_path, frames_dir)
        return JSONResponse(content={"message": "Video processed successfully", "num_frames": num_frames}, status_code=200)
    except Exception as e:
        return JSONResponse(content={"message": f"An error occurred: {e}"}, status_code=500)
    finally:
        shutil.rmtree(temp_dir)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3003)