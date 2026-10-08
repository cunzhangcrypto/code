// POST /api/codes/:id/copy → 记录一次复制
// 同一个 device_hash 对同一个码只计一次（靠 code_copies 的唯一约束）。

import { json } from '../../../../lib/shared.js';

export async function onRequestPost({ params, request, env }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'invalid_id' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const deviceHash =
    typeof body.device_hash === 'string' ? body.device_hash.trim() : '';
  if (!/^[a-f0-9]{16,128}$/i.test(deviceHash)) {
    return json({ error: 'invalid_device', message: '设备标识不合法' }, 400);
  }

  const row = await env.DB.prepare('SELECT id, copy_count FROM codes WHERE id = ?')
    .bind(id)
    .first();
  if (!row) {
    return json({ error: 'not_found' }, 404);
  }

  const inserted = await env.DB.prepare(
    'INSERT OR IGNORE INTO code_copies (code_id, device_hash, created_at) VALUES (?, ?, ?)'
  )
    .bind(id, deviceHash, Date.now())
    .run();

  const counted = !!(inserted.meta && inserted.meta.changes > 0);
  let copyCount = row.copy_count;

  if (counted) {
    await env.DB.prepare('UPDATE codes SET copy_count = copy_count + 1 WHERE id = ?')
      .bind(id)
      .run();
    copyCount += 1;
  }

  return json({ ok: true, counted, copy_count: copyCount });
}
