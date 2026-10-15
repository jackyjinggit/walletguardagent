# AgentGuard 本地交互原型

此原型包含聊天首页、任务预算摘要和详情抽屉，并使用 DSH Harness 实际聊天。采购付款、链上操作和报告交付均为模拟；这不表示 WalletConnect、多签或审计能力已实现。

请在仓库根目录启动服务：

```sh
npm start
```

然后访问 <http://127.0.0.1:4173>。

## AgentGuard local UI

From the repository root, run `npm start` to serve `dist/` on `http://127.0.0.1:4173` and connect chat to the installed DeepSeek Harness ACP profile.

The server requires the `dsh` CLI and its bundled Agent Client Protocol SDK. It launches a separate `dsh --profile acp` process for AgentGuard, with a temporary process-only patch that disables every configured `tool-*` entry and the filesystem/shell providers. The ACP client advertises no filesystem or terminal capabilities and rejects permission requests. Each chat POST creates an independent AgentGuard session in its own empty temporary directory; it never resumes or reads other DSH conversations. The DSH process reads its existing provider configuration and credentials itself; this server does not copy credentials into the UI or the repository.

The API is intentionally narrow: `GET /api/health` and `POST /api/chat`. Each chat request creates a fresh ACP session in its own empty temporary directory and passes the validated message history for that request only; the session is closed when DSH advertises ACP `session/close` support, and otherwise its client reference is disposed and never reused. The server does not resume or read prior DSH conversations. Budget context accepts only the UI's non-sensitive state fields (`balanceMilliMon`, `cumulativeLimitMilliMon`, `perPurchaseLimitMilliMon`, `spentMilliMon`, `remainingMilliMon`, `budgetAuthorized`, `authorizationRevoked`, and `currentTask`). Money fields must be integer milliMON values in range; 1000 milliMON equals 1 MON. Live values take priority over the product defaults in the prompt. The assistant can propose purchases and explain controls, while payment, authorization, chain activity, and report delivery remain outside the model and simulated in this demo.

If `4173` is occupied, stop the existing local static server and start this server with `PORT=4173 npm start`. `PORT` can be set to another local port for development.
