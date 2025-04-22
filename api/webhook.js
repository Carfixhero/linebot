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
    let db;
    try {
      const body = req.body;

      db = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
      });

      // Log LINE or Facebook webhook body to BOT_WEBHOOK_LOG
      if (body?.events?.[0]) {
        await db.execute(
          `INSERT INTO BOT_WEBHOOK_LOG (PLATFORM, RAW_JSON) VALUES (?, ?)`,
          ['line', JSON.stringify(body)]
        );
      } else if (body?.entry?.[0]?.messaging) {
        await db.execute(
          `INSERT INTO BOT_WEBHOOK_LOG (PLATFORM, RAW_JSON) VALUES (?, ?)`,
          ['facebook', JSON.stringify(body)]
        );
      }

      // LINE messages
      if (body?.events?.[0]?.message) {
        const event = body.events[0];
        const userId = event.source.userId;
        const messageText = event.message.text;
        const messageId = event.message.id;
        const timestamp = new Date(event.timestamp);

        const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
          headers: {
            Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
          },
        });
        const profile = await profileRes.json();
        const name = profile.displayName || null;

        await db.execute(
          `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM) VALUES (?, 'line')`,
          [userId]
        );

        const [[{ ID: bcId } = {}]] = await db.execute(
          `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'line'`,
          [userId]
        );

        await db.execute(
          `INSERT IGNORE INTO BOT_MESSAGES (BC_ID, DIRECTION, MESSAGE_ID, CREATED_TIME) VALUES (?, 'in', ?, ?)`,
          [bcId, messageId, timestamp]
        );

        const [[{ ID: bmId } = {}]] = await db.execute(
          `SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`,
          [messageId]
        );

        await db.execute(
          `INSERT IGNORE INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, CONTENT, CREATED_TIME)
           VALUES (?, ?, ?, ?, ?)`,
          [bmId, userId, name, messageText, timestamp]
        );
      }

      // Facebook messages
      if (body?.entry?.length > 0) {
        for (const entry of body.entry) {
          for (const msg of entry.messaging || []) {
            if (msg.message) {
              const userId = msg.sender.id;
              const messageText = msg.message.text || '[non-text message]';
              const messageId = msg.message.mid;
              const timestamp = new Date(msg.timestamp);

              await db.execute(
                `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM) VALUES (?, 'facebook')`,
                [userId]
              );

              const [[{ ID: bcId } = {}]] = await db.execute(
                `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
                [userId]
              );

              await db.execute(
                `INSERT IGNORE INTO BOT_MESSAGES (BC_ID, DIRECTION, MESSAGE_ID, CREATED_TIME) VALUES (?, 'in', ?, ?)`,
                [bcId, messageId, timestamp]
              );

              const [[{ ID: bmId } = {}]] = await db.execute(
                `SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`,
                [messageId]
              );

              let name = null;
              try {
                const detailRes = await fetch(`https://graph.facebook.com/v22.0/${messageId}?fields=from&access_token=${process.env.FB_PAGE_TOKEN}`);
                const detailData = await detailRes.json();
                name = detailData.from?.name || null;
              } catch (err) {
                console.error('Facebook detail fetch error:', err.message);
                await db.execute(
                  `INSERT INTO BOT_WEBHOOK_ERRORS (ERROR_MESSAGE, STACK_TRACE) VALUES (?, ?)`,
                  [err.message, err.stack]
                );
              }

              await db.execute(
                `INSERT IGNORE INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, CONTENT, CREATED_TIME)
                 VALUES (?, ?, ?, ?, ?)`,
                [bmId, userId, name, messageText, timestamp]
              );
            }
          }
        }
      }

      await db.end();
      return res.status(200).end();
    } catch (err) {
      if (db) {
        await db.execute(
          `INSERT INTO BOT_WEBHOOK_ERRORS (ERROR_MESSAGE, STACK_TRACE) VALUES (?, ?)`,
          [err.message, err.stack]
        );
        await db.end();
      }
      console.error('Webhook handler error:', err);
      return res.status(500).send('❌ Webhook error');
    }
  }

  return res.status(405).send('Method Not Allowed');
}
