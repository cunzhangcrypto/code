// /api/codes
//   GET  → 当前有效兑换码（按小时随机排序，支持分页）
//   POST → 提交兑换码
//
// 读取量的关键设计：全局随机排序按小时预计算一次，把「兑换码 id 的有序数组」
// 存进 hour_order 的一行（见 schema.sql）。于是 GET 只需要读
// 「1 行排序 + 当页 60 行」，而不是每次把整个有效池全量扫一遍 ——
// rows_read 因此与池子规模解耦，池子涨到几千个也不会拖垮 D1 免费额度。

import {
  json,
  jsonCached,
  normalizeCode,
  hourSeed,
  shiftHourSeed,
  hashString,
  TTL_MS,
} from '../../lib/shared.js';

const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 200;
/** hour_order 保留最近几小时的记录（跨越整点、时钟误差都够用） */
const KEEP_HOURS = 2;
/** 列表响应的边缘缓存秒数：换取 D1 读取量，代价是复制次数最多滞后这么久 */
const LIST_CACHE_SECONDS = 60;

/** 边缘缓存句柄；环境不支持时返回 null，退化为直连 D1 */
function getCache() {
  try {
    return typeof caches !== 'undefined' && caches.default ? caches.default : null;
  } catch {
    return null;
  }
}

/**
 * 读取当前小时的排序。
 * 没有（或数据损坏）就现算一次并入库 —— 每小时只会走到现算这一次。
 */
async function loadOrder(env, seed) {
  const row = await env.DB.prepare('SELECT ids FROM hour_order WHERE hour_seed = ?')
    .bind(seed)
    .first();

  if (row && row.ids) {
    try {
      const ids = JSON.parse(row.ids);
      if (Array.isArray(ids)) return ids;
    } catch {
      /* 数据坏了就重算，不往外抛 */
    }
  }

  return rebuildOrder(env, seed);
}

/** 全量扫一次有效池，算好排序写入 hour_order；顺手物理清掉过期行 */
async function rebuildOrder(env, seed) {
  const now = Date.now();

  const { results } = await env.DB.prepare(
    'SELECT id, code FROM codes WHERE expires_at > ?'
  )
    .bind(now)
    .all();

  const ids = (results || [])
    .slice()
    .sort((a, b) => hashString(a.code + seed) - hashString(b.code + seed))
    .map((row) => row.id);

  await env.DB.batch([
    // 过期行物理删除（连带其复制记录），表不再无限增长。
    // 查询接口本来就只在 expires_at > now 里找码，所以删掉不改变用户看到的结果。
    env.DB.prepare(
      'DELETE FROM code_copies WHERE code_id IN (SELECT id FROM codes WHERE expires_at <= ?)'
    ).bind(now),
    env.DB.prepare('DELETE FROM codes WHERE expires_at <= ?').bind(now),
    env.DB.prepare('INSERT OR REPLACE INTO hour_order (hour_seed, ids) VALUES (?, ?)')
      .bind(seed, JSON.stringify(ids)),
    // 顺手清掉旧记录，别让这张表无限长
    env.DB.prepare('DELETE FROM hour_order WHERE hour_seed < ?').bind(
      shiftHourSeed(seed, -KEEP_HOURS)
    ),
  ]);

  return ids;
}

/**
 * 新提交的码立刻进入当前小时的排序，插入位置随机 ——
 * 否则它会一直待在最后一页，直到下个整点重建排序，对新码不公平。
 * 读写的都是 hour_order 的同一行，无论数组多长都只花 1 行读 + 1 行写。
 */
async function appendToOrder(env, seed, id) {
  const row = await env.DB.prepare('SELECT ids FROM hour_order WHERE hour_seed = ?')
    .bind(seed)
    .first();

  // 本小时还没建过排序，等下一次 GET 重建时会自然带上这个码
  if (!row || !row.ids) return;

  let ids;
  try {
    ids = JSON.parse(row.ids);
  } catch {
    return;
  }
  if (!Array.isArray(ids) || ids.includes(id)) return;

  ids.splice(Math.floor(Math.random() * (ids.length + 1)), 0, id);

  await env.DB.prepare('UPDATE hour_order SET ids = ? WHERE hour_seed = ?')
    .bind(JSON.stringify(ids), seed)
    .run();
}

export async function onRequestGet({ request, env, waitUntil }) {
  try {
    const url = new URL(request.url);

    const sizeRaw = Number(url.searchParams.get('page_size'));
    const pageSize =
      Number.isInteger(sizeRaw) && sizeRaw > 0
        ? Math.min(sizeRaw, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    const pageRaw = Number(url.searchParams.get('page'));
    let page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

    // 边缘缓存用内部合成 URL 做 key，浏览器侧仍然 no-store：
    // 用户刷新一定能到边缘，而边缘最多隔 LIST_CACHE_SECONDS 才碰一次 D1。
    // 必须在读任何数据之前查缓存，否则省不下那次 D1 读取。
    const cache = getCache();
    const cacheKey = cache
      ? new Request(`https://muse-cache.internal/codes?page=${page}&page_size=${pageSize}`, {
          method: 'GET',
        })
      : null;

    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return json(await hit.json());
    }

    const seed = hourSeed();
    const ids = await loadOrder(env, seed);

    const total = ids.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages;

    const start = (page - 1) * pageSize;
    // 去重：一个码理论上可能被追加两次，兜一下避免同页出现重复卡片
    const pageIds = [...new Set(ids.slice(start, start + pageSize))];

    let codes = [];
    if (pageIds.length) {
      // id 数组用 json_each 当「一个参数」传进去，而不是拼 N 个 ?。
      // D1 单条语句最多 100 个绑定参数，拼 ? 的话 page_size 一超过 99 整条语句就会失败。
      const { results } = await env.DB.prepare(
        'SELECT id, code, copy_count FROM codes WHERE expires_at > ? AND id IN (SELECT value FROM json_each(?))'
      )
        .bind(Date.now(), JSON.stringify(pageIds))
        .all();

      // IN 查询不保证顺序，按预计算好的顺序还原
      const byId = new Map((results || []).map((row) => [row.id, row]));
      codes = pageIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((row) => ({ id: row.id, code: row.code, copy_count: row.copy_count }));
    }

    const payload = { codes, total, page, page_size: pageSize, total_pages: totalPages, seed };

    if (cache) {
      try {
        const put = cache.put(cacheKey, jsonCached(payload, LIST_CACHE_SECONDS));
        if (typeof waitUntil === 'function') waitUntil(put);
        else await put;
      } catch {
        /* 写缓存失败不影响本次响应 */
      }
    }

    return json(payload);
  } catch {
    // D1 出错（例如额度打满）时给出可读的 503，而不是让 Worker 抛异常变成 1101
    return json({ error: 'server_error', message: '服务暂时不可用，请稍后重试。' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid_body', message: '请求格式不正确' }, 400);
    }

    const code = normalizeCode(body && body.code);
    if (!code) {
      return json({ error: 'invalid_code', message: '兑换码必须是 6 位英文或数字。' }, 400);
    }

    const now = Date.now();
    const seed = hourSeed();
    const existing = await env.DB.prepare('SELECT id, expires_at FROM codes WHERE code = ?')
      .bind(code)
      .first();

    // 当前有效池中已存在 → 拒绝
    if (existing && existing.expires_at > now) {
      return json({ error: 'duplicate', message: '这个兑换码已经存在，无需重复提交。' }, 409);
    }

    if (existing) {
      // 已过期 → 允许重新提交，开启新的 24 小时周期（复制记录一并重置）
      await env.DB.batch([
        env.DB.prepare('DELETE FROM code_copies WHERE code_id = ?').bind(existing.id),
        env.DB.prepare(
          'UPDATE codes SET created_at = ?, expires_at = ?, copy_count = 0, status = ? WHERE id = ?'
        ).bind(now, now + TTL_MS, 'active', existing.id),
      ]);

      await appendToOrder(env, seed, existing.id);
      return json({ ok: true, code, reused: true }, 201);
    }

    let newId;
    try {
      const inserted = await env.DB.prepare(
        'INSERT INTO codes (code, created_at, expires_at, copy_count, status) VALUES (?, ?, ?, 0, ?)'
      )
        .bind(code, now, now + TTL_MS, 'active')
        .run();
      newId = inserted.meta && inserted.meta.last_row_id;
    } catch (err) {
      // 并发提交同一个新码时，唯一索引兜底
      if (String(err && err.message).includes('UNIQUE')) {
        return json({ error: 'duplicate', message: '这个兑换码已经存在，无需重复提交。' }, 409);
      }
      throw err;
    }

    if (newId) await appendToOrder(env, seed, newId);

    return json({ ok: true, code }, 201);
  } catch {
    return json({ error: 'server_error', message: '服务暂时不可用，请稍后重试。' }, 503);
  }
}
