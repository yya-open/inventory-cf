# inventory-cf（电脑配件出入库管理系统）

## 功能
- 库存查询 / 预警中心
- 入库 / 出库（自动写入出入库明细）
- 配件管理（新增/编辑/预警值）
- Excel 导入配件（管理员）
- 明细/库存导出 Excel（前端一键导出）
- 账号体系与权限
  - 管理员：admin / admin123（首次登录强制修改）
  - 角色：管理员 / 操作员 / 只读

## 技术栈
- 前端：Vue3 + Vite + Element Plus
- 后端：Cloudflare Pages Functions + D1

---

## 本地运行
```bash
pnpm i
pnpm dev
```

> 如需本地联调 D1，可以使用 `wrangler pages dev`（可选）。

---

## 部署到 Cloudflare Pages（GitHub 自动部署）
### 1）准备
1. 把本项目推到 GitHub（你已经完成了 ✅）
2. Cloudflare 控制台 → **Pages** → Create a project → 选择你的 GitHub 仓库

### 2）构建设置
- Framework preset：**Vue**
- Build command：`npm run build`（或 `pnpm build`）
- Build output directory：`dist`
- Node 版本建议：20+

### 3）绑定 D1（重要）
Cloudflare Pages 项目 → Settings → Functions → **D1 database bindings**：
- Variable name：`DB`
- D1 database：选择/新建 `inventory_db`

### 4）配置环境变量（重要）
Pages 项目 → Settings → Environment variables：
- `JWT_SECRET`：随便填一个足够长的随机字符串（建议 32 位以上）

### 5）初始化数据库（建表 + 插入默认数据/管理员）
你可以用 CLI 执行（推荐）：

1. 安装 wrangler 并登录
```bash
npm i -g wrangler
wrangler login
```

2. 打开 `wrangler.toml`，把 `database_id` 替换成你 D1 的 ID  
（D1 详情页可看到 Database ID）

3. 一键初始化（推荐）
```bash
wrangler d1 execute inventory_db --remote --file=sql/init.sql
```
### 升级说明（P1：审计 delta_qty + 登录限流）
如果你是从旧版本升级（数据库里已经有表了），需要额外执行一次迁移：
```bash
wrangler d1 execute inventory_db --remote --file=sql/migrate_audit_throttle.sql
wrangler d1 execute inventory_db --remote --file=sql/migrate_trace_audit.sql
```

可选环境变量（Pages → Settings → Environment variables）：
- `AUTH_MAX_FAILS`：允许失败次数（默认 5）
- `AUTH_WINDOW_MIN`：统计窗口分钟（默认 15）
- `AUTH_LOCK_MIN`：锁定分钟（默认 15）

> 如果你想分步执行：
```bash
wrangler d1 execute inventory_db --remote --file=sql/schema.sql
wrangler d1 execute inventory_db --remote --file=sql/seed.sql
```

### 6）访问
部署完成后，打开你的 Pages 域名：
- 登录页：`/login`
- 默认管理员：`admin / admin123`（首次登录会要求修改密码）

---

## Excel 导入说明
- 表头支持：`SKU、名称、品牌、型号、分类、单位、预警值`
- 进入：**Excel 导入** 页面 → 下载模板 → 填好后导入
- 导入模式：
  - 存在则更新（推荐）
  - 存在则跳过

---

## 权限说明
- 只读（viewer）：库存查询、预警、明细
- 操作员（operator）：+ 入库、出库
- 管理员（admin）：+ 配件管理、Excel 导入、用户管理

## 认证增强：token_version（踢下线/改密码立即失效）

如数据库是旧版本，请执行一次迁移：

```bash
wrangler d1 execute <你的D1库名> --file=sql/migrate_auth_token_version.sql
```

作用：
- 登录 token 内包含 tv（token_version）
- 改密码 / 退出登录会 token_version+1，旧 token 立即 401



## 测试与发布前检查

### 全量测试
```bash
npm run test
```

### 定向测试（单文件）
```bash
npm run test:file -- tests/data-scope.parts-warehouse.test.ts --pool=threads --maxWorkers=1
```

### E2E 关键流程
```bash
npm run test:e2e
```

错误码约定与前端处理方式请参考：`docs/error-codes.md`

### 其它发布前检查
```bash
npm run typecheck
npm run lint
npm run perf:explain
```

当前已覆盖的关键流程测试：
- 登录 → 改密码 → 旧 token 失效 → 新 token 生效
- 公开扫码查看 → 公开盘点提交 → 限流
- 盘点创建 → 应用 → 回滚

## 正式迁移流程（推荐）
项目已引入正式迁移清单与 registry 表：`schema_migrations`。

先验证迁移清单：
```bash
npm run migrate:verify
npm run migrate:plan
```

查看某个 D1 的迁移状态：
```bash
npm run migrate:status -- --db inventory_db --remote
```

应用所有未执行迁移：
```bash
npm run migrate:apply -- --db inventory_db --remote
```

生成一个可审阅的 bundle SQL：
```bash
npm run migrate:bundle
```

说明：
- 迁移清单位于 `sql/migrations.manifest.json`
- 每次迁移执行后，都会写入 `schema_migrations`
- 线上发布建议固定为：**先 migrate，再 deploy**
