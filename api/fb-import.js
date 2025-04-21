// ✅ FINAL SYNC SCRIPT — Full pagination: conversations, messages, content
import mysql from 'mysql2/promise';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  const PAGE_ID = process.env.FB_PAGE_ID;
  const ACCESS_TOKEN = process.env.FB_PAGE_TOKEN;

  try {
    let convoUrl = `https://graph.facebook.com/v22.0/${PAGE_ID}/conversations?access_token=${ACCESS_TOKEN}`;

    while (convoUrl) {
      const convoRes = await fetch(convoUrl);
      const convoData = await convoRes.json();
      const conversations = convoData.data || [];

      for (const convo of conversations) {
        const convoId = convo.id;

        await db.execute(
          `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM) VALUES (?, 'facebook')`,
          [convoId]
        );

        const [[{ ID: bcId } = {}]] = await db.execute(
          `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
          [convoId]
        );
        if (!bcId) continue;

        let msgUrl = `https://graph.facebook.com/v22.0/${convoId}/messages?access_token=${ACCESS_TOKEN}`;

        while (msgUrl) {
          const msgRes = await fetch(msgUrl);
          const msgData = await msgRes.json();
          const messages = msgData.data || [];

          for (const msg of messages) {
            const messageId = msg.id;
            const created = new Date(msg.created_time);

            await db.execute(
              `INSERT IGNORE INTO BOT_MESSAGES (BC_ID, DIRECTION, MESSAGE_ID, CREATED_TIME)
               VALUES (?, 'in', ?, ?)`,
              [bcId, messageId, created]
            );

            const [[{ ID: bmId } = {}]] = await db.execute(
              `SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`,
              [messageId]
            );
            if (!bmId) continue;

            const detailRes = await fetch(`https://graph.facebook.com/v22.0/${messageId}?fields=id,created_time,from,to,message&access_token=${ACCESS_TOKEN}`);
            const detailData = await detailRes.json();

            const userId = detailData.from?.id;
            const name = detailData.from?.name;
            const text = detailData.message;
            const createdTime = new Date(detailData.created_time);

            await db.execute(
              `INSERT IGNORE INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, CONTENT, CREATED_TIME)
               VALUES (?, ?, ?, ?, ?)`,
              [bmId, userId, name, text, createdTime]
            );
          }

          msgUrl = msgData.paging?.next || null;
        }
      }

      convoUrl = convoData.paging?.next || null;
    }

    await db.end();
    return res.status(200).end();
  } catch (err) {
    await db.end();
    return res.status(500).send('❌ Import failed');
  }
}
