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
    modalText: document.getElementById('modal-text'),
    modalHint: document.getElementById('modal-hint')
  };

  /* ---------- 小工具 ---------- */

  /* 兑换码格式：恰好 6 位英文或数字。与后端 lib/shared.js 的 CODE_RE 必须保持一致。 */
  var CODE_RE = /^[A-Za-z0-9]{6}$/;

  /* 输入不规范时的重庆话吐槽，随机抽一句（每句配一个专属表情） */
  var QUIPS = [
    '给老子的，你娃儿又来捣乱。😤',
    '你娃儿搞啥子名堂，乱劈柴嗦？🤨',
    '莫乱整，这个框框不兴乱填。🙅',
    '啷个回事哦，你当这是许愿池唛？🪙',
    '你娃儿硬是不听招呼。😮‍💨',
    '乱填些啥子，我认都认不到。🤷',
    '要不得，重来。🔄',
    '你这输入法啷个歪成这个样儿。⌨️',
    '莫装莽，好生填。🙃',
    '瓜娃子，英文数字认不到嗦？🔤',
    '你娃儿又在这点儿扯把子。🤥',
    '巴适点填，莫扯拐。⚠️',
    '乱搞些啥子，脑壳痛。🤕',
    '你怕是刚起床，眼睛都还没睁开。😴',
    '这门敲字，键盘要遭你敲烂。💥',
    '喊你填六个，你填一笼包子唛？🥟',
    '你娃儿耍啥子花活。🎪',
    '莫在这点儿打胡乱说。🗣️',
    '正经点，别个还要用。😐',
    '你这个填法，菩萨都看不懂。🙏',
    '硬是要得，填得像天书。📜',
    '你娃儿手抖了唛？🫨',
    '莫乱来，规矩点。📏',
    '这是兑换码，不是密码本。🔐',
    '你填的是啥子，我确实认不到。❓',
    '又来了又来了，天天都遇到你。🔁',
    '兄弟，慢点，看清楚了再填。🐢',
    '你娃儿怕是没睡醒哦。🛌',
    '莫慌，先把眼睛睁起。👀',
    '乱填一气，安逸了？😏',
    '你当这个是抽奖箱嗦，随便抓。🎰',
    '要填就好生填，莫整些幺蛾子。🦋',
    '六个字，不多不少，记到。6️⃣',
    '你娃儿又想搞啥子飞机。✈️',
    '莫豁我，认真点。😑',
    '这个填法，我都要笑出声。😂',
    '幺儿，看清楚了再动手。🧐',
    '你怕是把我当哈儿整。🤡',
    '莫在这点儿耍横。😠',
    '重填，莫得商量。🚫',
    '你娃儿是来搞笑的唛？🎭',
    '这门填，神仙也莫法。🧙',
    '把英文数字认到起，再来。📚',
    '莫给我整些稀奇古怪的。👽',
    '你娃儿胆子大，啥子都敢填。🐯',
    '慢慢来，莫把键盘整冒烟。🔥',
    '看哈再填，莫急这一下。⏳',
    '你娃儿毛焦火辣的，急啥子。🌶️',
    '莫乱扯，正经填一个。🎯',
    '好了好了，重填一个要得不。🤝'
  ];

  function strip(input) {
    return (input || '').trim();
  }

  /* 输入不合规范：随机甩一句重庆话，下面小一号字补上规则 */
  function rejectCode() {
    showModal(QUIPS[Math.floor(Math.random() * QUIPS.length)], '莫乱填，要填正确的muse兑换码');
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

  function showModal(message, hint) {
    el.modalText.textContent = message;

    el.modalHint.hidden = !hint;
    if (hint) el.modalHint.textContent = hint;

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
    if (!CODE_RE.test(code)) {
      rejectCode();
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
    if (!CODE_RE.test(code)) {
      rejectCode();
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
