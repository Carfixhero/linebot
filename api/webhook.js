// ✅ Unified LINE + Facebook Webhook with automatic Facebook recovery logic

import mysql from 'mysql2/promise';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  const VERIFY_TOKEN = 'carfix123';

  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send('Verification failed');
    }
  }

  if (req.method === 'POST') {
    console.log('📨 Incoming Facebook/LINE webhook:', JSON.stringify(req.body, null, 2));

    try {
      const body = req.body;

      const db = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
      });

      // ✅ LINE handler (unchanged)
      if (body?.events?.[0]?.message) {
        const event = body.events[0];
        const userId = event.source.userId;
        const messageText = event.message.text;
        const messageId = event.message.id;
        const timestamp = new Date(event.timestamp);

        let lineName = null;
        try {
          const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
            headers: {
              Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
            },
          });
          const profile = await profileRes.json();
          lineName = profile.displayName || null;
        } catch (err) {
          console.warn('⚠️ LINE profile fetch failed:', err);
        }

        await db.execute(
          `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM)
           VALUES (?, 'line')`,
          [userId]
        );

        const [[{ ID: bcId } = {}]] = await db.execute(
          `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'line'`,
          [userId]
        );

        await db.execute(
          `INSERT IGNORE INTO BOT_MESSAGES (BC_ID, DIRECTION, MESSAGE_ID, CREATED_TIME)
           VALUES (?, 'in', ?, ?)`,
          [bcId, messageId, timestamp]
        );

        const [[{ ID: bmId } = {}]] = await db.execute(
          `SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`,
          [messageId]
        );

        await db.execute(
          `INSERT INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, EMAIL, CONTENT, TRANS_CONTENT, CREATED_TIME)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [bmId, userId, lineName, null, messageText, null, timestamp]
        );
      }

      // ✅ Facebook recovery logic (automatic on any webhook trigger)
      if (body?.entry?.[0]?.messaging?.[0]?.sender?.id) {
        const msg = body.entry[0].messaging[0];
        const userId = msg.sender.id;

        // Step 1: Fetch all conversations (or just the sender’s latest convo)
        const convoRes = await fetch(`https://graph.facebook.com/v18.0/${process.env.FB_PAGE_ID}/conversations?access_token=${process.env.FB_PAGE_TOKEN}`);
        const convoData = await convoRes.json();
        const conversations = convoData.data || [];

        for (const convo of conversations) {
          const convoId = convo.id;

          // Check if conversation already exists
          await db.execute(
            `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM)
             VALUES (?, 'facebook')`,
            [convoId]
          );

          const [[{ ID: bcId } = {}]] = await db.execute(
            `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
            [convoId]
          );

          // Step 2: Fetch all messages in the conversation
          const msgRes = await fetch(`https://graph.facebook.com/v18.0/${convoId}/messages?access_token=${process.env.FB_PAGE_TOKEN}`);
          const msgData = await msgRes.json();

          for (const message of msgData.data || []) {
            const messageId = message.id;
            const text = message.message;
            const timestamp = message.created_time;
            const fromId = message.from?.id || null;
            let senderName = message.from?.name || null;
            let senderEmail = message.from?.email || null;

            if (!text || typeof text !== 'string') continue;

            // Check if message already exists
            const [existing] = await db.execute(`SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`, [messageId]);
            if (existing.length > 0) continue;

            await db.execute(
              `INSERT IGNORE INTO BOT_MESSAGES (BC_ID, DIRECTION, MESSAGE_ID, CREATED_TIME)
               VALUES (?, 'in', ?, ?)`,
              [bcId, messageId, new Date(timestamp)]
            );

            const [[{ ID: bmId } = {}]] = await db.execute(
              `SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`,
              [messageId]
            );

            await db.execute(
              `INSERT INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, EMAIL, CONTENT, TRANS_CONTENT, CREATED_TIME)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [bmId, fromId, senderName, senderEmail, text, null, new Date(timestamp)]
            );
          }
        }
      }

      await db.end();
      return res.status(200).send('OK');
    } catch (err) {
      console.error('❌ Webhook error:', err);
      return res.status(500).send('Internal error');
    }
  }

  return res.status(405).send('Method Not Allowed');
}
