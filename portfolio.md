---
title: "高项学习器"
description: "软考高项备考工具：过程域可视化 + 题库练习 + 论文专区，数据云端同步"
tags: ["Vue 3", "Vercel", "Neon", "PostgreSQL", "Serverless"]
demoUrl: "https://ruankao-senior.vercel.app"
githubUrl: "https://github.com/Bovia/ruankao-senior"
date: "2026-06"
---

## 为什么做这个

备考信息系统项目管理师（软考高项）时，市面上的题库 App 要么广告满天飞、要么按月收费，而我只需要一个能跑在手机上、离线也能用、记录自己做题历史的轻量工具。与其花时间找合适的，不如花时间把它做出来。

## 它解决了什么

把十大知识域的 ITTO 过程可视化展示，让死记硬背变成可点击的结构图；内置综合题、模拟题、知识域刷题三种练习模式，答题记录和错题本实时保存到云端，换设备登录即可继续。论文专区收录了论文写作框架和量化表达句，备考后期直接当素材库用。

## 一个值得说的技术决定

最初所有数据都存在 `localStorage`，多设备同步是个死结。后来引入 Neon Serverless Postgres + Vercel Functions 做了一层 REST API，但不想强迫用户注册账号——于是把"锁屏"改成了用户名输入框：输入已有用户名直接登录，输入新名字自动注册，JWT 静默颁发，整个过程对用户完全透明。

```js
// 登录即注册，对前端只暴露一个方法
async loginOrRegister(username) {
  const res = await this._post('/api/auth/login', { username });
  if (res.ok) return res;
  // 401 → 说明是新用户，自动注册
  return this._post('/api/auth/register', { username });
}
```

## 结果

自用为主，但把链接分享给了几个一起备考的朋友后，收到的第一条反馈是"题目解析比培训班的课件清楚"。备考期间每天打开率比任何笔记 App 都高，这大概就是把工具做给自己用的好处。
