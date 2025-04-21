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

    if (!Array.isArray(convoData?.data)) {
      console.warn('⚠️ No valid data received from Facebook');
      await db.end();
      return res.status(200).end(); // ✅ Silent clean exit
    }

    let inserted = 0;

    for (const convo of convoData.data) {
      const convoId = typeof convo?.id === 'string' ? convo.id.trim() : null;

      if (!convoId) {
        console.warn('❌ Skipping invalid or empty convo:', convo);
        continue;
      }

      const [result] = await db.execute(
        `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM)
         VALUES (?, 'facebook')`,
        [convoId]
      );

      if (result.affectedRows > 0) {
        inserted++;
      }
    }

    await db.end();
    return res.status(200).end(); // ✅ No output, clean finish

  } catch (err) {
    console.error('❌ Error syncing Facebook conversations:', err);
    await db.end();
    return res.status(200).end(); // Still respond with 200 to avoid re-tries
  }
}
