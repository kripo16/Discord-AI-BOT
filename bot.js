const fs = require('fs').promises;
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require('@google/generative-ai');

require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const discordToken = process.env.DISCORD_BOT_TOKEN;
const apiKey = process.env.GEMINI_API_KEY;
const channelID = "1260979255823564930";
const blackListedUsersFilePath = 'blackListedUsers.json';
const badWordsFilePath = 'badwords.txt';
const configFilePath = 'config.txt';
const dailyUsageFilePath = 'dailyUsage.json';

const misakiID = "868458055652749353";

let blackListedUsers = {};
let badWords = [];
let chatHistories = {};
let systemInstruction = '';
let dailyUsage = {};

const genAI = new GoogleGenerativeAI(apiKey);
let model = null;

let status = [
  {
    name: "Chilling in Chatbot",
    type: ActivityType.Custom
  },
  {
    name: "Help in Chatbot",
    type: ActivityType.Watching
  },
  {
    name: "Come play with me in Chatbot",
    type: ActivityType.Custom
  },
  {
    name: "Misaki is the best 💗🤭",
    type: ActivityType.Custom
  }
]

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
  responseMimeType: 'text/plain',
};

const safetySetting = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  }
];

const blockDurations = [1, 5, 30, 120, 1440]; // Block durations in minutes
const dailyMessageLimit = 20;


// Load JSON data from files asynchronously
async function loadJsonData(filePath, defaultValue = {}) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultValue;
  }
}

// Load plain text data from files asynchronously
async function loadTextData(filePath, defaultValue = '') {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultValue;
  }
}

// Function to check and update daily usage limit
async function checkAndUpdateDailyUsage(userId) {
  const currentTime = new Date().getTime();

  // Load dailyUsage from file
  try {
    dailyUsage = await loadJsonData(dailyUsageFilePath);
  } catch (error) {
    console.error('Error loading daily usage data:', error);
    dailyUsage = {};
  }

  if (!dailyUsage[userId]) {
    dailyUsage[userId] = { count: 0, lastUpdated: currentTime, blockedUntil: 0 };
  }

  if (dailyUsage[userId].blockedUntil > currentTime) {
    // User is currently blocked
    const timeLeft = Math.ceil((dailyUsage[userId].blockedUntil - currentTime) / 1000); // Convert to seconds
    return { isBlocked: true, remainingMessages: 0, timeLeft };
  }

  // Reset the block if the block time has passed
  if (dailyUsage[userId].blockedUntil > 0 && dailyUsage[userId].blockedUntil <= currentTime) {
    dailyUsage[userId].blockedUntil = 0;
    dailyUsage[userId].count = 0;
    await fs.writeFile(dailyUsageFilePath, JSON.stringify(dailyUsage, null, 2), 'utf8');
    const user = await client.users.fetch(userId); // Fetch the user
    await user.send('Yay, now you can talk with the lovely Nina ⋆౨ৎ˚⟡˖ ࣪ again !!\nWhat are you waiting for?, I missed you 🥺.');
  }

  if (dailyUsage[userId].count >= dailyMessageLimit) {
    // Block the user for one minute
    dailyUsage[userId].blockedUntil = currentTime + 86400000; // Unblock after one minute
    await fs.writeFile(dailyUsageFilePath, JSON.stringify(dailyUsage, null, 2), 'utf8');

    setTimeout(async () => {
      dailyUsage[userId].count = 0; // Reset the message count after the minute is up
      await fs.writeFile(dailyUsageFilePath, JSON.stringify(dailyUsage, null, 2), 'utf8');
      const user = await client.users.fetch(userId); // Fetch the user
      await user.send('Yay, now you can talk with the lovely Nina ⋆౨ৎ˚⟡˖ ࣪ again !!\nWhat are you waiting for?, I missed you 🥺.');
    }, 86400000); // Reset after one minute

    return { isBlocked: true, remainingMessages: 0, timeLeft: 60 }; // Return timeLeft in seconds
  }

  dailyUsage[userId].count += 1;
  dailyUsage[userId].lastUpdated = currentTime;
  await fs.writeFile(dailyUsageFilePath, JSON.stringify(dailyUsage, null, 2), 'utf8');

  return { isBlocked: false, remainingMessages: dailyMessageLimit - dailyUsage[userId].count };
}






// Read blacklisted users, bad words, and system instruction from files asynchronously at startup
(async () => {
  blackListedUsers = await loadJsonData(blackListedUsersFilePath);
  badWords = (await loadTextData(badWordsFilePath, '')).split(',').map(word => word.trim().toLowerCase()).filter(Boolean);
  systemInstruction = (await loadTextData(configFilePath, '')).trim();

  model = genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    systemInstruction: systemInstruction
  });
})();

// Function to update and notify blacklisted users
async function handleBlacklist(userId, reason, messageContent) {
  if (!blackListedUsers[userId]) {
    blackListedUsers[userId] = { count: 0, blockUntil: null };
  }

  blackListedUsers[userId].count += 1;
  const count = blackListedUsers[userId].count;
  let blockTime;

  if (count <= blockDurations.length) {
    blockTime = blockDurations[count - 1];
  } else {
    blockTime = 'permanent';
  }

  blackListedUsers[userId].blockUntil = blockTime === 'permanent' ? 'permanent' : Date.now() + blockTime * 60000;

  try {
    const user = await client.users.fetch(userId);
    const misaki = await client.users.fetch(misakiID);

    const blockTimeText = blockTime === 'permanent' ? 'permanently' : `${blockTime} minute(s)`;
    const unblockTime = blockTime === 'permanent' ? 'never' : new Date(blackListedUsers[userId].blockUntil).toLocaleString();
    await user.send(`You have been blacklisted for ${blockTimeText}. Reason: ${reason}\nIf you believe you did nothing wrong and got blocked Contact Misaki⋆౨ৎ˚⟡˖ or simply just wait till you get unblocked automatically`);
    await misaki.send(`User ID: ${userId}\nUser got blacklisted for: ${reason}\nBlock Message: ${messageContent}\nDuration: ${blockTimeText}\nCount: ${count}\nUnblock time: ${unblockTime}`);

    if (blockTime !== 'permanent') {
      setTimeout(() => unblockUser(userId), blockTime * 60000);
    }
  } catch (error) {
    console.error(`Could not send DM to user ${userId}:`, error);
  }

  await fs.writeFile(blackListedUsersFilePath, JSON.stringify(blackListedUsers, null, 2), 'utf8');
}

// Function to unblock a user
async function unblockUser(userId) {
  blackListedUsers[userId].blockUntil = 0;
  await fs.writeFile(blackListedUsersFilePath, JSON.stringify(blackListedUsers, null, 2), 'utf8');
  chatHistories[userId] = [];

  try {
    const user = await client.users.fetch(userId);
    const misaki = await client.users.fetch(misakiID);
    await user.send('You just got unblocked. Be careful next time 😾!');
    await misaki.send(`User ID: ${userId}\nUser got unblocked`);
  } catch (error) {
    console.error(`Could not send DM to user ${userId}:`, error);
  }
}

// Function to check if user is blacklisted
function isBlacklisted(userId) {
  const userData = blackListedUsers[userId];
  if (userData) {
    if (userData.blockUntil === 'permanent') {
      return true;
    }
    if (userData.blockUntil > Date.now()) {
      return true;
    } else if (userData.blockUntil !== 0) {
      blackListedUsers[userId].blockUntil = 0;
      fs.writeFile(blackListedUsersFilePath, JSON.stringify(blackListedUsers, null, 2), 'utf8');
    }
  }
  return false;
}

// Function to check for bad words
function containsBadWords(message) {
  const words = message.toLowerCase().split(/\W+/);
  for (const word of words) {
    if (badWords.includes(word)) {
      return true;
    }
  }
  return false;
}

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  setInterval(() => {
    let random = Math.floor(Math.random() * status.length);
    client.user.setActivity(status[random]);
  }, 20000)
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot || message.channel.id !== channelID) return;

    const userId = message.author.id;
    const query = message.content.trim();

    if (!query) return;
    if (query.startsWith('!')) return;

    if (!chatHistories[userId]) {
      chatHistories[userId] = [];
    }

    const usageData = await checkAndUpdateDailyUsage(userId);

    if (usageData.isBlocked) {
      await message.reply('Hey, you have finished your free access for today. Comeback tomorrow for whole new 20 messages 🫠 !!');
      await client.users.fetch(userId).then(user => user.send('Hey, you have finished your free access for today. Comeback tomorrow for whole new 20 messages 🫠 !! '));
      return;
    }

    const remainingMessages = usageData.remainingMessages;

    if (isBlacklisted(userId)) {
      const userData = blackListedUsers[userId];
      let timeLeft = '';
      if (userData.blockUntil !== 'permanent') {
        const timeRemaining = (userData.blockUntil - Date.now()) / 60000; // Convert milliseconds to minutes
        timeLeft = `Please wait ${Math.ceil(timeRemaining)} minute(s) to be unblocked.`;
      } else {
        timeLeft = 'You are permanently blacklisted 💀.\nContact Misaki ⋆౨ৎ˚⟡˖ ࣪ in order to get unblocked.';
      }
      await message.reply(`You are currently blacklisted. ${timeLeft}`);
      return;
    }

    if (containsBadWords(query)) {
      await handleBlacklist(userId, 'Use of inappropriate language', query);
      return;
    }

    const chatSession = model.startChat({
      generationConfig,
      history: chatHistories[userId],
      safetySettings: safetySetting
    });

    await message.channel.sendTyping();
    const result = await chatSession.sendMessage(query);
    const response = result.response.text();

    if (response) {
      chatHistories[userId].push({ role: 'user', parts: [{ text: query }] });
      chatHistories[userId].push({ role: 'model', parts: [{ text: response }] });

      await message.reply(`${response}\n(${remainingMessages} / 20 messages)`);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await message.reply("Omg Sorry, I'm Having A Trouble Right Now 😭. Can You Please Try Later? 🫶.");
  }
});

client.login(discordToken);
