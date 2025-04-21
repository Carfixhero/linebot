import mysql from 'mysql2/promise';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.status(200).send('✅ Starting conversation insert test');

  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  const PAGE_ID = process.env.FB_PAGE_ID;
  const ACCESS_TOKEN = process.env.FB_PAGE_TOKEN;

  const convoRes = await fetch(`https://graph.facebook.com/v22.0/${PAGE_ID}/conversations?access_token=${ACCESS_TOKEN}`);
  const convoData = await convoRes.json();

  if (!Array.isArray(convoData.data)) throw new Error('No conversations returned');

  for (const convo of convoData.data) {
    const convoId = convo.id;
    console.log(`📥 Inserting conversation: ${convoId}`);

    await db.execute(
      `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM) VALUES (?, 'facebook')`,
      [convoId]
    );
  }

  await db.end();
  console.log('✅ All conversations processed');
}
