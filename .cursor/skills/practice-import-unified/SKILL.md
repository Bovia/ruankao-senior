---
name: practice-import-unified
description: >-
  统一处理练习场题库导入与答案导入：自动判断“新试卷/已有试卷/十大知识域”，无法判断时先询问；新卷按现有命名创建，已有卷做增量答案导入并分配到 mtt 或 bovia。用户提到导题、导入题库、导入答案、zonghe/moni、zhishiyu、practice_sets、初始化作答时使用。
---

# 练习场统一导入技能（新卷 + 答案 + 知识域）

## 目标

1. 一个入口统一处理：
   - 新试卷导入（综合/模拟）
   - 已有试卷导入答案（分配 `mtt` / `bovia`）
   - 十大知识域批量导入
2. 保持现有仓库文件布局与命名，不新建临时命名文件，不乱放路径。
3. 默认增量更新，只修改目标试卷与目标用户。

## 先判断再执行（必须）

收到用户文件（可能一套或多套）后按顺序：

1. 先尝试从标题/结构判断导入意图：
   - 新试卷（综合/模拟）
   - 已有试卷答案
   - 十大知识域汇总
2. 若判断不清，必须先问：
   - `是导入新的试卷吗？`
   - `如果不是新卷，请确认是十大知识域、综合、还是模拟题？`
3. 若是“已有试卷导入答案”，必须再问：
   - `答案分配给谁？mtt 还是 bovia？`

## 分支 A：新试卷导入（综合/模拟）

### 命名与落盘（遵循现有规则）

- 综合题：
  - `data/practice/zonghe_n.md`
  - `data/practice/zonghe_n.js`
  - `practice_sets.js` 的 `key: "zonghe_n"`
- 模拟题（按当前仓库规则）：
  - `data/practice/moni_n.md`
  - `data/practice/moni_n.js`
  - `practice_sets.js` 的 `key: "moni_n"`

### 处理步骤

1. 检查目标 `key` 是否已存在于 `data/practice_sets.js`。
2. 不存在才建新卷：
   - 将 `.md` 内容嵌入 `data/practice/<key>.js`：
     - `(window.practiceMarkdown = window.practiceMarkdown || {})["<key>"] = \`...\`;`
   - 在 `data/practice_sets.js` 注册新条目：
     - 综合放 `comprehensive`，模拟放 `mock`
   - 在 `index.html` 中 `app.js` 前引入 `./data/practice/<key>.js`
3. 已存在则不要重复建卷，转分支 B（导答案）。

## 分支 B：已有试卷导入答案（增量）

### 数据目标

- localStorage 键：`jiyiqi-practice-user-answers-v1`
- 结构：`bySetKey[setKey][originIndex] = "A"|"B"|"C"|"D"`
- 同步写入：`data/export_my_answers_and_history.json` 的
  - `items["jiyiqi-practice-user-answers-v1"]`
  - `practiceProfiles.answersProfiles.<uid>.bySetKey[setKey]`

### 处理步骤

1. 从目标试卷 `data/practice/<setKey>.js`（或用户提供题文）提取：
   - 匹配 `你的答案：**X**` 或 `你的答案：X`
2. 规范化答案：去空白、取首字母、转大写（`A-Z`）。
3. 仅增量更新指定 `setKey` 到指定用户 `<uid>`（`mtt`/`bovia`）：
   - 不覆盖其他用户
   - 不覆盖该用户其他 `setKey`
4. 不把“你的答案”回写到题库 Markdown。

## 分支 C：十大知识域批量导入（zhishiyujihe）

### 输入与输出

- 输入：`data/practice/zhishiyujihe.md`
- 输出（固定 10 个）：
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

### 章节映射

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

### 解析规则

- 题干：`^\d+、\s*\[单选\]\s*(.+)$`
- 选项：`^([A-D])[:：]\s*(.+)$`
- 正确答案：`正确答案[:：]\s*([A-D])`
- 我的答案：`你的答案[:：]\s*([A-D])`
- 解析：`解析[:：]` 到题块末尾

### 用户答案分配

- 若用户意图是“导答案”，同样先确认分配对象：`mtt` / `bovia`
- 写入：
  - `practiceProfiles.attemptsProfiles.<uid>`
  - `practiceProfiles.answersProfiles.<uid>`（保留对象，可为空）
- 默认增量，不覆盖其他用户。

## 统一注意事项

1. 保持现有文件结构，不新造导出文件名。
2. 仅在确有必要时改 `index.html` 与 `practice_sets.js`。
3. 修改后检查：
   - 目标脚本已引入
   - `key` 与文件名一致
   - 数据结构与现有仓库兼容
