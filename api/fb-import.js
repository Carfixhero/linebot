const convoId = 't_10106324440531431'; // use a valid one from your DB

const [[{ ID: bcId } = {}]] = await db.execute(
  `SELECT ID FROM BOT_CONVERSATIONS WHERE CONVERSATION_ID = ? AND PLATFORM = 'facebook'`,
  [convoId]
);
if (!bcId) return res.status(200).end();

const msgRes = await fetch(`https://graph.facebook.com/v22.0/${convoId}/messages?access_token=${ACCESS_TOKEN}`);
const msgData = await msgRes.json();
const messages = msgData.data?.slice(0, 10) || [];

for (const msg of messages) {
  const messageId = msg.id;
  const text = msg.message;
  const created = new Date(msg.created_time);
  const userId = msg.from?.id || null;
  const name = msg.from?.name || null;

  await db.execute(
    `INSERT INTO BOT_MESSAGES (BC_ID, DIRECTION, MESSAGE_ID, CREATED_TIME) VALUES (?, 'in', ?, ?)`,
    [bcId, messageId, created]
  );

  const [[{ ID: bmId } = {}]] = await db.execute(
    `SELECT ID FROM BOT_MESSAGES WHERE MESSAGE_ID = ?`,
    [messageId]
  );
  if (!bmId) continue;

  await db.execute(
    `INSERT INTO BOT_MES_CONTENT (BM_ID, USERIDENT, NAME, CONTENT, CREATED_TIME)
     VALUES (?, ?, ?, ?, ?)`,
    [bmId, userId, name, text, created]
  );
}
