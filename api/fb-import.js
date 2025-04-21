// ✅ FINAL FB IMPORT SCRIPT — Fully aligned, no skipping, Facebook v22.0

import mysql from 'mysql2/promise';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.status(200).send('✅ FB import started');

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
    if (!Array.isArray(convoData.data)) throw new Error('No conversations returned');

    for (const convo of convoData.data) {
      const convoId = convo.id;
      console.log(`➡️ Conversation: ${convoId}`);

      const insertConvo = await db.execute(
        `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM)
         VALUES (?, 'facebook')`,
        [convoId]
      );

      const [[{ ID: bcId } = {}]] = await db.execute(
        `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
        [convoId]
      );

      if (!bcId) throw new Error(`❌ Failed to resolve BC_ID for ${convoId}`);

      const msgRes = await fetch(`https://graph.facebook.com/v22.0/${convoId}/messages?access_token=${ACCESS_TOKEN}`);
      const msgData = await msgRes.json();

      if (!Array.isArray(msgData.data)) {
        console.warn(`⚠️ No messages found for convo ${convoId}`);
        continue;
      }

      for (const msg of msgData.data) {
        const messageId = msg.id;
        const text = msg.message;
        const created = new Date(msg.created_time);
        const userId = msg.from?.id || null;
        const name = msg.from?.name || null;

        if (!text || typeof text !== 'string') {
          console.log(`⏭️ Skipping non-text message ${messageId}`);
          continue;
        }

        await db.execute(
          `INSERT IGNORE INTO BOT_MESSAGES (BC_ID, DIRECTION, MESSAGE_ID, CREATED_TIME)
           VALUES (?, 'in', ?, ?)`,
          [bcId, messageId, created]
        );

        const [[{ ID: bmId } = {}]] = await db.execute(
          `SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`,
          [messageId]
        );

        if (!bmId) throw new Error(`❌ Failed to resolve BM_ID for message ${messageId}`);

        await db.execute(
          `INSERT INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, CONTENT, CREATED_TIME)
           VALUES (?, ?, ?, ?, ?)`,
          [bmId, userId, name, text, created]
        );

        console.log(`✅ Inserted message ${messageId}`);
      }
    }

    await db.end();
    console.log('✅ FB import finished');
  } catch (err) {
    console.error('❌ Import failed:', err);
  }
}
