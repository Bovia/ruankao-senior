import { getDb } from './_lib/db.js';
import { requireAuth, cors } from './_lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const sql = getDb();

  // GET /api/case-drafts?bundleKey=xxx  — 查单个
  // GET /api/case-drafts                — 查全部
  if (req.method === 'GET') {
    const { bundleKey } = req.query;
    try {
      let rows;
      if (bundleKey) {
        rows = await sql`
          SELECT bundle_key, state, updated_at FROM case_drafts
          WHERE user_id = ${user.userId} AND bundle_key = ${bundleKey}
        `;
      } else {
        rows = await sql`
          SELECT bundle_key, state, updated_at FROM case_drafts
          WHERE user_id = ${user.userId}
        `;
      }
      return res.status(200).json({ drafts: rows });
    } catch (err) {
      console.error('case-drafts GET error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  // PUT /api/case-drafts  — upsert 一个套卷的状态
  if (req.method === 'PUT') {
    const { bundleKey, state } = req.body || {};
    if (!bundleKey || state === undefined) {
      return res.status(400).json({ error: '缺少 bundleKey / state' });
    }
    try {
      await sql`
        INSERT INTO case_drafts (user_id, bundle_key, state, updated_at)
        VALUES (${user.userId}, ${bundleKey}, ${JSON.stringify(state)}, NOW())
        ON CONFLICT (user_id, bundle_key)
        DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
      `;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('case-drafts PUT error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
