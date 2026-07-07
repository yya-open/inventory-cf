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
- 环境变量：`JWT_SECRET`

部署后可直接访问站点并使用登录页进入系统。

## 常见维护命令

数据库完整性检查：

```bash
npm run db:integrity
```

清理数据库冗余数据：

```bash
npm run db:clean
```

审计数据统计与清理：

```bash
npm run audit:stats
npm run audit:cleanup
```

观测数据清理：

```bash
npm run obs:cleanup
```
