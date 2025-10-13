// netlify/functions/tbot_handler.js

const axios = require('axios'); 

// 💡 ይህ BOT_TOKEN በ Netlify Environment Variables ውስጥ መዘጋጀት አለበት
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// *************************************************************************
// የዳታቤዝ ማስመሰያ (In-Memory Mock Database) - ለጊዜያዊ መፈተሻ ብቻ
// *************************************************************************

const USER_DB = {}; 

const getOrCreateUser = (userId) => {
    if (!USER_DB[userId]) {
        USER_DB[userId] = {
            points: 500,
            spin_attempts: 3,
            last_spin: 0, 
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
const SPIN_PRIZES = [0, 50, 100, 150, 200, 250, 500]; 

// *************************************************************************
// TWA Frontend መልስ የሚልክ Function
// *************************************************************************

const sendTwaResponse = async (userId, responseData) => {
    try {
        const payload = {
            chat_id: userId,
            text: ".", 
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
    if (event.httpMethod !== "POST") {
        return { statusCode: 200, body: "OK" }; 
    }

    try {
        const update = JSON.parse(event.body);
        
        const message = update.message;
        const webAppData = message && message.web_app_data;
        const userId = message && message.from && message.from.id;

        if (!webAppData || !userId) {
            return { statusCode: 200, body: "Not WebApp data or no user ID" };
        }

        const twaData = JSON.parse(webAppData.data);
        const action = twaData.action;
        let userData = getOrCreateUser(userId);
        let responseData = { action: action };
        const nowMs = Date.now();
        
        if (action === "request_initial_data") {
            if (userData.last_spin > 0 && nowMs - userData.last_spin >= DAILY_RESET_MS) {
                userData.spin_attempts = 3;
                userData.last_spin = 0;
            }
            
            responseData = {
                action: "initial_data",
                points: userData.points,
                spin_data: { attempts: userData.spin_attempts, last_spin: userData.last_spin },
                tasks_status: userData.tasks_status,
                daily_bonus: userData.daily_bonus
            };
        } else if (action === "spin_attempt") {
             if (userData.spin_attempts > 0) {
                const wonPoints = SPIN_PRIZES[Math.floor(Math.random() * SPIN_PRIZES.length)];
                userData.spin_attempts -= 1;
                userData.points += wonPoints;
                if (userData.spin_attempts === 0) { userData.last_spin = nowMs; }
                responseData = { action: "spin_result", points_won: wonPoints, new_points: userData.points, attempts_left: userData.spin_attempts, last_spin: userData.last_spin };
            } else {
                responseData = { action: "error", message: "No attempts left." };
            }
        }
        
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
