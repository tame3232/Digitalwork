// tbot_handler.js (Netlify Function)
// --------------------------------------------------------------------------------
// NOTE: This code uses an in-memory database (userDB) for testing. 
//       For Production, replace this with a persistent database (e.g., FaunaDB, MongoDB).
// --------------------------------------------------------------------------------
const BOT_TOKEN = process.env.BOT_TOKEN; 
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DAILY_RESET_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Prize options (must match frontend)
const PRIZE_OPTIONS = [50, 100, 150, 200, 250, 500, 0]; 
const DAILY_BONUS_POINTS = 500;

// In-Memory Database (for testing ONLY)
const userDB = {}; 

/**
 * Extracts the user ID from the incoming request body.
 * @param {Object} body - The incoming request body.
 * @param {boolean} isDirectFetch - True if the request is directly from the Mini App.
 * @returns {number|string|null} The user's ID.
 */
function extractUserId(body, isDirectFetch) {
    if (isDirectFetch && body && body.user_id) return body.user_id; 
    if (body.message && body.message.from) return body.message.from.id; 
    if (body.callback_query && body.callback_query.from) return body.callback_query.from.id;
    return null;
}

/**
 * Initializes a new user with default data or returns existing data.
 * (WARNING: Connect this to a persistent Database for Production)
 * @param {number|string} userId - User ID.
 * @returns {Object} The user's data object.
 */
function initializeUser(userId) {
    const defaultData = { 
        points: 1000, 
        spin_data: { attempts: 5, last_spin: 0 }, 
        quiz_data: { attempts: 5, last_quiz: 0 },
        daily_bonus: { last_claim: 0 },
        tasks_status: {
            "TG_CH": { completed: false, status: 'NEW' },
            "TG_GP": { completed: false, status: 'NEW' },
            "YT_SUB": { completed: false, status: 'NEW' }
        },
        cart_history: []
    };
    
    if (!userDB[userId]) {
        userDB[userId] = defaultData;
    }
    return userDB[userId];
}

/**
 * Sends a message to the Telegram Bot API.
 */
async function sendTelegramMessage(chatId, text, options = {}) {
    const url = `${API_BASE}/sendMessage`;
    const payload = { chat_id: chatId, text: text, parse_mode: 'MarkdownV2', ...options };
    
    if (!BOT_TOKEN) {
        console.error("BOT_TOKEN is not set.");
        return false;
    }
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Telegram API Error ${response.status}: Failed to send message to ${chatId}. Response: ${errorText}`);
            return false; 
        }
        return true;
        
    } catch (error) {
        console.error("Network or Fetch Error sending Telegram message:", error);
        return false;
    }
}


exports.handler = async (event) => {
    
    // Netlify Functions should only respond to POST for Webhooks and Mini App fetches
    if (event.httpMethod !== "POST") { return { statusCode: 405, body: "Method Not Allowed" }; }
    
    let body;
    if (!event.body) { return { statusCode: 200, body: "OK" }; } 
    
    try { 
        body = JSON.parse(event.body); 
    } catch (e) { 
        return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, 
                 body: JSON.stringify({ action: "error", message: "Invalid JSON format." }) };
    }
    
    // 1. Telegram Webhook Update (from Telegram)
    if (body.update_id) {
        const userId = extractUserId(body, false);
        
        if (userId) {
            initializeUser(userId); 
            
            if (body.message && body.message.text === '/start') {
                 // Sends the Mini App button
                 await sendTelegramMessage(userId, 
                      "እንኳን ደህና መጡ! ሱቁን ለመክፈት ከታች ያለውን አዝራር ይጫኑ\\.", 
                      {
                          reply_markup: {
                                inline_keyboard: [[{
                                    text: "🛒 School Library Shop",
                                    // Make sure this URL is correct
                                    web_app: { url: "https://schoollibrary1.netlify.app/" } 
                                }]]
                            }
                     }
                 );
            }
            return { statusCode: 200, body: "OK" }; 
        } 
        return { statusCode: 200, body: "OK - User ID Not Found" };
    } 
    
    // 2. Mini App Fetch Request (from Frontend)
    else if (body.action) {
        const userId = extractUserId(body, true);
        const now = Date.now();
        
        if (!userId || userId === "UNKNOWN_USER") { 
             return { statusCode: 400, headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ action: "error", message: "User ID Missing in Fetch Request" }) };
        }
        
        const user = initializeUser(userId);

        // Daily attempt reset logic
        const resetAttempts = (data) => {
            if (data.attempts === 0 && (now - data.last_spin) >= DAILY_RESET_MS) {
                data.attempts = 5; 
                data.last_spin = 0; 
            }
        };

        resetAttempts(user.spin_data);
        resetAttempts(user.quiz_data);
        
        switch (body.action) {
            
            case 'request_initial_data':
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: "initial_data",
                        points: user.points,
                        spin_data: user.spin_data,
                        quiz_data: user.quiz_data,
                        daily_bonus: user.daily_bonus, 
                        tasks_status: user.tasks_status,
                        last_operation_time: Math.max(user.daily_bonus.last_claim, user.spin_data.last_spin, user.quiz_data.last_quiz)
                    })
                };
            
            case 'spin_attempt':
                if (user.spin_data.attempts > 0) {
                    user.spin_data.attempts -= 1;
                    user.spin_data.last_spin = now; 
                    
                    const wonPrize = PRIZE_OPTIONS[Math.floor(Math.random() * PRIZE_OPTIONS.length)];
                    user.points += wonPrize;
                    
                    return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: "spin_result",
                            points_won: wonPrize,
                            new_points: user.points,
                            attempts_left: user.spin_data.attempts,
                            last_spin: user.spin_data.last_spin
                        })
                    };
                } else {
                     return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: "error",
                            message: "No attempts left.",
                            attempts_left: user.spin_data.attempts,
                            last_spin: user.spin_data.last_spin
                        })
                    };
                }
            
            case 'claim_daily_bonus':
                const lastClaim = user.daily_bonus ? user.daily_bonus.last_claim : 0;
                
                if (now - lastClaim >= DAILY_RESET_MS) {
                    user.points += DAILY_BONUS_POINTS;
                    user.daily_bonus.last_claim = now;
                    
                    return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: "daily_bonus_claimed",
                            success: true,
                            new_points: user.points,
                            last_claim: now 
                        })
                    };
                } else {
                     return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: "daily_bonus_claimed",
                            success: false,
                            message: "Already claimed for today.",
                            last_claim: lastClaim 
                        })
                    };
                }
            
            case 'verify_social_task':
                const taskId = body.task_id;
                const pointsGained = parseInt(body.points) || 0; 

                if (!user.tasks_status[taskId] || user.tasks_status[taskId].completed) {
                     return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: "error", message: "Task invalid or already completed." }) };
                }
                
                user.tasks_status[taskId] = { completed: false, status: 'PENDING' };
                
                // *** Telegram membership verification API call goes here ***
                let isVerified = true; // Mock verification for testing

                if (isVerified) {
                    user.points += pointsGained;
                    user.tasks_status[taskId] = { completed: true, status: 'DONE' };
                    
                    return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: "task_verified",
                            success: true,
                            task_id: taskId,
                            points_gained: pointsGained,
                            new_points: user.points,
                            tasks_status: user.tasks_status
                        })
                    };
                } else {
                    user.tasks_status[taskId] = { completed: false, status: 'FAILED' };
                    return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: "task_verified",
                            success: false,
                            task_id: taskId,
                            tasks_status: user.tasks_status,
                            message: "Verification failed."
                        })
                    };
                }

            case 'initiate_telebirr_payment':
                const totalAmount = parseFloat(body.total);
                const cartItems = body.cart_
