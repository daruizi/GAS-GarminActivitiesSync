# Garmin 运动数据同步工具

![workflow](./assets/workflow.png)

---

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
  - [Web 版本（推荐）](#web-版本推荐)
  - [GitHub Actions 版本](#github-actions-版本)
  - [Docker 定时同步版本（推荐长期运行）](#docker-定时同步版本推荐长期运行)
  - [Docker 手动执行版本](#docker-手动执行版本)
  - [本地运行版本](#本地运行版本)
- [事件驱动触发（可选进阶）](#事件驱动触发可选进阶)
- [配置说明](#配置说明)
- [同步健康度监控](#同步健康度监控)
- [项目结构](#项目结构)
- [常见问题](#常见问题)
- [更新日志](#更新日志)
- [免责声明](#免责声明)

---

## 项目简介

Garmin 运动数据同步工具是一个用于在 Garmin 中国区和国际区之间**同步**和**迁移**运动活动数据的自动化工具。

### 为什么需要这个工具？

- **双区账号用户**：同时使用 Garmin 中国区和国际区的用户，需要手动重复上传活动数据
- **Strava 热力图**：国际区账号可同步至 [Strava 全球热力图](https://www.strava.com/heatmap)
- **国内运动软件联动**：悦跑圈、咕咚、Keep、郁金香等国内 App 可通过中国区账号接收数据
- **微信运动显示**：同步后可在微信运动中显示「Garmin 手表 骑行 xx 分钟」

### 核心功能

| 功能 | 说明 |
|------|------|
| 数据同步 | 自动检测新活动并在两区之间同步 |
| 数据迁移 | 批量迁移历史运动数据 |
| 网络预检 | 同步前自动验证 Garmin 端点连通性，网络异常时秒级失败 |
| 健康度监控 | 追踪同步成功率、连续失败次数，支持连续失败自动暂停保护 |
| RQ 数据采集 | 采集 RunningQuotient 跑力数据并记录到 Google Sheets |
| 消息通知 | 支持 Bark、Telegram、企业微信推送 |

---

## 功能特性

### 1. 同步数据

自动检测源账号的新活动，下载并上传到目标账号。

| 方向 | GitHub Action | 说明 |
|------|---------------|------|
| 中国区 → 国际区 | `Sync Garmin CN to Garmin Global` | 每 6 小时自动检查同步，同步后可在 Strava 热力图显示 |
| 国际区 → 中国区 | `Sync Garmin Global to Garmin CN` | 默认每 3 小时兜底同步；配置 [事件驱动触发](#事件驱动触发可选进阶) 后可在新活动出现的 1-3 分钟内自动同步 |

> **注意**：如无特殊需求，建议只开启一个方向的同步！

#### 同步流程（v2.4.0 增强）

```
网络预检 → 连续失败检查 → 登录源区域 → 获取活动列表 → 去重筛选
→ 登录目标区域 → 逐条下载+上传 → 记录健康度 → 发送通知
```

- **网络预检**：同步前先验证 Garmin CN/Global 端点可达，避免网络故障时浪费登录时间
- **连续失败保护**：连续失败 5 次自动暂停同步，防止触发 Garmin 风控
- **健康度追踪**：每次同步记录成功/失败次数到 SQLite，可随时查看成功率

### 2. 迁移数据

一次性批量迁移历史运动数据，适合首次使用或需要补全历史记录的场景。

| 方向 | GitHub Action | 说明 |
|------|---------------|------|
| 中国区 → 国际区 | `Migrate Garmin CN to Garmin Global` | 手动触发 |
| 国际区 → 中国区 | `Migrate Garmin Global to Garmin CN` | 手动触发 |

可通过环境变量控制迁移数量和起始位置：
- `GARMIN_MIGRATE_NUM`：每次迁移数量（默认 200）
- `GARMIN_MIGRATE_START`：从第几条活动开始（默认 0）

支持**断点续传**：迁移进度自动存入数据库，中断后重试自动从上次位置继续。

### 3. RQ + Google Sheets 数据采集

采集 RunningQuotient 跑力数据与 Garmin 跑步统计，自动写入 Google Sheets，便于长期追踪跑力趋势。

### 4. 消息通知

支持多种通知渠道：

| 渠道 | 说明 |
|------|------|
| Bark | iOS 推送通知 |
| Telegram | Telegram Bot 推送 |
| 企业微信 | 企业微信机器人 Webhook |

---

## 快速开始

### Web 版本（推荐）

如果你不熟悉代码，**强烈推荐使用 Web 版本**，无需任何配置，在网页上填入账号即可同步数据。

🔗 **访问地址**：[https://dailysync.vyzt.dev/](https://dailysync.vyzt.dev/)

### GitHub Actions 版本

适合熟悉 GitHub 的用户，完全自动化运行。

#### 步骤 1：Fork 仓库

将此仓库 Fork 到你的 GitHub 账号下。

#### 步骤 2：配置 Secrets

进入 `Settings` → `Secrets and variables` → `Actions` → `New repository secret`，添加以下配置：

**必填配置：**

| Secret 名称 | 说明 |
|------------|------|
| `GARMIN_USERNAME` | Garmin 中国区账号（邮箱） |
| `GARMIN_PASSWORD` | Garmin 中国区密码 |
| `GARMIN_GLOBAL_USERNAME` | Garmin 国际区账号（邮箱） |
| `GARMIN_GLOBAL_PASSWORD` | Garmin 国际区密码 |
| `AESKEY` | 数据库加密密钥（至少 16 个字符，建议包含大小写字母、数字和特殊字符） |

**可选配置：**

| Secret 名称 | 说明 |
|------------|------|
| `GARMIN_SYNC_NUM` | 每次同步检查的活动数量（默认 10） |
| `GARMIN_SYNC_DELAY` | 同步延迟时间，单位毫秒（默认 2000） |
| `GARMIN_REQUEST_TIMEOUT` | HTTP 请求超时时间，单位毫秒（默认 30000） |
| `GARMIN_MIGRATE_NUM` | 迁移数量（默认 200） |
| `GARMIN_MIGRATE_START` | 迁移起始位置（默认 0） |

**通知配置（可选）：**

| Secret 名称 | 说明 |
|------------|------|
| `BARK_KEY` | Bark 推送 Key |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token |
| `TELEGRAM_CHAT_ID` | Telegram Chat ID |
| `WECOM_WEBHOOK_URL` | 企业微信机器人 Webhook URL |

**RQ + Google Sheets 配置（可选）：**

| Secret 名称 | 说明 |
|------------|------|
| `RQ_COOKIE` | RunningQuotient Cookie |
| `RQ_CSRF_TOKEN` | RunningQuotient CSRF Token |
| `RQ_USERID` | RunningQuotient 用户 ID |
| `GOOGLE_SHEET_ID` | Google Sheets ID |
| `GOOGLE_API_CLIENT_EMAIL` | Google Service Account 邮箱 |
| `GOOGLE_API_PRIVATE_KEY` | Google Service Account 私钥 |

#### 步骤 3：启用 Actions

进入 `Actions` 页面，选择需要运行的工作流，点击 `Enable workflow`。

- 如需每 3 小时兜底同步 Global → CN，启用 `Sync Garmin Global to Garmin CN`（想要新活动出现后 1-3 分钟内触发，见 [事件驱动触发](#事件驱动触发可选进阶)）
- 如需每 6 小时自动同步 CN → Global，启用 `Sync Garmin CN to Garmin Global`

#### 步骤 4：手动测试

点击 `Run workflow` 手动触发一次测试，确认配置正确。

### Docker 定时同步版本（推荐长期运行）

适合需要在本地机器、NAS 或 VPS 上**7×24 小时自动定时同步**的用户。

#### 步骤 1：拉取代码

```bash
git clone https://github.com/YOUR_USERNAME/GarminActivitiesSync.git
cd GarminActivitiesSync
```

#### 步骤 2：配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入账号密码：

```env
# Garmin 中国区账号
GARMIN_USERNAME=your_email@example.com
GARMIN_PASSWORD=your_password

# Garmin 国际区账号
GARMIN_GLOBAL_USERNAME=your_email@example.com
GARMIN_GLOBAL_PASSWORD=your_password

# 数据库加密密钥（必填，至少16个字符）
AESKEY=YourComplexKey123!@#

# 同步方向：global2cn（国际区→中国区）或 cn2global
SYNC_DIRECTION=global2cn

# Cron 调度计划（默认每小时整点）
CRON_SCHEDULE=0 * * * *
```

#### 步骤 3：启动定时同步

```bash
# 使用 cron profile 启动（后台运行，每小时自动同步）
docker compose --profile cron up -d
```

**自定义同步频率**：修改 `.env` 中的 `CRON_SCHEDULE`：

| 表达式 | 说明 |
|--------|------|
| `0 * * * *` | 每小时整点（默认） |
| `*/30 * * * *` | 每 30 分钟 |
| `0 */2 * * *` | 每 2 小时 |
| `0 */6 * * *` | 每 6 小时 |

**查看日志**：

```bash
docker compose --profile cron logs -f daily-sync-cron
```

**停止定时同步**：

```bash
docker compose --profile cron down
```

#### 步骤 4：查看同步健康度

```bash
# 查看 Global → CN 同步健康度
yarn health:global2cn

# 查看 CN → Global 同步健康度
yarn health:cn2global
```

### Docker 手动执行版本

适合偶尔手动运行一次同步的用户。

```bash
# 同步国际区 → 中国区
docker compose --profile manual run --rm daily-sync yarn sync:global2cn

# 同步中国区 → 国际区
docker compose --profile manual run --rm daily-sync yarn sync:cn2global

# 迁移国际区 → 中国区
docker compose --profile manual run --rm daily-sync yarn migrate:global2cn
```

### 本地运行版本

适合有 Node.js 开发环境的用户。

#### 1. 前置要求

- Node.js 24+（配合自动化引擎与最新 LTS，全面升级）
- 能够访问国际互联网（同步国际区需要）

#### 安装依赖

```bash
# 启用 yarn
corepack enable

# 安装依赖
yarn
```

#### 配置账号

编辑 `.env` 文件或直接修改 `src/config/index.ts` 中的默认值。

#### 运行命令

```bash
# ===== 同步 =====
yarn sync:global2cn      # 同步国际区 → 中国区
yarn sync:cn2global      # 同步中国区 → 国际区

# ===== 迁移 =====
yarn migrate:global2cn   # 迁移国际区 → 中国区
yarn migrate:cn2global   # 迁移中国区 → 国际区

# ===== 监控 =====
yarn health:global2cn    # 查看 Global→CN 同步健康度
yarn health:cn2global    # 查看 CN→Global 同步健康度

# ===== 其他 =====
yarn rq                  # RQ + Google Sheets 同步
yarn test                # 运行测试
yarn format              # 代码格式化
yarn lint                # 代码检查
```

---

## 事件驱动触发（可选进阶）

`Sync Garmin Global to Garmin CN` 默认每 3 小时跑一次兜底同步。如果你想在 Garmin 国际账号一出现新活动时**立即**（1-3 分钟内）自动同步到 Garmin 中国，而不是等待下一次兜底运行，可以借助 Strava 的活动推送作为触发信号：Garmin Connect 国际会自动把每条新活动推送到 Strava，我们用一个免费的 Cloudflare Worker 监听 Strava 的 webhook 事件，一旦收到就直接触发本仓库的同步 workflow（不读取任何 Strava 活动数据，仅作触发信号）。

详见 [`trigger/README.md`](./trigger/README.md)，包含完整的搭建步骤、验证清单和故障排查表。

---

## 配置说明

### 环境变量一览

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `GARMIN_USERNAME` | 中国区账号 | - |
| `GARMIN_PASSWORD` | 中国区密码 | - |
| `GARMIN_GLOBAL_USERNAME` | 国际区账号 | - |
| `GARMIN_GLOBAL_PASSWORD` | 国际区密码 | - |
| `AESKEY` | 数据库加密密钥 | - |
| `GARMIN_SYNC_NUM` | 每次同步检查的活动数量 | 10 |
| `GARMIN_SYNC_DELAY` | 同步延迟时间（毫秒） | 2000 |
| `GARMIN_REQUEST_TIMEOUT` | HTTP 请求超时（毫秒） | 30000 |
| `GARMIN_MIGRATE_NUM` | 每次迁移的活动数量 | 200 |
| `GARMIN_MIGRATE_START` | 迁移起始位置 | 0 |
| `SYNC_DIRECTION` | Docker Cron 同步方向 | global2cn |
| `CRON_SCHEDULE` | Docker Cron 调度计划 | 0 * * * * |
| `BARK_KEY` | Bark 推送 Key | - |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | - |
| `TELEGRAM_CHAT_ID` | Telegram Chat ID | - |
| `WECOM_WEBHOOK_URL` | 企业微信 Webhook | - |
| `RQ_COOKIE` | RQ Cookie | - |
| `RQ_CSRF_TOKEN` | RQ CSRF Token | - |
| `RQ_USERID` | RQ 用户 ID | - |
| `GOOGLE_SHEET_ID` | Google Sheets ID | - |
| `GOOGLE_API_CLIENT_EMAIL` | Google API 邮箱 | - |
| `GOOGLE_API_PRIVATE_KEY` | Google API 私钥 | - |

---

## 同步健康度监控

v2.4.0 引入了同步健康度监控系统，自动追踪每次同步的成功/失败情况。

### 查看健康度

```bash
yarn health:global2cn
```

输出示例：

```
📊 同步健康度报告
────────────────────────────────────────
同步方向: GLOBAL → CN
总成功: 47 次
总失败: 2 次
成功率: 95.9%
连续失败: 0 次
最后成功: 2026-06-30T08:00:12.345Z
最后失败: 2026-06-28T14:00:05.123Z
────────────────────────────────────────
```

### 连续失败保护

当同步**连续失败 5 次**时，系统会自动暂停同步，防止：
- 触发 Garmin API 风控（频繁登录失败可能导致账号临时锁定）
- 在网络长期不可达时无意义地消耗资源

暂停后需要手动检查网络和账号状态，系统会在下次成功同步后自动重置失败计数。

### 健康度数据存储

健康度数据存储在 SQLite 数据库 `db/garmin.db` 的 `sync_health` 表中，与 Session 和同步记录共用同一个数据库文件。

---

## 项目结构

```
GarminActivitiesSync/
├── .github/
│   └── workflows/              # GitHub Actions 工作流
├── src/
│   ├── clients/                # API 客户端
│   │   ├── garmin.ts           # Garmin Connect API（含 Session 智能管理）
│   │   ├── google-sheets.ts    # Google Sheets API
│   │   └── runningquotient.ts  # RunningQuotient API
│   ├── services/               # 业务服务
│   │   ├── sync.ts             # 同步/迁移服务（含预检+健康度）
│   │   ├── notification.ts     # 通知服务
│   │   └── rq-sync.ts          # RQ 同步服务
│   ├── utils/                  # 工具函数
│   │   ├── database.ts         # SQLite 数据库
│   │   ├── crypto.ts           # 加密工具
│   │   ├── logger.ts           # 日志工具
│   │   ├── validation.ts       # 输入验证（Zod）
│   │   ├── rateLimiter.ts      # O(1) 滑动窗口速率限制
│   │   ├── retry.ts            # 指数退避重试
│   │   ├── preflight.ts        # 🆕 网络连通性预检
│   │   ├── syncHealth.ts       # 🆕 同步健康度监控
│   │   ├── format.ts           # 格式化工具
│   │   └── runner.ts           # 任务运行器
│   ├── config/                 # 配置管理
│   ├── types/                  # TypeScript 类型定义
│   ├── health_check.ts         # 🆕 健康度查看命令
│   └── index.ts                # 入口文件
├── tests/                      # 单元测试（77 个测试用例）
├── db/                         # SQLite 数据库文件
├── Dockerfile                  # Docker 手动执行镜像
├── Dockerfile.cron             # 🆕 Docker 定时同步镜像
├── docker-entrypoint.sh        # 🆕 Docker Cron 入口脚本
├── docker-compose.yml          # Docker Compose（manual + cron）
├── eslint.config.mjs           # ESLint Flat Config
├── vitest.config.ts            # 测试配置
├── package.json                # 项目依赖
└── tsconfig.json               # TypeScript 配置
```

---

## 常见问题

### Q: 网络连通性测试失败？

v2.4.0 内置了网络预检功能，同步前会自动检查 Garmin 端点可达性。你也可以手动测试：

**测试国际互联网：**
```bash
ping google.com
```

**测试 Garmin 国际区：**
```bash
ping sso.garmin.com
```

**测试 Garmin 中国区：**
```bash
ping sso.garmin.cn
```

如果 ping 不通，请检查：
1. 是否开启了科学上网
2. 命令行是否也配置了代理（Clash 需开启 TUN Mode）

### Q: 开启了 ECG 功能怎么办？

开启 ECG 功能的佳明账号登录时需要验证码，且无法关闭。GitHub Actions 无法中途输入验证码，建议使用 [Web 版本](https://dailysync.vyzt.dev/)。

### Q: 为什么迁移/同步失败？

1. **网络问题**：尝试更换美国 IP 节点
2. **账号问题**：确认账号密码正确
3. **频率限制**：降低 `GARMIN_SYNC_NUM` 或 `GARMIN_MIGRATE_NUM`
4. **Session 过期**：删除仓库中的 `db/garmin.db` 文件重新登录
5. **连续失败暂停**：查看健康度 (`yarn health:global2cn`)，确认连续失败次数

### Q: 同步日志出现 `HTTP Error (400): Bad Request` / `/preauthorized` 怎么办？

这表示 Garmin 登录端点拒绝了完整 SSO 登录（通常因短时间内频繁登录触发风控）。v2.4.1 已修复 v2.4.0 中每小时触发完整登录的回归——正常情况下 access token 过期会通过 refresh token 静默续期（走 `/exchange/user/2.0`），不会命中 `/preauthorized`。如仍出现：

1. 确认已更新到 **v2.4.1+**
2. 删除 `db/garmin.db` 中的旧 session（让下次运行重新登录）：`rm db/garmin.db`
3. 若账号被 Garmin 临时锁定，等待一段时间（通常数小时）后重试
4. 查看健康度 `yarn health:global2cn` 确认连续失败次数

### Q: 同步被自动暂停了怎么办？

如果看到 "连续失败 X 次，暂停同步" 的消息：
1. 运行 `yarn health:global2cn` 查看详细的失败信息
2. 检查网络连接（特别是访问 Garmin 国际区的网络）
3. 确认账号密码没有变更
4. 问题解决后，手动执行一次 `yarn sync:global2cn` 即可恢复

### Q: Session 解密失败怎么办？

如果看到 `Session 解密失败` 警告：
1. 系统会自动清理无效的旧 Session 并重新登录
2. 确保 `AESKEY` 保持不变，否则每次都会解密失败
3. 如果 AESKEY 曾修改过，可删除 `db/garmin.db` 重新开始

### Q: 如何修改定时执行频率？

**GitHub Actions**：编辑 `.github/workflows/` 下对应的 workflow 文件中的 `cron` 表达式：

```yaml
schedule:
  - cron: "0 */6 * * *"  # 每 6 小时执行一次
```

**Docker Cron**：修改 `.env` 中的 `CRON_SCHEDULE`：

```env
CRON_SCHEDULE=0 */2 * * *  # 每 2 小时执行一次
```

常用 Cron 表达式：
- `0 * * * *` — 每小时
- `*/30 * * * *` — 每 30 分钟
- `0 */2 * * *` — 每 2 小时
- `0 */6 * * *` — 每 6 小时

### Q: Docker 定时同步和 GitHub Actions 哪个好？

| 特性 | GitHub Actions | Docker Cron |
|------|---------------|-------------|
| 费用 | 免费（每月 2000 分钟） | 需要自有服务器/NAS |
| 维护 | 零维护 | 需要保持容器运行 |
| 网络 | GitHub 自带美国 IP | 需要自备科学上网 |
| 灵活性 | 受限于 Actions 运行时 | 完全可控 |
| 适合场景 | 普通用户 | NAS 用户 / 有 VPS 的用户 |

---

## 更新日志

### v2.5.1 (2026-07-12)

**调优：**

- ⏱️ **兜底频率从每日调整为每 3 小时**：上线首日实测发现每日一次的兜底间隔过于保守（对比原来每小时轮询、几乎是量级差异），但事件驱动本身已能覆盖绝大多数场景，用每 3 小时（`cron: "30 */3 * * *"`）替代——相比原来的每小时轮询，运行次数从 24 次/天降到 8 次/天，同时把"webhook 漏掉时最坏要等多久"从 24 小时收窄到 3 小时，两头兼顾

**踩坑记录（真实生产事故）：**

- 🐛 **上线当天 Strava webhook 完全空转**：`repository_dispatch` 触发、Worker 鉴权/过滤、Strava 订阅创建等全部验证通过，但用户实测两条真实活动均未同步。根因是部署时漏做了「一次性配置步骤」里的 OAuth 授权（运动员从未真正授权应用访问自己的数据），导致 Strava 服务端从不给这个应用推送任何事件——订阅"活着"，但从未收到过一条真实事件。这个问题**无法靠模拟 curl 请求发现**，只有真实活动才能验证。补做授权后，手动重跑同步补传了两条遗漏活动，随后一次真实力量训练验证了全自动链路（约 2 分钟延迟）。详见 [`trigger/README.md`](./trigger/README.md) 的踩坑记录

### v2.5.0 (2026-07-12)

**新增功能：**

- ⚡ **事件驱动触发**：`Sync Garmin Global to Garmin CN` 新增 `repository_dispatch` 触发，配合 `trigger/` 目录下的 Cloudflare Worker 监听 Strava 的 "activity create" webhook 事件（Garmin Global 已自动推送活动到 Strava），新活动出现后 1-3 分钟内自动触发同步。原有的每小时 `schedule` 降级为每日 00:30 UTC（北京时间 08:30）兜底同步，接住 webhook 偶尔漏掉的事件。已实测验证：手动触发 `repository_dispatch` → session 复用登录（0.79 秒完成，未触发重登录风控）→ 正确识别去重

**安全清理：**

- 🔒 `db/garmin.db` 不再被 git 跟踪——该文件早已不是实际持久化机制（现由 workflow 中的 `actions/cache` 承担），仅为历史遗留跟踪

**踩坑记录：**

- 曾计划引入第三方 `gautamkrishnar/keepalive-workflow` action 防止 60 天无提交导致 `schedule` 被 GitHub 自动禁用，但该 action 仓库已不可解析（`Repository access blocked`），会导致每次运行直接失败于 "Set up job"。已移除；60 天保活改为依赖仓库持续活跃提交 + GitHub 禁用前的邮件预警（不影响 `repository_dispatch`，只影响每日兜底）

详见 [`trigger/README.md`](./trigger/README.md)。

### v2.4.1 (2026-07-01)

**Bug 修复：**

- 🐛 **修复 v2.4.0 引入的 session 续期回归，恢复 hourly 同步**：v2.4.0 的 `tokenExpiringSoon` 分支在 access token 过期时主动调用 `client.login()`，触发完整 SSO 登录命中 `/oauth-service/oauth/preauthorized` 端点。由于每小时整点运行、而 access token 寿命仅约 30 分钟，该分支每次运行都会触发一次完整账密登录，连续多次后 Garmin 登录端点以 400 Bad Request 拒绝（登录风控），导致 2026-06-30 22:16 UTC 起所有 hourly 同步连续失败。现已还原为 v2.3.0 的 refresh-token 续期路径：`loadToken` + `getUserProfile`，access token 过期由 garmin-connect 库的 401 拦截器自动用 refresh token 刷新（走 `/oauth-service/oauth/exchange/user/2.0`，复用长寿命 OAuth1 token，不碰 `/preauthorized`），仅在 refresh 真正失效时才回退到完整账密 `login()`。

**测试：**

- ✅ 新增 5 个回归测试（`tests/garmin.test.ts`），锁定 session 续期分支：access token 过期时不触发完整 `login()`、仅 refresh 失效时才回退。已实证该测试在 v2.4.0 代码上失败、在 v2.4.1 上通过，可防止回归再次发生。
- ✅ 测试总数 72 → 77，全部通过；TypeScript 编译零错误。

### v2.4.0 (2026-06-30)

**可靠性增强（5 项改进）：**

- 🛡️ **网络预检**：同步前自动验证 Garmin CN/Global 端点连通性，网络异常时秒级失败而非等待登录超时
- 📊 **同步健康度监控**：追踪每次同步的成功/失败次数、连续失败次数，数据持久化到 SQLite
- 🛑 **连续失败自动暂停**：连续失败 5 次自动暂停同步，防止触发 Garmin API 风控
- ⚡ **Session 智能管理**：检查 OAuth2 token 过期时间，有效时跳过冗余 DB 写入，减少不必要的 I/O
- 🔒 **安全修复**：移除误提交到仓库的 `.env` 文件

**部署增强（2 项改进）：**

- 🐳 **Docker Cron 定时同步**：新增 `Dockerfile.cron` 和 `docker-entrypoint.sh`，支持一行命令启动每小时自动同步
- 📦 **Docker Compose profiles**：分离手动执行（`manual`）和定时同步（`cron`）两种模式

**监控与运维：**

- 🩺 **健康度查看命令**：新增 `yarn health:global2cn` 和 `yarn health:cn2global` 命令
- 📝 **GitHub Actions 缓存优化**：改进 cache key 策略，提高缓存命中率

### v2.3.0 (2026-03-07)

**全面核心优化 (15项改进)：**

**可靠性：**
- 同步判断升级：使用本地数据库 `activityId` 完全取代旧的时间对比逻辑，彻底消除时区与重复上传问题
- 迁移支持断点续传：进度自动存入数据库，中断重试不再从头开始
- 智能重试与限流：下载/上传全面集成 `RateLimiter`，并使用带超时和指数退避的统一 `withRetry` 机制
- 断点逃生：完美处理并记录目标端已存在活动引发的 `409 Conflict`，保证任务继续运行
- 修复 Google Sheets 的 `AbortController` 超时失效异常

**性能与安全：**
- 初始化优化：由每次API调用初始化数据库改为在全局 `runTask` 一次性初始化
- 异步 I/O：日志写入改为异步，防止阻塞事件循环
- 路径与网络：临时下载文件使用稳定的绝对目录，不再禁用 Node.js 的 TLS 证书校验 `NODE_TLS_REJECT_UNAUTHORIZED=0`
- 无感持久化：Actions 中使用 `actions/cache` 管理 Session 和数据库，移除旧版需要 push commit 的高危操作

**代码与质量：**
- 零警告：移除 `lodash` 强依赖并清理过时废弃变量，减小包体积并提高可维护性
- 规范升级：迁移 ESLint 至最新的 `eslint.config.mjs` Flat Config 标准，修复 pre-commit hook 在 v9 环境下失效导致的拦截 bug (DX提升)
- 算法优化：完善 `number2capital` 算法支持中文多位制
- 测试驱动：增加针对数据库、同步重试和通知渠道的单元测试，完善测试覆盖 (`vitest` 测试通过)

### v2.2.0 (2026-03-07)

**新增功能：**
- 多通知渠道支持（Telegram、企业微信）
- 输入验证模块（Zod）
- API 速率限制处理
- HTTP 请求超时配置
- 日志文件写入支持

**安全性改进：**
- AES 密钥强度验证
- Session 解密失败自动清理
- Google API 私钥空值处理

**健壮性改进：**
- 重试机制（指数退避）
- 下载文件自动清理
- 启动时配置验证
- 执行时间统计

**开发体验：**
- 添加单元测试（Vitest）
- 添加 ESLint + Prettier
- 添加 Git pre-commit hooks
- 更新依赖版本

### v2.0.0

- 初始版本
- 支持 Garmin 中国区与国际区数据同步
- 支持 GitHub Actions 自动化运行

---

## 免责声明

本工具仅限用于学习和研究目的，不得用于商业或非法用途。使用本工具所产生的任何后果由用户自行承担。

账号密码保存在你自己的 GitHub Secrets 或本地 `.env` 文件中，代码完全开源，欢迎提交 PR。

---

## 致谢

本项目由 **Antigravity (Google DeepMind)** 主导了 v2.3.0 版本的大规模底层重构、性能优化及自动化测试部署。

感谢以下 AI 工具的帮助，本项目展示了 AI 辅助编程的能力，从代码审查、问题诊断到修复实现，全程由 AI 完成：
- **[Antigravity]** - v2.3.0 核心逻辑重构、去重机制升级、GitHub Actions 自动化测试与发版
- **[Claude Code]** - v2.4.0 可靠性增强、健康度监控、Docker 定时同步、代码验证；v2.4.1 session 续期回归修复
