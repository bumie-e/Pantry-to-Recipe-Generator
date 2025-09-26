# Pantry-to-Recipe-Generator
This project takes the AI recipe idea to another level by adding computer vision and AI. Take a video recording of your pantry and the app suggests a list of recipes you could make!


# 🛒 AI Pantry-to-Recipe Generator

An AI-powered web app that helps you discover recipes using the ingredients you already have at home.  
Simply **record a short video of your pantry or storehouse**, and the app will:  

1. Detect visible ingredients using **computer vision**  
2. Aggregate the results into a clean list  
3. Generate **recipe suggestions** using AI  

This project combines **computer vision, natural language generation, and modern frontend development** into a practical and portfolio-worthy application.  

---

## 🚀 Features

- **Video Upload & Preview**  
  Upload a short video of your pantry and preview it before submitting.  

- **Ingredient Detection (Computer Vision)**  
  Extracts frames from the video and detects pantry items using pretrained models (YOLOv8 / Google Vision API).  

- **Smart Aggregation**  
  Merges ingredient detections across frames into a final list.  

- **AI-Powered Recipe Generation**  
  Uses an LLM to suggest recipes based on detected ingredients.  

- **Clean Recipe Display**  
  Recipes are shown in cards with name, ingredients used, and step-by-step instructions.  

- **Stretch Features (Optional)**  
  - Guided **Cooking Mode** (step-by-step navigation)  
  - **Text-to-Speech** for voice-guided cooking  
  - Save favorite recipes locally for future use  

---

## 🏗️ Project Structure

ai-pantry-recipe-generator/
│
├── frontend/ # React + TypeScript app
│ ├── components/ # UI components (VideoUpload, IngredientList, RecipeCard)
│ ├── pages/ # App pages (Home, Recipes, Favorites)
│ ├── services/ # API services (video upload, recipe fetch)
│ └── ...
│
├── backend/ # Node.js/Express or Python/FastAPI server
│ ├── routes/ # API routes (upload, detect, recipes)
│ ├── utils/ # Frame extraction, model inference
│ └── ...
│
├── README.md # Project documentation
└── PROJECTS.md # GitHub project board / issue tracker


---

## 🎯 Goals

1. **Learn & Apply AI**  
   - Practice working with computer vision for object detection  
   - Integrate LLMs for natural language generation  

2. **Build Full-Stack Skills**  
   - Develop with React + TypeScript (frontend)  
   - Implement backend services for AI inference and video processing  

3. **Create a Portfolio-Ready App**  
   - Practical, innovative, and demo-friendly  
   - Shows ability to combine multiple AI techniques in a useful tool  

---

## 🛠️ Tech Stack

**Frontend**  
- React + TypeScript  
- Tailwind CSS / Chakra UI for styling  

**Backend**  
- Node.js (Express) or Python (FastAPI)  
- ffmpeg for video frame extraction  
- YOLOv8 or Google Vision API for object detection  

**AI**  
- OpenAI / Anthropic API for recipe generation  

**Deployment**  
- Frontend: Vercel / Netlify  
- Backend: Render / Heroku  

---

## ✅ Roadmap

- [ ] Initialize frontend (React + TypeScript)  
- [ ] Setup backend (video upload + processing)  
- [ ] Implement video frame extraction  
- [ ] Integrate object detection model  
- [ ] Aggregate ingredient detections  
- [ ] Generate recipes with AI  
- [ ] Display recipes in UI  
- [ ] Add cooking mode (stretch)  
- [ ] Add text-to-speech instructions (stretch)  
- [ ] Add favorites system (stretch)  
- [ ] Polish UI & deploy  

---

## 🤝 Contributions

Contributions are welcome! Feel free to open issues or submit PRs to improve the app.  

---

## 📜 License

MIT License. Free to use, modify, and distribute.  

