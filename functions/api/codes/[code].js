// GET /api/codes/:code → 查询兑换码状态
// 只告诉用户：是否仍在公开池中 + 被复制了多少次。
// 不返回 created_at / expires_at / 剩余时间 / 剩余次数。

import { json, normalizeCode } from '../../../lib/shared.js';

export async function onRequestGet({ params, env }) {
  const code = normalizeCode(params.code);
  if (!code) {
    return json({ exists: false, active: false, expired: false });
  }

  const row = await env.DB.prepare(
    'SELECT code, copy_count, expires_at FROM codes WHERE code = ?'
  )
    .bind(code)
    .first();

  if (!row) {
    // 从来没提交过
    return json({ exists: false, active: false, expired: false });
  }

  if (row.expires_at > Date.now()) {
    return json({ exists: true, active: true, copy_count: row.copy_count });
  }

  // 提交过，但已超过 24 小时并从公开池移除
  return json({ exists: false, active: false, expired: true });
}
