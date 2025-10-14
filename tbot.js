/**
 * Telegram Bot Webhook Handler for Render
 *
 * This file switches the architecture from Netlify Serverless Function
 * to a persistent Node.js Web Server using Express.
 *
 * It uses Express to listen on the port provided by Render (process.env.PORT)
 * and directs all incoming POST requests (Telegram Webhook and Frontend Fetch)
 * to the appropriate handler functions.
 */

// ************************************************************************
// 1. IMPORTS AND SETUP
// ************************************************************************

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

// Initialize Express App
const app = express();
// Render automatically sets the PORT environment variable
const PORT = process.env.PORT || 3000; 

// Middleware to parse incoming JSON request bodies (Telegram webhook uses JSON)
app.use(bodyParser.json()); 

// 💡 IMPORTANT: Set your BOT_TOKEN as an Environment Variable in Render Dashboard
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Constants (Copied from your original file)
const DAILY_RESET_MS = 24 * 60 * 60 * 1000;
const MAX_SPIN_ATTEMPTS = 5;
const MAX_QUIZ_ATTEMPTS = 5;

// ************************************************************************
// 2. HELPER FUNCTIONS (No change needed here, just migrating them)
// ************************************************************************

// Helper function for user data retrieval (Mock/Placeholder for DB logic)
async function getOrCreateUser(userId, username) {
    // --- Mock Data Retrieval Logic ---
    let userData = {
        id: userId,
        username: username,
        points: 0,
        balance: 0.00,
        spin_data: {
            attempts: MAX_SPIN_ATTEMPTS,
            last_spin: 0
        },
        quiz_data: {
            attempts: MAX_QUIZ_ATTEMPTS,
            last_quiz: 0
        },
        tasks_status: {
            TG_CH: { completed: false, claimed: false, points: 150 },
            TG_GP: { completed: false, claimed: false, points: 100 },
            YT_SUB: { completed: false, claimed: false, points: 300 }
        },
        daily_bonus: {
            last_claim: 0,
            points: 500
        },
        purchases: [] 
    };
    
    userData = applyDailyReset(userData);

    return userData;
}

// Helper function to apply daily reset logic
function applyDailyReset(userData) {
    const now = Date.now();
    
    // Check Spin Reset
    if (userData.spin_data.last_spin > 0 && now - userData.spin_data.last_spin >= DAILY_RESET_MS) {
        userData.spin_data.attempts = MAX_SPIN_ATTEMPTS;
    }

    // Check Quiz Reset
    if (userData.quiz_data.last_quiz > 0 && now - userData.quiz_data.last_quiz >= DAILY_RESET_MS) {
        userData.quiz_data.attempts = MAX_QUIZ_ATTEMPTS;
    }
    
    return userData;
}

async function updateUserData(userId, updateFields) {
    const mockRank = Math.floor(Math.random() * 200) + 1;
    return { success: true, new_rank: mockRank };
}

function getMockLeaderboard() {
    return [
        { rank: 1, name: "Abel (You)", points: 3500, type: "points" },
        { rank: 2, name: "Bethlehem", points: 3200, type: "points" },
        { rank: 3, name: "Kaleb.T", points: 2950, type: "points" },
    ];
}

// ************************************************************************
// 3. HANDLER FUNCTIONS (Modified to return data instead of Netlify format)
// ************************************************************************

async function handleTelegramWebhook(body) {
    const { message } = body;

    if (message && message.text === '/start') {
        const chat_id = message.chat.id;

        // 💡 Render URL Placeholder: You MUST replace this with your actual Render URL
        // once the service is deployed. Example: https://my-bot-service.onrender.com
        const webAppUrl = 'https://YOUR-RENDER-SERVICE-NAME.onrender.com/web-app'; 

        const keyboard = {
            inline_keyboard: [
                [{ text: "▶️ PLAY", web_app: { url: webAppUrl } }]
            ]
        };

        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chat_id,
            text: "Welcome to the School Library Shop! Click 'PLAY' to start the Mini App.",
            reply_markup: keyboard
        });
        
        return { success: true, message: "Start command processed" };
    }
    
    return { success: true, message: "Ignored message" };
}

async function handleFrontendRequest(body) {
    const { action, user_id } = body;
    
    if (!user_id) {
        return { error: "User ID Missing" };
    }
    
    let user = await getOrCreateUser(user_id, body.username || 'Guest');
    
    if (action === "request_initial_data") {
        
        return {
            action: "initial_data",
            points: user.points,
            spin_data: user.spin_data,
            tasks_status: user.tasks_status,
            daily_bonus: user.daily_bonus,
            leaderboard_data: getMockLeaderboard() 
        };
    }
    
    // --- Spin Logic (Simplified) ---
    if (action === "spin_attempt") {
        
        if (user.spin_data.attempts <= 0) {
            return { action: "spin_result", success: false, attempts_left: 0 };
        }
        
        const prizeOptions = [50, 100, 150, 200, 250, 500, 0];
        const pointsWon = prizeOptions[Math.floor(Math.random() * prizeOptions.length)];
        
        user.points += pointsWon;
        user.spin_data.attempts -= 1;
        user.spin_data.last_spin = Date.now();
        
        await updateUserData(user_id, { points: user.points, spin_data: user.spin_data });
        
        return {
            action: "spin_result",
            success: true,
            points_won: pointsWon,
            new_points: user.points,
            attempts_left: user.spin_data.attempts,
        };
    }
    
    // ... (Other action logics would go here)
    
    return { error: "Unknown action" };
}


// ************************************************************************
// 4. EXPRESS ROUTES (MAIN ENTRY POINT)
// ************************************************************************

// Health Check route (Optional, but good for Render)
app.get('/', (req, res) => {
    res.status(200).send('Telegram Bot Service is Running!');
});

// The single POST endpoint for all requests (Telegram Webhook AND Frontend Fetch)
app.post('/', async (req, res) => {
    try {
        const body = req.body;
        let response;
        
        if (body.update_id) {
            // 1. TELEGRAM WEBHOOK REQUEST
            response = await handleTelegramWebhook(body);
            // Telegram expects a quick 200 OK response even if nothing is sent back
            res.status(200).send('OK'); 
        } else {
            // 2. FRONTEND FETCH REQUEST
            response = await handleFrontendRequest(body);
            
            if (response.error) {
                res.status(400).json(response);
            } else {
                res.status(200).json(response);
            }
        }

    } catch (error) {
        console.error("Express handler error:", error.message);
        // Send a 500 error response to the client or Telegram
        res.status(500).json({ error: `Internal Server Error: ${error.message}` }); 
    }
});


// ************************************************************************
// 5. START SERVER
// ************************************************************************

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
