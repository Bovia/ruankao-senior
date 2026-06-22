import bcrypt from 'bcryptjs';
import { getDb } from '../_lib/db.js';
import { signToken, cors } from '../_lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (username.length < 2 || username.length > 50) {
    return res.status(400).json({ error: '用户名长度 2-50 字符' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }

  try {
    const sql = getDb();
    const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: '用户名已存在' });
    }
    const hash = await bcrypt.hash(password, 10);
    const rows = await sql`
      INSERT INTO users (username, password_hash)
      VALUES (${username}, ${hash})
      RETURNING id, username
    `;
    const user = rows[0];
    const token = signToken({ userId: user.id, username: user.username });
    return res.status(201).json({ token, username: user.username, userId: user.id });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
}
