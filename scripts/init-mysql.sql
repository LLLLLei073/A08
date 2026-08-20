-- 数智党校学习系统 - MySQL 建库脚本
-- 在 MySQL 命令行中执行：mysql -u root -p < scripts/init-mysql.sql
-- 或在 MySQL Workbench / Navicat 中粘贴执行

-- 1. 创建数据库（使用 utf8mb4 字符集以支持完整中文和 emoji）
CREATE DATABASE IF NOT EXISTS party_school
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

-- 2. 创建专属账号（推荐，比直接用 root 安全）
--    用户名：party_school，密码：请改成你自己的强密码
-- CREATE USER IF NOT EXISTS 'party_school'@'localhost' IDENTIFIED BY 'YOUR_STRONG_PASSWORD_HERE';
-- GRANT ALL PRIVILEGES ON party_school.* TO 'party_school'@'localhost';
-- FLUSH PRIVILEGES;

-- 3. 如使用 root 账号，则跳过步骤 2，仅需本脚本第 1 步即可
--    .env 中的 DATABASE_URL 填写：
--    mysql://root:YOUR_ROOT_PASSWORD@localhost:3306/party_school

-- 完成后执行：
--   cd packages/server
--   npx prisma migrate deploy   # 应用迁移
--   npx prisma db seed          # 灌入种子数据（ts-node prisma/seed.ts）
