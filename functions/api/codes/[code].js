// GET /api/codes/:code → 查询兑换码状态
// 只告诉用户：是否仍在公开池中 + 被复制了多少次。
// 不区分「已过期」和「从没提交过」—— 过期行会被物理清掉，两者都表现为查不到。
// 不返回 created_at / expires_at / 剩余时间 / 剩余次数。

import { json, normalizeCode } from '../../../lib/shared.js';

export async function onRequestGet({ params, env }) {
  const code = normalizeCode(params.code);
  if (!code) {
    return json({ exists: false, active: false });
  }

  try {
    const row = await env.DB.prepare(
      'SELECT copy_count FROM codes WHERE code = ? AND expires_at > ?'
    )
      .bind(code, Date.now())
      .first();

    if (!row) {
      // 不在公开池里：要么超过 24 小时，要么从来没提交过
      return json({ exists: false, active: false });
    }

    return json({ exists: true, active: true, copy_count: row.copy_count });
  } catch {
    // D1 出错时给出可读的 503，而不是让 Worker 抛异常变成 1101
    return json({ error: 'server_error', message: '服务暂时不可用，请稍后重试。' }, 503);
  }
}
