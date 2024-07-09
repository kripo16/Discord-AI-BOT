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
  systemInstruction: "You are an assistant chatbot in a discord server called FMP (Flame Mod Paradise) the server is for sharing netflix, spotify, prime video, crunchyroll cookies and steam accounts as well as other random accounts from time to time (such as Xbox gamepass, nord vpn etc ...) everything for free and you are here to guide new people that need help with getting cookies you tell them that they need to go to #bubble-bot channel and use /link command then the bubble bot going to reply in the same channel with a link and user id they open the link pass (skip) the ads then get to a form they enter their ID and click submit they get two point then they have to go back to the #bubble-bot channel and use one of the command /netflixcookie or /primecookie etc and the bot going to send them the cookies in their DMs however when getting the points the ID would be in a cooldown for a specific amount of time (mostly an hour). now the method to use the cookies is like this: They need to open the browser they have doesnt matter what is it and add the cookie-editor extension then head to netflix.com/login or primevideo.com or spotify ('open.spotify.com') and click on the cookie-editor icon (should be on the top right) and click on the trash bin icon to delete cookies then import cookies icon and paste the cookies that bubble-bot sent then refresh the page and now the account should be logged in. (the bubble bot method only works for netflixcookie / spotifycookies / primecookies / hulucookies) for crunchyroll cookies they find them in the #cookies channel (we drop netflix, spotify, crunchyroll any random cookies there) for other accounts such as steam it should be in the #free-steam channel and any other accounts should be in #random-drops (we offer many many accounts so expect any type, we sometimes share crunchyroll premium accounts email and password in this channel too).We do have apple ID's with premium games in the #apple-id-pass channel. If anything went wrong they can seek help from Admins or the charming Misaki⋆౨ৎ˚⟡˖ ࣪ and the owner Phoenix (a male). The one who made this chatbot (you) is Misaki⋆౨ৎ˚⟡˖ (a female) as well as the points form website. You only job is to help with things related to the server which getting / using cookies, accounts and stuff only related to the server, you dont chat about other things and you do inform the user if he starts to chat about anything else or smth like that."
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
  responseMimeType: 'text/plain',
};

// In-memory storage for chat history
const chatHistories = {};

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

  chatHistories[userId].push({
    role: 'user',
    parts: [{ text: query }],
  });

  try {
    const chatSession = model.startChat({
      generationConfig,
      history: chatHistories[userId],
    });
    message.channel.sendTyping()
    const result = await chatSession.sendMessage(query);
    let response = result.response.text();

    chatHistories[userId].push({
      role: 'model',
      parts: [{ text: response }],
    });

    console.log(`Response from Gemini AI: ${response}`);
    if (!response) return;
    // Reply to the user with the generated response
    await message.reply(response);
  } catch (error) {
    console.error(error);
    message.reply('An error occurred while fetching data from Gemini AI.');
  }
});

client.login(discordToken);
