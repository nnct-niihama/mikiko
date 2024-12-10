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
import { configure, getFileSink, getLogger } from "@logtape/logtape";

await configure({
  sinks: {
    file: getFileSink("mikiko.log"),
  },
  filters: {},
  loggers: [{ category: ["my-app"], lowestLevel: "info", sinks: ["file"] }],
});

const logger = getLogger(["my-app"]);

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
    GatewayIntentBits.GuildMessageReactions,
  ],
});

client.on(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user?.tag}!`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    logger.info("InteractionCreate -> userId: {userId}", {
      userId: interaction.user.id,
    });
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ping") {
      await interaction.reply("Pong!");
    }
  } catch (error) {
    logger.error("InteractionCreate -> error: {error}", {
      error: error,
    });
  }
});

// 発言に対して3%の確率でおほ^〜やはえ^〜などを返信を返す（時間帯によって発言確率を変更しても楽しいかも）
client.on(Events.MessageCreate, async (message) => {
  // Botかどうかを判定する
  if (message.author.bot) {
    return;
  }
  logger.info("MessageCreate -> userId: {userId}", {
    userId: message.author.id,
  });

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
  logger.info("VoiceStateUpdate -> userId: {userId}", {
    userId: newState.member?.id,
  });
  // ミュートでも反応してしまうので無視用
  const statusChk =
    oldState.serverDeaf === newState.serverDeaf &&
    oldState.serverMute === newState.serverMute &&
    oldState.selfDeaf === newState.selfDeaf &&
    oldState.selfMute === newState.selfMute &&
    oldState.selfVideo === newState.selfVideo &&
    oldState.streaming === newState.streaming;

  if ((statusChk == true || oldState.serverDeaf == null) && newState.channel) {
    //チャンネルに入ってきたときの処理
    (client.channels.cache.get(CHAT_CHANNEL_ID) as TextChannel).send(
      `${newState.member?.displayName}が${newState.channel.name}チャンネルに入ったわよ〜!!`
    );
  } else if (statusChk && oldState.channel) {
    // チャンネルから出たときの処理
    (client.channels.cache.get(CHAT_CHANNEL_ID) as TextChannel).send(
      `${newState.member?.displayName}が${oldState.channel?.name}チャンネルから抜けたわよ〜!!`
    );
  }
});

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

// 卒研時間報告機能に対して🖕を立ててくる不届きものがいるので粛清するようにする
GraduationResearchScheduleList.map((lecture) => {
  schedule.scheduleJob(lecture.name + "開始", lecture.startTime, async () => {
    try {
      logger.info("Scheduled Event");
      const channel = client.channels.cache.get(CHAT_CHANNEL_ID) as TextChannel;
      const message = await channel.send(
        `@everyone\nみなさん卒研の時間ですわよ。おほほほほ！`
      );

      const collector = message.createReactionCollector({
        filter: (reaction, user) => reaction.emoji.name === "🖕" && !user.bot,
        time: 600_000,
      });

      collector.on("collect", (reaction, user) => {
        channel.send(`${user.displayName} >> You punk! 🖕`);
      });
    } catch (error) {
      logger.error("Scheduled Event -> error: {error}", {
        error: error,
      });
      console.error("メッセージ送信エラー:", error);
    }
  });

  schedule.scheduleJob(lecture.name + "終了", lecture.endTime, async () => {
    try {
      logger.info("Scheduled Event");
      const channel = client.channels.cache.get(CHAT_CHANNEL_ID) as TextChannel;
      const message = await channel.send(
        `@everyone\nみなさん卒研ご苦労様ですわよ。おほほほほ！`
      );

      const collector = message.createReactionCollector({
        filter: (reaction, user) =>
          (reaction.emoji.name === "🖕" ||
            reaction.emoji.name === "👎" ||
            reaction.emoji.name === "💩") &&
          !user.bot,
        time: 600_000,
      });

      collector.on("collect", (reaction, user) => {
        channel.send(`${user.displayName} >> You punk! 🖕`);
      });
    } catch (error) {
      logger.error("Scheduled Event -> error: {error}", {
        error: error,
      });
      console.error("メッセージ送信エラー:", error);
    }
  });
});

client.login(DISCORD_BOT_TOKEN);
