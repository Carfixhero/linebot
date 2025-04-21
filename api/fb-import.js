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
    const convoRes = await fetch(`https://graph.facebook.com/v22.0/${PAGE_ID}/conversations?access_token=${ACCESS_TOKEN}`);
    const convoData = await convoRes.json();

    for (const convo of convoData.data) {
      const convoId = convo.id;

      await db.execute(
        `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM) VALUES (?, 'facebook')`,
        [convoId]
      );

      const [[{ ID: bcId } = {}]] = await db.execute(
        `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
        [convoId]
      );

      const msgRes = await fetch(`https://graph.facebook.com/v22.0/${convoId}/messages?access_token=${ACCESS_TOKEN}`);
      const msgData = await msgRes.json();
      const messages = msgData.data;

      for (const msg of messages) {
        const messageId = msg.id;
        const created = new Date(msg.created_time);

        await db.execute(
          `INSERT IGNORE INTO BOT_MESSAGES (BC_ID, DIRECTION, MESSAGE_ID, CREATED_TIME)
           VALUES (?, 'in', ?, ?)`,
          [bcId, messageId, created]
        );

        const msgRes2 = await fetch(`https://graph.facebook.com/v22.0/${messageId}?fields=id,created_time,from,to,message&access_token=${ACCESS_TOKEN}`);
        const msgData2 = await msgRes2.json();

        const userId = msgData2.from?.id;
        const name = msgData2.from?.name;
        const text = msgData2.message;
        const createdTime = new Date(msgData2.created_time);

        const [[{ ID: bmId } = {}]] = await db.execute(
          `SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`,
          [messageId]
        );

        await db.execute(
          `INSERT IGNORE INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, CONTENT, CREATED_TIME)
           VALUES (?, ?, ?, ?, ?)`,
          [bmId, userId, name, text, createdTime]
        );
      }
    }

    await db.end();
    return res.status(200).end();
  } catch (err) {
    console.error('❌ FB import error:', err);
    await db.end();
    return res.status(500).send('❌ Import failed');
  }
}
