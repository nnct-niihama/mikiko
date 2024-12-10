import { Client, GatewayIntentBits, Events, TextChannel } from "discord.js";
import dotenv from "dotenv";
import schedule from "node-schedule";
import { extractEnv } from "./extract-env";
import {
  configure,
  getConsoleSink,
  getFileSink,
  getLogger,
} from "@logtape/logtape";
import fs from "fs";
import path from "path";
import { Octokit } from "@octokit/core";
import express from "express";

await configure({
  sinks: {
    file: getFileSink("mikiko.log"),
    console: getConsoleSink(),
  },
  filters: {},
  loggers: [
    { category: ["app"], lowestLevel: "info", sinks: ["file", "console"] },
  ],
});

const logger = getLogger(["app"]);

dotenv.config();
const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, CHAT_CHANNEL_ID, GITHUB_TOKEN } =
  extractEnv([
    "DISCORD_BOT_TOKEN",
    "DISCORD_CLIENT_ID",
    "CHAT_CHANNEL_ID",
    "GITHUB_TOKEN",
  ]);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

const app = express();
app.use(express.json());

// GitHub Webhook 受信時の型
interface GitHubWebhookPayload {
  action: string;
  issue: {
    title: string;
    url: string;
    assignee: string;
  };
}

// 型ガード関数
const isGitHubWebhookPayload = (
  value: unknown
): value is GitHubWebhookPayload => {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (
    "action" in value &&
    typeof value.action === "string" &&
    value.action != undefined &&
    "issue" in value &&
    typeof value.issue === "object" &&
    value.issue != undefined
  ) {
    if (
      "title" in value.issue &&
      typeof value.issue.title === "string" &&
      "url" in value.issue &&
      typeof value.issue.url === "string" &&
      "assignee" in value.issue &&
      (typeof value.issue.assignee == "string" ||
        typeof value.issue.assignee == "undefined")
    ) {
      return true;
    }
  }
  return false;
};

// GitHub Webhook 受信処理
app.post("/webhook", async (req, res) => {
  try {
    logger.info("Webhook");
    const reqBody = req.body as unknown;

    // 型チェック
    if (!isGitHubWebhookPayload(reqBody)) {
      throw new Error(
        "The webhook request type is different from the expected type"
      );
    }

    // actionがクローズ以外のものだった場合処理を終了
    if (reqBody.action !== "closed") {
      return;
    }

    const channel = client.channels.cache.get(CHAT_CHANNEL_ID) as TextChannel;
    let message = `>>> # 新しい機能が実装されたわよ〜❤️\n[${reqBody.issue.title}](${reqBody.issue.url})\n美樹子感激✨`;
    if (reqBody.issue.assignee != undefined) {
      message = message + `\n-# created by ${reqBody.issue.assignee}`;
    }
    channel.send(message);
  } catch (error) {
    logger.error(`Webhook -> error: ${error}`);
  }
});

client.on(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user?.tag}!\n\n\n`);
});

// 卒研時間報告機能に対して🖕を立ててくる不届きものがいるので粛清するようにする
const messageReactions = new Map();
const botReplies = new Set();
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    logger.info(`MessageReactionAdd -> userId: ${user.id}`);

    // リアクションをつけたのがBotの場合は無視する
    if (user.bot) {
      return;
    }

    // Botに対してのリアクションかどうか判定しBotじゃない場合は無視する
    if (reaction.message.author?.id !== DISCORD_CLIENT_ID) {
      return;
    }

    // 舐めた文字(🖕, 👎, 💩)の場合
    if (
      reaction.emoji.name === "🖕" ||
      reaction.emoji.name === "👎" ||
      reaction.emoji.name === "💩"
    ) {
      const message = reaction.message;
      const messageId = message.id;

      // そのメッセージでまだリアクションしていない場合
      if (!messageReactions.has(messageId)) {
        messageReactions.set(messageId, new Set());
      }

      const reactionUsers = messageReactions.get(messageId);

      // そのメッセージで、そのユーザーがまだリアクションしていない場合、またそのメッセージがbotがこの機能（🖕に対して反応する機能）で送ったものじゃない場合のみ
      if (!reactionUsers.has(user.id) && !botReplies.has(reaction.message.id)) {
        const files = fs.readdirSync("./assets");
        const fileCount = files.filter((file) => {
          const filePath = path.join("./assets", file);
          return !file.startsWith(".") && fs.statSync(filePath).isFile;
        }).length;

        // 何番目の画像を使うのか計算
        const fileNumber = Math.floor(Math.random() * fileCount);
        const replyMessage = await message.reply({
          content: `<@${user.id}> >> You punk! 🖕`,
          files: [
            {
              attachment: path.join(
                "./assets",
                files.filter((file) => {
                  const filePath = path.join("./assets", file);
                  return !file.startsWith(".") && fs.statSync(filePath).isFile;
                })[fileNumber]
              ),
            },
          ],
        });

        // リアクション済みユーザーを記録
        reactionUsers.add(user.id);
        // botのリプライメッセージに記録
        botReplies.add(replyMessage.id);
      }
    }
  } catch (error) {
    logger.error(`MessageReactionAdd -> error: ${error}`);
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

GraduationResearchScheduleList.map((lecture) => {
  schedule.scheduleJob(lecture.name + "開始", lecture.startTime, async () => {
    try {
      logger.info("Scheduled Event");
      const channel = client.channels.cache.get(CHAT_CHANNEL_ID) as TextChannel;
      await channel.send(`@everyone\nみなさん卒研の時間ですわよ。おほほほほ！`);
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
      await channel.send(
        `@everyone\nみなさん卒研ご苦労様ですわよ。おほほほほ！`
      );
    } catch (error) {
      logger.error("Scheduled Event -> error: {error}", {
        error: error,
      });
    }
  });
});

// issueベースで開発をしているので昼(12:00)と夜(00:00)にまだ残っているissueがあったら"早く実装して〜❤️"を送るようにする
schedule.scheduleJob({ hour: 0, minute: 0 }, async () => {
  try {
    logger.info(
      "Scheduled Event (issueベースで開発をしているので昼(12:00)と夜(00:00)にまだ残っているissueがあったら 早く実装して〜❤️ を送るようにする)"
    );
    const octokit = new Octokit({ auth: GITHUB_TOKEN });

    const response = await octokit.request("GET /repos/{owner}/{repo}/issues", {
      owner: "nnct-niihama",
      repo: "mikiko",
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const channel = client.channels.cache.get(CHAT_CHANNEL_ID) as TextChannel;
    let messageText =
      ">>> # おほほ〜、まだ実装されていない機能があるわよ〜❤️\n";
    response.data
      .filter(
        (issue) =>
          !issue.labels.map((label) => label.toString()).includes("maintenance")
      )
      .map((issue) => {
        messageText = messageText + `- ${issue.title}\n`;
      });
    messageText = messageText + "早く実装して〜❤️";

    channel.send(messageText);
  } catch (error) {
    logger.error("Scheduled Event -> error: {error}", {
      error: error,
    });
  }
});

schedule.scheduleJob({ hour: 12, minute: 0 }, async () => {
  try {
    logger.info(
      "Scheduled Event (issueベースで開発をしているので昼(12:00)と夜(00:00)にまだ残っているissueがあったら 早く実装して〜❤️ を送るようにする)"
    );
    const octokit = new Octokit({ auth: GITHUB_TOKEN });

    const response = await octokit.request("GET /repos/{owner}/{repo}/issues", {
      owner: "nnct-niihama",
      repo: "mikiko",
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const channel = client.channels.cache.get(CHAT_CHANNEL_ID) as TextChannel;
    let messageText =
      ">>> # おほほ〜、まだ実装されていない機能があるわよ〜❤️\n";
    response.data
      .filter(
        (issue) =>
          !issue.labels.map((label) => label.toString()).includes("maintenance")
      )
      .map((issue) => {
        messageText = messageText + `- ${issue.title}\n`;
      });
    messageText = messageText + "早く実装して〜❤️";

    channel.send(messageText);
  } catch (error) {
    logger.error("Scheduled Event -> error: {error}", {
      error: error,
    });
  }
});

// サーバー起動
app.listen(3000, () => {
  logger.info("Server is listening on port 3000");
});

client.login(DISCORD_BOT_TOKEN);
