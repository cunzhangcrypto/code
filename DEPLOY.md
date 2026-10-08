# 部署步骤

## 架构

```
Cloudflare Pages（public/ 静态前端）
        │
        ▼
Pages Functions（functions/ 下的 Workers 运行时，处理 /api/*）
        │
        ▼
Cloudflare D1（codes / code_copies 两张表）
```

部署由 GitHub Actions 手动触发，脚本见 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)。
**不要在 Cloudflare 控制台手动绑定 D1** —— 绑定写在 `wrangler.toml` 里，部署时由工作流把真实的 `database_id` 注入进去。

---

## 1. 前置条件

- 一个 Cloudflare 账号
- 本仓库已推送到 GitHub
- 本地开发需要 Node 18+（CI 用 Node 22）

---

## 2. 创建 Cloudflare API Token

打开 <https://dash.cloudflare.com/profile/api-tokens> → **Create Token** → **Create Custom Token**。

权限（Permissions）：

| 范围 | 资源 | 权限 |
| --- | --- | --- |
| Account | Cloudflare Pages | Edit |
| Account | D1 | Edit |
| Account | Account Settings | Read |

Account Resources 选 **Include → 你的账号**。

创建后**立刻复制 token**（关闭页面就看不到了）。

---

## 3. 拿到 Account ID

Cloudflare 控制台右侧栏有 **Account ID**（32 位十六进制字符串），或者本地执行：

```bash
npx wrangler whoami
```

---

## 4. 配置 GitHub Secrets

仓库 → **Settings → Secrets and variables → Actions**。

### Secrets（必填项）

| 名称 | 说明 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 第 2 步创建的 token |
| `CLOUDFLARE_ACCOUNT_ID` | 第 3 步拿到的 ID |

### Secrets（可选项）

| 名称 | 说明 |
| --- | --- |
| `D1_DATABASE_ID` | 指定要绑定的 D1 数据库。**不填**时工作流会按名字查找 `muse-codes-db`，不存在就自动创建。 |

### Variables（非敏感的配置，可选）

在同一个页面的 **Variables** 标签下添加：

| 名称 | 默认值 | 说明 |
| --- | --- | --- |
| `PAGES_PROJECT` | `muse-codes` | Pages 项目名，决定 `<名字>.pages.dev` 子域名 |
| `D1_NAME` | `muse-codes-db` | D1 数据库名 |

---

## 5. 触发部署

仓库 → **Actions** → 左侧选 **🚀 Deploy Muse兑换码 to Cloudflare Pages** → **Run workflow** → 分支选 `main` → **Run workflow**。

工作流依次做六件事：

1. 校验并 trim Secrets（缺 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 会直接报错退出）
2. 解析 D1 数据库，不存在则创建；有 `D1_DATABASE_ID` 则直接用
3. 把数据库 ID 注入 `wrangler.toml` 的 `database_id`
4. 执行 `schema.sql` 建表（`CREATE TABLE IF NOT EXISTS`，可重复跑）
5. 确保 Pages 项目存在（已存在时该步跳过）
6. `wrangler pages deploy` 发布到 Cloudflare Pages

跑完后日志里会输出部署地址，形如 `https://muse-codes.pages.dev`。

---

## 6. 本地开发

```bash
npm install
npm run db:init:local   # 建本地 D1 表（数据存在 .wrangler/ 下，已 gitignore）
npm run dev             # http://127.0.0.1:8788
```

本地跑的是真实的 Pages Functions + 本地 D1，接口行为和线上一致。

---

## 7. 以后加功能

改代码 → commit → push 到 `main` → 回到 Actions 手动 Run 一次即可。

`public/` 放静态资源，`functions/api/` 下加文件就会自动生成对应路由（文件名即路径）。

---

## 8. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 工作流报 401 / 403 | API Token 权限不足，对照第 2 步重新建一个 |
| `npm ci` 失败 | `package-lock.json` 和 `package.json` 不同步，本地跑 `npm install` 后一起提交 |
| 部署成功但接口 500 | D1 表没建好，重跑一次工作流（schema 是幂等的） |
| 子域名被占用 | 改 `PAGES_PROJECT` Variable，换成别的项目名 |
| 想绑自定义域名 | Cloudflare 控制台 → Workers & Pages → 该项目 → Custom domains |
| 本地接口报 `env.DB` 未定义 | `wrangler.toml` 里的 `[[d1_databases]]` binding 必须是 `DB` |
