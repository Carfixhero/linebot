import fetch from 'node-fetch';
import mysql from 'mysql2/promise';

// 🔧 Add your real tokens and DB settings here
const PAGE_ACCESS_TOKEN = 'EAARBZBEvs8soBO4RORfeXJFQ4KbhGdABkkXBxDhZApP0qbkSIelJrqVm4qMFg8Pk5ALDOKJ23oKgeZAeBU3ZCvUP031GiNJtXcVyaHhgT58ivhaNT1D54QgWgNUOGP4wLJYZCJU4jxGZAurJoyafE59v7rKMPTQlyXLwfOTw6Y4cFSwFwXs9vmaJZCrQRxIIAZDZD';
const PAGE_ID = '276557755531692'; // Just the number, no slashes

const MYSQL_CONFIG = {
  host: '114.29.238.174',
  user: 'root',
  password: 'Cfh259988Cfh259988',
  database: 'tecdoc2024q1',
};

async function run() {
  const db = await mysql.createConnection(MYSQL_CONFIG);

  console.log('Fetching conversations...');
  const res = await fetch(
    `https://graph.facebook.com/v18.0/${PAGE_ID}/conversations?access_token=${PAGE_ACCESS_TOKEN}`
  );
  const data = await res.json();
  const conversations = data.data || [];

  for (const convo of conversations) {
    const convoId = convo.id;
    console.log(`📥 Fetching messages for convo: ${convoId}`);

    const msgRes = await fetch(
      `https://graph.facebook.com/v18.0/${convoId}/messages?access_token=${PAGE_ACCESS_TOKEN}`
    );
    const msgData = await msgRes.json();

    for (const msg of msgData.data || []) {
      const messageId = msg.id;
      const text = msg.message;
      const userId = msg.from?.id || null;
      const timestamp = msg.created_time;

      await db.execute(
        `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM)
         VALUES (?, ?)`,
        [userId, 'facebook']
      );

      await db.execute(
        `INSERT INTO BOT_MES_CONTENT (BM_ID, USERIDENT, CONTENT, CREATED_TIME)
         VALUES (?, ?, ?, ?)`,
        [null, userId, text, new Date(timestamp)]
      );

      console.log(`✅ Saved message ${messageId}`);
    }
  }

  await db.end();
  console.log('🎉 Done');
}

run().catch(console.error);
