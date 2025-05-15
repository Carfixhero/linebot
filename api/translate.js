import mysql from 'mysql2/promise';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  let db;
  try {
    db = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    });

    const [rows] = await db.execute(
      'SELECT ID, CONTENT FROM BOT_MES_CONTENT WHERE TRANS_CONTENT IS NULL LIMIT 1'
    );

    if (rows.length === 0) {
      await db.end();
      return res.status(200).json({ message: 'Nothing to translate' });
    }

    const { ID, CONTENT } = rows[0];
    const clean = CONTENT?.trim() || '';

    const isSkippable =
      clean === '' ||
      /^\[.*\]$/.test(clean) ||
      /^[\d\s]+$/.test(clean);

    if (isSkippable) {
      await db.execute(
        'UPDATE BOT_MES_CONTENT SET TRANS_CONTENT = ? WHERE ID = ?',
        ['NA', ID]
      );
      await db.end();
      return res.status(200).json({
        skipped: true,
        reason: 'Non-translatable content',
        id: ID,
        original: CONTENT
      });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a professional car parts translator.
If the message is in Thai, translate it to English.
If it's in English, translate it to Thai.
The message is always about car spare parts, repairs, or mechanics.
Only reply with the clean, natural translation — no explanation.`
        },
        {
          role: 'user',
          content: CONTENT
        }
      ]
    });

    const translated = response.choices?.[0]?.message?.content?.trim();

    if (!translated) {
      await db.execute(
        'UPDATE BOT_MES_CONTENT SET TRANS_CONTENT = ? WHERE ID = ?',
        ['NA', ID]
      );
      await db.end();
      return res.status(200).json({
        skipped: true,
        reason: 'OpenAI gave empty',
        id: ID
      });
    }

    await db.execute(
      'UPDATE BOT_MES_CONTENT SET TRANS_CONTENT = ? WHERE ID = ?',
      [translated, ID]
    );

    await db.end();
    res.status(200).json({
      success: true,
      id: ID,
      original: CONTENT,
      translated,
    });

  } catch (err) {
    console.error('❌ Translation failed:', err);
    try {
      const idMatch = /ID\s*=\s*(\d+)/.exec(err.message || '')?.[1];
      if (idMatch && db) {
        await db.execute(
          'UPDATE BOT_MES_CONTENT SET TRANS_CONTENT = ? WHERE ID = ?',
          ['NA', idMatch]
        );
      }
    } catch (ignore) {}
    if (db) await db.end();
    res.status(500).json({
      error: 'Translation failed',
      detail: err.message || 'Unknown error',
    });
  }
}
