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

    if (!Array.isArray(convoData.data)) {
      throw new Error('No conversations found from Facebook');
    }

    for (const convo of convoData.data) {
      const convoId = convo.id;

      if (!convoId || typeof convoId !== 'string') {
        console.warn(`❌ Skipping invalid conversation:`, convo);
        continue;
      }

      console.log(`📥 Inserting conversation: ${convoId}`);

      await db.execute(
        `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM)
         VALUES (?, 'facebook')`,
        [convoId]
      );
    }

    await db.end();
    console.log('✅ FB conversation insert complete');
  } catch (err) {
    console.error('❌ Conversation insert failed:', err);
  }
}
