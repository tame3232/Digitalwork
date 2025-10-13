// netlify/functions/tbot_handler.js

const axios = require('axios');

// የቴሌግራም ቦት ቶከን
// በ Netlify Environment Variables ውስጥ ማስቀመጥዎን እርግጠኛ ይሁኑ!
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// *************************************************************************
// የዳታቤዝ ማስመሰያ (In-Memory Mock Database)
// **ማስጠንቀቂያ:** Serverless Functions STATE አይይዙም!
// ይህ ኮድ ለሎጂክ ማሳያ እና ለጊዜያዊ መፈተሻ ብቻ ነው!
// *************************************************************************

const USER_DB = {}; 

const getOrCreateUser = (userId) => {
    // ቶከኑን በ Variable ውስጥ ስለሚያስቀምጡ፣ እዚህ ትክክለኛውን ID መመለስ አለበት።
    if (!USER_DB[userId]) {
        USER_DB[userId] = {
            points: 500,
            balance: 0.00,
            spin_attempts: 3,
            last_spin: 0, // Last successful spin timestamp (MS)
            tasks_status: {
                TG_CH: { completed: false }, 
                TG_GP: { completed: false },
                YT_SUB: { completed: false },
            },
            daily_bonus: { last_claim: 0 }
        };
    }
    return USER_DB[userId];
};

const DAILY_RESET_MS = 24 * 60 * 60 * 1000;
const SPIN_PRIZES = [0, 50, 100, 150, 200, 250, 500]; // የሽልማት አማራጮች

// *************************************************************************
// TWA Frontend መልስ የሚልክ Function
// *************************************************************************

/**
 * Frontend የላከውን WebApp Data ተጠቅሞ ለሱ ምላሽ ይልካል
 * (ይህም በትክክል ለተጠቃሚው መልእክት መላክ ሲሆን፣ TWA ዳታውን ይይዘዋል)
 */
const sendTwaResponse = async (userId, responseData) => {
    try {
        const payload = {
            chat_id: userId,
            text: ".", // ይህ መልእክት ለተጠቃሚው አይታይም፣ TWA ዳታ ለማስተላለፍ ብቻ ነው
            reply_markup: {
                web_app_data: {
                    data: JSON.stringify(responseData)
                }
            }
        };
        await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
    } catch (error) {
        console.error("Error sending TWA response:", error.response ? error.response.data : error.message);
    }
};

// *************************************************************************
// ዋናው የNetlify Function Handler
// *************************************************************************

exports.handler = async (event, context) => {
    // Webhook POST ጥያቄ ብቻ ይቀበሉ
    if (event.httpMethod !== "POST") {
        return { statusCode: 200, body: "OK" }; 
    }

    try {
        const update = JSON.parse(event.body);
        
        let userId;
        let twaData;
        
        const message = update.message;
        const webAppData = message && message.web_app_data;
        
        // *****************************************************************
        // ** ወሳኝ ማስተካከያ: የዳታውን ምንጭ መለየት (Mini App vs Telegram Webhook) **
        // *****************************************************************

        if (webAppData) {
            // ሀ. ከቴሌግራም መልእክት ውስጥ የተላከ TWA Data (ለምሳሌ MainButton ሲጫን)
            userId = message.from.id;
            twaData = JSON.parse(webAppData.data);
            
        } else if (update.action && update.user_id) { 
            // ለ. ከ TWA Frontend በቀጥታ የመጣ ዳታ (ለምሳሌ ገጽ ሲከፈት - loadInitialData)
            twaData = update; 
            userId = twaData.user_id; 
            
        } else if (message && message.text) {
             // ሐ. የተለመደ የቴሌግራም መልእክት (ለምሳሌ /start ትዕዛዝ)
             // ይህንን ክፍል ሙሉ ለሙሉ ችላ ማለት ወይም መልስ መስጠት ይችላሉ።
             // ለጊዜው ችላ እንለዋለን
             return { statusCode: 200, body: "Standard Telegram message ignored." };
        }
        
        if (!userId) {
            return { statusCode: 200, body: "User ID not found or data not recognized." };
        }
        
        // ... የተቀረው ኮድዎ ከዚህ በታች ይቀጥላል ...
        const action = twaData.action;
        // **ማሳሰቢያ:** ይህ ኮድ በየጥሪው ዳታቤዝዎን ስለሚያድስ፣ ለሙከራ ብቻ ይጠቅማል!
        let userData = getOrCreateUser(userId);
        let responseData = { action: action };
        
        const nowMs = Date.now();

        console.log(`Received action: ${action} for user: ${userId}`);
        
        // ********************* አመክንዮ አያያዝ *********************
        
        if (action === "request_initial_data") {
            // 1. የጀማሪውን ዳታ ለFrontend መላክ
            
            // የ Spin ሙከራዎች ከ24 ሰዓት በኋላ ይደሳሉ?
            if (userData.last_spin > 0 && nowMs - userData.last_spin >= DAILY_RESET_MS) {
                userData.spin_attempts = 3;
                userData.last_spin = 0;
            }
            
            responseData = {
                action: "initial_data", // Frontend የሚጠብቀው action
                points: userData.points,
                spin_data: {
                    attempts: userData.spin_attempts,
                    last_spin: userData.last_spin 
                },
                tasks_status: userData.tasks_status,
                daily_bonus: userData.daily_bonus
            };
            
        } else if (action === "spin_attempt") {
            // 2. Spin Wheel አመክንዮ
            
            if (userData.spin_attempts > 0) {
                const wonPoints = SPIN_PRIZES[Math.floor(Math.random() * SPIN_PRIZES.length)];
                
                userData.spin_attempts -= 1;
                userData.points += wonPoints;
                
                if (userData.spin_attempts === 0) {
                    userData.last_spin = nowMs;
                }
                
                responseData = {
                    action: "spin_result",
                    points_won: wonPoints,
                    new_points: userData.points,
                    attempts_left: userData.spin_attempts,
                    last_spin: userData.last_spin
                };
                
            } else {
                await sendTwaResponse(userId, { action: "error", message: "ቀሪ ሙከራ የለዎትም።" });
                return { statusCode: 200, body: "No attempts left." };
            }
            
        } else if (action === "claim_daily_bonus") {
            // 3. የዕለታዊ ጉርሻ አመክንዮ
            
            if (nowMs - userData.daily_bonus.last_claim >= DAILY_RESET_MS) {
                const pointsGained = 500;
                userData.points += pointsGained;
                userData.daily_bonus.last_claim = nowMs;
                
                responseData = {
                    action: "daily_bonus_claimed",
                    success: true,
                    new_points: userData.points,
                    last_claim: userData.daily_bonus.last_claim
                };
            } else {
                responseData = { action: "daily_bonus_claimed", success: false };
            }

        } else if (action === "verify_social_task") {
            // 4. የማህበራዊ Task ማረጋገጫ (Mock)
            const taskId = twaData.task_id;
            const task = userData.tasks_status[taskId];
            let success = false;
            let pointsGained = 0;

            if (task && !task.completed) {
                success = true; // ለጊዜው ሁልጊዜ ስኬት ነው
                
                if (taskId === "TG_CH") pointsGained = 150;
                else if (taskId === "TG_GP") pointsGained = 100;
                else if (taskId === "YT_SUB") pointsGained = 300;
                
                if (success) {
                    userData.points += pointsGained;
                    task.completed = true;
                }
            }

            responseData = {
                action: "task_verified",
                task_id: taskId,
                success: success,
                points_gained: pointsGained,
                new_points: userData.points
            };
            
        } else if (action === "initiate_telebirr_payment") {
            // 5. የክፍያ አመክንዮ (Mock)
            
            await sendTwaResponse(userId, { action: "info", message: "የክፍያ ሂደት ተጀምሯል።" });
            
            setTimeout(async () => {
                 userData.balance += parseFloat(twaData.total);
                 
                 await sendTwaResponse(userId, {
                    action: "payment_confirmed",
                    success: true,
                    amount: twaData.total
                 });
                 
            }, 5000); 

            // Netlify Function በፍጥነት OK መመለስ አለበት
            return { statusCode: 200, body: "Payment initiated." };
        }
        
        // ******************************************************
        
        // የመጨረሻ ምላሽን ወደ TWA Frontend መላክ
        await sendTwaResponse(userId, responseData);

        return {
            statusCode: 200,
            body: "Successfully processed WebApp data."
        };

    } catch (error) {
        console.error("Handler Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

