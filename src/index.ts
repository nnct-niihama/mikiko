import {
  REST,
  Routes,
  Client,
  GatewayIntentBits,
  Events,
  TextChannel,
} from "discord.js";
import dotenv from "dotenv";
import { extractEnv } from "./extract-env";

dotenv.config();
const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, CHAT_CHANNEL_ID } = extractEnv([
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_ID",
  "CHAT_CHANNEL_ID",
]);

const commands = [
  {
    name: "ping",
    description: "Replies with Pong!",
  },
];

const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);

try {
  console.log("Started refreshing application (/) commands.");

  await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), {
    body: commands,
  });

  console.log("Successfully reloaded application (/) commands.");
} catch (error) {
  console.error(error);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.on(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user?.tag}!`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("Pong!");
  }
});

// 発言に対して3%の確率でおほ^〜やはえ^〜などを返信を返す（時間帯によって発言確率を変更しても楽しいかも）
client.on(Events.MessageCreate, async (message) => {
  // Botかどうかを判定する
  if (message.author.bot) {
    return;
  }

  // 3%の確率で `おほ^〜` か `はえ^〜` を発言する
  if (Math.random() >= 0.03) {
    return;
  }
  if (Math.random() < 0.7) {
    message.channel.send("おほ^〜");
  } else {
    message.channel.send("はえ^〜");
  }
});

// ディスコードに誰かが入ったら"{username}が入ったわよ〜!!"と発言する
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  // ユーザーが入ったのがボイスチャンネルかどうかを確認する
  if (newState.channel?.isVoiceBased) {
    (client.channels.cache.get(CHAT_CHANNEL_ID) as TextChannel).send(
      `${newState.member?.displayName}が${newState.channel.name}に入ったわよ〜!!`
    );
  } else {
    (client.channels.cache.get(CHAT_CHANNEL_ID) as TextChannel).send(
      `${newState.member?.displayName}が${oldState.channel?.name}から抜けたわよ〜!!`
    );
  }
});

client.login(DISCORD_BOT_TOKEN);
