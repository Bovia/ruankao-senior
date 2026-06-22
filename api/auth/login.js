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

  try {
    const sql = getDb();
    const rows = await sql`SELECT id, username, password_hash FROM users WHERE username = ${username}`;
    if (rows.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const token = signToken({ userId: user.id, username: user.username });
    return res.status(200).json({ token, username: user.username, userId: user.id });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
}
