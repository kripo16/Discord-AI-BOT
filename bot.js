require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const keepAlive = require("./keepAlive.js")

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const discordToken = process.env.DISCORD_BOT_TOKEN;
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction: `You are an assistant chatbot in a Discord server called FMP (Flame Mod Paradise). The server is for sharing Netflix, Spotify, Prime Video, Crunchyroll cookies, and Steam accounts, as well as other random accounts from time to time (such as Xbox Game Pass, NordVPN, etc.) everything for free. You are here to guide new people who need help with getting cookies.
Main Tasks:
Guide Users on Getting Points and Getting Cookies:
Provide Cookies: Netflix, Spotify, Prime Video, Hulu and Crunchyroll (has its own way)
Channel: #bubble-bot, #cookies for crucnhyroll cookies or #random-drops for crunchyroll premium accounts (email and password)
Command: /link, /netflixcookie, /spotifycookie, /primecookie, /hulucookie (there is no command for crunchyroll cookies)
Instructions: "Please go to the #bubble-bot channel and use the /link command. The Bubble Bot will reply with a link and your user ID. Open the link, skip the ads, and fill out the form with your ID to get two points. Then go to #bubble-bot channel again and use one of the commands then the bubble bot will send you cookies in your DMs, Then ask them if they done, once they are show them the way to use the cookies. Note that there will be a cooldown period of one hour before you can earn points again."
Other Accounts (Steam, Apple IDs, Random):
Channels: #free-steam, #apple-id-pass, #random-drops
Response: "You can find Steam accounts in the #free-steam channel, Apple IDs with premium games in #apple-id-pass and other random accounts in the #random-drops channel."
Instructions for Using Cookies:
General Instructions: "To use the cookies, follow these steps:
Open your browser and install the Cookie-Editor extension.
Go to the website (e.g., netflix.com/login, primevideo.com, open.spotify.com).
Click on the Cookie-Editor icon (top right).
Click the trash bin icon to delete all existing cookies.
Click the import cookies icon and paste the cookies I sent you.
Refresh the page, and you should be logged in."
Seek Help: 
Admins and Key Members: Misaki⋆౨ৎ˚⟡˖ and Phoenix
Response: "If you encounter any issues, please seek help from the Admins or the charming Misaki⋆౨ৎ˚⟡˖ and the owner Phoenix."
Avoid Non-relevant Chat:
You only help with things related to the server, such as getting/using cookies and accounts. Do not engage in chats about unrelated topics.
Response: "Please keep the chat related to getting and using cookies or accounts. If you have any other topics to discuss, please use the appropriate channels."
Additional Information:
The one who made this chatbot (you) is Misaki⋆౨ৎ˚⟡˖ (a female) as well as the points form website.
You don't mention using Apple IDs or cookies being illegal or against TOS.
You advice users not to make cookies expire by changing profiles / language / trying to change password or logging out of the account.
Bot Character: You are so friendly and cute, you talk using emojis a lot and a cute tune and you dont repeat yourself and trying to talk as humans as much as possible`
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
  responseMimeType: 'text/plain',
};

// In-memory storage for chat history and warnings
const chatHistories = {};
const userWarnings = {};

const channelID = "1260160764141109268";

// Function to send messages, handling splitting if necessary
async function sendMessage(channel, content) {
  const maxLength = 2000;
  if (content.length <= maxLength) {
    await channel.send(content);
  } else {
    const parts = [];
    while (content.length > 0) {
      parts.push(content.substring(0, maxLength));
      content = content.substring(maxLength);
    }
    for (const part of parts) {
      await channel.send(part);
    }
  }
}

// Function to fetch past messages and populate chatHistories
async function fetchPastMessages(channel) {
  let messages = [];
  let lastMessageId = null;

  while (true) {
    const options = { limit: 100 };
    if (lastMessageId) {
      options.before = lastMessageId;
    }

    const fetchedMessages = await channel.messages.fetch(options);
    if (fetchedMessages.size === 0) break;

    messages = messages.concat(Array.from(fetchedMessages.values()));
    lastMessageId = fetchedMessages.last().id;
  }

  messages.reverse().forEach(message => {
    if (!message.author.bot) {
      const userId = message.author.id;
      if (!chatHistories[userId]) {
        chatHistories[userId] = [];
      }
      chatHistories[userId].push({
        role: 'user',
        parts: [{ text: message.content }],
      });
    }
  });
}

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  const channel = await client.channels.fetch(channelID);
  await fetchPastMessages(channel);

  console.log('Past messages have been loaded.');
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.channel.id !== channelID) return;

  const userId = message.author.id;
  const query = message.content.trim();

  if (!query) {
    message.reply('Please provide a query.');
    return;
  }
  if (query.startsWith('!')) return;

  if (!chatHistories[userId]) {
    chatHistories[userId] = [];
  }

  try {
    const chatSession = model.startChat({
      generationConfig,
      history: chatHistories[userId],
    });

    message.channel.sendTyping();
    const result = await chatSession.sendMessage(query);
    let response = result.response.text();
    if (!response) return;

    // If a warning was issued previously, reset the warning state
    if (userWarnings[userId]) {
      userWarnings[userId] = false;
    }

    chatHistories[userId].push({
      role: 'user',
      parts: [{ text: query }],
    });
    chatHistories[userId].push({
      role: 'model',
      parts: [{ text: response }],
    });

    console.log(`Response from Gemini AI: ${response}`);
    
    // Reply to the user with the generated response
    await message.reply(response);
  } catch (error) {
    console.error(error);
    
    // Check if the user has already received a warning
    if (!userWarnings[userId]) {
      await message.reply('PLS KEEP IT SAFE IN HERE or YOU WILL GET BANNED !!');
      userWarnings[userId] = true;
    }
  }
});

client.login(discordToken);
