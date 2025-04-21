// ✅ FB full import — conversations and messages with 60s window
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
  const PAGE_TOKEN = process.env.FB_PAGE_TOKEN;

  try {
    const convoRes = await fetch(`https://graph.facebook.com/v22.0/${PAGE_ID}/conversations?access_token=${PAGE_TOKEN}`);
    const convoData = await convoRes.json();

    if (!Array.isArray(convoData.data)) throw new Error('No conversations found');

    for (const convo of convoData.data) {
      const convoId = convo.id;
      if (!convoId) continue;

      const [exists] = await db.execute(
        `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
        [convoId]
      );
      if (exists.length > 0) continue;

      await db.execute(
        `INSERT INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM) VALUES (?, 'facebook')`,
        [convoId]
      );

      const [[{ ID: bcId } = {}]] = await db.execute(
        `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
        [convoId]
      );
      if (!bcId) continue;

      const msgRes = await fetch(`https://graph.facebook.com/v22.0/${convoId}/messages?access_token=${PAGE_TOKEN}`);
      const msgData = await msgRes.json();
      const messages = msgData.data || [];

      for (const msg of messages) {
        const messageId = msg.id;
        const text = msg.message;
        const created = new Date(msg.created_time);
        const userId = msg.from?.id || null;
        const name = msg.from?.name || null;

        if (!text || typeof text !== 'string') continue;

        const [existing] = await db.execute(`SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`, [messageId]);
        if (existing.length > 0) continue;

        await db.execute(
          `INSERT INTO BOT_MESSAGES (BC_ID, DIRECTION, MESSAGE_ID, CREATED_TIME) VALUES (?, 'in', ?, ?)`,
          [bcId, messageId, created]
        );

        const [[{ ID: bmId } = {}]] = await db.execute(
          `SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`,
          [messageId]
        );
        if (!bmId) continue;

        await db.execute(
          `INSERT INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, CONTENT, CREATED_TIME)
           VALUES (?, ?, ?, ?, ?)`,
          [bmId, userId, name, text, created]
        );
      }
    }

    await db.end();
    res.status(200).send('OK');
  } catch (err) {
    res.status(500).send('Import failed');
  }
}
