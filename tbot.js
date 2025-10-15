// tbot.js (Telegram Bot Web App Backend)

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios'); // ለቴሌግራም API ጥሪ
const cors = require('cors'); // ⚠️ CORSን ለመፍታት (አሁን በ package.json ውስጥ አለ)

const app = express();
// 💡 Render በሚሰጠው ፖርት ወይም በ 3000 ይነሳል
const port = process.env.PORT || 3000; 

// ************************************************************
// 💡 የእርስዎ Render Frontend URL
const RENDER_FRONTEND_URL = 'https://digitalwork-1ae6.onrender.com';
// ************************************************************

// 💡 CORS ለ Frontend (Web App) ጥያቄዎች እንዲሰራ ማስተካከል
app.use(cors({
    origin: RENDER_FRONTEND_URL, 
    methods: 'GET,POST',
    allowedHeaders: 'Content-Type,Authorization'
}));

// የ JSON ጥያቄዎችን ለመቀበል
app.use(bodyParser.json());


// ************************************************************
// 💡 የቴሌግራም ቦት ቶክን (በ Render ENV VARs ውስጥ ቢሆን ይመረጣል)
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE'; 
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
// ************************************************************


// ********** የቦታ መያዣ ዳታቤዝ (PLACEHOLDER DATABASE) **********
// ⚠️ ይህ ዳታቤዝ Render Restart ሲደረግ ይጠፋል! በእውነተኛ ዳታቤዝ ይተኩት።

const userDatabase = {
    // ምሳሌ ተጠቃሚ ዳታ (ለመሞከሪያ)
    '123456789': { 
        points: 500,
        balance: 10.50,
        last_spin: 0, 
        spin_attempts: 5,
        last_quiz: 0,
        quiz_attempts: 5,
        last_daily_claim: 0,
        tasks_completed: {
            'TG_CH': { completed: false, claimed: false }, 
            'TG_GP': { completed: false, claimed: false }, 
            'YT_SUB': { completed: false, claimed: false }
        }
    }
};

const MAX_ATTEMPTS = 5;
const DAILY_RESET_MS = 24 * 60 * 60 * 1000;
const SPINNER_PRIZES = [50, 100, 150, 200, 250, 500, 0]; // 0 ለ "ባዶ"

function getUserData(userId) {
    if (!userDatabase[userId]) {
        // አዲስ ተጠቃሚን መፍጠር
        userDatabase[userId] = {
            points: 0,
            balance: 0.00,
            last_spin: 0,
            spin_attempts: MAX_ATTEMPTS,
            last_quiz: 0,
            quiz_attempts: MAX_ATTEMPTS,
            last_daily_claim: 0,
            tasks_completed: {
                'TG_CH': { completed: false, claimed: false }, 
                'TG_GP': { completed: false, claimed: false }, 
                'YT_SUB': { completed: false, claimed: false }
            }
        };
    }
    return userDatabase[userId];
}

function getLeaderboardData() {
    return [
        { rank: 1, name: "Abel (አንተ)", points: 3500, type: "points" },
        { rank: 2, name: "Bethlehem", points: 3200, type: "points" },
        { rank: 3, name: "Kaleb.T", points: 2950, type: "points" },
    ];
}

/**
 * 💡 የ 24 ሰዓት ጊዜው አልፎ እንደሆነ የሚፈትሽ ተግባር
 */
function isResetTimeElapsed(lastActionTime) {
    if (lastActionTime === 0) return true; 
    return (Date.now() - lastActionTime) >= DAILY_RESET_MS;
}

// ********** ዋናው POST End-point (ሁለቱንም Web App እና Webhook የሚያስተናግድ) **********

app.post('/', async (req, res) => {
    const requestBody = req.body;
    const action = requestBody.action;
    const userId = requestBody.user_id;
    
    // 💡 ለሙከራ እንዲመች (በእውነተኛው ቦት ላይ user_id ከ init_data መረጋገጥ አለበት)
    const currentUserId = userId || '123456789'; 

    // ----------------------------------------------------
    // ********** 1. የWeb App API ጥያቄዎችን ማስተናገጃ **********
    // ----------------------------------------------------
    
    if (action) {
        console.log(`Received Web App API Action: ${action} for user: ${currentUserId}`);
        
        // 1.1. የመነሻ ዳታ ጥያቄ
        if (action === 'request_initial_data') {
            const userData = getUserData(currentUserId);
            
            // ሙከራዎችን (Attempts) ማደስ (Reset) የሚችል አመክንዮ
            if (isResetTimeElapsed(userData.last_spin)) {
                 userData.spin_attempts = MAX_ATTEMPTS;
            }
             if (isResetTimeElapsed(userData.last_quiz)) {
                 userData.quiz_attempts = MAX_ATTEMPTS;
            }
            
            return res.json({
                action: "initial_data",
                success: true,
                points: userData.points,
                balance: userData.balance,
                leaderboard_data: getLeaderboardData(),
                spin_data: {
                    attempts: userData.spin_attempts,
                    last_spin: userData.last_spin 
                },
                daily_bonus: {
                    last_claim: userData.last_daily_claim
                },
                tasks_status: userData.tasks_completed
            });
        }

        // 1.2. የ Spin Wheel ሙከራ
        if (action === 'spin_attempt') {
            const userData = getUserData(currentUserId);
            
            if (isResetTimeElapsed(userData.last_spin)) {
                 userData.spin_attempts = MAX_ATTEMPTS;
            }

            if (userData.spin_attempts <= 0) {
                 return res.status(200).json({ // 200 መመለስ Web App እንዲሰራ ያደርጋል
                    action: "spin_result", 
                    success: false, 
                    message: "Attempts depleted! Try again after reset.",
                    attempts_left: 0,
                 });
            }
            
            // የዘፈቀደ ውጤት ምረጥ
            const wonValue = SPINNER_PRIZES[Math.floor(Math.random() * SPINNER_PRIZES.length)];
            
            // ዳታ ማዘመን
            userData.points += wonValue;
            userData.spin_attempts -= 1;
            userData.last_spin = Date.now(); 
            
            // ውጤቱን ለ Frontend መልስ
            return res.json({
                action: "spin_result",
                success: true,
                points_won: wonValue,
                new_points: userData.points,
                attempts_left: userData.spin_attempts,
                last_spin: userData.last_spin 
            });
        }
        
        // 1.3. የTask ማረጋገጫ (Placeholder)
        if (action === 'verify_social_task') {
             const userData = getUserData(currentUserId);
             const taskId = requestBody.task_id;
             const pointsGained = 300; 
             
             if (userData.tasks_completed[taskId] && !userData.tasks_completed[taskId].completed) {
                 // ⚠️ እዚህ ላይ የቴሌግራም APIን ተጠቅመው ማረጋገጥ አለበት
                 
                 userData.tasks_completed[taskId].completed = true;
                 userData.tasks_completed[taskId].claimed = true;
                 userData.points += pointsGained; 
                 
                 return res.json({
                     action: "task_verified",
                     success: true,
                     task_id: taskId,
                     points_gained: pointsGained,
                     new_points: userData.points
                 });
             } else {
                 return res.json({
                     action: "task_verified",
                     success: false,
                     task_id: taskId,
                     message: "Task already completed or invalid."
                 });
             }
        }
        
        // 1.4. የዕለታዊ ጉርሻ ጥያቄ
        if (action === 'claim_daily_bonus') {
             const userData = getUserData(currentUserId);
             const dailyBonus = 500;
             
             if (isResetTimeElapsed(userData.last_daily_claim)) {
                  userData.points += dailyBonus;
                  userData.last_daily_claim = Date.now();
                  
                  return res.json({
                      action: "daily_bonus_claimed",
                      success: true,
                      new_points: userData.points,
                      last_claim: userData.last_daily_claim
                  });
             } else {
                 return res.json({
                      action: "daily_bonus_claimed",
                      success: false,
                      message: "Daily bonus already claimed."
                 });
             }
        }
        
        // 1.5. የክፍያ ጥያቄ
        if (action === 'initiate_telebirr_payment') {
            // ⚠️ እዚህ ላይ የ Telebirr API ጥሪን አስገብተው የክፍያ URL ማመንጨት አለብዎት።
            return res.json({
                 action: "payment_confirmed",
                 success: true,
                 amount: requestBody.total,
                 // ⚠️ እውነተኛ ክፍያ ከተረጋገጠ በኋላ ቦቱ መጽሐፉን ይልካል
            });
        }

        // ያልታወቀ 'action' ከመጣ
        return res.status(400).json({ 
            action: "error", 
            message: `Unknown API action: ${action}` 
        });
    }

    // ----------------------------------------------------
    // ********** 2. የቴሌግራም ዌብሁክን ማስተናገጃ **********
    // ----------------------------------------------------
    
    const update = req.body;
    if (!update || (!update.message && !update.callback_query)) {
        return res.status(200).send('OK');
    }
    
    const chatId = update.message ? update.message.chat.id : update.callback_query.message.chat.id;
    const text = update.message ? update.message.text : update.callback_query.data;
    
    if (text && text.startsWith('/start')) {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: 'እንኳን ደህና መጡ! ወደ Web App ገጽዎ ለመግባት ከታች ያለውን ቁልፍ ይጫኑ።',
            reply_markup: {
                inline_keyboard: [[
                    { 
                        text: 'School ላይብረሪ Shop', 
                        web_app: { 
                            url: RENDER_FRONTEND_URL 
                        } 
                    }
                ]]
            }
        });
    }

    // ለቴሌግራም ዌብሁክ ሁልጊዜ 200 OK ይመልሱ
    res.status(200).send('OK');
});

// ********** ሰርቨሩን ማስጀመር **********
app.listen(port, () => {
    console.log(`Server running on port ${port} and listening for requests.`);
});
