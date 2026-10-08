// /api/codes
//   GET  → 当前有效兑换码（按小时随机排序）
//   POST → 提交兑换码

import { json, normalizeCode, hourSeed, hashString, TTL_MS } from '../../lib/shared.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  const sizeRaw = Number(url.searchParams.get('page_size'));
  const pageSize = Number.isInteger(sizeRaw) && sizeRaw > 0 ? Math.min(sizeRaw, 200) : 60;

  const pageRaw = Number(url.searchParams.get('page'));
  let page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const now = Date.now();

  // 过期判断完全交给 expires_at，不需要 Cron、不需要改 status
  const { results } = await env.DB.prepare(
    'SELECT id, code, copy_count FROM codes WHERE expires_at > ?'
  )
    .bind(now)
    .all();

  // 每小时一个种子：同一小时内排序稳定，进入下一小时自然重排
  const seed = hourSeed();
  const sorted = (results || [])
    .slice()
    .sort((a, b) => hashString(a.code + seed) - hashString(b.code + seed));

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) page = totalPages;

  const start = (page - 1) * pageSize;
  const codes = sorted
    .slice(start, start + pageSize)
    .map((row) => ({ id: row.id, code: row.code, copy_count: row.copy_count }));

  return json({ codes, total, page, page_size: pageSize, total_pages: totalPages, seed });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_body', message: '请求格式不正确' }, 400);
  }

  const code = normalizeCode(body && body.code);
  if (!code) {
    return json(
      { error: 'invalid_code', message: '请输入正确的兑换码（4-64 个字符，不能含空格）' },
      400
    );
  }

  const now = Date.now();
  const existing = await env.DB.prepare('SELECT id, expires_at FROM codes WHERE code = ?')
    .bind(code)
    .first();

  // 当前有效池中已存在 → 拒绝
  if (existing && existing.expires_at > now) {
    return json(
      { error: 'duplicate', message: '这个兑换码已经存在，无需重复提交。' },
      409
    );
  }

  if (existing) {
    // 已过期 → 允许重新提交，开启新的 24 小时周期（复制记录一并重置）
    await env.DB.batch([
      env.DB.prepare('DELETE FROM code_copies WHERE code_id = ?').bind(existing.id),
      env.DB.prepare(
        'UPDATE codes SET created_at = ?, expires_at = ?, copy_count = 0, status = ? WHERE id = ?'
      ).bind(now, now + TTL_MS, 'active', existing.id),
    ]);
    return json({ ok: true, code, reused: true }, 201);
  }

  try {
    await env.DB.prepare(
      'INSERT INTO codes (code, created_at, expires_at, copy_count, status) VALUES (?, ?, ?, 0, ?)'
    )
      .bind(code, now, now + TTL_MS, 'active')
      .run();
  } catch (err) {
    // 并发提交同一个新码时，唯一索引兜底
    if (String(err && err.message).includes('UNIQUE')) {
      return json(
        { error: 'duplicate', message: '这个兑换码已经存在，无需重复提交。' },
        409
      );
    }
    throw err;
  }

  return json({ ok: true, code }, 201);
}
