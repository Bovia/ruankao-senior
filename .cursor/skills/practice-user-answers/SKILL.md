---
name: practice-user-answers
description: >-
  为「练习场」生成/维护“我的答案”独立配置（不污染题库 Markdown 解析）。当用户提到：导出 JSON、解析 data/practice、初始化我的答案、清洗你的答案/你的作答、从 zonghe_n 或 moni_n 抽取答案、或希望用导入项目缓存初始化作答数据时使用。
---

# 练习场「我的答案」配置（导出/导入初始化）

目标：把题库 `data/practice/*.js` 里的「你的答案」抽取出来，生成独立配置写入本地缓存键 `jiyiqi-practice-user-answers-v1`，并通过“导入项目缓存”初始化。**题库 Markdown 不再解析/展示「你的作答」**，避免影响阅读解析。

## 数据结构（写入 localStorage）

- **key**：`jiyiqi-practice-user-answers-v1`
- **value**：JSON 字符串，格式：

```json
{
  "v": 1,
  "bySetKey": {
    "zonghe_1": { "0": "D", "1": "A" },
    "zonghe_2": { "0": "A" },
    "moni_1":   { "0": "A" }
  },
  "generatedAt": 0
}
```

- `bySetKey[setKey][originIndex] = 'A'|'B'|'C'|'D'`
- `setKey` 对应 `data/practice_sets.js` 里的 `key`
- `originIndex` 为题序（0-based）

## 抽取规则

从 `data/practice/<setKey>.js` 中的模板字符串里按题切块，匹配：

- `你的答案：**X**` 或 `你的答案：X`

抽取出的答案需：

- 去空白
- 提取首个字母并转大写（`A-Z`）
- 空值/无匹配则不写入该题（表示未作答）

## 导出为“导入项目缓存”JSON

导出格式必须与项目已有“导入项目缓存”兼容：

```json
{
  "v": 1,
  "exportedAt": 0,
  "keys": ["jiyiqi-practice-user-answers-v1"],
  "items": {
    "jiyiqi-practice-user-answers-v1": "<上面 value 的 JSON 字符串>"
  }
}
```

## 执行步骤（建议实现）

1. 读取 `data/practice_sets.js`，拿到所有 `setKey`（如 `zonghe_1`、`moni_1`）。
2. 逐个读取 `data/practice/<setKey>.js`，提取模板字符串内容。
3. 按题号切块，抽取每题「你的答案」得到 `bySetKey`。
4. 生成导入 JSON，直接给用户粘贴到“导入项目缓存”。

## 注意事项

- 只生成/维护 `jiyiqi-practice-user-answers-v1`，不要把答案写回题库 Markdown。
- UI 中不展示“你的作答”，但可用于“只看错题/只对题”筛选。

