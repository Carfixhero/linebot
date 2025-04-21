import mysql from 'mysql2/promise';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  try {
    const db = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    });

    const [rows] = await db.execute(
      'SELECT ID, CONTENT FROM BOT_MES_CONTENT WHERE TRANS_CONTENT IS NULL AND CONTENT IS NOT NULL LIMIT 1'
    );

    if (rows.length === 0) {
      return res.status(200).json({ message: 'Nothing to translate' });
    }

    const { ID, CONTENT } = rows[0];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Translate to ENGLISH. Only reply with the translation.' },
        { role: 'user', content: CONTENT }
      ]
    });

    const translated = completion.choices[0].message.content.trim();

    await db.execute(
      'UPDATE BOT_MES_CONTENT SET TRANS_CONTENT = ? WHERE ID = ?',
      [translated, ID]
    );

    res.status(200).json({
      success: true,
      id: ID,
      original: CONTENT,
      translated,
    });

  } catch (err) {
    console.error('Translation error:', err);
    res.status(500).json({ error: 'Translation failed', detail: err.message });
  }
}
