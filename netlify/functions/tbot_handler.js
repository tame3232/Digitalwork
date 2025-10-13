// tbot_handler.js (Netlify Function)
const BOT_TOKEN = process.env.BOT_TOKEN; 
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DAILY_RESET_MS = 24 * 60 * 60 * 1000; 

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
            spin_data: { attempts: 3, last_spin: 0 }, 
            tasks_status: {} 
        };
    }
    return userDB[userId];
}

// 💡 ማስተካከያ: መልእክቱ መላኩን እና ያለስህተት መሄዱን የሚያረጋግጥ Function
async function sendTelegramMessage(chatId, text, options = {}) {
    const url = `${API_BASE}/sendMessage`;
    const payload = { chat_id: chatId, text: text, parse_mode: 'HTML', ...options };
    
    // 💡 ወሳኝ: BOT_TOKEN መኖሩን ማረጋገጥ
    if (!BOT_TOKEN) {
        console.error("❌ BOT_TOKEN is not set in Netlify environment variables.");
        return false;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            // የቴሌግራም API ምላሽ ካልሰጠ (ለምሳሌ 401 Unauthorized, 400 Bad Request)
            const errorText = await response.text();
            console.error(`❌ Telegram API Error ${response.status}: Failed to send message to ${chatId}. Response: ${errorText}`);
            return false; 
        }
        
        console.log(`Telegram message sent successfully to chat ID: ${chatId}`);
        return true;
        
    } catch (error) {
        // አጠቃላይ አውታረ መረብ/ኔትዎርክ ስህተት ሲፈጠር
        console.error("❌ Network or Fetch Error sending Telegram message:", error);
        return false;
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
    
    // 1. የቴሌግራም Webhook Update (ከ Telegram የሚመጣ)
    if (body.update_id) {
        const userId = extractUserId(body, false);
        
        if (userId) {
            const user = initializeUser(userId); 
            
            if (body.message && body.message.text === '/start') {
                 // 💡 የ Mini App አዝራርን ይልካል
                 await sendTelegramMessage(userId, "እንኳን ደህና መጡ! ሱቁን ለመክፈት ከታች ያለውን አዝራር ይጫኑ።", {
                      reply_markup: {
                            inline_keyboard: [[{
                                text: "🛒 School Library Shop",
                                web_app: { url: "https://schoollibrary1.netlify.app/" } 
                            }]]
                        }
                 });
            }
            return { statusCode: 200, body: "OK" }; 
        } else {
            console.error("Critical Error: User ID not found in Webhook update.", body); 
            return { statusCode: 200, body: "OK - User ID Not Found" };
        }
    } 
    
    // ... (Mini App Fetch Request ኮድ ሳይቀየር ይቀጥላል) ...
    else if (body.action) {
        const userId = extractUserId(body, true);
        const now = Date.now();
        
        // ... (Error handling and spin reset logic) ...

        // ... (switch block for request_initial_data and spin_attempt) ...
        
        if (!userId || userId === "UNKNOWN") { 
             return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ action: "error", message: "User ID Missing in Fetch Request" }) };
        }
        
        const user = initializeUser(userId);
        
        // 💡 አዲስ አመክንዮ: የ Spin ሙከራዎችን በ24 ሰዓት አንዴ ሪሴት ያደርጋል
        if (user.spin_data.attempts === 0 && (now - user.spin_data.last_spin) >= DAILY_RESET_MS) {
             user.spin_data.attempts = 3; // ሙከራዎች ይመለሳሉ
             user.spin_data.last_spin = 0; // ሰዓት ቆጣሪው ይቆማል
        }

        switch (body.action) {
            case 'request_initial_data':
                let resetTime = 0;
                if (user.spin_data.attempts === 0) {
                    resetTime = user.spin_data.last_spin + DAILY_RESET_MS;
                }
                
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: "initial_data",
                        points: user.points,
                        spin_data: user.spin_data,
                        reset_time: resetTime 
                    })
                };
            
            case 'spin_attempt':
                // ... (Spin logic) ...
                const PRIZE_OPTIONS = [50, 100, 150, 200, 250, 500, 0]; 
                
                if (user.spin_data.attempts > 0) {
                    user.spin_data.attempts -= 1;
                    user.spin_data.last_spin = now; 
                    
                    const wonPrize = PRIZE_OPTIONS[Math.floor(Math.random() * PRIZE_OPTIONS.length)];
                    user.points += wonPrize;
                    
                    let newResetTime = 0;
                    if (user.spin_data.attempts === 0) {
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
                            reset_time: newResetTime 
                        })
                    };
                } else {
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
