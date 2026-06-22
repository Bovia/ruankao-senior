/**
 * 一次性迁移脚本：把 export_my_answers_and_history.json 导入 Neon
 * 运行：node tools/migrate-seed-to-neon.mjs
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');

// 读取 .env.local
const envPath = join(ROOT, '.env.local');
const envContent = readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const sql = neon(process.env.DATABASE_URL);
const seed = JSON.parse(readFileSync(join(ROOT, 'data/export_my_answers_and_history.json'), 'utf8'));

// ── 解析 bovia 数据 ────────────────────────────────────────────────────────
const boviaAttemptsRaw = JSON.parse(seed.items['jiyiqi-practice-attempts-v1'] || '{}');
const boviaAnswersRaw  = JSON.parse(seed.items['jiyiqi-practice-user-answers-v1'] || '{}');
const boviaAnswers = boviaAnswersRaw.bySetKey || {};

// ── 解析 mtt 数据 ──────────────────────────────────────────────────────────
const mttAttempts = (seed.practiceProfiles?.attemptsProfiles?.mtt) || {};
const mttAnswersRaw = seed.practiceProfiles?.answersProfiles?.mtt || {};
const mttAnswers = mttAnswersRaw.bySetKey || {};

async function insertAttempts(userId, username, attemptsByBundle) {
  let count = 0;
  for (const [bundleKey, list] of Object.entries(attemptsByBundle)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item?.ts) continue;
      await sql`
        INSERT INTO practice_attempts (user_id, bundle_key, data, ts)
        VALUES (${userId}, ${bundleKey}, ${JSON.stringify(item)}, ${item.ts})
        ON CONFLICT (user_id, bundle_key, ts) DO NOTHING
      `;
      count++;
    }
  }
  console.log(`  ${username}: 插入 ${count} 条练习历史`);
}

async function insertAnswers(userId, username, bySetKey) {
  let count = 0;
  for (const [setKey, answers] of Object.entries(bySetKey)) {
    if (!answers || typeof answers !== 'object') continue;
    await sql`
      INSERT INTO practice_answers (user_id, set_key, answers, updated_at)
      VALUES (${userId}, ${setKey}, ${JSON.stringify(answers)}, NOW())
      ON CONFLICT (user_id, set_key) DO UPDATE SET answers = EXCLUDED.answers, updated_at = NOW()
    `;
    count++;
  }
  console.log(`  ${username}: 插入 ${count} 套题目答案`);
}

console.log('开始迁移种子数据到 Neon...\n');

// bovia (user_id = 1)
console.log('【bovia】');
await insertAttempts(1, 'bovia', boviaAttemptsRaw);
await insertAnswers(1, 'bovia', boviaAnswers);

// mtt (user_id = 2)
console.log('\n【mtt】');
await insertAttempts(2, 'mtt', mttAttempts);
await insertAnswers(2, 'mtt', mttAnswers);

// 验证
const rows = await sql`
  SELECT u.username, COUNT(DISTINCT a.id) as attempts, COUNT(DISTINCT pa.id) as answer_sets
  FROM users u
  LEFT JOIN practice_attempts a ON a.user_id = u.id
  LEFT JOIN practice_answers pa ON pa.user_id = u.id
  GROUP BY u.username
  ORDER BY u.username
`;
console.log('\n✅ 迁移完成，当前数据库状态：');
for (const r of rows) {
  console.log(`  ${r.username}: ${r.attempts} 条练习历史，${r.answer_sets} 套答案`);
}
