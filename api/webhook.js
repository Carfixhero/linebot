import mysql from 'mysql2/promise';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const event = req.body?.events?.[0];
  if (!event || !event.message) return res.status(400).send('No message');

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

  // insert conversation if not exists
  await connection.execute(
    `INSERT IGNORE INTO BOT_CONVERSATIONS (CONVERSATION_ID, PLATFORM)
     VALUES (?, ?)`,
    [userId, 'line']
  );

  // get convo ID
  const [convoRows] = await connection.execute(
    `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = ?`,
    [userId, 'line']
  );
  const convoId = convoRows[0]?.ID;

  // insert into content table
  await connection.execute(
    `INSERT INTO BOT_MES_CONTENT 
      (BM_ID, USERIDENT, CONTENT, CREATED_TIME) 
     VALUES (?, ?, ?, ?)`,
    [null, userId, messageText, timestamp]
  );

  await connection.end();

  res.status(200).send('OK');
}
