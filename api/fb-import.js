// ✅ FB Import Script — Clean version for your schema
// Matches: BOT_CONVERSATIONS, BOT_MESSAGES, BOT_MES_CONTENT

import mysql from 'mysql2/promise';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.status(200).send('✅ FB import started');

  const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_TOKEN;
  const PAGE_ID = process.env.FB_PAGE_ID;

  const MYSQL_CONFIG = {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  };

  const db = await mysql.createConnection(MYSQL_CONFIG);

  // Step 1: Fetch conversations
  const convoRes = await fetch(`https://graph.facebook.com/v18.0/${PAGE_ID}/conversations?access_token=${PAGE_ACCESS_TOKEN}`);
  const convoData = await convoRes.json();
  const conversations = convoData.data || [];

  for (const convo of conversations) {
    const convoId = convo.id;

    // 1.1 Insert into BOT_CONVERSATIONS (if not already)
    await db.execute(
      `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM)
       VALUES (?, 'facebook')`,
      [convoId]
    );

    const [cRows] = await db.execute(
      `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
      [convoId]
    );
    const bcId = cRows[0]?.ID;
    if (!bcId) continue;

    // Step 2: Fetch messages in this convo
    const msgRes = await fetch(`https://graph.facebook.com/v18.0/${convoId}/messages?access_token=${PAGE_ACCESS_TOKEN}`);
    const msgData = await msgRes.json();

    for (const msg of msgData.data || []) {
      const messageId = msg.id;
      const text = msg.message;
      const userId = msg.from?.id || null;
      const timestamp = msg.created_time;

      if (!text || typeof text !== 'string') continue;

      // 2.1 Insert into BOT_MESSAGES
      await db.execute(
        `INSERT IGNORE INTO BOT_MESSAGES (BC_ID, DIRECTION, MESSAGE_ID, CREATED_TIME)
         VALUES (?, 'in', ?, ?)`,
        [bcId, messageId, new Date(timestamp)]
      );

      const [mRows] = await db.execute(
        `SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`,
        [messageId]
      );
      const bmId = mRows[0]?.ID;
      if (!bmId) continue;

      // 2.2 Insert into BOT_MES_CONTENT
      await db.execute(
        `INSERT INTO BOT_MES_CONTENT (BM_ID, USERIDENT, CONTENT, CREATED_TIME)
         VALUES (?, ?, ?, ?)`,
        [bmId, userId, text, new Date(timestamp)]
      );
    }
  }

  await db.end();
  console.log('✅ FB import complete');
}
