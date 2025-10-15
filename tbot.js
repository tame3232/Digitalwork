// tbot.js (Telegram Bot Web App Backend)

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// ************************************************************
// 💡 የ Frontend ዩአርኤል (ይህን እርስዎ ያለውን Render Frontend URL ያቀይሩ)
const RENDER_FRONTEND_URL = 'https://digitalwork-1ae6.onrender.com';
// ************************************************************

// 💡 CORS ማስተካከያ
app.use(cors({
  origin: RENDER_FRONTEND_URL,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());

// ************************************************************
// 💡 የቴሌግራም ቦት ቶክን (በ Render ውስጥ በ ENV ውስጥ አድርጉ)
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
// ************************************************************

// ********** Temporary Database **********
const userDatabase = {};

const MAX_ATTEMPTS = 5;
const DAILY_RESET_MS = 24 * 60 * 60 * 1000;
const SPINNER_PRIZES = [50, 100, 150, 200, 250, 500, 0];

// Helper: የተጠቃሚ ዳታ መያዣ
function getUserData(userId) {
  if (!userDatabase[userId]) {
    userDatabase[userId] = {
      points: 0,
      balance: 0.0,
      last_spin: 0,
      spin_attempts: MAX_ATTEMPTS,
      last_quiz: 0,
      quiz_attempts: MAX_ATTEMPTS,
      last_daily_claim: 0,
      tasks_completed: {
        TG_CH: { completed: false, claimed: false },
        TG_GP: { completed: false, claimed: false },
        YT_SUB: { completed: false, claimed: false }
      }
    };
  }
  return userDatabase[userId];
}

function getLeaderboardData() {
  return [
    { rank: 1, name: 'Abel (አንተ)', points: 3500, type: 'points' },
    { rank: 2, name: 'Bethlehem', points: 3200, type: 'points' },
    { rank: 3, name: 'Kaleb.T', points: 2950, type: 'points' }
  ];
}

// 24 ሰዓት ማስጀመሪያ አልፎ እንደሆነ ይፈትሽ
function isResetTimeElapsed(lastActionTime) {
  if (lastActionTime === 0) return true;
  return Date.now() - lastActionTime >= DAILY_RESET_MS;
}

// 💡 አዲስ የ GET ጥያቄ ተቆጣጣሪ
// ይህ አገልጋዩን Web App መስኮት ወይም ማንኛውም ብሮውዘር ሲከፍተው "Cannot GET /" የሚለውን ስህተት እንዳይጥል ያደርጋል።
app.get('/', (req, res) => {
  res.status(200).send('Telegram Bot Web App Backend እየሰራ ነው። Web App ን ለመክፈት የቴሌግራም ቦት ይጠቀሙ።');
});

// ********** Web App + Telegram Webhook Handler **********
app.post('/', async (req, res) => {
  const { action, user_id, task_id, total } = req.body;
  const currentUserId = user_id || '123456789';

  // ========== 1️⃣ Web App API ==========
  if (action) {
    console.log(`Received action: ${action} for user ${currentUserId}`);

    const userData = getUserData(currentUserId);

    // Request initial data
    if (action === 'request_initial_data') {
      if (isResetTimeElapsed(userData.last_spin)) userData.spin_attempts = MAX_ATTEMPTS;
      if (isResetTimeElapsed(userData.last_quiz)) userData.quiz_attempts = MAX_ATTEMPTS;

      return res.json({
        action: 'initial_data',
        success: true,
        points: userData.points,
        balance: userData.balance,
        leaderboard_data: getLeaderboardData(),
        spin_data: { attempts: userData.spin_attempts, last_spin: userData.last_spin },
        daily_bonus: { last_claim: userData.last_daily_claim },
        tasks_status: userData.tasks_completed
      });
    }

    // Spin attempt
    if (action === 'spin_attempt') {
      if (isResetTimeElapsed(userData.last_spin)) userData.spin_attempts = MAX_ATTEMPTS;

      if (userData.spin_attempts <= 0) {
        return res.json({
          action: 'spin_result',
          success: false,
          message: 'Attempts depleted! Try again after reset.',
          attempts_left: 0
        });
      }

      const wonValue = SPINNER_PRIZES[Math.floor(Math.random() * SPINNER_PRIZES.length)];
      userData.points += wonValue;
      userData.spin_attempts -= 1;
      userData.last_spin = Date.now();

      return res.json({
        action: 'spin_result',
        success: true,
        points_won: wonValue,
        new_points: userData.points,
        attempts_left: userData.spin_attempts
      });
    }

    // Verify task
    if (action === 'verify_social_task') {
      const pointsGained = 300;
      if (userData.tasks_completed[task_id] && !userData.tasks_completed[task_id].completed) {
        userData.tasks_completed[task_id].completed = true;
        userData.tasks_completed[task_id].claimed = true;
        userData.points += pointsGained;
        return res.json({
          action: 'task_verified',
          success: true,
          task_id,
          points_gained: pointsGained,
          new_points: userData.points
        });
      } else {
        return res.json({
          action: 'task_verified',
          success: false,
          task_id,
          message: 'Task already completed or invalid.'
        });
      }
    }

    // Daily bonus
    if (action === 'claim_daily_bonus') {
      const dailyBonus = 500;
      if (isResetTimeElapsed(userData.last_daily_claim)) {
        userData.points += dailyBonus;
        userData.last_daily_claim = Date.now();
        return res.json({
          action: 'daily_bonus_claimed',
          success: true,
          new_points: userData.points,
          last_claim: userData.last_daily_claim
        });
      } else {
        return res.json({
          action: 'daily_bonus_claimed',
          success: false,
          message: 'Daily bonus already claimed.'
        });
      }
    }

    // Payment (Telebirr)
    if (action === 'initiate_telebirr_payment') {
      return res.json({
        action: 'payment_confirmed',
        success: true,
        amount: total
      });
    }

    // Unknown Action
    return res.status(400).json({ action: 'error', message: `Unknown API action: ${action}` });
  }

  // ========== 2️⃣ Telegram Webhook ==========
  const update = req.body;
  if (!update || (!update.message && !update.callback_query)) {
    return res.status(200).send('OK');
  }

  const chatId = update.message ? update.message.chat.id : update.callback_query.message.chat.id;
  const text = update.message ? update.message.text : update.callback_query.data;

  if (text && text.startsWith('/start')) {
    try {
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: 'እንኳን ደህና መጡ! ወደ Web App ገጽዎ ለመግባት ከታች ያለውን ቁልፍ ይጫኑ።',
        reply_markup: {
          inline_keyboard: [[
            {
              text: 'School ላይብረሪ Shop',
              web_app: { url: RENDER_FRONTEND_URL }
            }
          ]]
        }
      });
    } catch (err) {
      console.error('Error sending Telegram message:', err.message);
    }
  }

  res.status(200).send('OK');
});

// ********** Server Start **********
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
