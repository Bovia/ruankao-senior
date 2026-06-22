import { getDb } from './_lib/db.js';
import { requireAuth, cors } from './_lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const sql = getDb();

  // GET /api/slash-records  — 获取全部斩题记录
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT category, data, updated_at FROM slash_records
        WHERE user_id = ${user.userId}
      `;
      return res.status(200).json({ records: rows });
    } catch (err) {
      console.error('slash-records GET error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  // PUT /api/slash-records  — upsert 某大类的斩题状态
  if (req.method === 'PUT') {
    const { category, data } = req.body || {};
    if (!category || data === undefined) {
      return res.status(400).json({ error: '缺少 category / data' });
    }
    try {
      await sql`
        INSERT INTO slash_records (user_id, category, data, updated_at)
        VALUES (${user.userId}, ${category}, ${JSON.stringify(data)}, NOW())
        ON CONFLICT (user_id, category)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('slash-records PUT error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
