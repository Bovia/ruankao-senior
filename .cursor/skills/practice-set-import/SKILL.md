---
name: practice-set-import
description: >-
  为高项学习器「练习场」新增综合题/模考套卷：将 Markdown 题库嵌入为 JS、注册 practice_sets、在 index.html 引入脚本。
  命名规则 zonghe_n / mock_n。在用户新增套卷、导入题库、或提到 practice_sets / data/practice 时使用。
---

# 练习场套卷导入指南（Markdown → 嵌入 JS）

本仓库练习场数据流：**`.md` 原文 → 包进 `data/practice/*.js` → `window.practiceMarkdown[key]` → `parsePracticeMarkdown()` → 题卡 UI**。

相关文件：

- `data/practice_sets.js` — 套卷列表（`id`、`title`、`summary`、`key`）
- `data/practice/zonghe_n.js` — 嵌入的 Markdown 字符串（**不是**裸 `.md` 运行时读取）
- `index.html` — 在 `app.js` 之前增加对应 `<script src="./data/practice/zonghe_n.js">`
- `app.js` — `parsePracticeMarkdown()`、`window.practiceMarkdown` 读取逻辑（一般无需改）

## 命名规则

| 类型   | Markdown 源文件（编辑用） | 嵌入后的 JS 文件        | `practice_sets.js` 里的 `key` |
|--------|---------------------------|-------------------------|-------------------------------|
| 综合题 | `data/practice/zonghe_n.md` | `data/practice/zonghe_n.js` | `"zonghe_n"`                  |
| 模考   | `data/practice/mock_n.md`   | `data/practice/mock_n.js`   | `"mock_n"`                    |

`key` 必须与 JS 里 `practiceMarkdown["..."]` 的键名完全一致（不含 `.js`）。

## 第一步：由 `.md` 生成嵌入用 `.js`

在仓库根目录执行（将 `zonghe_2` 换成实际键名，如 `zonghe_3`、`mock_1`）：

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
KEY=zonghe_2
printf '(window.practiceMarkdown = window.practiceMarkdown || {})["%s"] = `\n' "$KEY" > "data/practice/${KEY}.js"
cat "data/practice/${KEY}.md" >> "data/practice/${KEY}.js"
printf '\n`;\n' >> "data/practice/${KEY}.js"
```

**注意：** 若 Markdown 正文中包含反引号 `` ` ``，会破坏模板字符串。先检查：

```bash
grep -c '`' "data/practice/${KEY}.md"
```

若大于 0，需改用转义、或改为 JSON 字符串拼接等非模板字面量方案（再让 Agent 处理）。

## 第二步：注册并加载

1. **`index.html`**  
   在 `./data/practice_sets.js` 之后、`./app.js` 之前增加一行：

   ```html
   <script src="./data/practice/zonghe_2.js"></script>
   ```

2. **`data/practice_sets.js`**  
   在 `comprehensive` 或 `mock` 数组中追加一项，例如：

   ```js
   { id: "comp-2", title: "综合题2", summary: "简述本套内容。", key: "zonghe_2" }
   ```

   - `id` 在同类数组内唯一即可（与 `key` 不必相同）。
   - 模考套卷写在 `mock` 数组里，`id` 建议 `mock-1` 等形式。

## 喂给 Agent 时的最短指令模板

可复制：

> 按仓库 `.cursor/skills/practice-set-import/SKILL.md`：我已放好 `data/practice/zonghe_N.md`，请生成 `zonghe_N.js`、改 `index.html` 和 `practice_sets.js`。

## Markdown 格式约定（与解析器一致）

解析器期望题干形如：`数字、 *[单选]* …`；选项形如 `-  A：…`；答案行含 `正确答案：**X**`；解析以 `解析：` 开头。若格式变化导致题数不对，需改 `app.js` 中的 `parsePracticeMarkdown`（与本 skill 无关时再单独处理）。
