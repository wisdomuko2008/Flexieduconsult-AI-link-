require("dotenv").config();
const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
const cors = require("cors");

// Initialize Firebase
admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
});
const db = admin.firestore();

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const API_KEYS = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5
].filter(Boolean);

let keyIndex = 0;

// UPDATED: Log specifically to a user's history
async function logToFirebase(userId, prompt, response) {
    try {
        await db.collection("users").doc(userId).collection("chat_history").add({
            user_message: prompt,
            jarvis_response: response,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            platform: "Flexi Educational Consult"
        });
    } catch (err) {
        console.error("❌ Firebase Log Error:", err);
    }
}

async function callGemini(prompt, imageBase64) {
    const key = API_KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % API_KEYS.length;

    let parts = [{ text: prompt }];

    if (imageBase64) {
        const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
        parts.push({
            inlineData: {
                mimeType: "image/jpeg",
                data: base64Data
            }
        });
    }

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        { contents: [{ parts: parts }] }
    );
    
    return response.data.candidates[0].content.parts[0].text;
}

// Admission Help Route
app.post("/admission-help", async (req, res) => {
    try {
        // Extract userId from frontend payload
        const { prompt, image, userId, userName } = req.body;
        
        const currentYear = new Date().toLocaleDateString("en-NG", { 
            timeZone: "Africa/Lagos", 
            year: "numeric" 
        });

        const systemInstruction = `
            You are Jarvis, a professional support agent at Flexi Educational Consult (F.E.C).
            Current User: ${userName}
            Current Year: ${currentYear}
            
            STRICT RULES:
            1. FORMAT: Plain-text, no bold (**), no bullet points.
            2. LENGTH: Under 40 words.
            3. PERSONA: Professional and authoritative support agent.
            4. REFUSAL: Do not solve academic assignments. Reply: "I cannot solve academic assignments. Please contact Flexi Educational Consult at 09034159839."
            5. KNOWLEDGE: Accurate admission info for Nigerian institutions.
            6. REDIRECTION: Use "For updates and processing, please contact Flexi Educational Consult at 09034159839" if unknown.
            7. NO FILLER: Never apologize or offer unsolicited help.
            
            User Message: ${prompt}
        `;
        
        const result = await callGemini(systemInstruction, image);
        
        // Log the exchange to the specific user's document
        logToFirebase(userId, prompt, result);
        
        res.json({ success: true, response: result });
    } catch (err) {
        console.error("❌ AI Route Error:", err.response?.data?.error || err.message);
        res.status(500).json({ success: false, error: "Service unavailable" });
    }
});

app.get("/", (req, res) => res.send("Jarvis is online."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Jarvis (F.E.C Official Bot) Running on port ${PORT}`));
