import mysql from 'mysql2/promise';
import fetch from 'node-fetch';

const MIME_MAP = {
  image: 'image/jpeg',
  audio: 'audio/mpeg',
  video: 'video/mp4',
  file: 'application/octet-stream',
};

export default async function handler(req, res) {
  const VERIFY_TOKEN = 'carfix123';
  let db;

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
    try {
      const body = req.body;

      db = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
      });

const platform = body?.events ? 'line' : body?.entry ? 'facebook' : 'unknown';

if (body?.entry?.length > 0) {
  for (const entry of body.entry) {
    await db.execute(
      `INSERT INTO BOT_WEBHOOK_LOG (PLATFORM, RAW_JSON) VALUES (?, ?)`,
      [platform, JSON.stringify(entry)]
    );
  }
} else {
  await db.execute(
    `INSERT INTO BOT_WEBHOOK_LOG (PLATFORM, RAW_JSON) VALUES (?, ?)`,
    [platform, JSON.stringify(body)]
  );
}
      // ✅ LINE
      if (platform === 'line' && body?.events?.length > 0) {
        for (const event of body.events) {
          const userId = event.source?.userId || null;
          const messageId = event.message?.id || `event_${event.type}_${Date.now()}`;
          const timestamp = new Date(event.timestamp);

          let messageText = '[unknown LINE event]';
          let fileUrl = null;
          let base64Id = null;

          if (event.message?.type === 'text') {
            messageText = event.message.text;
          } else if (event.message?.type === 'sticker') {
            messageText = '[sticker message]';
          } else if (event.postback?.data) {
            messageText = `[postback] ${event.postback.data}`;
          } else if (['image', 'video', 'audio', 'file'].includes(event.message?.type)) {
            messageText = `[${event.message.type} attachment]`;
            fileUrl = `linefile:${messageId}`;

            try {
              const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
                headers: {
                  Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
                },
              });

              if (!res.ok) throw new Error(`LINE download failed: ${res.statusText}`);

              const buffer = await res.buffer();
              const base64Raw = buffer.toString('base64');
              const mimeType = res.headers.get('content-type') || MIME_MAP[event.message.type] || 'application/octet-stream';

              const [result] = await db.execute(
                `INSERT INTO BOT_MES_BASE64 (BASE64_DATA, MIME_TYPE) VALUES (?, ?)`,
                [base64Raw, mimeType]
              );
              base64Id = result.insertId;

            } catch (err) {
              console.error('LINE base64 fetch error:', err.message);
              await db.execute(
                `INSERT INTO BOT_WEBHOOK_ERRORS (ERROR_MESSAGE, STACK_TRACE) VALUES (?, ?)`,
                [err.message, err.stack]
              );
            }
          }

          let name = null;
          try {
            const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
              headers: {
                Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
              },
            });
            const profile = await profileRes.json();
            name = profile.displayName || null;
          } catch (err) {
            console.error('LINE profile fetch error:', err.message);
          }

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
            `INSERT IGNORE INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, CONTENT, FILE_URL, BASE64_ID, CREATED_TIME)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [bmId, userId, name, messageText, fileUrl, base64Id, timestamp]
          );
        }
      }

      // ✅ Facebook
      if (platform === 'facebook' && body?.entry?.length > 0) {
        for (const entry of body.entry) {
         for (const msg of entry.messaging || []) {
  if (msg.message) {
    const direction = msg.message.is_echo ? 'out' : 'in';
    const userId = msg.sender.id;
    const messageId = msg.message.mid;
    const timestamp = new Date(msg.timestamp);

    let messageText = '[non-text message]';
    let fileUrl = null;
    let base64Id = null;

    if (msg.message.text) {
      messageText = msg.message.text;
    } else if (msg.message.attachments?.length > 0) {
      const attachment = msg.message.attachments[0];
      messageText = `[${attachment.type} attachment]`;
      fileUrl = attachment.payload?.url || null;

      if (fileUrl) {
        try {
          const res = await fetch(fileUrl);
          if (!res.ok) throw new Error(`FB download failed: ${res.statusText}`);

          const buffer = await res.buffer();
          const base64Raw = buffer.toString('base64');
          const mimeType = res.headers.get('content-type') || MIME_MAP[attachment.type] || 'application/octet-stream';

          const [result] = await db.execute(
            `INSERT INTO BOT_MES_BASE64 (BASE64_DATA, MIME_TYPE) VALUES (?, ?)`,
            [base64Raw, mimeType]
          );
          base64Id = result.insertId;

        } catch (err) {
          console.error('Facebook base64 fetch error:', err.message);
          await db.execute(
            `INSERT INTO BOT_WEBHOOK_ERRORS (ERROR_MESSAGE, STACK_TRACE) VALUES (?, ?)`,
            [err.message, err.stack]
          );
        }
      }
    }

    await db.execute(
      `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM) VALUES (?, 'facebook')`,
      [userId]
    );

    const [[{ ID: bcId } = {}]] = await db.execute(
      `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
      [userId]
    );

    await db.execute(
      `INSERT IGNORE INTO BOT_MESSAGES (BC_ID, DIRECTION, MESSAGE_ID, CREATED_TIME) VALUES (?, ?, ?, ?)`,
      [bcId, direction, messageId, timestamp]
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
      `INSERT IGNORE INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, CONTENT, FILE_URL, BASE64_ID, CREATED_TIME)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [bmId, userId, name, messageText, fileUrl, base64Id, timestamp]
    );
  }

  if (msg.reaction) {
    const userId = msg.sender.id;
    const messageId = `react_${Date.now()}`;
    const messageText = `[reaction: ${msg.reaction.reaction} - ${msg.reaction.emoji}]`;
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

    await db.execute(
      `INSERT IGNORE INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, CONTENT, CREATED_TIME)
       VALUES (?, ?, ?, ?, ?)`,
      [bmId, userId, null, messageText, timestamp]
    );
  }
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
