export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const events = req.body?.events;
  if (!events || !Array.isArray(events)) {
    return res.status(400).send('Invalid webhook payload');
  }

  const replyToken = events[0]?.replyToken;
  const userMessage = events[0]?.message?.text;

  const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  const reply = {
    replyToken,
    messages: [
      {
        type: 'text',
        text: "Thanks! We received your message.",
      },
    ],
  };

  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(reply),
  });

  res.status(200).send('OK');
}
