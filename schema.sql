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
