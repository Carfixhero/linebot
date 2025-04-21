// ✅ FINAL CLEAN VERSION — Skips existing convos, avoids timeouts, minimal logging

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

    if (!Array.isArray(convoData.data)) throw new Error('No conversations found from Facebook');

    for (const convo of convoData.data) {
      const convoId = convo.id;

      if (!convoId || typeof convoId !== 'string') continue;

      const [check] = await db.execute(
        `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
        [convoId]
      );
      if (check.length > 0) continue;

      await db.execute(
        `INSERT INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM) VALUES (?, 'facebook')`,
        [convoId]
      );

      const [[{ ID: bcId } = {}]] = await db.execute(
        `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
        [convoId]
      );
      if (!bcId) continue;

      const msgRes = await fetch(`https://graph.facebook.com/v22.0/${convoId}/messages?access_token=${ACCESS_TOKEN}`);
      const msgData = await msgRes.json();
      const messages = msgData.data || [];

      for (const msg of messages) {
        const messageId = msg.id;
        const text = msg.message;
        const timestamp = new Date(msg.created_time);
        const userId = msg.from?.id || null;
        const name = msg.from?.name || null;

        if (!text || typeof text !== 'string') continue;

        const [exists] = await db.execute(`SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`, [messageId]);
        if (exists.length > 0) continue;

        await db.execute(
          `INSERT INTO BOT_MESSAGES (BC_ID, DIRECTION, MESSAGE_ID, CREATED_TIME) VALUES (?, 'in', ?, ?)`,
          [bcId, messageId, timestamp]
        );

        const [[{ ID: bmId } = {}]] = await db.execute(
          `SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`,
          [messageId]
        );
        if (!bmId) continue;

        await db.execute(
          `INSERT INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, CONTENT, CREATED_TIME)
           VALUES (?, ?, ?, ?, ?)`,
          [bmId, userId, name, text, timestamp]
        );
      }
    }

    await db.end();
    res.status(200).send('✅ FB import complete');
  } catch (err) {
    console.error('❌ FB import error:', err);
    res.status(500).send('❌ Import failed');
  }
}
