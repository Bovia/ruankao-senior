import { getDb } from './_lib/db.js';
import { requireAuth, cors } from './_lib/auth.js';

/**
 * GET  /api/sync  — 一次性拉取该用户所有个人数据
 * PUT  /api/sync  — 一次性上传（首次迁移）
 */
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const sql = getDb();

  // ── GET：拉取全量数据 ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const [attemptsRows, answersRows, favRows, draftRows, slashRows, essayRows] = await Promise.all([
        sql`SELECT bundle_key, data, ts FROM practice_attempts WHERE user_id = ${user.userId} ORDER BY ts ASC`,
        sql`SELECT set_key, answers FROM practice_answers WHERE user_id = ${user.userId}`,
        sql`SELECT id, type, title, content, source_key, source_tag, created_at FROM favorites WHERE user_id = ${user.userId} ORDER BY created_at ASC`,
        sql`SELECT bundle_key, state FROM case_drafts WHERE user_id = ${user.userId}`,
        sql`SELECT category, data FROM slash_records WHERE user_id = ${user.userId}`,
        sql`SELECT data FROM my_essay WHERE user_id = ${user.userId}`,
      ]);

      // 重新组装成 app.js 里的格式
      const attempts = {};
      for (const row of attemptsRows) {
        const bk = row.bundle_key;
        if (!attempts[bk]) attempts[bk] = [];
        attempts[bk].push(row.data);
      }

      const answers = {};
      for (const row of answersRows) {
        answers[row.set_key] = row.answers;
      }

      const caseDrafts = {};
      for (const row of draftRows) {
        caseDrafts[row.bundle_key] = row.state;
      }

      const slashRecords = {};
      for (const row of slashRows) {
        slashRecords[row.category] = row.data;
      }

      return res.status(200).json({
        hasData: attemptsRows.length > 0 || answersRows.length > 0 || favRows.length > 0,
        attempts,
        answers,
        favorites: favRows,
        caseDrafts,
        slashRecords,
        myEssay: essayRows.length > 0 ? essayRows[0].data : null,
      });
    } catch (err) {
      console.error('sync GET error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  // ── PUT：全量上传（首次迁移 localStorage → 云端）─────────────────────────
  if (req.method === 'PUT') {
    const { attempts, answers, favorites, caseDrafts, slashRecords, myEssay } = req.body || {};

    try {
      // attempts: { bundleKey: [{ id, bundleKey, ts, ... }, ...] }
      if (attempts && typeof attempts === 'object') {
        for (const [bundleKey, list] of Object.entries(attempts)) {
          if (!Array.isArray(list)) continue;
          for (const item of list) {
            if (!item || !item.ts) continue;
            await sql`
              INSERT INTO practice_attempts (user_id, bundle_key, data, ts)
              VALUES (${user.userId}, ${bundleKey}, ${JSON.stringify(item)}, ${item.ts})
              ON CONFLICT DO NOTHING
            `;
          }
        }
      }

      // answers: { setKey: { "0": "D", ... } }
      if (answers && typeof answers === 'object') {
        for (const [setKey, ans] of Object.entries(answers)) {
          if (!ans) continue;
          await sql`
            INSERT INTO practice_answers (user_id, set_key, answers, updated_at)
            VALUES (${user.userId}, ${setKey}, ${JSON.stringify(ans)}, NOW())
            ON CONFLICT (user_id, set_key) DO UPDATE SET answers = EXCLUDED.answers, updated_at = NOW()
          `;
        }
      }

      // favorites: [{ id, type, title, content, sourceKey, createdAt, ... }]
      if (Array.isArray(favorites) && favorites.length > 0) {
        await sql`DELETE FROM favorites WHERE user_id = ${user.userId}`;
        for (const fav of favorites) {
          if (!fav || !fav.id) continue;
          await sql`
            INSERT INTO favorites (id, user_id, type, title, content, source_key, source_tag, created_at)
            VALUES (
              ${fav.id}, ${user.userId}, ${fav.type || 'note'},
              ${fav.title || ''}, ${fav.content || ''},
              ${fav.sourceKey || fav.source_key || ''},
              ${fav.sourceTag || fav.source_tag || ''},
              ${fav.createdAt || fav.created_at || Date.now()}
            )
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }

      // caseDrafts: { bundleKey: state }
      if (caseDrafts && typeof caseDrafts === 'object') {
        for (const [bundleKey, state] of Object.entries(caseDrafts)) {
          if (!state) continue;
          await sql`
            INSERT INTO case_drafts (user_id, bundle_key, state, updated_at)
            VALUES (${user.userId}, ${bundleKey}, ${JSON.stringify(state)}, NOW())
            ON CONFLICT (user_id, bundle_key) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
          `;
        }
      }

      // slashRecords: { category: data }
      if (slashRecords && typeof slashRecords === 'object') {
        for (const [category, data] of Object.entries(slashRecords)) {
          if (!data) continue;
          await sql`
            INSERT INTO slash_records (user_id, category, data, updated_at)
            VALUES (${user.userId}, ${category}, ${JSON.stringify(data)}, NOW())
            ON CONFLICT (user_id, category) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
          `;
        }
      }

      // myEssay
      if (myEssay && typeof myEssay === 'object') {
        await sql`
          INSERT INTO my_essay (user_id, data, updated_at)
          VALUES (${user.userId}, ${JSON.stringify(myEssay)}, NOW())
          ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `;
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('sync PUT error:', err);
      return res.status(500).json({ error: '服务器错误' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
