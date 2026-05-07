---
name: zhishiyu-batch-import
description: 批量解析 `data/practice/zhishiyujihe.md`，生成十个知识域题库脚本 `data/zhishiyu_*.js`，并把“你的答案”写入 `data/export_my_answers_and_history` 的 mtt 档案。用户提到知识域批量导题、zhishiyujihe、zhishiyu_*.js、mtt 初始化答案时使用。
disable-model-invocation: true
---

# 知识域批量导入（zhishiyujihe.md → zhishiyu_*.js）

## 目标

1. 从 `data/practice/zhishiyujihe.md` 解析 10 个知识域单选题。
2. 生成 `data/zhishiyu_*.js`，覆盖对应 `window.knowledgeData[domainId].quiz`。
3. 解析“你的答案”，写入 `data/export_my_answers_and_history.json` 的 `practiceProfiles.attemptsProfiles.mtt`。
4. 同步 `data/export_my_answers_and_history.js`（`window.__PRACTICE_SEED_DATA__`）。

## 输出文件命名

- `data/zhishiyu_integration.js`
- `data/zhishiyu_scope.js`
- `data/zhishiyu_schedule.js`
- `data/zhishiyu_cost.js`
- `data/zhishiyu_quality.js`
- `data/zhishiyu_resource.js`
- `data/zhishiyu_communications.js`
- `data/zhishiyu_risk.js`
- `data/zhishiyu_procurement.js`
- `data/zhishiyu_stakeholder.js`

## 章节到 domainId 映射

- 项目整合管理 → `integration`
- 项目范围管理 → `scope`
- 项目进度管理 → `schedule`
- 项目成本管理 → `cost`
- 项目质量管理 → `quality`
- 项目资源管理 → `resource`
- 项目沟通管理 → `communications`
- 项目风险管理 → `risk`
- 项目采购管理 → `procurement`
- 项目干系人管理 → `stakeholder`

说明：`项目立项管理` 不在 10 知识域映射内，默认跳过。

## 题目解析规则

- 题干：`^\d+、\s*\[单选\]\s*(.+)$`
- 选项：`^([A-D])[:：]\s*(.+)$`
- 正确答案：`正确答案[:：]\s*([A-D])`
- 我的答案：`你的答案[:：]\s*([A-D])`
- 解析：`解析[:：]` 到该题块末尾

输出题目对象结构：

```js
{
  question: "...",
  type: "单选题",
  options: ["A：...", "B：...", "C：...", "D：..."],
  answer: "A",
  analysis: "...",
  userAnswer: "B"
}
```

## mtt 历史记录写入规则

- 每个 domain 生成 1 条 attempt（首次历史）：
  - `bundleKey = "quiz|domain|<domainId>||"`
  - `choices` 来自“你的答案”
  - `answerMap` 来自“正确答案”
  - `wrongOriginIndices` 仅统计已作答且答错
  - `practiceLayer = "domain"`
  - `activeDomainId = <domainId>`
- 写入：
  - `practiceProfiles.attemptsProfiles.mtt`
  - `practiceProfiles.answersProfiles.mtt` 保留对象（可为空）

## 完成后检查

1. `index.html` 已在 `app.js` 前引入 10 个 `zhishiyu_*.js`。
2. 10 个输出文件都存在且可执行（IIFE 形式）。
3. `export_my_answers_and_history.json` 与 `.js` 内容一致。
4. 打开页面后知识域题库来自新脚本，不再使用旧 quiz 数据。
