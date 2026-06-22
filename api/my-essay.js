import { getDb } from './_lib/db.js';
import { requireAuth, cors } from './_lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const sql = getDb();

  // GET /api/my-essay
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT data, updated_at FROM my_essay WHERE user_id = ${user.userId}
      `;
      if (rows.length === 0) return res.status(200).json({ data: null });
      return res.status(200).json({ data: rows[0].data, updatedAt: rows[0].updated_at });
    } catch (err) {
      console.error('my-essay GET error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  // PUT /api/my-essay  — upsert
  if (req.method === 'PUT') {
    const { data } = req.body || {};
    if (!data) return res.status(400).json({ error: '缺少 data' });
    try {
      await sql`
        INSERT INTO my_essay (user_id, data, updated_at)
        VALUES (${user.userId}, ${JSON.stringify(data)}, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('my-essay PUT error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
