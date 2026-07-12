# 事件驱动触发：Strava Webhook → Cloudflare Worker → GitHub Actions

让「佳明国际 → 佳明中国」的同步从每小时轮询变成**新活动出现后 1–3 分钟内自动触发**，不再依赖固定 cron 周期。

## 设计思路

出发点很简单：轮询周期越短，越接近实时，但代价是登录/请求次数线性增加，而 Garmin 的非官方接口对高频登录很敏感（v2.4.0 就因为一个 session 续期回归，在 hourly 频率下触发过一次真实的登录风控故障，见主 README 更新日志）。真正的事件驱动需要一个"新活动出现了"的信号源，而不是"猜多久问一次"。

逐条推演可选方案：

- **Garmin 官方 Push API**：只对企业合作伙伴开放，个人开发者拿不到，直接排除。
- **本地常驻轮询守护**（node-cron + 任务计划自启）：需要电脑 24 小时开机，且轮询频率从"每天 24 次"变成"每天上千次"才能逼近实时，登录风控风险不降反升，还重复造了 GitHub 已有的免费基础设施。技术上可行，但性价比低，仅作为文末备选项保留。
- **Strava Webhook 作为"门铃"**：Garmin Connect 国际本身就会把每条新活动自动推送到 Strava（官方功能，秒级），而 Strava 提供标准的 push webhook。于是可以完全不碰 Garmin 的登录接口，只监听 Strava 的事件作为"有新活动了"的信号，实际数据仍然从 Garmin Global 直接拉取——**Strava 只当门铃，不参与数据搬运**。这样毫秒级信号 + 零额外 Garmin 请求，是三个方案里唯一同时满足"实时"和"不增加风控面"的。

选定 Strava 之后的几个从属决策：

- **同步执行器不换**：现有 GitHub Actions workflow（`yarn sync:global2cn`）已经跑得很稳，secrets 也配好了，没有理由重新实现一遍。要改的只是"谁来触发它"，不是"谁来执行它"——所以选 `repository_dispatch`，一个 API 调用就能远程点火现有 workflow，同步逻辑（`src/services/sync.ts` 的去重、409 容忍、session 续期）完全不动。
- **触发层用 Cloudflare Worker，不是别的**：需要一个能收 Strava webhook 的公网 HTTP 端点。免费、免运维、冷启动够快（Strava 给 2 秒响应窗口）、不需要额外账号体系——比自建服务器或用现有的 Actions 里跑 HTTP server（GitHub Actions 本身不支持长驻监听）更合适。
- **鉴权用路径当密钥**：Strava webhook 投递没有请求签名机制，用一段随机路径（`WEBHOOK_PATH`）取代传统的 API Key header，成本几乎为零但足够挡住扫描器。
- **每日兜底不能省**：webhook 投递不是 100% 可靠（Strava 官方文档写明非 2xx 最多重试 3 次就放弃），完全依赖事件驱动会有漏网风险。保留一次低频兜底同步，把"漏网"的后果从"可能永久漏掉"降到"最多等到第二天"。

## 架构

```
Garmin 设备 → Garmin Connect 国际（官方推送，秒级）→ Strava
  → Strava Webhook (activity create) → Cloudflare Worker（本目录，免费）
  → GitHub repository_dispatch → 现有 workflow 运行 yarn sync:global2cn → 佳明 CN
```

Strava 在这条链路里只是「门铃」——我们从不读取任何 Strava 活动数据，同步逻辑仍然直接从 Garmin Global 拉取 FIT 原始文件并上传到 Garmin CN（`src/services/sync.ts` 完全不变）。

每日仍保留一次低频兜底同步（`.github/workflows/sync_garmin_global_to_garmin_cn.yml` 里的 `schedule`），用于接住 webhook 偶尔漏掉的事件。

## 实施计划

按以下顺序落地，每一步都是独立可回滚的：

| 阶段 | 内容 | 产出 |
|---|---|---|
| 0. 安全清理 | 排查 `db/garmin.db` 是否仍是活跃持久化机制（结论：不是，已被 `actions/cache` 取代），untrack 掉这个遗留文件 | 1 次提交 |
| 1. Workflow 触发器改造 | `sync_garmin_global_to_garmin_cn.yml` 加 `repository_dispatch: [new_activity]`；`schedule` 从每小时降为每日 00:30 UTC 兜底；不改动既有的 session cache 逻辑 | 1 次提交 |
| 2. Cloudflare Worker 开发 | 单文件纯 JS Worker：GET 做 Strava 订阅验证握手，POST 过滤 `activity create` 事件并异步触发 `repository_dispatch` | `trigger/worker.js` + `wrangler.toml` |
| 3. 一次性人工配置 | Strava 应用凭据、OAuth 自授权、GitHub PAT、Cloudflare 登录部署、Worker secrets 写入、创建 Strava 订阅（完整步骤见下方「一次性配置步骤」） | 线上 Worker + 有效订阅 |
| 4. 端到端验证 | 手动 `repository_dispatch` 触发 → 确认 workflow 正常跑完；GET/POST 分别测试 Worker 的鉴权、过滤、去重逻辑 | 验证清单见下方 |

落地过程中踩过一个坑：曾计划加 `gautamkrishnar/keepalive-workflow` action 防止 60 天无提交导致 `schedule` 被 GitHub 自动禁用，实测该 action 仓库已不可解析（GitHub 返回 `Repository access blocked`，每次运行直接失败在 "Set up job"），已移除——60 天保活退化为"依赖仓库持续活跃 + GitHub 禁用前的邮件预警"，只影响每日兜底，不影响 `repository_dispatch`。

## 前置条件

- 已有 Strava 账号，且 Garmin Connect 国际已开启「自动同步到 Strava」（大多数账号默认开启）
- 已有 Strava API 应用（[strava.com/settings/api](https://www.strava.com/settings/api)）——2026 年起创建新 API 应用需要 Strava 付费订阅
- 一个免费 Cloudflare 账号
- 本仓库的 GitHub 仓库管理权限（用于创建 fine-grained PAT）
- 已安装 Node.js（用于运行 `npx wrangler`）

## 一次性配置步骤

按顺序执行。标 **【浏览器】** 的步骤需要你亲自操作；标 **【终端】** 的可以直接在命令行完成。

### 1.【浏览器】获取 Strava 应用凭据

打开 [strava.com/settings/api](https://www.strava.com/settings/api)，记录：

- **Client ID**
- **Client Secret**
- 将 **Authorization Callback Domain** 设置为 `localhost`（下一步需要）
- 记下你的 athlete ID（个人主页 URL 形如 `strava.com/athletes/12345678` 中的数字）

### 2. 授权自己的应用接收自己的活动事件

Strava 的规则是：webhook 只会推送**已经用该应用授权过**的运动员的活动事件。即使应用是你自己创建的，也需要走一次 OAuth 授权。

**【浏览器】** 打开（替换 `<CLIENT_ID>`）：

```
https://www.strava.com/oauth/authorize?client_id=<CLIENT_ID>&redirect_uri=http://localhost/exchange_token&response_type=code&scope=activity:read_all
```

点击「Authorize」后浏览器会跳转到一个打不开的 `http://localhost/exchange_token?...&code=XXXX` 页面——这是正常的，从地址栏复制 `code` 参数的值。

**【终端】** 用这个 code 完成一次性换取（换到的 token 直接丢弃，我们不会再调用 Strava 的任何数据接口）：

```bash
curl -X POST https://www.strava.com/api/v3/oauth/token \
  -F client_id=<CLIENT_ID> \
  -F client_secret=<CLIENT_SECRET> \
  -F code=<上一步拿到的code> \
  -F grant_type=authorization_code
```

返回 200 且包含 `access_token` 字段即成功。可在 [strava.com/settings/apps](https://www.strava.com/settings/apps) 确认应用已显示为「已连接」。

### 3.【浏览器】创建 GitHub Fine-grained PAT

前往 [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)：

- Repository access → **Only select repositories** → 选择本仓库
- Permissions → **Contents: Read and write**（足以调用 `repository_dispatch`，不需要更多权限）
- Expiration：建议 1 年，并在日历上设一个到期提醒（到期后事件驱动会失效，但每日兜底仍正常工作）

复制生成的 token。

### 4.【终端】登录 Cloudflare 并部署 Worker

```bash
cd trigger
npx wrangler@4 login   # 会弹出浏览器完成授权
npx wrangler@4 deploy  # 首次部署会提示注册一个 workers.dev 子域，接受默认值即可
```

部署成功后记下 Worker 的访问地址，形如：

```
https://garmin-sync-trigger.<你的子域>.workers.dev
```

### 5.【终端】生成随机密钥并写入 Worker Secrets

```bash
openssl rand -hex 16   # 运行两次，分别作为下面的 STRAVA_VERIFY_TOKEN 和 WEBHOOK_PATH
```

依次写入（每条命令会提示交互式输入值）：

```bash
npx wrangler@4 secret put STRAVA_VERIFY_TOKEN
npx wrangler@4 secret put WEBHOOK_PATH
npx wrangler@4 secret put STRAVA_OWNER_ID   # 第 1 步记录的 athlete ID
npx wrangler@4 secret put GH_PAT            # 第 3 步生成的 token
```

写入 secret 立即对线上 Worker 生效，无需重新 `deploy`。

### 6.【终端】创建 Strava 订阅

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=<CLIENT_ID> \
  -F client_secret=<CLIENT_SECRET> \
  -F callback_url=https://garmin-sync-trigger.<你的子域>.workers.dev/hook/<WEBHOOK_PATH> \
  -F verify_token=<STRAVA_VERIFY_TOKEN>
```

Strava 会先向 `callback_url` 发一个 GET 请求做验证握手（Worker 已实现），握手通过后返回：

```json
{ "id": 123456 }
```

**记下这个 `id`**，回滚时需要用到。

大功告成——从下一次 Garmin Global 出现新活动、且它同步到 Strava 开始，1–3 分钟内应该会自动出现在 Garmin CN。

## 查看 / 删除订阅

```bash
# 查看当前订阅
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=<CLIENT_ID> -d client_secret=<CLIENT_SECRET>

# 删除订阅（回滚用）
curl -X DELETE "https://www.strava.com/api/v3/push_subscriptions/<订阅ID>?client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>"
```

## 验证清单

> ✅ 以下第 1、3 步已于 2026-07-12 实测通过：手动 `repository_dispatch` → workflow 成功触发 → session 复用登录（0.79 秒完成，未触发完整账密重登录）→ 正确识别「没有要同步的活动」（去重生效）；Worker 线上 GET 验证握手、POST 事件过滤（create/update/他人 owner_id）均按预期返回；Strava 订阅创建成功（GET 握手在生产环境走通）。

1. **不依赖 Strava，先验证 workflow 触发链路**：
   ```bash
   gh api repos/daruizi/GAS-GarminActivitiesSync/dispatches -f event_type=new_activity
   gh run list --workflow=sync_garmin_global_to_garmin_cn.yml --limit 3
   ```
   应看到一条由 `repository_dispatch` 触发的新运行，日志里能看到 "Log trigger source" 步骤（本次是手动模拟，`client_payload` 为空也没关系）以及正常的同步日志。同时确认 "Cache Session Database" / "Save Session Database" 两个步骤正常跑完，保存了带最新 `run_number` 的 cache。

2. **本地测试 Worker**：在 `trigger/` 下创建 `.dev.vars`（已被 .gitignore 排除）填入四个变量，然后：
   ```bash
   npx wrangler@4 dev
   ```
   另开终端：
   ```bash
   # 验证握手：应精确返回 {"hub.challenge":"abc123"}
   curl "http://localhost:8787/hook/<WEBHOOK_PATH>?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=<STRAVA_VERIFY_TOKEN>"

   # 错误 token → 403；错误路径 → 404（自行验证）

   # 模拟一条新活动事件（用你自己的 owner_id）→ 200，且会真实触发一次 workflow（内容为空转，无害）
   curl -X POST "http://localhost:8787/hook/<WEBHOOK_PATH>" \
     -H "Content-Type: application/json" \
     -d '{"object_type":"activity","aspect_type":"create","object_id":123,"owner_id":<你的athlete ID>,"subscription_id":1,"event_time":1750000000}'

   # 模拟 update 事件或他人 owner_id → 200，但不应触发 workflow
   ```

3. **线上验证**：对部署后的 workers.dev 地址重复上面的 GET 握手测试；`npx wrangler@4 tail` 可以实时看日志。

4. **端到端**：在 Garmin Connect 国际网页版用「导入数据」上传一个真实的 GPX/FIT 文件（纯手动录入的运动记录不一定会推送到 Strava；文件导入或真实设备活动才可靠）。观察：`wrangler tail` 出现 POST → `gh run watch` → 1–3 分钟内活动出现在 Garmin CN。之后可以对线上地址重发同一个模拟事件，第二次应该在同步日志里看到「没有要同步的活动」或 409 跳过（验证去重生效）。测试完成后从两侧账号删除测试活动。

5. **兜底验证**：第二天检查 `gh run list --workflow=sync_garmin_global_to_garmin_cn.yml -e schedule`，确认 00:30 UTC（北京时间 08:30）的兜底运行正常。

## 故障模式与缓解

| 故障 | 影响 | 缓解 |
|---|---|---|
| Strava 事件丢失/未送达 | 该活动延迟同步 | 每日 08:30 兜底扫最近 10 条活动 |
| Worker 宕机 / Cloudflare 故障 | 事件丢失（Strava 对非 2xx 响应最多重试 3 次） | 兜底 cron 接住；`wrangler tail` 排查 |
| Actions cache 被驱逐（7 天未用才会被驱逐，每日 schedule 天然保活） | 下次运行需要重新登录 Garmin 一次 | 无需处理；workflow 的 concurrency 串行执行，不会并发触发多次登录 |
| 重复事件 / Strava 重投 | 多跑一次同步 workflow | SQLite 按 activity_id 去重 + 上传 409 视为已同步，空转约 3 次网络调用 |
| 非 Garmin 来源的 Strava 活动（手动录入、Zwift 直连等） | 触发一次空转运行 | 无害，Garmin Global 侧没有新活动时直接判定"无需同步" |
| GitHub PAT 过期 / 被吊销 | dispatch 调用 401，事件驱动失效（Worker 日志可见） | 每日兜底仍正常工作；到期前重新生成并 `wrangler secret put GH_PAT` |
| 60 天无提交导致 schedule 被 GitHub 自动禁用 | 只影响每日兜底，事件驱动不受影响（`repository_dispatch` 不计入此规则） | 保持仓库有正常提交活动即可重置计时；GitHub 禁用前也会发邮件预警。曾尝试用 `gautamkrishnar/keepalive-workflow` action 自动保活，但该 action 仓库已不可解析会导致运行直接失败，已放弃 |

## 回滚

各步骤相互独立，可以只回滚部分：

1. 删除 Strava 订阅：`curl -X DELETE .../push_subscriptions/<订阅ID>?...`（见上文）
2. 下线 Worker：`npx wrangler@4 delete`
3. 恢复每小时轮询：`git revert` 引入 `repository_dispatch` / 每日 schedule 的那次提交
4. 吊销 GitHub PAT：[github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens)

即使什么都不回滚，只要 Strava 订阅被删除或 Worker 下线，同步 workflow 本身完全不受影响——它只是少了一个触发来源，每日兜底会继续正常运行。
