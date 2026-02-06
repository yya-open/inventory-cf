INSERT OR IGNORE INTO warehouses (id, name) VALUES (1, '主仓');

INSERT OR IGNORE INTO items (id, sku, name, brand, model, category, unit, warning_qty) VALUES
(1, 'RAM-16G-DDR4-3200', '内存条 16G DDR4 3200', 'Kingston', 'DDR4-3200', '内存', '条', 2),
(2, 'SSD-1T-NVME', 'NVMe SSD 1TB', 'Samsung', '980', '硬盘', '块', 1);
