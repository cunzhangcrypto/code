-- Muse兑换码 · Cloudflare D1 数据结构
-- 本地初始化：npm run db:init:local
-- 线上初始化：npm run db:init:remote

CREATE TABLE IF NOT EXISTS codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT    NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  copy_count INTEGER NOT NULL DEFAULT 0,
  status     TEXT    NOT NULL DEFAULT 'active'
);

-- 公开兑换码池的过滤条件固定是 expires_at > now
CREATE INDEX IF NOT EXISTS idx_codes_expires_at ON codes (expires_at);

-- 复制记录：一个设备对同一个码只计一次
CREATE TABLE IF NOT EXISTS code_copies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id     INTEGER NOT NULL,
  device_hash TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (code_id, device_hash)
);

-- 每小时预计算的随机排序，一行一小时（ids 是排好序的兑换码 id 数组的 JSON）。
--
-- 为什么要有这张表：排序是「全局」的（按 hash(code + 小时种子) 排），
-- 如果每次请求都现算，就必须把整个有效池扫一遍 —— rows_read 正比于池子大小，
-- 池子越大、访问越多，越快打满 D1 免费额度（500 万行/天）。
-- 存成一行之后，GET 只读「1 行排序 + 当页 60 行」，读取量与池子规模解耦。
CREATE TABLE IF NOT EXISTS hour_order (
  hour_seed TEXT PRIMARY KEY,
  ids       TEXT NOT NULL
);
