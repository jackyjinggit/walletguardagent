# walletguardagent

Web3 链上页面：协助记账（合规）+ 协助决策（多人协作 + 审计追溯）+ 最后静态跳转到 Monad 链上页面（采购账本公示 + 决策可验证）。

## Owner

蒋平 (Jacky Jiang) — GitHub: @jackyjinggit

## 任务板

[飞书任务板（4 段需求：目标 / 关键日期 / 范围 / 需求清单）](https://ucnrju0zujaw.feishu.cn/docx/R3OXdfX5loqkpxxhzmmcdubCn0b)

## 关键日期

- 10-16 启动会
- 10-17~19 mock 端到端
- 10-20~24 Monad 测试网端到端
- 10-25~28 完整 demo
- 10-29~31 评审材料

## 协作方式

Fork → clone → branch → PR → **Review → Merge**

长期更新 + 最终 merge。

## 需求（按任务板）

### 蒋平

- Web 端 UI（采购录入 / 审批流 / 账本展示）
- WalletConnect 集成
- Monad 静态跳转页（独立页 + explorer 链接）
- 最后交易 owner 签 Approve

### 董鹏

- 采购订单合约（Solidity 多签）
- 记账事件 + 决策 hash 上链
- Monad 测试网 deploy

### 刘志

- 采购数据接入
- AI 推理（合规校验 + 决策建议）
- owner 签名代发
- 链上事件订阅
- 审计报告
- 异常检测
- 链上/链下数据汇总
- 决策可追溯