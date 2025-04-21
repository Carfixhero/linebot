export default async function handler(req, res) {
  const max = 20; // how many messages to translate in one run
  let success = 0;
  let failed = 0;

  for (let i = 0; i < max; i++) {
    try {
      const result = await fetch(`${process.env.BASE_URL}/api/translate`, {
        method: 'GET',
      });
      const data = await result.json();
      if (data.success) {
        success++;
      } else {
        console.log('No more messages to translate or skipped');
        break;
      }
    } catch (err) {
      console.error('Translate call failed:', err);
      failed++;
    }
  }

  res.status(200).json({ translated: success, failed });
}
