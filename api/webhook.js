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

  await connection.execute(
    'INSERT INTO BOT_MESSAGES (MESSAGE_ID, CREATED_TIME, DIRECTION, SOURCE) VALUES (?, ?, ?, ?)',
    [messageId, timestamp, 'in', 'line']
  );

  const [rows] = await connection.execute('SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?', [messageId]);
  const BM_ID = rows[0]?.ID;

  await connection.execute(
    'INSERT INTO BOT_MES_CONTENT (BM_ID, CONTENT, CREATED_TIME) VALUES (?, ?, ?)',
    [BM_ID, messageText, timestamp]
  );

  await connection.end();

  res.status(200).send('OK');
}
