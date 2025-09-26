Issue 1: Initialize project with React + TypeScript
Description:
Set up the base frontend project with React and TypeScript. Configure folder structure for scalability and install core dependencies.
Acceptance Criteria:
 React project bootstrapped with TypeScript template
 Folder structure (components/, pages/, services/) created
 Core dependencies installed (React Router, Axios, Tailwind or similar)
 App runs locally with no errors

Issue 2: Setup backend service for video processing
Description:
Create backend server to handle video uploads and processing.
Acceptance Criteria:
 Basic backend server (Express/FastAPI) created
 Endpoint /upload accepts video files
 Returns dummy JSON response for now
 Server runs locally

Issue 3: Frontend: Add video upload and preview
Description:
Enable users to upload a short pantry video and preview it before submitting for processing.
Acceptance Criteria:
 File input for video upload
 Preview player for selected video
 “Submit” button sends video to backend

Issue 4: Backend: Extract frames from uploaded video
Description:
Process uploaded video and extract frames at regular intervals (e.g., 1 frame per second).
Acceptance Criteria:
 Uploaded video saved temporarily
 Frames extracted using ffmpeg or similar tool
 Frames available for further analysis

Issue 5: Integrate object detection model for ingredient recognition
Description:
Run extracted frames through a pretrained object detection model to recognize pantry ingredients.
Acceptance Criteria:
 Object detection model integrated (YOLOv8, Google Vision, etc.)
 Model runs on frames and outputs ingredient labels + confidence
 Output logged for debugging

Issue 6: Aggregate ingredient detections across frames
Description:
Aggregate detection results from multiple frames into a single list of ingredients.
Acceptance Criteria:
 Repeated detections merged into unique ingredient list
 Confidence scores averaged or highest score kept
 Ingredient list prepared for frontend

Issue 7: Send ingredient list back to frontend
Description:
Return final detected ingredient list to frontend for display.
Acceptance Criteria:
 API returns JSON list of detected ingredients
 Frontend displays detected ingredients as tags/chips
 Handles empty or failed detection gracefully

Issue 8: Integrate AI API for recipe suggestions
Description:
Generate recipe recommendations using AI based on detected ingredients.
Acceptance Criteria:
 Ingredient list sent to LLM API (OpenAI, Anthropic, etc.)
 API returns 2–3 recipe suggestions
 Recipes contain name, ingredients used, and steps

Issue 9: Frontend: Display recipe suggestions
Description:
Show generated recipe recommendations to the user in a clean UI.
Acceptance Criteria:
 Recipes displayed in card layout
 Each card shows recipe name, ingredients used, and instructions
 Handles API errors (e.g., loading/error state)

Issue 10: Add “Cooking Mode” with step-by-step guidance (Stretch)
Description:
Add a guided “Cooking Mode” that shows one step at a time.
Acceptance Criteria:
 Recipes can be viewed step-by-step
 “Next Step” and “Previous Step” navigation
 Progress indicator shows step position

Issue 11: Add Text-to-Speech for recipe instructions (Stretch)
Description:
Enable voice instructions for cooking steps using Web Speech API.
Acceptance Criteria:
 Text-to-speech reads current step aloud
 Option to toggle voice on/off
 Works on supported browsers

Issue 12: Save favorite recipes locally (Stretch)
Description:
Allow users to save and revisit favorite recipes.
Acceptance Criteria:
 Save recipe button available on recipe cards
 Saved recipes stored in Local Storage/IndexedDB
 Favorites page lists saved recipes

Issue 13: Add responsive design & polish UI
Description:
Make app mobile-friendly and improve overall styling.
Acceptance Criteria:
 Layout adjusts correctly for mobile and desktop
 Consistent color scheme and spacing
 Buttons, cards, and tags styled cleanly

Issue 14: Deploy project
Description:
Deploy frontend and backend so the app is accessible online.
Acceptance Criteria:
 Frontend deployed on Vercel/Netlify
 Backend deployed on Render/Heroku
 Frontend connected to live backend
