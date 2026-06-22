/**
 * 一次性迁移脚本：把 export_my_answers_and_history.json 导入 Neon
 * 同时为有答案但缺做题记录的套卷，根据答案 + 题库解析合成记录
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

// ── 解析练习题库标准答案 ────────────────────────────────────────────────────
function extractAnswersFromPracticeJs(setKey) {
  const filePath = join(ROOT, 'data/practice', `${setKey}.js`);
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
  // 提取反引号内的 markdown
  const m = content.match(/`([\s\S]*)`/);
  if (!m) return null;
  const markdown = m[1];

  // 按题号切割
  const blocks = markdown.split(/\n(?=\d+[、，,.]\s)/);
  const answers = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || !/^\d+/.test(trimmed)) continue;
    const boldMatch = trimmed.match(/正确答案[：:]\s*\*\*([^*]+)\*\*/);
    const plainMatch = trimmed.match(/正确答案[：:]\s*([A-Za-z])(?=\s|\n|$)/);
    const ans = boldMatch ? boldMatch[1].trim() : plainMatch ? plainMatch[1].trim() : '';
    answers.push(ans.toUpperCase());
  }
  return answers;
}

// 套卷元数据：key → { id, layer, title }
const SETS_META = {
  zonghe_1:  { id: 'comp-1',  layer: 'comprehensive', title: '综合题1' },
  zonghe_2:  { id: 'comp-2',  layer: 'comprehensive', title: '综合题2' },
  zonghe_3:  { id: 'comp-3',  layer: 'comprehensive', title: '综合题3' },
  zonghe_4:  { id: 'comp-4',  layer: 'comprehensive', title: '综合题4' },
  zonghe_5:  { id: 'comp-5',  layer: 'comprehensive', title: '综合题5' },
  zonghe_6:  { id: 'comp-6',  layer: 'comprehensive', title: '综合题6' },
  zonghe_7:  { id: 'comp-7',  layer: 'comprehensive', title: '综合题7' },
  zonghe_8:  { id: 'comp-8',  layer: 'comprehensive', title: '综合题8' },
  zonghe_9:  { id: 'comp-9',  layer: 'comprehensive', title: '综合题9' },
  zonghe_10: { id: 'comp-10', layer: 'comprehensive', title: '综合题10' },
  zonghe_11: { id: 'comp-11', layer: 'comprehensive', title: '综合题11' },
  zonghe_12: { id: 'comp-12', layer: 'comprehensive', title: '综合题12' },
  moni_1:    { id: 'mock-1',  layer: 'mock', title: '模拟题1' },
  moni_2:    { id: 'mock-2',  layer: 'mock', title: '模拟题2' },
};

function bundleKeyForSet(setKey) {
  const m = SETS_META[setKey];
  if (!m) return null;
  return m.layer === 'mock'
    ? `quiz|mock|||${m.id}`
    : `quiz|comprehensive||${m.id}|`;
}

// 根据用户答案 + 标准答案 合成一条做题记录
function buildAttemptRecord(setKey, userChoices, standardAnswers, tsSeed) {
  const meta = SETS_META[setKey];
  if (!meta || !standardAnswers || !standardAnswers.length) return null;
  const total = standardAnswers.length;
  const answerMap = {};
  const choices = {};
  const wrongOriginIndices = [];
  let correct = 0;
  for (let i = 0; i < total; i++) {
    const k = String(i);
    const ans = (standardAnswers[i] || '').toUpperCase();
    const user = (userChoices[k] || '').toUpperCase();
    answerMap[k] = ans;
    if (user) choices[k] = user;
    if (user && ans && user === ans) {
      correct++;
    } else if (user && ans && user !== ans) {
      wrongOriginIndices.push(i);
    }
  }
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const bk = bundleKeyForSet(setKey);
  return {
    id: `seed-${meta.id}-1`,
    bundleKey: bk,
    ts: tsSeed,
    title: meta.title,
    total,
    correct,
    percent,
    choices,
    answerMap,
    wrongOriginIndices,
    isDraft: false,
    practiceLayer: meta.layer,
    activeDomainId: '',
    activeComprehensiveId: meta.layer === 'comprehensive' ? meta.id : '',
    activeMockId: meta.layer === 'mock' ? meta.id : '',
  };
}

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
  console.log(`  ${username}: 插入 ${count} 条做题记录`);
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
  console.log(`  ${username}: 插入/更新 ${count} 套题目答案`);
}

// 补全缺失的做题记录（有答案但无历史记录的套卷）
async function hydrateMissingAttempts(userId, username, userAnswersBySetKey, existingBundleKeys) {
  let count = 0;
  let tsBase = Date.now() - 1000 * 60 * 60 * 24 * 30; // 30天前作为种子时间戳
  for (const [setKey, userChoices] of Object.entries(userAnswersBySetKey)) {
    const bk = bundleKeyForSet(setKey);
    if (!bk) continue;
    if (existingBundleKeys.has(bk)) continue; // 已有记录，跳过
    if (!userChoices || typeof userChoices !== 'object' || !Object.keys(userChoices).length) continue;

    const standardAnswers = extractAnswersFromPracticeJs(setKey);
    if (!standardAnswers || !standardAnswers.length) {
      console.log(`  ⚠ ${setKey}: 无法解析题库，跳过`);
      continue;
    }

    const attempt = buildAttemptRecord(setKey, userChoices, standardAnswers, tsBase++);
    if (!attempt) continue;

    await sql`
      INSERT INTO practice_attempts (user_id, bundle_key, data, ts)
      VALUES (${userId}, ${bk}, ${JSON.stringify(attempt)}, ${attempt.ts})
      ON CONFLICT (user_id, bundle_key, ts) DO NOTHING
    `;
    console.log(`  ✓ ${setKey} (${bk}): ${attempt.correct}/${attempt.total} = ${attempt.percent}%`);
    count++;
  }
  console.log(`  ${username}: 补全 ${count} 条缺失做题记录`);
}

console.log('开始迁移/补全种子数据到 Neon...\n');

// 查询当前已有的 bundle_key
const boviaBundleRows = await sql`SELECT DISTINCT bundle_key FROM practice_attempts WHERE user_id = 1`;
const boviaBundleKeys = new Set(boviaBundleRows.map(r => r.bundle_key));
const mttBundleRows = await sql`SELECT DISTINCT bundle_key FROM practice_attempts WHERE user_id = 2`;
const mttBundleKeys = new Set(mttBundleRows.map(r => r.bundle_key));

// bovia (user_id = 1)
console.log('【bovia】');
await insertAttempts(1, 'bovia', boviaAttemptsRaw);
await insertAnswers(1, 'bovia', boviaAnswers);
console.log('  → 补全缺失做题记录：');
await hydrateMissingAttempts(1, 'bovia', boviaAnswers, boviaBundleKeys);

// mtt (user_id = 2)
console.log('\n【mtt】');
await insertAttempts(2, 'mtt', mttAttempts);
await insertAnswers(2, 'mtt', mttAnswers);
if (Object.keys(mttAnswers).length > 0) {
  console.log('  → 补全缺失做题记录：');
  await hydrateMissingAttempts(2, 'mtt', mttAnswers, mttBundleKeys);
}

// 验证
const rows = await sql`
  SELECT u.username,
    COUNT(DISTINCT a.bundle_key) as attempt_bundles,
    COUNT(DISTINCT pa.set_key) as answer_sets
  FROM users u
  LEFT JOIN practice_attempts a ON a.user_id = u.id
  LEFT JOIN practice_answers pa ON pa.user_id = u.id
  GROUP BY u.username
  ORDER BY u.username
`;
console.log('\n✅ 迁移完成，当前数据库状态：');
for (const r of rows) {
  console.log(`  ${r.username}: ${r.attempt_bundles} 套做题记录，${r.answer_sets} 套答案`);
}
