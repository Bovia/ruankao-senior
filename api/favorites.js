import { getDb } from './_lib/db.js';
import { requireAuth, cors } from './_lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const sql = getDb();

  // GET /api/favorites  — 获取所有收藏
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT id, type, title, content, source_key, source_tag, created_at
        FROM favorites
        WHERE user_id = ${user.userId}
        ORDER BY created_at DESC
        LIMIT 800
      `;
      return res.status(200).json({ items: rows });
    } catch (err) {
      console.error('favorites GET error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  // POST /api/favorites  — 新增收藏
  if (req.method === 'POST') {
    const { id, type, title, content, sourceKey, sourceTag, createdAt } = req.body || {};
    if (!id || !type || createdAt === undefined) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    try {
      await sql`
        INSERT INTO favorites (id, user_id, type, title, content, source_key, source_tag, created_at)
        VALUES (${id}, ${user.userId}, ${type}, ${title || ''}, ${content || ''}, ${sourceKey || ''}, ${sourceTag || ''}, ${createdAt})
        ON CONFLICT (id) DO NOTHING
      `;
      return res.status(201).json({ ok: true });
    } catch (err) {
      console.error('favorites POST error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  // DELETE /api/favorites?id=xxx  — 删除一条收藏
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: '缺少 id' });
    try {
      await sql`DELETE FROM favorites WHERE id = ${id} AND user_id = ${user.userId}`;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('favorites DELETE error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  // PUT /api/favorites/bulk  — 批量同步（全量覆盖，用于首次迁移 localStorage 数据）
  if (req.method === 'PUT') {
    const { items } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: '需要 items 数组' });
    }
    try {
      // 先清空再插入
      await sql`DELETE FROM favorites WHERE user_id = ${user.userId}`;
      if (items.length > 0) {
        for (const item of items) {
          await sql`
            INSERT INTO favorites (id, user_id, type, title, content, source_key, source_tag, created_at)
            VALUES (
              ${item.id}, ${user.userId}, ${item.type},
              ${item.title || ''}, ${item.content || ''},
              ${item.sourceKey || item.source_key || ''},
              ${item.sourceTag || item.source_tag || ''},
              ${item.createdAt || item.created_at || Date.now()}
            )
          `;
        }
      }
      return res.status(200).json({ ok: true, count: items.length });
    } catch (err) {
      console.error('favorites PUT error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
