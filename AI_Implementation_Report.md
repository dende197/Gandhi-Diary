# AI Tutor Implementation Report (PWA Integration)

## 1. Overview
G-Diary integrates a Gemini-powered AI Tutor to assist students with study planning and material organization. The system is designed for privacy, performance, and cross-timezone reliability.

## 2. Architecture

### Backend: AI Proxy
- **Endpoint**: `/api/ai/chat` (Node.js/Express)
- **Security**: The Gemini API key remains on the server (`process.env.GEMINI_API_KEY`).
- **Function**: The proxy forwards messages from the PWA to Google and returns the generated tokens. This prevents key exposure in the browser.

### Frontend: PWA
- **Interface**: A modern, glassmorphism-style chat UI.
- **State**: Chat history is persisted in `localStorage`.
- **Sync**: AI-generated plans can be automatically parsed and applied to the central Planner state.

## 3. Key Fixes

### API Security (Leak Prevention)
Google's security systems automatically revoke API keys if they are detected in client-side code on public domains. 
- **Resolution**: Implemented the Proxy architecture. The PWA no longer contains or requires an API key in the source code or local storage.

### Timezone Offset Bug (Date Shift)
The app previously used `toISOString()`, which returns UTC. In many timezones (like Italy, UTC+1), this caused days to "shift" by 24 hours at midnight.
- **Symptoms**: Sunday tasks appeared on Monday; clicking Feb 15 opened Feb 14.
- **Resolution**: Implemented `getLocalDateString()` as a centralized helper to ensure dates are always calculated based on the user's local clock.

## 4. Maintenance for IT
If the AI stops responding:
1. Check the `GEMINI_API_KEY` in the Render environment variables.
2. Verify the Backend URL in `index.html` matches the Render deployment.
3. Check `server.log` for API quota errors.
