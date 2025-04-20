// ✅ Unified LINE + Facebook Webhook (Schema-aligned with Facebook name/email lookup)

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

      // ✅ LINE message handler
      if (body?.events?.[0]?.message) {
        const event = body.events[0];
        const userId = event.source.userId;
        const messageText = event.message.text;
        const messageId = event.message.id;
        const timestamp = new Date(event.timestamp);

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
          [bmId, userId, null, null, messageText, null, timestamp]
        );
      }

      // ✅ Facebook message handler
      if (body?.entry?.[0]?.messaging?.[0]?.message) {
        const msg = body.entry[0].messaging[0];
        const userId = msg.sender.id;
        const messageText = msg.message.text;
        const messageId = msg.message.mid;
        const timestamp = new Date(msg.timestamp);

        // 🔍 Lookup sender name/email using Graph API (based on message ID)
        let senderName = null;
        let senderEmail = null;

        try {
          const detailRes = await fetch(`https://graph.facebook.com/v18.0/${messageId}?fields=from&access_token=${process.env.FB_PAGE_TOKEN}`);
          const detailData = await detailRes.json();
          senderName = detailData.from?.name || null;
          senderEmail = detailData.from?.email || null;
        } catch (error) {
          console.warn('⚠️ Failed to fetch FB sender name/email:', error);
        }

        await db.execute(
          `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM)
           VALUES (?, 'facebook')`,
          [userId]
        );

        const [[{ ID: bcId } = {}]] = await db.execute(
          `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
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
          [bmId, userId, senderName, senderEmail, messageText, null, timestamp]
        );
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
