# inventory-cf

电脑配件出入库与资产台账管理系统，覆盖配件库存、PC 台账、显示器台账、盘点、回滚、审计、备份恢复和系统运维等场景。

前端使用 Vue 3 + Vite + TypeScript + Element Plus，后端使用 Cloudflare Pages Functions，数据存储使用 Cloudflare D1。

## 主要功能

- 配件库存查询、预警、统计看板、入库、出库和流水查询
- PC / 显示器资产台账、二维码公开查询、入库、出库、回收和归档
- 台账盘点批次、盘点状态筛选、已盘 / 异常 / 未盘统计卡和盘点记录
- Excel 导入导出、配件资料治理、SKU 别名与业务字典管理
- 账号、角色、权限、数据范围、仓库范围和授权域管理
- 审计日志、运维工具、任务中心、备份恢复、发布检查和系统健康检查

## 权限模型

- 账号角色：`admin` / `operator` / `viewer`
- 数据范围：`all` / `department` / `warehouse` / `department_warehouse`
- 仓库范围支持多选
- 账号授权域使用固定选项：
  - `配件仓`
  - `电脑仓`
  - `显示器仓`
- 业务字典和账号权限范围分开管理，避免互相影响

## 技术栈

- 前端：Vue 3、Vite、TypeScript、Element Plus
- 后端：Cloudflare Pages Functions
- 数据库：Cloudflare D1
- 测试：Vitest
- 发布与运维：Wrangler、项目内迁移脚本、发布检查脚本

## 本地开发

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

常用检查：

```bash
npm run typecheck
npm run typecheck:functions
npm run lint
npm run build
```

## 测试

运行全部单元测试：

```bash
npm run test
```

运行指定测试文件：

```bash
npm run test:file -- tests/inventory.store.test.ts --pool=threads --maxWorkers=1
```

运行冒烟测试：

```bash
npm run test:smoke
```

运行回归保护测试：

```bash
npm run test:guards
```

## 发布前检查

推荐发布前执行：

```bash
npm run verify:release
```

更严格的完整检查：

```bash
npm run verify:release:strict
```

`verify:release:strict` 会额外检查 Functions 构建、Element Plus 用法、性能预算和函数端类型。

## 数据库初始化

1. 在 Cloudflare Pages 中配置 D1 绑定，变量名使用 `DB`
2. 配置环境变量 `JWT_SECRET`
3. 初始化数据库：

```bash
wrangler d1 execute inventory_db --remote --file=sql/init.sql
```

把 `inventory_db` 替换成实际绑定的 D1 数据库名。

初始化数据包含默认管理员账号：

- 账号：`admin`
- 密码：`admin123`

首次登录后系统会要求修改密码。

## 数据库迁移

如果从旧版本升级，建议先检查迁移状态，再执行迁移：

```bash
npm run migrate:verify
npm run migrate:status -- --db inventory_db --remote
npm run migrate:plan -- --db inventory_db --remote
npm run migrate:apply -- --db inventory_db --remote
```

诊断迁移问题：

```bash
npm run migrate:doctor -- --db inventory_db --remote
```

较早版本升级时，可能还需要补充执行：

```bash
wrangler d1 execute inventory_db --remote --file=sql/migrate_auth_token_version.sql
```

## 部署到 Cloudflare Pages

- Framework preset：`Vue`
- Build command：`npm run build`
- Build output directory：`dist`
- D1 绑定：`DB`
- R2 绑定：`BACKUP_BUCKET`
- Queue Producer 绑定：`ASYNC_JOB_QUEUE` → 队列 `inventory-async-jobs`
- 加密变量(Secret,面板/API 都读不到明文):`JWT_SECRET`、`TURNSTILE_SECRET`
- 普通变量:`VITE_TURNSTILE_SITEKEY`(构建期注入前端)、`NODE_VERSION`、`AUTH_MAX_FAILS`、`AUTH_LOCK_MIN`、`AUTH_CAPTCHA_AFTER`、`DISABLE_SCHEMA_HEALING`

密钥用 Secret 类型写入,不要用普通变量:

```bash
wrangler pages secret put JWT_SECRET --project-name inventory-cf
wrangler pages secret put TURNSTILE_SECRET --project-name inventory-cf
```

改完环境变量要重新部署一次才生效(每个部署带的是自己那份环境快照)。`JWT_SECRET` 换值等于让所有已登录会话立即失效。

部署后可直接访问站点并使用登录页进入系统。

## 异步任务队列与定时维护

导出、备份、二维码批量生成等重任务走 `async_jobs` 表。Pages Functions 只做入队,真正的执行放在独立的消费者 Worker 上,避免 Pages 请求撞上 CPU 时间上限。

一次性资源准备:

```bash
wrangler queues create inventory-async-jobs
wrangler queues create inventory-async-jobs-dlq
wrangler deploy -c wrangler.async-jobs-consumer.jsonc
```

然后在 Pages 项目里加 Queue Producer 绑定 `ASYNC_JOB_QUEUE`(指向 `inventory-async-jobs`),并重新部署一次让绑定生效。

- 消费者 Worker:`inventory-cf-async-jobs-consumer`,`workers_dev: false`,只接队列消息和 cron,不暴露公开 HTTP 入口
- 失败重试:`max_retries: 3`,超限进 `inventory-async-jobs-dlq`
- cron `*/15 * * * *` 驱动 5 项维护:过期任务清理、审计日志保留清理、审计容量统计刷新、审计归档巡检、观测数据清理
- 没有绑定 `ASYNC_JOB_QUEUE` 时会退化成在请求内直接执行(小任务可用,大导出容易超时);把环境变量 `ASYNC_JOB_QUEUE_REQUIRED` 设为 `1` 可以禁掉这种退化,缺队列时直接返回 503

## 常见维护命令

所有维护脚本都需要显式指定数据库和目标环境(`--remote` 或 `--local`),缺少 `--db` 会直接报错。

数据库结构检查(比对 `schema-status.ts` 声明的结构要求、迁移清单版本和库内实际对象):

```bash
npm run db:schema-check -- --db inventory_db --remote
```

结构不一致时会逐条列出缺失的表/列/索引/触发器并以非 0 退出。

数据库完整性检查:

```bash
npm run db:integrity -- --db inventory_db --remote
```

清理数据库冗余数据:

```bash
npm run db:clean -- --db inventory_db --remote
```

审计数据统计与清理:

```bash
npm run audit:stats -- --db inventory_db --remote
npm run audit:cleanup -- --db inventory_db --remote
```

观测数据清理(慢请求/错误请求/浏览器性能与埋点日志)按 `observability_retention_policy` 的保留天数删除,已挂在消费者 Worker 的 cron 上(见上文「异步任务队列与定时维护」)。需要手动补一次时:

```bash
npm run obs:cleanup -- --db inventory_db --remote
```
