/* Muse兑换码 · 前端逻辑 */
(function () {
  'use strict';

  var DEVICE_KEY = 'muse_device_id';
  var API = '/api/codes';

  var el = {
    grid: document.getElementById('code-grid'),
    count: document.getElementById('code-count'),
    pager: document.getElementById('code-pager'),
    pagerInfo: document.getElementById('pager-info'),
    pagerPrev: document.getElementById('pager-prev'),
    pagerNext: document.getElementById('pager-next'),
    queryForm: document.getElementById('query-form'),
    queryInput: document.getElementById('query-input'),
    queryResult: document.getElementById('query-result'),
    shareForm: document.getElementById('share-form'),
    shareInput: document.getElementById('share-input'),
    shareResult: document.getElementById('share-result'),
    modal: document.getElementById('modal'),
    modalText: document.getElementById('modal-text')
  };

  /* ---------- 小工具 ---------- */

  function strip(input) {
    return (input || '').replace(/\s+/g, '');
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  function showModal(message) {
    el.modalText.textContent = message;
    el.modal.hidden = false;
  }

  function hideModal() {
    el.modal.hidden = true;
  }

  el.modal.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close')) hideModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !el.modal.hidden) hideModal();
  });

  /* ---------- 设备指纹（只用于复制去重） ---------- */

  var deviceHashPromise = null;

  function fallbackHash(id) {
    var h = 0x811c9dc5;
    for (var i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }

  function getDeviceHash() {
    if (deviceHashPromise) return deviceHashPromise;

    deviceHashPromise = Promise.resolve().then(function () {
      var id = null;
      try {
        id = localStorage.getItem(DEVICE_KEY);
      } catch (err) {
        /* localStorage 不可用时退化为内存态 */
      }
      if (!id) {
        id =
          window.crypto && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()) + Math.random().toString(16).slice(2);
        try {
          localStorage.setItem(DEVICE_KEY, id);
        } catch (err) {
          /* ignore */
        }
      }

      if (!(window.crypto && crypto.subtle)) {
        return fallbackHash(id).padEnd(64, '0');
      }

      return crypto.subtle
        .digest('SHA-256', new TextEncoder().encode(id))
        .then(function (buf) {
          return Array.prototype.map
            .call(new Uint8Array(buf), function (b) {
              return b.toString(16).padStart(2, '0');
            })
            .join('');
        })
        .catch(function () {
          return fallbackHash(id).padEnd(64, '0');
        });
    });

    return deviceHashPromise;
  }

  /* ---------- 兑换码网格 ---------- */

  var PAGE_SIZE = 60;
  var page = 1;
  var totalPages = 1;

  function renderEmpty() {
    el.grid.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'empty';
    var p = document.createElement('p');
    p.textContent = '兑换池现在还是空的，要不你先分享一个？';
    var a = document.createElement('a');
    a.className = 'btn btn--primary';
    a.href = '#share';
    a.textContent = '分享我的兑换码';
    box.appendChild(p);
    box.appendChild(a);
    el.grid.appendChild(box);
  }

  function buildCard(item) {
    // 整张卡就是复制按钮
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'code-card';
    card.title = '点击复制';

    var code = document.createElement('span');
    code.className = 'code-card__code';
    code.textContent = item.code;

    var meta = document.createElement('span');
    meta.className = 'code-card__meta';
    meta.textContent = '该码被复制了 ' + item.copy_count + ' 次';

    card.appendChild(code);
    card.appendChild(meta);
    card.addEventListener('click', function () {
      onCopy(item, card, meta);
    });

    return card;
  }

  function renderPager() {
    if (totalPages <= 1) {
      el.pager.hidden = true;
      return;
    }
    el.pager.hidden = false;
    el.pagerInfo.textContent = '第 ' + page + ' / ' + totalPages + ' 页';
    el.pagerPrev.disabled = page <= 1;
    el.pagerNext.disabled = page >= totalPages;
  }

  function renderCodes(data) {
    el.grid.innerHTML = '';
    el.grid.setAttribute('aria-busy', 'false');

    page = data.page || 1;
    totalPages = data.total_pages || 1;
    el.count.textContent = (data.total || 0) + ' 个';

    var codes = data.codes || [];
    if (!codes.length) {
      renderEmpty();
      renderPager();
      return;
    }

    var frag = document.createDocumentFragment();
    codes.forEach(function (item) {
      frag.appendChild(buildCard(item));
    });
    el.grid.appendChild(frag);
    renderPager();
  }

  function loadCodes(target) {
    if (typeof target === 'number' && target > 0) page = target;

    return fetch(API + '?page=' + page + '&page_size=' + PAGE_SIZE, {
      headers: { accept: 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(renderCodes)
      .catch(function () {
        el.grid.innerHTML = '';
        el.grid.setAttribute('aria-busy', 'false');
        el.pager.hidden = true;
        el.count.textContent = '—';
        var box = document.createElement('div');
        box.className = 'empty';
        var p = document.createElement('p');
        p.textContent = '兑换码加载失败，请刷新页面重试。';
        box.appendChild(p);
        el.grid.appendChild(box);
      });
  }

  el.pagerPrev.addEventListener('click', function () {
    if (page > 1) loadCodes(page - 1);
  });

  el.pagerNext.addEventListener('click', function () {
    if (page < totalPages) loadCodes(page + 1);
  });

  /* ---------- 复制 ---------- */

  function onCopy(item, card, meta) {
    if (card.dataset.busy === '1') return;
    card.dataset.busy = '1';

    copyText(item.code).then(
      function () {
        card.classList.add('is-copied');
        meta.textContent = '✓ 已复制';
        setTimeout(function () {
          card.classList.remove('is-copied');
          meta.textContent = '该码被复制了 ' + item.copy_count + ' 次';
        }, 1600);

        getDeviceHash()
          .then(function (deviceHash) {
            return fetch(API + '/' + item.id + '/copy', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ device_hash: deviceHash })
            });
          })
          .then(function (res) {
            return res.ok ? res.json() : null;
          })
          .then(function (data) {
            if (!data) return;
            item.copy_count = data.copy_count;
            /* 还在显示「已复制」时先别覆盖，交给上面的定时器复原 */
            if (!card.classList.contains('is-copied')) {
              meta.textContent = '该码被复制了 ' + data.copy_count + ' 次';
            }
          })
          .catch(function () {
            /* 复制统计失败不影响用户使用兑换码 */
          })
          .then(function () {
            card.dataset.busy = '0';
          });
      },
      function () {
        card.dataset.busy = '0';
        showModal('复制失败，请手动选中兑换码后复制。');
      }
    );
  }

  /* ---------- 结果渲染 ---------- */

  function renderResult(container, variant, lines) {
    container.innerHTML = '';
    container.className = 'result' + (variant ? ' result--' + variant : '');
    lines.forEach(function (line) {
      var p = document.createElement('p');
      p.className = 'result-line' + (line.strong ? ' result-line--strong' : '');
      if (line.code) {
        p.className = 'result-code';
        p.textContent = line.text;
      } else {
        p.textContent = line.text;
      }
      container.appendChild(p);
    });
    container.hidden = false;
  }

  /* ---------- 查询 ---------- */

  el.queryForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = strip(el.queryInput.value);
    if (!code) {
      showModal('请先输入你的 Muse 兑换码。');
      return;
    }

    var btn = el.queryForm.querySelector('button');
    btn.disabled = true;
    el.queryResult.hidden = true;

    fetch(API + '/' + encodeURIComponent(code), { headers: { accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data.active) {
          renderResult(el.queryResult, 'ok', [
            { code: true, text: code },
            { text: '✓ 当前正在展示', strong: true },
            { text: '该码被复制了 ' + data.copy_count + ' 次' }
          ]);
        } else if (data.expired) {
          renderResult(el.queryResult, 'warn', [
            { code: true, text: code },
            { text: '未找到这个兑换码' },
            { text: '这个兑换码可能已经超过 24 小时，如果你还有可用兑换码，可以重新提交。' }
          ]);
        } else {
          renderResult(el.queryResult, 'muted', [
            { code: true, text: code },
            { text: '未找到这个兑换码' },
            { text: '请检查兑换码是否输入正确。' }
          ]);
        }
      })
      .catch(function () {
        showModal('查询失败，请稍后重试。');
      })
      .then(function () {
        btn.disabled = false;
      });
  });

  /* ---------- 分享 / 提交 ---------- */

  el.shareForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = strip(el.shareInput.value);
    if (!code) {
      showModal('请先输入要分享的 Muse 兑换码。');
      return;
    }
    if (code.length < 4 || code.length > 64) {
      showModal('兑换码长度不正确，请输入 4-64 个字符。');
      return;
    }

    var btn = el.shareForm.querySelector('button');
    btn.disabled = true;
    el.shareResult.hidden = true;

    fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (r) {
        if (r.ok) {
          el.shareInput.value = '';
          renderResult(el.shareResult, 'ok', [
            { text: '✓ 提交成功', strong: true },
            { text: '你的兑换码已经加入兑换码池。' },
            { text: '其他用户现在可以看到并复制这个兑换码。' }
          ]);
          loadCodes();
        } else {
          showModal((r.data && r.data.message) || '提交失败，请稍后重试。');
        }
      })
      .catch(function () {
        showModal('提交失败，请检查网络后重试。');
      })
      .then(function () {
        btn.disabled = false;
      });
  });

  /* ---------- 整点自动重排 ---------- */

  function scheduleHourlyRefresh() {
    var now = new Date();
    var next = new Date(now);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    var delay = next.getTime() - now.getTime() + 3000;
    setTimeout(function () {
      loadCodes();
      scheduleHourlyRefresh();
    }, delay);
  }

  /* ---------- 启动 ---------- */

  loadCodes(1);
  scheduleHourlyRefresh();
})();
