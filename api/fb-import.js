import mysql from 'mysql2/promise';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // ✅ Early response to prevent timeout
  res.status(200).send('✅ Script started — running in background');
  const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_TOKEN;
  const PAGE_ID = process.env.FB_PAGE_ID;

  const MYSQL_CONFIG = {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  };

  const db = await mysql.createConnection(MYSQL_CONFIG);

  const convoRes = await fetch(`https://graph.facebook.com/v18.0/${PAGE_ID}/conversations?access_token=${PAGE_ACCESS_TOKEN}`);
  const convoData = await convoRes.json();
  const conversations = convoData.data || [];

  for (const convo of conversations) {
    const convoId = convo.id;

    const msgRes = await fetch(`https://graph.facebook.com/v18.0/${convoId}/messages?access_token=${PAGE_ACCESS_TOKEN}`);
    const msgData = await msgRes.json();

    for (const msg of msgData.data || []) {
      const messageId = msg.id;
      
  const text = msg.message;

if (!text || typeof text !== 'string') {
  console.log(`⚠️ Skipping non-text message: ${msg.id}`);
  continue;
}

const userId = msg.from?.id || 'unknown';
const timestamp = msg.created_time || new Date().toISOString();


      await db.execute(
        `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM)
         VALUES (?, ?)`,
        [userId, 'facebook']
      );

   await db.execute(
  `INSERT INTO BOT_MES_CONTENT (BM_ID, USERIDENT, CONTENT, CREATED_TIME) VALUES (?, ?, ?, ?)`,
  [
    null,
    userId || 'unknown',
    text || '[empty]',
    timestamp ? new Date(timestamp) : new Date()
  ]
);

    }
  }

  await db.end();
  res.status(200).send('✅ Facebook import complete');
}
