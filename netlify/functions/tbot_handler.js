// tbot_handler.js (Netlify Function)
const BOT_TOKEN = process.env.BOT_TOKEN; 
// 💡 ወሳኝ ማሳሰቢያ: BOT_TOKENን በ Netlify UI Environment Variables ውስጥ ያስገቡ።
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DAILY_RESET_MS = 24 * 60 * 60 * 1000; 

// 💡 ቋሚ የሽልማት አማራጮች (ከFrontend ጋር የተጣጣመ)
const PRIZE_OPTIONS = [50, 100, 150, 200, 250, 500, 0]; 
const DAILY_BONUS_POINTS = 500;

// 💡 የውሂብ ማስቀመጫ (ለሙከራ ጊዜ) - በProduction ላይ ከ Database ጋር መተካት አለበት
const userDB = {}; 

/**
 * ከተለያዩ ምንጮች የተጠቃሚ IDን ያወጣል።
 */
function extractUserId(body, isDirectFetch) {
    if (isDirectFetch && body && body.user_id) return body.user_id; 
    if (body.message && body.message.from) return body.message.from.id; 
    if (body.callback_query && body.callback_query.from) return body.callback_query.from.id;
    return null;
}

/**
 * አዲስ ተጠቃሚን በነባሪ ዋጋዎች ይመዘግባል ወይም ያለውን ይመልሳል።
 */
function initializeUser(userId) {
    if (!userDB[userId]) {
        userDB[userId] = { 
            points: 1000, 
            spin_data: { attempts: 5, last_spin: 0 }, 
            quiz_data: { attempts: 5, last_quiz: 0 },
            daily_bonus: { last_claim: 0 },
            tasks_status: {
                "TG_CH": { completed: false, status: 'NEW' }, // Telegram Channel
                "TG_GP": { completed: false, status: 'NEW' }, // Telegram Group
                "YT_SUB": { completed: false, status: 'NEW' }  // YouTube Subscribe
            },
            cart_history: []
        };
    }
    return userDB[userId];
}

/**
 * መልእክት ወደ ቴሌግራም ለመላክ ይጠቅማል።
 */
async function sendTelegramMessage(chatId, text, options = {}) {
    const url = `${API_BASE}/sendMessage`;
    const payload = { chat_id: chatId, text: text, parse_mode: 'HTML', ...options };
    
    if (!BOT_TOKEN) {
        console.error("❌ BOT_TOKEN is not set.");
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
            console.error(`❌ Telegram API Error ${response.status}: Failed to send message to ${chatId}. Response: ${errorText}`);
            return false; 
        }
        return true;
        
    } catch (error) {
        console.error("❌ Network or Fetch Error sending Telegram message:", error);
        return false;
    }
}


exports.handler = async (event) => {
    
    if (event.httpMethod !== "POST") { return { statusCode: 405, body: "Method Not Allowed" }; }
    let body;
    if (!event.body) { return { statusCode: 200, body: "OK" }; }
    try { body = JSON.parse(event.body); } catch (e) { 
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, 
                 body: JSON.stringify({ action: "error", message: "Invalid JSON format." }) };
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
                                // 💡 URLዎን ያስተካክሉ
                                web_app: { url: "https://schoollibrary1.netlify.app/" } 
                            }]]
                        }
                 });
            }
            return { statusCode: 200, body: "OK" }; 
        } 
        return { statusCode: 200, body: "OK - User ID Not Found" };
    } 
    
    // 2. Mini App Fetch Request (ከFrontend የሚመጣ)
    else if (body.action) {
        const userId = extractUserId(body, true);
        const now = Date.now();
        
        if (!userId || userId === "UNKNOWN_USER") { 
             return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ action: "error", message: "User ID Missing in Fetch Request" }) };
        }
        
        const user = initializeUser(userId);

        // 💡 ዕለታዊ የሙከራ ሪሴት አመክንዮ
        const resetAttempts = (data) => {
            if (data.attempts === 0 && (now - data.last_spin) >= DAILY_RESET_MS) {
                data.attempts = 5; 
                data.last_spin = 0; 
            }
        };

        resetAttempts(user.spin_data);
        resetAttempts(user.quiz_data);
        
        const getResetTime = (data) => data.attempts === 0 ? data.last_spin + DAILY_RESET_MS : 0;


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
                        // የመጨረሻው ክዋኔ ጊዜ ለጠቅላላ ሰዓት ቆጣሪ
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
                const pointsGained = parseInt(body.points); 

                if (user.tasks_status[taskId] && user.tasks_status[taskId].completed) {
                     return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: "error", message: "Task already completed." }) };
                }
                
                // 💡 ሁኔታውን ወደ PENDING ቀይር
                user.tasks_status[taskId] = { completed: false, status: 'PENDING' };
                
                // *** እዚህ ላይ የቴሌግራም አባልነት ማረጋገጫ API ጥሪ ይገባል ***
                // ለሙከራ ጊዜ በቀጥታ እንደተሳካ እናስቀምጠዋለን
                let isVerified = true; 

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
                            message: "Verification failed. Please ensure you have joined/subscribed."
                        })
                    };
                }

            case 'initiate_telebirr_payment':
                const totalAmount = parseFloat(body.total);
                const cartItems = body.cart_items;
                
                // 💡 ለተጠቃሚው በቦቱ መልእክት ይልካል
                const msgText = `💰 **ክፍያ ተጀምሯል!**\nጠቅላላ: ${totalAmount} ብር።\n\nእባክዎ ክፍያውን በቴሌብር (Telebirr) ወይም በሌላ የክፍያ ዘዴ በኩል ያጠናቅቁ።\n\n_ክፍያዎ ሲረጋገጥ፣ የገዙዋቸውን ${cartItems.length} መጽሐፍት ፋይሎች እዚሁ ይለቀቃሉ!_`;
                
                await sendTelegramMessage(userId, msgText);
                
                // 💡 የክፍያ ታሪክ ማስቀመጥ (ለማጣራት)
                user.cart_history.push({ total: totalAmount, items: cartItems, status: 'PENDING', timestamp: now });
                
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: "payment_initiated",
                        success: true,
                        message: "Payment request sent to the user via Telegram bot."
                    })
                };
                
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
