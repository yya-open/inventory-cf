INSERT OR IGNORE INTO warehouses (id, name) VALUES (1, '主仓');
INSERT OR IGNORE INTO warehouses (id, name) VALUES (2, '电脑仓');

INSERT OR IGNORE INTO items (id, sku, name, brand, model, category, unit, warning_qty) VALUES
(1, 'RAM-16G-DDR4-3200', '内存条 16G DDR4 3200', 'Kingston', 'DDR4-3200', '内存', '条', 2),
(2, 'SSD-1T-NVME', 'NVMe SSD 1TB', 'Samsung', '980', '硬盘', '块', 1);


-- Default admin (please change password after first login)
INSERT OR IGNORE INTO users (id, username, password_hash, role, is_active, must_change_password)
VALUES (1, 'admin', 'pbkdf2$100000$MEg44sOf2APw8x1HQEipVQ$x1a47ows6TbAAFmg4n4gBKAzZtPD0fEX7D8lHXitiQ0', 'admin', 1, 1);
