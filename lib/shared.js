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

/**
 * 规范化兑换码：去掉所有空白字符，限制长度。
 * 只做「去空白」，不改大小写 —— 保证用户复制出去的码和 Muse 官方要求的完全一致。
 * 不合法时返回 null。
 */
export function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.replace(/\s+/g, '');
  if (code.length < 4 || code.length > 64) return null;
  return code;
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
