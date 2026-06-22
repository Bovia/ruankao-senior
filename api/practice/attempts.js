import { getDb } from '../_lib/db.js';
import { requireAuth, cors } from '../_lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const sql = getDb();

  // GET /api/practice/attempts?bundleKey=xxx  — 查询某个套卷的历史
  // GET /api/practice/attempts                — 查询所有历史（最近 500 条）
  if (req.method === 'GET') {
    const { bundleKey, limit = 500 } = req.query;
    try {
      let rows;
      if (bundleKey) {
        rows = await sql`
          SELECT id, bundle_key, data, ts, created_at
          FROM practice_attempts
          WHERE user_id = ${user.userId} AND bundle_key = ${bundleKey}
          ORDER BY ts DESC
          LIMIT ${Math.min(Number(limit), 1000)}
        `;
      } else {
        rows = await sql`
          SELECT id, bundle_key, data, ts, created_at
          FROM practice_attempts
          WHERE user_id = ${user.userId}
          ORDER BY ts DESC
          LIMIT ${Math.min(Number(limit), 1000)}
        `;
      }
      return res.status(200).json({ attempts: rows });
    } catch (err) {
      console.error('attempts GET error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  // POST /api/practice/attempts  — 新增一条练习记录
  if (req.method === 'POST') {
    const { bundleKey, data, ts } = req.body || {};
    if (!bundleKey || !data || !ts) {
      return res.status(400).json({ error: '缺少必要参数 bundleKey / data / ts' });
    }
    try {
      const rows = await sql`
        INSERT INTO practice_attempts (user_id, bundle_key, data, ts)
        VALUES (${user.userId}, ${bundleKey}, ${JSON.stringify(data)}, ${ts})
        RETURNING id
      `;
      return res.status(201).json({ id: rows[0].id });
    } catch (err) {
      console.error('attempts POST error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
