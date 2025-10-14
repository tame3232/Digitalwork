const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path'); // የፋይል መንገዶችን ለማስተናገድ አስመጣን

const app = express();
const PORT = process.env.PORT || 3000;

// የቴሌግራም ቦት ቶከን ከአካባቢ ተለዋዋጮች (Environment Variables) እናስገባለን።
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("ERROR: BOT_TOKEN is not set in environment variables.");
    process.exit(1);
}

// ቴሌግራም የሚጠቀምበትን JSON ፓርሰር ተጠቀም
app.use(bodyParser.json());

// 1. የቴሌግራም ዌብሁክን ማስተናገጃ (POST Request Handler)
app.post('/', async (req, res) => {
    const update = req.body;
    if (!update || !update.message) {
        return res.status(200).send('No message received');
    }

    const chatId = update.message.chat.id;
    const text = update.message.text;

    console.log(`Received message: ${text} from Chat ID: ${chatId}`);

    if (text === '/start') {
        const webAppUrl = `https://digitalwork-1ae6.onrender.com/web-app-view`; // አዲስ ልዩ ዩ.አር.ኤል

        const replyMarkup = {
            inline_keyboard: [
                [{
                    text: 'PLAY 🏆',
                    web_app: { url: webAppUrl }
                }]
            ]
        };

        try {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: chatId,
                text: 'እንኳን ደህና መጡ! ዌብ አፕሊኬሽኑን ለመክፈት ከታች ያለውን አዝራር ይጫኑ።',
                reply_markup: replyMarkup
            });
            console.log("Start message sent successfully.");
        } catch (error) {
            console.error("Error sending message to Telegram:", error.response ? error.response.data : error.message);
        }
    }

    // ለቴሌግራም 200 OK ምላሽ እንመልሳለን
    res.status(200).send('OK');
});

// 2. ለዌብ አፕ ጥያቄዎች index.htmlን ማስተናገጃ (GET Request Handler)
// ይህ ክፍል ተጠቃሚው "PLAY" አዝራርን ሲጫን index.html እንዲያገኝ ያደርጋል።
app.get('/web-app-view', (req, res) => {
    // index.html ፋይልን ከዋናው ማውጫ (root directory) እየላክን ነው።
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 3. የሰርቨሩ የስራ ሁኔታ ማረጋገጫ (Health Check)
app.get('/', (req, res) => {
    res.status(200).send("Telegram Bot Service is Running!");
});


// ሰርቨሩን ማስጀመር
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // ዌብሁክ በትክክል መዘጋጀቱን ለማረጋገጥ መሞከር ይችላሉ (አስገዳጅ አይደለም)
    // setWebhook(BOT_TOKEN, `https://digitalwork-1ae6.onrender.com/`);
});

/*
// ዌብሁክን ለመጀመሪያ ጊዜ በፕሮግራም ለማዘጋጀት (አማራጭ)
async function setWebhook(token, url) {
    try {
        const webhookUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${url}`;
        const response = await axios.get(webhookUrl);
        console.log("Webhook Setup Response:", response.data);
    } catch (error) {
        console.error("Failed to set webhook:", error.message);
    }
}
*/
