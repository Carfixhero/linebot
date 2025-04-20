import mysql from 'mysql2/promise';

export default async function handler(req, res) {
  const VERIFY_TOKEN = 'carfix123'; // match your Facebook token

  // ✅ Facebook GET webhook verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Facebook webhook verified!');
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send('Verification failed');
    }
  }

  // ✅ LINE + Facebook webhook POST handler
  if (req.method === 'POST') {
    try {
      const body = req.body;

      // LINE structure
      if (body?.events?.[0]?.message) {
        const event = body.events[0];
        const userId = event.source.userId;
        const messageText = event.message.text;
        const messageId = event.message.id;
        const timestamp = new Date(event.timestamp);

        const connection = await mysql.createConnection({
          host: process.env.MYSQL_HOST,
          user: process.env.MYSQL_USER,
          password: process.env.MYSQL_PASSWORD,
          database: process.env.MYSQL_DATABASE,
        });

        await connection.execute(
          `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM)
           VALUES (?, ?)`,
          [userId, 'line']
        );

        const [convoRows] = await connection.execute(
          `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = ?`,
          [userId, 'line']
        );
        const convoId = convoRows[0]?.ID;

        await connection.execute(
          `INSERT INTO BOT_MES_CONTENT 
            (BM_ID, USERIDENT, CONTENT, CREATED_TIME) 
           VALUES (?, ?, ?, ?)`,
          [null, userId, messageText, timestamp]
        );

        await connection.end();
        return res.status(200).send('OK');
      }

      // Facebook structure
      if (body?.entry?.[0]?.messaging?.[0]?.message) {
        console.log('✅ Facebook message received');
        return res.status(200).send('OK'); // You can add DB insert later
      }

      return res.status(400).send('Unsupported payload');
    } catch (err) {
      console.error('❌ Webhook error:', err);
      return res.status(500).send('Internal error');
    }
  }

  // ❌ Not GET or POST
  res.status(405).send('Method Not Allowed');
}
