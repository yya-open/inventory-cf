# inventory-cf（Vue3 + Cloudflare Pages + Pages Functions + D1）

一个最小可用的电脑配件出入库管理系统：
- 库存查询 / 预警中心
- 入库 / 出库（出库原子扣减，库存不足返回 409）
- 出入库明细（支持导出 CSV）
- 配件管理（新增/编辑）

## 1. 本地开发（可选）
> Pages Functions 在本地需要 wrangler 才能完全模拟；你也可以仅跑前端 UI。

```bash
npm i
npm run dev
```

## 2. 部署到 Cloudflare（GitHub → Pages）
### 2.1 准备
1) 把本仓库 push 到 GitHub（main 分支）
2) Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git

### 2.2 Pages 构建设置
- Build command: `npm run build`
- Output directory: `dist`

> 如果你用 pnpm，也可以改为 `pnpm install && pnpm build`，并在 Pages 环境变量里指定 Node 版本。

### 2.3 创建 D1 数据库
Cloudflare Dashboard → D1 → Create database
例如命名：`inventory_db`

### 2.4 绑定 D1 到 Pages 项目（关键）
Pages 项目 → Settings → Bindings → Add binding → D1 database
- Binding name: `DB`
- Database: 选择 `inventory_db`

### 2.5 初始化表结构
推荐用 Wrangler 在本地执行（一次性）：

```bash
npm i -g wrangler
wrangler login
wrangler d1 execute inventory_db --file=sql/schema.sql
wrangler d1 execute inventory_db --file=sql/seed.sql
```

> 如果你创建的 D1 名字不是 inventory_db，请替换命令中的库名。

### 2.6 发布
push 到 GitHub 后，Cloudflare Pages 会自动构建并发布。
打开 Pages 分配的域名即可访问。

## 3. API 路由说明
- GET  /api/items?keyword=
- POST /api/items
- GET  /api/stock?warehouse_id=1&keyword=
- POST /api/stock-in
- POST /api/stock-out
- GET  /api/tx?type=&item_id=&date_from=&date_to=
- GET  /api/warnings?warehouse_id=1

## 4. 默认约定
- 默认仓库：主仓（warehouse_id = 1）
- 不做账号系统（如需权限建议接入 Cloudflare Access）
- 明细接口默认最多返回 500 条
