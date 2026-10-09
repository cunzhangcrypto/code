// 前端与 Workers 共用的纯函数工具（放在 functions/ 之外，避免被当成路由）。

/** 24 小时有效期（毫秒） */
export const TTL_MS = 24 * 60 * 60 * 1000;

/** 统一的 JSON 响应；兑换码池是动态数据，禁止任何缓存 */
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/** 兑换码格式：恰好 6 位英文或数字。与前端 public/app.js 的 CODE_RE 必须保持一致。 */
const CODE_RE = /^[A-Za-z0-9]{6}$/;

/**
 * 规范化兑换码：去掉首尾空白后，必须恰好是 6 位英文或数字。
 * 只去首尾空白、不改大小写 —— 保证用户复制出去的码和 Muse 官方要求的完全一致。
 * 不合法时返回 null。
 */
export function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.trim();
  return CODE_RE.test(code) ? code : null;
}

/** 当前小时的种子，例如 2026-10-08T18（UTC，整点自然变化） */
export function hourSeed(date = new Date()) {
  return date.toISOString().slice(0, 13);
}

/**
 * FNV-1a 32 位哈希：用于按小时随机排序。
 * 纯函数，不需要写数据库、不需要 Cron，同一小时内排序稳定。
 */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
