/**
 * 记忆器 — 后端 API 客户端
 *
 * 使用方式：
 *   - 登录后调用 ApiClient.init(token)
 *   - 所有方法均返回 Promise，失败时 resolve { error: '...' }
 *   - 离线/未登录时返回 { offline: true }，调用方可降级为 localStorage
 */

const ApiClient = (() => {
  // 生产环境填 Vercel 域名，本地开发自动用 localhost
  const BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : '';

  let _token = null;

  function _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (_token) h['Authorization'] = `Bearer ${_token}`;
    return h;
  }

  async function _request(method, path, body) {
    if (!navigator.onLine) return { offline: true };
    try {
      const opts = { method, headers: _headers() };
      if (body !== undefined) opts.body = JSON.stringify(body);
      const res = await fetch(`${BASE}${path}`, opts);
      const json = await res.json();
      if (!res.ok) return { error: json.error || `HTTP ${res.status}` };
      return json;
    } catch (e) {
      console.warn('[ApiClient]', path, e.message);
      return { offline: true };
    }
  }

  return {
    /** 设置登录 Token（登录/注册后调用） */
    init(token) {
      _token = token;
      if (token) localStorage.setItem('jiyiqi-api-token', token);
      else localStorage.removeItem('jiyiqi-api-token');
    },

    /** 从 localStorage 恢复 Token（页面刷新时） */
    restore() {
      _token = localStorage.getItem('jiyiqi-api-token') || null;
      return !!_token;
    },

    isLoggedIn() { return !!_token; },

    // ── 认证 ────────────────────────────────────────────────────────────────

    async login(username, password) {
      const res = await _request('POST', '/api/auth/login', { username, password });
      if (res.token) this.init(res.token);
      return res;
    },

    async register(username, password) {
      const res = await _request('POST', '/api/auth/register', { username, password });
      if (res.token) this.init(res.token);
      return res;
    },

    /**
     * 用 username 做 key，自动登录；账号不存在则自动注册。
     * 用于解锁时静默初始化云同步，失败不影响本地使用。
     */
    async loginOrRegister(username) {
      const pwd = username + '_jiyiqi';
      const loginRes = await this.login(username, pwd);
      if (loginRes.token) return loginRes;
      // 404/401 → 首次注册
      if (loginRes.error && !loginRes.offline) {
        return await this.register(username, pwd);
      }
      return loginRes;
    },

    logout() { this.init(null); },

    // ── 练习历史 ─────────────────────────────────────────────────────────────

    /** 获取练习历史（可选按 bundleKey 过滤） */
    getAttempts(bundleKey) {
      const q = bundleKey ? `?bundleKey=${encodeURIComponent(bundleKey)}` : '';
      return _request('GET', `/api/practice/attempts${q}`);
    },

    /** 新增一条练习记录 */
    addAttempt(bundleKey, data, ts) {
      return _request('POST', '/api/practice/attempts', { bundleKey, data, ts });
    },

    // ── 题目答案 ─────────────────────────────────────────────────────────────

    /** 获取某套卷答案（不传 setKey 则获取全部） */
    getAnswers(setKey) {
      const q = setKey ? `?setKey=${encodeURIComponent(setKey)}` : '';
      return _request('GET', `/api/practice/answers${q}`);
    },

    /** 保存某套卷答案（upsert） */
    saveAnswers(setKey, answers) {
      return _request('PUT', '/api/practice/answers', { setKey, answers });
    },

    // ── 收藏 / 笔记 ──────────────────────────────────────────────────────────

    getFavorites() {
      return _request('GET', '/api/favorites');
    },

    addFavorite(item) {
      return _request('POST', '/api/favorites', item);
    },

    deleteFavorite(id) {
      return _request('DELETE', `/api/favorites?id=${encodeURIComponent(id)}`);
    },

    /** 批量覆盖同步（首次从 localStorage 迁移时用） */
    syncFavorites(items) {
      return _request('PUT', '/api/favorites', { items });
    },

    // ── 案例草稿 ─────────────────────────────────────────────────────────────

    getCaseDrafts(bundleKey) {
      const q = bundleKey ? `?bundleKey=${encodeURIComponent(bundleKey)}` : '';
      return _request('GET', `/api/case-drafts${q}`);
    },

    saveCaseDraft(bundleKey, state) {
      return _request('PUT', '/api/case-drafts', { bundleKey, state });
    },

    // ── 我的论文 ─────────────────────────────────────────────────────────────

    getMyEssay() {
      return _request('GET', '/api/my-essay');
    },

    saveMyEssay(data) {
      return _request('PUT', '/api/my-essay', { data });
    },

    // ── 斩题记录 ─────────────────────────────────────────────────────────────

    getSlashRecords() {
      return _request('GET', '/api/slash-records');
    },

    saveSlashRecord(category, data) {
      return _request('PUT', '/api/slash-records', { category, data });
    },

    // ── 全量同步 ─────────────────────────────────────────────────────────────

    /** 一次性拉取所有个人数据 */
    getAllUserData() {
      return _request('GET', '/api/sync');
    },

    /** 一次性上传所有个人数据（首次迁移） */
    uploadAllUserData(payload) {
      return _request('PUT', '/api/sync', payload);
    },
  };
})();

// 页面加载时自动恢复登录状态
ApiClient.restore();
