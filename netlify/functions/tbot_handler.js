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
        
        // ... tbot_handler.js

        if (!userId) {
            
            // Logውን ለማየት:
            console.error("Critical Error: User ID not found in either webAppData or direct update. Update object:", update);
            
            // የኮድ ማስተካከያ (ለጊዜው):
            if (update.message && update.message.from && update.message.from.id) {
                // ለ /start ትዕዛዝ ምላሽ ለመስጠት (ይህም User ID አለው)
                userId = update.message.from.id;
                await axios.post(`${TELEGRAM_API}/sendMessage`, { chat_id: userId, text: "Mini Appን ለመክፈት ከታች ያለውን አዝራር ይጫኑ።" });
                return { statusCode: 200, body: "Standard start message sent." };
            }
            
            return { statusCode: 200, body: "User ID not found or data not recognized." };
        }

        // ... የተቀረው ኮድ ይቀጥላል


