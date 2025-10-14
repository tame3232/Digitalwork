// Function Handler for Netlify
// This file handles all incoming requests, including Telegram Webhook and Frontend Fetch requests.

// Import necessary dependencies
const axios = require('axios'); 
// const { MongoClient } = require('mongodb'); 

// 💡 IMPORTANT: Set your BOT_TOKEN as an Environment Variable in Netlify UI
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Constants
const DAILY_RESET_MS = 24 * 60 * 60 * 1000;
const MAX_SPIN_ATTEMPTS = 5;
const MAX_QUIZ_ATTEMPTS = 5;

// Helper function for user data retrieval (Mock/Placeholder for DB logic)
async function getOrCreateUser(userId, username) {
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
// 1. TELEGRAM WEBHOOK HANDLER
// ************************************************************************

async function handleTelegramWebhook(body) {
    const { message } = body;

    if (message && message.text === '/start') {
        const chat_id = message.chat.id;

        // 💡 UPDATED URL: Using the provided correct Netlify site URL
        const webAppUrl = 'https://cheerful-gumption-78086f.netlify.app'; 

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
        
        return { statusCode: 200, body: JSON.stringify({ message: "Start command processed" }) };
    }
    
    return { statusCode: 200, body: JSON.stringify({ message: "Ignored message" }) };
}

// ************************************************************************
// 2. FRONTEND FETCH REQUEST HANDLER
// ************************************************************************

async function handleFrontendRequest(body) {
    const { action, user_id } = body;
    
    if (!user_id) {
        return { statusCode: 400, body: JSON.stringify({ error: "User ID Missing" }) };
    }
    
    let user = await getOrCreateUser(user_id, body.username || 'Guest');
    
    if (action === "request_initial_data") {
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                action: "initial_data",
                points: user.points,
                spin_data: user.spin_data,
                tasks_status: user.tasks_status,
                daily_bonus: user.daily_bonus,
                leaderboard_data: getMockLeaderboard() 
            })
        };
    }
    
    // --- Spin Logic (Simplified) ---
    if (action === "spin_attempt") {
        // ... (Spin logic remains the same)
        if (user.spin_data.attempts <= 0) {
            return { statusCode: 200, body: JSON.stringify({ action: "spin_result", success: false, attempts_left: 0 })};
        }
        
        const prizeOptions = [50, 100, 150, 200, 250, 500, 0];
        const pointsWon = prizeOptions[Math.floor(Math.random() * prizeOptions.length)];
        
        user.points += pointsWon;
        user.spin_data.attempts -= 1;
        user.spin_data.last_spin = Date.now();
        
        await updateUserData(user_id, { points: user.points, spin_data: user.spin_data });
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                action: "spin_result",
                success: true,
                points_won: pointsWon,
                new_points: user.points,
                attempts_left: user.spin_data.attempts,
            })
        };
    }
    
    // ... (Other action logics remain the same)
    
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }) };
}


// ************************************************************************
// 3. MAIN HANDLER
// ************************************************************************

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body);

        if (body.update_id) {
            return await handleTelegramWebhook(body);
        }

        return await handleFrontendRequest(body);

    } catch (error) {
        console.error("Function execution error:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: `Internal Server Error: ${error.message}` }) 
        };
    }
};
