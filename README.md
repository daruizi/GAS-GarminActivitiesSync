# Garmin 运动数据同步工具

![workflow](./assets/workflow.png)

<a style="display:inline-block;background-color:#FC5200;color:#fff;padding:5px 10px 5px 30px;font-size:11px;font-family:Helvetica, Arial, sans-serif;white-space:nowrap;text-decoration:none;background-repeat:no-repeat;background-position:10px center;border-radius:3px;background-image:url('https://badges.strava.com/logo-strava-echelon.png')" href='https://www.strava.com/athletes/37141473' target="_clean">
  关注作者 Strava
  <img src='https://badges.strava.com/logo-strava.png' alt='Strava' style='margin-left:2px;vertical-align:text-bottom' height=13 width=51 />
</a>

---

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
  - [Web 版本（推荐）](#web-版本推荐)
  - [GitHub Actions 版本](#github-actions-版本)
  - [Docker 版本](#docker-版本)
  - [本地运行版本](#本地运行版本)
- [配置说明](#配置说明)
- [项目结构](#项目结构)
- [常见问题](#常见问题)
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
| RQ 数据采集 | 采集 RunningQuotient 跑力数据并记录到 Google Sheets |
| 消息通知 | 支持 Bark 推送通知运行结果 |

---

## 功能特性

### 1. 同步数据

自动检测源账号的新活动，下载并上传到目标账号。

| 方向 | GitHub Action | 说明 |
|------|---------------|------|
| 中国区 → 国际区 | `Sync Garmin CN to Garmin Global` | 每 6 小时自动检查同步，同步后可在 Strava 热力图显示 |
| 国际区 → 中国区 | `Sync Garmin Global to Garmin CN` | 每小时自动检查同步，适合常用国际区的用户 |

> **注意**：如无特殊需求，建议只开启一个方向的同步！

### 2. 迁移数据

一次性批量迁移历史运动数据，适合首次使用或需要补全历史记录的场景。

| 方向 | GitHub Action | 说明 |
|------|---------------|------|
| 中国区 → 国际区 | `Migrate Garmin CN to Garmin Global` | 手动触发 |
| 国际区 → 中国区 | `Migrate Garmin Global to Garmin CN` | 手动触发 |

可通过环境变量控制迁移数量和起始位置：
- `GARMIN_MIGRATE_NUM`：每次迁移数量（默认 100）
- `GARMIN_MIGRATE_START`：从第几条活动开始（默认 0）

### 3. RQ + Google Sheets 数据采集

采集 RunningQuotient 跑力数据与 Garmin 跑步统计，自动写入 Google Sheets，便于长期追踪跑力趋势。

### 4. Bark 消息通知

支持 iOS Bark 推送，运行成功/失败时自动推送消息到手机。

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

| Secret 名称 | 说明 | 必填 |
|------------|------|------|
| `GARMIN_USERNAME` | Garmin 中国区账号（邮箱） | ✅ |
| `GARMIN_PASSWORD` | Garmin 中国区密码 | ✅ |
| `GARMIN_GLOBAL_USERNAME` | Garmin 国际区账号（邮箱） | ✅ |
| `GARMIN_GLOBAL_PASSWORD` | Garmin 国际区密码 | ✅ |
| `BARK_KEY` | Bark 推送 Key（可选） | ❌ |
| `GARMIN_MIGRATE_NUM` | 迁移数量（默认 100） | ❌ |
| `GARMIN_MIGRATE_START` | 迁移起始位置（默认 0） | ❌ |

RQ + Google Sheets 功能额外配置：

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

#### 步骤 4：手动测试

点击 `Run workflow` 手动触发一次测试，确认配置正确。

### Docker 版本

适合会使用 Docker 的用户。

#### 拉取代码

```bash
git clone https://github.com/YOUR_USERNAME/GarminActivitiesSync.git
cd GarminActivitiesSync
```

#### 配置环境变量

复制并编辑 `.env` 文件：

```bash
cp .env.example .env
```

填入账号密码：

```env
# Garmin 中国区
GARMIN_USERNAME=your_email@example.com
GARMIN_PASSWORD=your_password

# Garmin 国际区
GARMIN_GLOBAL_USERNAME=your_email@example.com
GARMIN_GLOBAL_PASSWORD=your_password

# 迁移配置
GARMIN_MIGRATE_NUM=100
GARMIN_MIGRATE_START=0
```

#### 修改运行命令

编辑 `docker-compose.yml` 中的 `command` 参数：

```yaml
# 同步中国区 → 国际区（默认）
command: yarn sync:cn2global

# 同步国际区 → 中国区
# command: yarn sync:global2cn

# 迁移中国区 → 国际区
# command: yarn migrate:cn2global

# 迁移国际区 → 中国区
# command: yarn migrate:global2cn
```

#### 运行

```bash
docker-compose up
```

#### 定时任务

配合 crontab 实现定时同步：

```cron
# 每 3 小时同步国际区 → 中国区
0 */3 * * * docker start daily-sync >> /var/log/garmin-sync.log 2>&1
```

### 本地运行版本

适合有 Node.js 开发环境的用户。

#### 环境要求

- Node.js 18+ （推荐最新 LTS 版本）
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
# 同步中国区 → 国际区
yarn sync:cn2global

# 同步国际区 → 中国区
yarn sync:global2cn

# 迁移中国区 → 国际区
yarn migrate:cn2global

# 迁移国际区 → 中国区
yarn migrate:global2cn

# RQ + Google Sheets 同步
yarn rq
```

---

## 配置说明

### 环境变量一览

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `GARMIN_USERNAME` | 中国区账号 | - |
| `GARMIN_PASSWORD` | 中国区密码 | - |
| `GARMIN_GLOBAL_USERNAME` | 国际区账号 | - |
| `GARMIN_GLOBAL_PASSWORD` | 国际区密码 | - |
| `GARMIN_SYNC_NUM` | 每次同步检查的活动数量 | 10 |
| `GARMIN_MIGRATE_NUM` | 每次迁移的活动数量 | 100 |
| `GARMIN_MIGRATE_START` | 迁移起始位置 | 0 |
| `BARK_KEY` | Bark 推送 Key | - |
| `RQ_COOKIE` | RQ Cookie | - |
| `RQ_CSRF_TOKEN` | RQ CSRF Token | - |
| `RQ_USERID` | RQ 用户 ID | - |
| `GOOGLE_SHEET_ID` | Google Sheets ID | - |
| `GOOGLE_API_CLIENT_EMAIL` | Google API 邮箱 | - |
| `GOOGLE_API_PRIVATE_KEY` | Google API 私钥 | - |

---

## 项目结构

```
GarminActivitiesSync/
├── .github/
│   └── workflows/          # GitHub Actions 工作流
│       ├── sync_garmin_cn_to_garmin_global.yml
│       ├── sync_garmin_global_to_garmin_cn.yml
│       ├── migrate_garmin_cn_to_garmin_global.yml
│       └── migrate_garmin_global_to_garmin_cn.yml
├── src/
│   ├── clients/            # API 客户端
│   │   ├── garmin.ts       # Garmin Connect API
│   │   ├── google-sheets.ts # Google Sheets API
│   │   └── runningquotient.ts # RunningQuotient API
│   ├── services/           # 业务服务
│   │   ├── sync.ts         # 同步/迁移服务
│   │   ├── notification.ts # 通知服务
│   │   └── rq-sync.ts      # RQ 同步服务
│   ├── utils/              # 工具函数
│   │   ├── database.ts     # SQLite 数据库
│   │   ├── crypto.ts       # 加密工具
│   │   ├── logger.ts       # 日志工具
│   │   ├── format.ts       # 格式化工具
│   │   └── runner.ts       # 任务运行器
│   ├── config/             # 配置管理
│   ├── types/              # TypeScript 类型定义
│   └── index.ts            # 入口文件
├── db/                     # SQLite 数据库文件
├── .env                    # 环境变量配置
├── .env.example            # 环境变量示例
├── docker-compose.yml      # Docker Compose 配置
├── Dockerfile              # Docker 镜像构建
├── package.json            # 项目依赖
└── tsconfig.json           # TypeScript 配置
```

---

## 常见问题

### Q: 网络连通性测试失败？

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

### Q: 如何修改定时执行频率？

编辑 `.github/workflows/` 下对应的 workflow 文件中的 `cron` 表达式：

```yaml
schedule:
  - cron: "0 */6 * * *"  # 每 6 小时执行一次
```

常用示例：
- `0 * * * *` - 每小时
- `0 */6 * * *` - 每 6 小时
- `0 */12 * * *` - 每 12 小时

---

## 免责声明

本工具仅限用于学习和研究目的，不得用于商业或非法用途。使用本工具所产生的任何后果由用户自行承担。

账号密码保存在你自己的 GitHub Secrets 中，代码完全开源，欢迎提交 PR。

---

**自动 · 安全 · 省心**