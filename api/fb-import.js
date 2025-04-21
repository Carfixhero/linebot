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

    // 🛑 Defensive check: is data array?
    if (!Array.isArray(convoData.data)) {
      await db.end();
      return res.status(500).json({ error: 'Invalid data from Facebook API', convoData });
    }

    let inserted = 0;

    for (const convo of convoData.data) {
      const convoId = convo?.id;

      // 🛑 Skip if no valid ID
      if (!convoId || typeof convoId !== 'string') {
        console.warn(`❌ Skipping invalid conversation`, convo);
        continue;
      }

      await db.execute(
        `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM)
         VALUES (?, 'facebook')`,
        [convoId]
      );

      inserted++;
    }

    await db.end();

    // ✅ Always return something
    return res.status(200).json({ message: '✅ Sync complete', inserted });

  } catch (err) {
    console.error('❌ Error fetching or inserting:', err);
    await db.end();
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}
