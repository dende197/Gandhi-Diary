# Technical Report: AI Assistant Integration in G-Diary

This report documents the architectural design, implementation steps, and current issues related to the Conversational AI Assistant integrated into the G-Diary PWA.

## 1. Architecture Overview

The G-Diary AI Assistant is a client-side integration that connects directly to the **Google Gemini API** (Generative Language API).

### Key Components

- **Frontend View**: Implemented in `renderAIAssistantView()`. A chat-based interface using standard HTML/CSS with support for quick-action buttons.
- **AI Logic**: Located in the `sendAIChat()` asynchronous function.
- **Persistence**: Chat history is stored in `localStorage` under the key `gdiary_ai_chat`. Key settings (API Key, difficulty, availability) are stored in `gdiary_tasks` (as part of the global `state`).
- **Context Awareness**: The AI is provided with a "System Context" containing:
  - Active homework (from `state.tasks`)
  - Upcoming exams (from `state.exams`)
  - Backlog items (from `state.backlog`)
  - Difficult subjects (from `state.difficulty`)
  - Study availability hours (from `state.availability`)

## 2. Implementation Flow

1. **User Interaction**: User enters text or clicks a "Quick Start" button (e.g., "Genera Piano Settimanale").
2. **Context Assembly**: The app gathers all relevant academic data from the local `state` object.
3. **Payload Construction**:
   - Role-based conversation history is mapped to the Gemini format (`role: 'user' | 'model'`).
   - A system prompt is injected at the start to define the AI's persona and rules.
4. **API Call**:
   - **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`
   - **Method**: POST
   - **Authentication**: API Key passed via query parameter `?key=...`
5. **Response Handling**:
   - The response is parsed and added to the chat history.
   - A regex-based "Plan Detector" checks if the response contains time slots. If so, an "Applica al Planner" button is rendered.
6. **Persistence & Render**: History is saved to `localStorage` and `render()` is called to update the UI.

## 3. Security Incident: Leaked API Key

### Issue Description
During development, the Gemini API key was hardcoded into the source code (`index.html`) to facilitate immediate testing. When the code was committed and pushed to the remote GitHub repository, Google the automated security scanners detected the presence of the key in a public/accessible context.

### Impact
- **Status**: The key `AIzaSyB8OAQJBtKoiNrPop-7VOMhZxcfznOCCCk` has been flagged as **LEAKED** by Google.
- **Result**: API requests using this key are now blocked or heavily throttled by Google Cloud security policies.
- **Current App State**: The AI assistant returns "Your API key was reported as leaked" or "Quota exceeded" errors.

### Resolution Steps
1. **Key Rotation**: The user must go to [Google AI Studio](https://aistudio.google.com/app/apikey) and **delete** the compromised key.
2. **New Key Generation**: Generate a new API key.
3. **Source Code Cleanup**: Remove the hardcoded key from `index.html`.
4. **Secure Input**: The app has been updated to require manual entry of the API key through the "Setup Accademico" or "AI Settings" section. This key is stored ONLY in the browser's `localStorage` and never committed to source control.

## 4. Technical Issues Encountered

| Issue | Resolution |
|-------|------------|
| **Model Availability** | `gemini-1.5-flash` was sometimes reported as "not found" on certain tiers. Switched to `gemini-flash-latest` which maps to the best available stable model. |
| **Rate Limiting** | Frequent requests triggered 429 errors. Implemented exponential backoff (retry) logic (3 attempts with 15s/30s/45s delays). |
| **Character Escaping** | Subjects with apostrophes (e.g., *Dell'Alimentazione*) broke inline JavaScript handlers. Fixed using proper string escaping. |
| **DOM Persistence** | View transitions sometimes lost focus on the input field. Resolved using `setTimeout` hooks after `render()`. |

## 5. Contact Information for IT Support
For further technical clarification, the IT professional can inspect the `sendAIChat` and `renderAIAssistantView` functions in the `index.html` file of the repository.
