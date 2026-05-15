# inventory-cf

电脑配件出入库管理系统，支持 PC / 显示器 / 配件等业务场景，前端为 Vue 3 + Vite，后端为 Cloudflare Pages Functions + D1。

## 主要功能
- 库存查询、预警和统计看板
- 入库、出库、盘点、回滚、批量操作
- 配件资料管理、Excel 导入、导出
- 账号、角色、权限、数据范围管理
- 审计、运维、备份恢复、系统检查

## 当前权限模型
- 账号角色：`admin` / `operator` / `viewer`
- 数据范围：`all` / `department` / `warehouse` / `department_warehouse`
- 仓库范围支持多选
- 账号授权仓域使用固定选项：
  - `配件仓`
  - `电脑仓`
  - `显示器仓`
- 业务字典与账号权限范围已分开管理，互不干扰

## 技术栈
- 前端：Vue 3、Vite、Element Plus、TypeScript
- 后端：Cloudflare Pages Functions
- 数据库：Cloudflare D1

## 本地开发
```bash
npm install
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
```bash
npm run test
npm run test:e2e
npm run test:smoke
```

单文件测试：
```bash
npm run test:file -- tests/data-scope.parts-warehouse.test.ts --pool=threads --maxWorkers=1
```

## 发布前检查
```bash
npm run verify:release
```

更严格的完整检查：
```bash
npm run verify:release:strict
```

## 数据库初始化
1. 配置 Cloudflare Pages 的 D1 绑定，变量名使用 `DB`
2. 配置环境变量 `JWT_SECRET`
3. 初始化数据库：
```bash
wrangler d1 execute inventory_db --remote --file=sql/init.sql
```
把 `inventory_db` 替换成你实际绑定的 D1 库名。

默认初始化数据里包含管理员账号：
- 账号：`admin`
- 密码：`admin123`

首次登录后会要求修改密码。

## 升级说明
如果你是从旧版本升级，建议按顺序执行迁移和修复检查：
```bash
npm run migrate:verify
npm run migrate:doctor -- --db inventory_db --remote
npm run migrate:apply -- --db inventory_db --remote
```

如果是较早版本，还可能需要执行：
```bash
wrangler d1 execute inventory_db --remote --file=sql/migrate_auth_token_version.sql
```

## 部署到 Cloudflare Pages
- Framework preset：`Vue`
- Build command：`npm run build`
- Build output directory：`dist`
- D1 绑定：`DB`
- 环境变量：`JWT_SECRET`

部署后可直接访问站点并使用登录页。

## 相关文档
- API 错误码说明：[`docs/error-codes.md`](docs/error-codes.md)
