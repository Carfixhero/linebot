// ✅ Hardened Facebook Backfill with pagination and complete logging

import mysql from 'mysql2/promise';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.status(200).send('✅ Facebook backfill started');

  try {
    const db = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    });

    let nextUrl = `https://graph.facebook.com/v18.0/${process.env.FB_PAGE_ID}/conversations?access_token=${process.env.FB_PAGE_TOKEN}`;

    while (nextUrl) {
      const convoRes = await fetch(nextUrl);
      const convoData = await convoRes.json();
      const conversations = convoData.data || [];

      console.log(`📦 Found ${conversations.length} conversations`);

      for (const convo of conversations) {
        const convoId = convo.id;
        console.log(`➡️ Processing conversation: ${convoId}`);

        try {
          await db.execute(
            `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM)
             VALUES (?, 'facebook')`,
            [convoId]
          );

          const [[{ ID: bcId } = {}]] = await db.execute(
            `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
            [convoId]
          );

          if (!bcId) {
            console.warn(`❌ Skipping convo ${convoId} — no BC_ID`);
            continue;
          }

          const msgRes = await fetch(`https://graph.facebook.com/v18.0/${convoId}/messages?access_token=${process.env.FB_PAGE_TOKEN}`);
          const msgData = await msgRes.json();
          const messages = msgData.data || [];

          console.log(`   ↳ ${messages.length} messages in convo ${convoId}`);

          for (const message of messages) {
            const messageId = message.id;
            const text = message.message;
            const timestamp = message.created_time;
            const fromId = message.from?.id || null;
            const senderName = message.from?.name || null;
            const senderEmail = message.from?.email || null;

            if (!text || typeof text !== 'string') {
              console.warn(`⚠️ Skipping non-text message: ${messageId}`);
              continue;
            }

            const [existing] = await db.execute(`SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`, [messageId]);
            if (existing.length > 0) {
              console.log(`   ✅ Already exists: ${messageId}`);
              continue;
            }

            await db.execute(
              `INSERT IGNORE INTO BOT_MESSAGES (BC_ID, DIRECTION, MESSAGE_ID, CREATED_TIME)
               VALUES (?, 'in', ?, ?)`,
              [bcId, messageId, new Date(timestamp)]
            );

            const [[{ ID: bmId } = {}]] = await db.execute(
              `SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`,
              [messageId]
            );

            if (!bmId) {
              console.warn(`⚠️ Could not find BM_ID for message: ${messageId}`);
              continue;
            }

            await db.execute(
              `INSERT INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, EMAIL, CONTENT, TRANS_CONTENT, CREATED_TIME)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [bmId, fromId, senderName, senderEmail, text, null, new Date(timestamp)]
            );

            console.log(`   💾 Inserted message: ${messageId}`);
          }
        } catch (err) {
          console.error(`❌ Error in conversation ${convoId}:`, err);
        }
      }

      nextUrl = convoData.paging?.next || null;
      if (nextUrl) console.log('🔁 Fetching next page of conversations...');
    }

    await db.end();
    console.log('✅ Facebook backfill complete');
  } catch (err) {
    console.error('❌ Top-level backfill error:', err);
  }
}
