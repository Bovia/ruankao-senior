import { getDb } from '../_lib/db.js';
import { requireAuth, cors } from '../_lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const sql = getDb();

  // GET /api/practice/answers?setKey=xxx  — 查单个套卷答案
  // GET /api/practice/answers             — 查全部
  if (req.method === 'GET') {
    const { setKey } = req.query;
    try {
      let rows;
      if (setKey) {
        rows = await sql`
          SELECT set_key, answers, updated_at
          FROM practice_answers
          WHERE user_id = ${user.userId} AND set_key = ${setKey}
        `;
      } else {
        rows = await sql`
          SELECT set_key, answers, updated_at
          FROM practice_answers
          WHERE user_id = ${user.userId}
          ORDER BY updated_at DESC
        `;
      }
      return res.status(200).json({ answers: rows });
    } catch (err) {
      console.error('answers GET error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  // PUT /api/practice/answers  — 更新/插入某套卷的所有答案（upsert）
  if (req.method === 'PUT') {
    const { setKey, answers } = req.body || {};
    if (!setKey || answers === undefined) {
      return res.status(400).json({ error: '缺少必要参数 setKey / answers' });
    }
    try {
      await sql`
        INSERT INTO practice_answers (user_id, set_key, answers, updated_at)
        VALUES (${user.userId}, ${setKey}, ${JSON.stringify(answers)}, NOW())
        ON CONFLICT (user_id, set_key)
        DO UPDATE SET answers = EXCLUDED.answers, updated_at = NOW()
      `;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('answers PUT error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
