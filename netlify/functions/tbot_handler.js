// tbot_handler.js (Netlify Function)
const BOT_TOKEN = process.env.BOT_TOKEN; 
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DAILY_RESET_MS = 24 * 60 * 60 * 1000; // 24 ሰዓት በ ሚሊሰከንድ

// ... (extractUserId Function ሳይቀየር ይቀጥላል) ...
function extractUserId(body, isDirectFetch) {
    if (isDirectFetch && body && body.user_id) return body.user_id; 
    if (body.message && body.message.from) return body.message.from.id; 
    if (body.callback_query && body.callback_query.from) return body.callback_query.from.id;
    return null;
}

// ... (userDB እና initializeUser Function ሳይቀየሩ ይቀጥላሉ) ...
const userDB = {}; 
function initializeUser(userId) {
    if (!userDB[userId]) {
        userDB[userId] = { 
            points: 1000, 
            spin_data: { 
                attempts: 3, 
                last_spin: 0 // የመጨረሻው ሙከራ ጊዜ (Timestamp)
            }, 
            tasks_status: {} 
        };
    }
    return userDB[userId];
}

// ... (sendTelegramMessage Function ሳይቀየር ይቀጥላል) ...
async function sendTelegramMessage(chatId, text, options = {}) {
    const url = `${API_BASE}/sendMessage`;
    const payload = { chat_id: chatId, text: text, parse_mode: 'HTML', ...options };
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (error) {
        console.error("Error sending Telegram message:", error);
    }
}


exports.handler = async (event) => {
    
    // ... (HTTP Method, empty body, JSON parsing check ኮዶች ሳይቀየሩ ይቀጥላሉ) ...
    if (event.httpMethod !== "POST") { return { statusCode: 405, body: "Method Not Allowed" }; }
    let body;
    if (!event.body) { console.log("Empty body received."); return { statusCode: 200, body: "OK" }; }
    try { body = JSON.parse(event.body); } catch (e) { 
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, 
                 body: JSON.stringify({ action: "error", message: "Invalid JSON format in request body." }) };
    }
    
    // ... (Telegram Webhook Update ኮድ ሳይቀየር ይቀጥላል) ...
    if (body.update_id) {
        // ... Webhook handling code (including /start) ...
        return { statusCode: 200, body: "OK" };
    } 
    
    // 2. Mini App Fetch Request (ከ Frontend የሚመጣ)
    else if (body.action) {
        const userId = extractUserId(body, true);
        if (!userId || userId === "UNKNOWN") {
             return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ action: "error", message: "User ID Missing in Fetch Request" }) };
        }
        
        const user = initializeUser(userId);
        const now = Date.now();

        // 💡 አዲስ አመክንዮ: የ Spin ሙከራዎችን በ24 ሰዓት አንዴ ሪሴት ያደርጋል
        if (user.spin_data.attempts === 0 && (now - user.spin_data.last_spin) >= DAILY_RESET_MS) {
             user.spin_data.attempts = 3; // ሙከራዎች ይመለሳሉ
             user.spin_data.last_spin = 0; // ሰዓት ቆጣሪው ይቆማል
        }

        switch (body.action) {
            case 'request_initial_data':
                
                let resetTime = 0;
                if (user.spin_data.attempts === 0) {
                    // 💡 ማስተካከያ: ሙከራዎች ከሌሉ የመመለሻ ሰዓቱን አስልቶ ይልካል
                    resetTime = user.spin_data.last_spin + DAILY_RESET_MS;
                }
                
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: "initial_data",
                        points: user.points,
                        spin_data: user.spin_data,
                        reset_time: resetTime // ዜሮ ወይም ወደፊት የሚመጣ ሰዓት (Timestamp)
                    })
                };
            
            case 'spin_attempt':
                const PRIZE_OPTIONS = [50, 100, 150, 200, 250, 500, 0]; 
                
                if (user.spin_data.attempts > 0) {
                    user.spin_data.attempts -= 1;
                    user.spin_data.last_spin = now; // የመጨረሻ ሙከራ ጊዜን ይመዘግባል
                    
                    const wonPrize = PRIZE_OPTIONS[Math.floor(Math.random() * PRIZE_OPTIONS.length)];
                    user.points += wonPrize;
                    
                    let newResetTime = 0;
                    if (user.spin_data.attempts === 0) {
                        // 💡 ማስተካከያ: ሙከራ ሲያልቅ የመመለሻ ሰዓቱን ይልካል
                        newResetTime = now + DAILY_RESET_MS;
                    }
                    
                    return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: "spin_result",
                            points_won: wonPrize,
                            new_points: user.points,
                            attempts_left: user.spin_data.attempts,
                            reset_time: newResetTime // አዲሱን የመመለሻ ሰዓት
                        })
                    };
                } else {
                     // ሙከራ ሲያልቅ ቀሪውን ጊዜ አስልቶ ይልካል
                     const currentResetTime = user.spin_data.last_spin + DAILY_RESET_MS;
                     
                     return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: "error",
                            message: "No attempts left. Wait for the reset time.",
                            attempts_left: user.spin_data.attempts,
                            reset_time: currentResetTime
                        })
                    };
                }
                
            // ... (default case ይቀጥላል) ...
            default:
                 return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: "error",
                        message: "Unknown action in Mini App fetch request."
                    })
                };
        }
    }
    
    return { statusCode: 200, body: "Unexpected Request Format" };
};
