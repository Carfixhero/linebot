import fetch from 'node-fetch';
import mysql from 'mysql2/promise';

// 🔧 Set these manually or load from .env
const PAGE_ACCESS_TOKEN = 'YOUR_PAGE_ACCESS_TOKEN';
const MYSQL_CONFIG = {
  host: 'YOUR_DB_HOST',
  user: 'YOUR_DB_USER',
  password: 'YOUR_DB_PASSWORD',
  database: 'YOUR_DB_NAME',
};

async function run() {
  const db = await mysql.createConnection(MYSQL_CONFIG);

  const res = await fetch(
    `https://graph.facebook.com/v18.0/YOUR_PAGE_ID/conversations?access_token=${PAGE_ACCESS_TOKEN}`
  );
  const data = await res.json();
  const conversations = data.data;

  for (const convo of conversations) {
    const convoId = convo.id;

    const msgRes = await fetch(
      `https://graph.facebook.com/v18.0/${convoId}/messages?access_token=${PAGE_ACCESS_TOKEN}`
    );
    const msgData = await msgRes.json();

    for (const msg of msgData.data) {
      const messageId = msg.id;
      const text = msg.message;
      const userId = msg.from?.id || null;
      const timestamp = msg.created_time;

      await db.execute(
        `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM) VALUES (?, ?)`,
        [userId, 'facebook']
      );

      await db.execute(
        `INSERT INTO BOT_MES_CONTENT (BM_ID, USERIDENT, CONTENT, CREATED_TIME)
         VALUES (?, ?, ?, ?)`,
        [null, userId, text, new Date(timestamp)]
      );

      console.log(`Saved: ${messageId}`);
    }
  }

  await db.end();
}

run().catch(console.error);
