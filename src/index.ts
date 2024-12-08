import {
  REST,
  Routes,
  Client,
  GatewayIntentBits,
  Events,
  TextChannel,
} from "discord.js";
import dotenv from "dotenv";
import schedule from "node-schedule";
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

// 卒研の時間になると"みなさん卒研の時間ですわよ"と@everyoneのメンションをして発言をする
type Lecture = {
  name: string;
  startTime: schedule.Spec;
  endTime: schedule.Spec;
};

const GraduationResearchScheduleList: Lecture[] = [
  {
    name: "月曜2限",
    startTime: { hour: 10, minute: 30, dayOfWeek: 1 },
    endTime: { hour: 12, minute: 0, dayOfWeek: 1 },
  },
  {
    name: "月曜3限",
    startTime: { hour: 12, minute: 50, dayOfWeek: 1 },
    endTime: { hour: 14, minute: 20, dayOfWeek: 1 },
  },
  {
    name: "火曜3限",
    startTime: { hour: 12, minute: 50, dayOfWeek: 2 },
    endTime: { hour: 14, minute: 20, dayOfWeek: 2 },
  },
  {
    name: "火曜4限",
    startTime: { hour: 14, minute: 30, dayOfWeek: 2 },
    endTime: { hour: 16, minute: 0, dayOfWeek: 2 },
  },
  {
    name: "水曜4限",
    startTime: { hour: 14, minute: 30, dayOfWeek: 3 },
    endTime: { hour: 16, minute: 0, dayOfWeek: 3 },
  },
  {
    name: "木曜4限",
    startTime: { hour: 14, minute: 30, dayOfWeek: 4 },
    endTime: { hour: 16, minute: 0, dayOfWeek: 4 },
  },
  {
    name: "金曜3限",
    startTime: { hour: 12, minute: 50, dayOfWeek: 5 },
    endTime: { hour: 14, minute: 20, dayOfWeek: 5 },
  },
  {
    name: "金曜4限",
    startTime: { hour: 14, minute: 30, dayOfWeek: 6 },
    endTime: { hour: 16, minute: 0, dayOfWeek: 6 },
  },
];

GraduationResearchScheduleList.map((lecture) => {
  schedule.scheduleJob(lecture.name + "開始", lecture.startTime, () => {
    (client.channels.cache.get(CHAT_CHANNEL_ID) as TextChannel).send(
      `@everyone\nみなさん卒研の時間ですわよ。おほほほほ！`
    );
  });
  schedule.scheduleJob(lecture.name + "終了", lecture.endTime, () => {
    (client.channels.cache.get(CHAT_CHANNEL_ID) as TextChannel).send(
      "@everyone\nみなさん卒研ご苦労様ですわよ。おほほほほ！"
    );
  });
});

client.login(DISCORD_BOT_TOKEN);
