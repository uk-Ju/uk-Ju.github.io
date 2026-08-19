/* CalHub 웹 계산기 — 각 랜딩 페이지에서 바로 동작하는 간이 계산기 23종.
 * 정밀 계산·기록 저장·플로팅 위젯은 앱이 담당한다. 여기서는 검색 유입 사용자가
 * "바로 계산되는 경험"을 얻고 앱으로 넘어가게 하는 것이 목적.
 * 대출·예적금 반올림은 앱 엔진과 같은 방식(회차별 원화 반올림 / 원 단위 절사). */
(function () {
  'use strict';

  /* ── 숫자 유틸 ─────────────────────────────────────────── */
  function toNum(s) {
    s = String(s == null ? '' : s).replace(/[^0-9.\-]/g, '');
    if (!s || s === '-' || s === '.' || s === '-.') return null;
    var v = Number(s);
    return isFinite(v) ? v : null;
  }
  function toInt(s) {
    var v = toNum(s);
    return v == null ? null : Math.trunc(v);
  }
  function fmt(n, maxDec) {
    if (n == null || !isFinite(n)) return '—';
    return n.toLocaleString('ko-KR', { maximumFractionDigits: maxDec == null ? 8 : maxDec });
  }
  function won(n) {
    if (n == null || !isFinite(n)) return '—';
    var neg = n < 0;
    return (neg ? '-₩' : '₩') + Math.abs(Math.round(n)).toLocaleString('ko-KR');
  }
  function pct(n, d) {
    if (n == null || !isFinite(n)) return '—';
    return fmt(n, d == null ? 2 : d) + '%';
  }
  function floorWon(x) { return Math.floor(x + 1e-7); }   // 원 단위 절사 (예적금 관례)
  function roundWon(x) { return Math.round(x); }          // 원화 반올림 (대출 계열)

  // 입력 칸 천단위 콤마 (소수부는 그대로)
  function commaize(s) {
    var m = String(s).replace(/[^0-9.\-]/g, '');
    if (!m) return '';
    var neg = m[0] === '-' ? '-' : '';
    m = m.replace(/-/g, '');
    var dot = m.indexOf('.');
    var intPart = dot === -1 ? m : m.slice(0, dot);
    var frac = dot === -1 ? '' : '.' + m.slice(dot + 1).replace(/\./g, '');
    intPart = intPart.replace(/^0+(?=\d)/, '');
    return neg + (intPart ? Number(intPart).toLocaleString('ko-KR') : (frac ? '0' : '')) + frac;
  }

  /* ── DOM 헬퍼 ──────────────────────────────────────────── */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ── 빠른입력 프리셋 ───────────────────────────────────────
   *
   * 앱의 `shared_ui/quick_input_row.dart`와 **같은 구성·같은 순서**다
   * (좌→우로 커지는 순 — 2026-07-27 사용자 지시). 웹에서 숫자를 일일이
   * 타이핑하게 두면 "3억 5천만"을 넣는 데만 아홉 번을 눌러야 한다.
   *
   * 앱은 탭=더하기 / 길게 누르기=대체지만, 웹은 길게 누르기가 모바일
   * 브라우저의 텍스트 선택·컨텍스트 메뉴와 겹쳐서 **탭=더하기만** 둔다.
   * 대체가 필요하면 지우개(⌫)로 비우고 다시 누르면 된다.
   */
  var QUICK_PRESETS = {
    principal: [['+100만', 1e6], ['+1000만', 1e7], ['+1억', 1e8]],
    monthly: [['+1만', 1e4], ['+5만', 5e4], ['+10만', 1e5]],
    mid: [['+10만', 1e5], ['+100만', 1e6], ['+1000만', 1e7]],
    months: [['+1월', 1], ['+1년', 12], ['+10년', 120]],
    qty: [['−1', -1], ['+1', 1], ['+10', 10]],
    rate: [['+0.1', 0.1], ['+0.5', 0.5], ['+1', 1]],
  };

  /* 부동소수 누적 방지 — 0.1을 세 번 더해도 0.30000000000000004가 되지
   * 않게 소수 자릿수를 맞춰 끊는다(이율 프리셋에서 실제로 보인다). */
  function addQuick(cur, delta) {
    var base = toNum(cur) || 0;
    var dec = String(delta).indexOf('.');
    dec = dec === -1 ? 0 : String(delta).length - dec - 1;
    var next = base + delta;
    if (next < 0) next = 0;              // 수량 −1이 음수로 내려가지 않게
    return dec ? Number(next.toFixed(dec)) : next;
  }

  /* ── 공용 렌더러 ───────────────────────────────────────────
   * spec.fields: [{k, label(문자열 또는 v=>문자열), type:'num'|'int'|'sel'|'date'|'time'|'chk',
   *               opts:[[값,라벨]], def, ph, suffix, span2,
   *               quick:'principal'|'monthly'|'mid'|'months'|'qty'|'rate'}]
   *   ⚠️ **필드 순서 = 열 배치**다. 서로 대응하는 줄(보유/추가 매수, 첫 분수/둘째 분수,
   *   상품 A/B)은 **같은 열에 같은 성격의 값**이 오도록 순서를 맞춘다 — 1열이 단가인데
   *   아랫줄 1열이 수량이면 눈이 열을 따라 읽지 못한다 (2026-08-12 사용자 지적).
   *   f.showIf(v): 있으면 그 값이 참일 때만 칸이 보인다 — 방식에 따라만 쓰이는
   *   칸(대출 체증률)을 늘 띄워 두면 나머지 사용자에게는 뜻 모를 잡음이 된다.
   * spec.cols: 열 수 (기본 2). 분수처럼 한 묶음이 세 칸인 경우 3.
   * spec.compute(v): null(입력 부족) 또는 [{label, value, hero, dim}] 행 목록
   * spec.custom(host, api): 완전 커스텀 위젯이면 이걸 대신 정의
   */
  function renderWidget(host, spec) {
    if (spec.custom) { spec.custom(host); return; }
    var values = {};
    spec.fields.forEach(function (f) { values[f.k] = f.def != null ? String(f.def) : ''; });

    var form = el('div', 'cw-form' + (spec.cols === 3 ? ' cw-cols-3' : ''));
    var result = el('div', 'cw-result');
    var labelEls = {};
    var wrapEls = {};

    spec.fields.forEach(function (f) {
      var wrap = el('label', 'cw-field' + (f.span2 ? ' cw-span2' : ''));
      wrapEls[f.k] = wrap;
      var lab = el('span', 'cw-label', typeof f.label === 'function' ? f.label(values) : f.label);
      labelEls[f.k] = { el: lab, def: f.label };
      wrap.appendChild(lab);
      var input;
      if (f.type === 'sel') {
        input = document.createElement('select');
        f.opts.forEach(function (o) {
          var op = document.createElement('option');
          op.value = o[0]; op.textContent = o[1];
          input.appendChild(op);
        });
        input.value = values[f.k];
      } else if (f.type === 'date' || f.type === 'time') {
        input = document.createElement('input');
        input.type = f.type;
        input.value = values[f.k];
      } else if (f.type === 'chk') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = values[f.k] === 'true';
        wrap.classList.add('cw-check');
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'decimal';
        input.autocomplete = 'off';
        if (f.ph) input.placeholder = f.ph;
        input.value = values[f.k];
      }
      input.addEventListener('input', onChange);
      input.addEventListener('change', onChange);
      function onChange() {
        if (f.type === 'chk') values[f.k] = input.checked ? 'true' : 'false';
        else values[f.k] = input.value;
        if ((f.type === 'num' || f.type === 'int') && f.comma !== false) {
          var c = commaize(input.value);
          if (c !== input.value) input.value = c;
          values[f.k] = c;
        }
        refreshLabels();
        update();
      }
      wrap.appendChild(input);
      if (f.suffix) wrap.appendChild(el('span', 'cw-suffix', f.suffix));

      // 빠른입력 줄 — 입력 칸 **바로 아래**에 붙는다(앱과 같은 배치).
      var presets = f.quick && QUICK_PRESETS[f.quick];
      if (presets) {
        var quickRow = el('div', 'cw-quick');
        presets.forEach(function (p) {
          var b = el('button', 'cw-quick-btn', p[0]);
          b.type = 'button';
          // <label> 안이라 기본 동작을 막지 않으면 탭이 입력 칸 포커스로
          // 넘어가 모바일에서 키보드가 결과를 덮는다.
          b.addEventListener('click', function (e) {
            e.preventDefault();
            var next = String(addQuick(values[f.k], p[1]));
            values[f.k] = f.comma === false ? next : commaize(next);
            input.value = values[f.k];
            refreshLabels();
            update();
          });
          quickRow.appendChild(b);
        });
        // 지우개 — 그 칸만 비운다. 대체 입력의 출발점이다.
        var clr = el('button', 'cw-quick-btn cw-quick-clear', '⌫');
        clr.type = 'button';
        clr.title = '이 칸만 지우기';
        clr.setAttribute('aria-label', '이 칸만 지우기');
        clr.addEventListener('click', function (e) {
          e.preventDefault();
          values[f.k] = '';
          input.value = '';
          refreshLabels();
          update();
        });
        quickRow.appendChild(clr);
        wrap.appendChild(quickRow);
      }

      form.appendChild(wrap);
    });

    function refreshLabels() {
      spec.fields.forEach(function (f) {
        if (typeof f.label === 'function') labelEls[f.k].el.textContent = f.label(values);
        if (f.showIf) wrapEls[f.k].style.display = f.showIf(values) ? '' : 'none';
      });
    }
    // 첫 그림에도 적용해야 한다 — 안 그러면 조건부 칸이 잠깐 떴다 사라진다.
    refreshLabels();

    function update() {
      var rows = null;
      try { rows = spec.compute(values); } catch (e) { rows = null; }
      renderRows(result, rows, spec.empty);
      if (spec.detail) {
        var d = null;
        // 상세 표가 터져도 요약은 살아 있어야 한다 — 여기서만 삼킨다.
        try { d = rows ? spec.detail(values) : null; } catch (e2) { d = null; }
        renderDetail(detail, d);
      }
    }

    host.appendChild(form);
    host.appendChild(result);
    var detail = el('div', 'cw-detail-host');
    if (spec.detail) host.appendChild(detail);
    update();
  }

  function renderRows(container, rows, emptyMsg) {
    container.innerHTML = '';
    if (!rows || !rows.length) {
      container.appendChild(el('p', 'cw-empty', emptyMsg || '값을 입력하면 결과가 바로 계산됩니다.'));
      return;
    }
    rows.forEach(function (r) {
      if (r.hero) {
        var heroEl = el('div', 'cw-hero');
        heroEl.appendChild(el('div', 'cw-hero-label', r.label));
        heroEl.appendChild(el('div', 'cw-hero-value', r.value));
        container.appendChild(heroEl);
      } else {
        var row = el('div', 'cw-row' + (r.dim ? ' cw-dim' : ''));
        row.appendChild(el('span', 'cw-row-label', r.label));
        row.appendChild(el('span', 'cw-row-value', r.value));
        container.appendChild(row);
      }
    });
  }

  /* ── 접히는 상세 표 ────────────────────────────────────────
   *
   * spec.detail(values) → null 또는
   *   {title, columns:[{label, align}], rows:[[셀…]], note, open}
   *
   * **기본은 접힘**이다(앱의 상환 스케줄과 같은 규칙) — 요약을 보러 온
   * 사람에게 360줄을 먼저 들이밀지 않는다. 긴 표는 처음 [CHUNK]회차만
   * 그리고 [더 보기]로 잇는다(1200회차를 한 번에 그리면 입력할 때마다
   * 수천 개 셀이 다시 만들어져 화면이 버벅인다).
   */
  var DETAIL_CHUNK = 120;

  function renderDetail(container, d) {
    container.innerHTML = '';
    if (!d || !d.rows || !d.rows.length) { container.style.display = 'none'; return; }
    container.style.display = '';

    var box = el('details', 'cw-detail');
    if (d.open) box.open = true;
    var sum = el('summary', 'cw-detail-sum');
    sum.appendChild(el('span', null, d.title || '상세 내역'));
    sum.appendChild(el('span', 'cw-detail-count', d.rows.length.toLocaleString('ko-KR') + '회차'));
    box.appendChild(sum);

    var scroller = el('div', 'cw-detail-scroll');
    var table = el('table', 'cw-table');
    var thead = el('thead');
    var htr = el('tr');
    d.columns.forEach(function (c) {
      var th = el('th', c.align === 'right' ? 'cw-num' : null, c.label);
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    var tbody = el('tbody');
    table.appendChild(tbody);
    scroller.appendChild(table);
    box.appendChild(scroller);

    var shown = 0;
    var more = el('button', 'cw-detail-more');
    more.type = 'button';

    function draw() {
      var to = Math.min(shown + DETAIL_CHUNK, d.rows.length);
      var frag = document.createDocumentFragment();
      for (var r = shown; r < to; r++) {
        var row = d.rows[r];
        var tr = el('tr', row.cls || null);
        for (var c = 0; c < d.columns.length; c++) {
          var td = el('td', d.columns[c].align === 'right' ? 'cw-num' : null,
            (row.cells || row)[c]);
          tr.appendChild(td);
        }
        frag.appendChild(tr);
      }
      tbody.appendChild(frag);
      shown = to;
      if (shown >= d.rows.length) {
        more.style.display = 'none';
      } else {
        more.style.display = '';
        more.textContent = '더 보기 (' + shown.toLocaleString('ko-KR') + ' / '
          + d.rows.length.toLocaleString('ko-KR') + '회차)';
      }
    }
    more.addEventListener('click', function (e) { e.preventDefault(); draw(); });
    draw();
    box.appendChild(more);
    if (d.note) box.appendChild(el('p', 'cw-detail-note', d.note));
    container.appendChild(box);
  }

  /* ── 대출 엔진 (회차별 원화 반올림 + 마지막 회차 잔액 보정) ──
   *
   * 앱(`core/calc/loan_calc.dart`)과 **같은 규칙**이다. 앱은 정확 유리수로
   * 누적하고 여기는 배정도 실수라 아주 긴 기간에서 몇 원이 갈릴 수 있지만,
   * 기준 케이스는 원 단위까지 일치하는지 확인하고 넣는다.
   *
   * [gradPct]는 체증식 전용 — 대출 원금 대비 **매월 상환금 증가액**의 비율(%).
   */
  function computeLoan(P, annualPct, months, grace, method, gradPct) {
    var i = annualPct / 100 / 12;
    var n = months - grace;
    if (P <= 0 || months <= 0 || n <= 0 || annualPct < 0 || months > 1200) return null;
    var totalInterest = 0, bal = P, k;
    // [schedule] 회차별 내역 — 합계와 **같은 루프**에서 모은다. 표를 위해
    // 다시 계산하면 합계와 표가 갈라질 수 있다(앱 §7-4-33의 풀이 규칙과 같은 이유).
    var schedule = [];
    function push(no, pay, interest, principal, grace) {
      schedule.push({
        no: no, pay: pay, interest: interest,
        principal: principal, balance: bal, grace: !!grace,
      });
    }
    for (k = 1; k <= grace; k++) {
      var gi = roundWon(bal * i);
      totalInterest += gi;
      push(k, gi, gi, 0, true);   // 거치 중엔 이자만 — 잔액이 줄지 않는다
    }
    var firstPay = null, monthly = null, stepUp = null, lastPay = null;
    if (method === 'annuity') {
      var A = i === 0 ? P / n : P * i / (1 - Math.pow(1 + i, -n));
      monthly = roundWon(A);
      for (k = 1; k <= n; k++) {
        var it = roundWon(bal * i);
        var pr = (k === n) ? bal : monthly - it;
        totalInterest += it;
        bal -= pr;
        push(grace + k, it + pr, it, pr);
      }
      firstPay = monthly;
    } else if (method === 'principal') {
      var basePr = P / n;
      for (k = 1; k <= n; k++) {
        var it2 = roundWon(bal * i);
        var pr2 = (k === n) ? bal : roundWon(basePr);
        totalInterest += it2;
        if (k === 1) firstPay = pr2 + it2;
        bal -= pr2;
        push(grace + k, it2 + pr2, it2, pr2);
      }
    } else if (method === 'graduated') {
      // 체증식 — 첫 상환금이 이자와 같아 납입원금 0에서 출발하고, 이후 매 회차
      // **정액**(원금 × 체증률)씩 늘어난다. 체증률은 완전상환을 위해 역산되는
      // 값이 아니라서 **만기에 잔액이 남고**, 마지막 회차가 그것을 일시 상환한다.
      var g = (gradPct == null ? 0.0008 : gradPct) / 100;
      if (g < 0) return null;
      var base = roundWon(P * i);
      stepUp = roundWon(P * g);
      for (k = 1; k <= n; k++) {
        var it3 = roundWon(bal * i);
        var pay3 = (k === n) ? bal + it3 : base + stepUp * (k - 1);
        var pr3 = (k === n) ? bal : pay3 - it3;
        totalInterest += it3;
        if (k === 1) firstPay = pay3;
        if (k === n) lastPay = pay3;
        bal -= pr3;
        push(grace + k, pay3, it3, pr3);
      }
    } else { // bullet 만기일시
      var mi = roundWon(P * i);
      totalInterest += mi * n;
      firstPay = mi;
      for (k = 1; k <= n; k++) {
        // 원금은 만기에 한 번에 — 마지막 회차만 잔액이 0으로 떨어진다.
        var isLast = k === n;
        if (isLast) bal = 0;
        push(grace + k, isLast ? mi + P : mi, mi, isLast ? P : 0);
      }
    }
    return {
      firstPay: firstPay,
      monthly: monthly,
      stepUp: stepUp,
      lastPay: lastPay,
      totalInterest: totalInterest,
      totalPay: P + totalInterest,
      schedule: schedule,
    };
  }

  /* ── BigInt 분수 유틸 ──────────────────────────────────── */
  function bgcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { var t = a % b; a = b; b = t; } return a; }

  /* ── 소수 판정·소인수분해 (BigInt) ─────────────────────── */
  function powmod(b, e, m) { var r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
  function isPrime(n) {
    if (n < 2n) return false;
    var smalls = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
    for (var i = 0; i < smalls.length; i++) { if (n === smalls[i]) return true; if (n % smalls[i] === 0n) return false; }
    var d = n - 1n, r = 0n;
    while ((d & 1n) === 0n) { d >>= 1n; r++; }
    for (var j = 0; j < smalls.length; j++) {
      var x = powmod(smalls[j], d, n);
      if (x === 1n || x === n - 1n) continue;
      var ok = false;
      for (var k = 1n; k < r; k++) { x = x * x % n; if (x === n - 1n) { ok = true; break; } }
      if (!ok) return false;
    }
    return true;
  }
  function pollard(n) {
    if (n % 2n === 0n) return 2n;
    for (var c = 1n; ; c++) {
      var x = 2n, y = 2n, d = 1n;
      while (d === 1n) {
        x = (x * x + c) % n;
        y = (y * y + c) % n; y = (y * y + c) % n;
        d = bgcd(x > y ? x - y : y - x, n);
      }
      if (d !== n) return d;
    }
  }
  function factorize(n) {
    var map = new Map();
    function add(p) { map.set(p, (map.get(p) || 0) + 1); }
    var ps = [2n, 3n, 5n, 7n, 11n, 13n];
    for (var i = 0; i < ps.length; i++) { while (n % ps[i] === 0n) { add(ps[i].toString()); n /= ps[i]; } }
    var stack = n > 1n ? [n] : [];
    while (stack.length) {
      var m = stack.pop();
      if (m === 1n) continue;
      if (isPrime(m)) { add(m.toString()); continue; }
      var d = pollard(m);
      stack.push(d, m / d);
    }
    return map;
  }

  /* ── 날짜 유틸 (UTC 정수 연산 — 시간대 안전) ───────────── */
  function parseDate(s) {
    if (!s) return null;
    var m = s.split('-');
    if (m.length !== 3) return null;
    return Date.UTC(+m[0], +m[1] - 1, +m[2]);
  }
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  function fmtDate(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '년 ' + (d.getUTCMonth() + 1) + '월 ' + d.getUTCDate() + '일 (' + WEEKDAYS[d.getUTCDay()] + ')';
  }

  /* ── 수식 파서 (일반·공학) ─────────────────────────────── */
  var FUNCS = {
    sin: function (x, deg) { return Math.sin(deg ? x * Math.PI / 180 : x); },
    cos: function (x, deg) { return Math.cos(deg ? x * Math.PI / 180 : x); },
    tan: function (x, deg) { return Math.tan(deg ? x * Math.PI / 180 : x); },
    log: function (x) { return Math.log10(x); },
    ln: function (x) { return Math.log(x); },
    sqrt: function (x) { return Math.sqrt(x); },
    abs: function (x) { return Math.abs(x); },
  };
  function evalExpr(src, sci, deg) {
    var s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '').replace(/\s+/g, '');
    if (!s) return null;
    var pos = 0;
    function peek() { return s[pos]; }
    function fail() { throw new Error('parse'); }
    function number() {
      var m = /^\d+(\.\d+)?/.exec(s.slice(pos));
      if (!m) fail();
      pos += m[0].length;
      return Number(m[0]);
    }
    function atom() {
      var c = peek();
      if (c === '(') { pos++; var v = expr(); if (peek() !== ')') fail(); pos++; return post(v); }
      if (c === '-') { pos++; return -atom(); }
      if (c === '+') { pos++; return atom(); }
      if (sci) {
        var fm = /^(sin|cos|tan|log|ln|sqrt|abs)\(/.exec(s.slice(pos));
        if (fm) {
          pos += fm[1].length + 1;
          var arg = expr();
          if (peek() !== ')') fail();
          pos++;
          return post(FUNCS[fm[1]](arg, deg));
        }
        if (s.startsWith('pi', pos) || s.startsWith('π', pos)) { pos += s[pos] === 'π' ? 1 : 2; return post(Math.PI); }
        if (peek() === 'e' && !/[a-z]/.test(s[pos + 1] || '')) { pos++; return post(Math.E); }
      }
      if (/\d/.test(c)) return post(number());
      fail();
    }
    function post(v) {
      for (;;) {
        if (peek() === '%') { pos++; v = v / 100; continue; }
        if (sci && peek() === '!') {
          pos++;
          if (v < 0 || v > 170 || v !== Math.floor(v)) fail();
          var r = 1; for (var i = 2; i <= v; i++) r *= i;
          v = r; continue;
        }
        if (sci && peek() === '^') { pos++; v = Math.pow(v, atom()); continue; }
        break;
      }
      return v;
    }
    function term() {
      var v = atom();
      for (;;) {
        var c = peek();
        if (c === '*') { pos++; v *= atom(); }
        else if (c === '/') { pos++; v /= atom(); }
        else break;
      }
      return v;
    }
    function expr() {
      var v = term();
      for (;;) {
        var c = peek();
        if (c === '+') { pos++; v += term(); }
        else if (c === '-') { pos++; v -= term(); }
        else break;
      }
      return v;
    }
    var out = expr();
    if (pos !== s.length) fail();
    return isFinite(out) ? out : null;
  }

  /* ── 단위 변환 데이터 ──────────────────────────────────── */
  var UNIT_DATA = {
    length: { label: '길이', units: [['mm', 0.001], ['cm', 0.01], ['m', 1], ['km', 1000], ['인치(in)', 0.0254], ['피트(ft)', 0.3048], ['야드(yd)', 0.9144], ['마일(mi)', 1609.344]] },
    weight: { label: '무게', units: [['mg', 0.000001], ['g', 0.001], ['kg', 1], ['톤(t)', 1000], ['돈', 0.00375], ['근', 0.6], ['파운드(lb)', 0.45359237], ['온스(oz)', 0.028349523125]] },
    area: { label: '넓이', units: [['㎡', 1], ['평', 400 / 121], ['아르(a)', 100], ['헥타르(ha)', 10000], ['㎢', 1000000], ['ft²', 0.09290304]] },
    volume: { label: '부피', units: [['mL', 0.001], ['L', 1], ['m³', 1000], ['갤런(gal)', 3.785411784], ['말', 18]] },
    temp: { label: '온도', units: [['섭씨(°C)', 'C'], ['화씨(°F)', 'F'], ['켈빈(K)', 'K']] },
    data: { label: '데이터', units: [['B', 1], ['KB', 1024], ['MB', 1048576], ['GB', 1073741824], ['TB', 1099511627776]] },
  };
  function convTemp(v, from, to) {
    var c = from === 'C' ? v : from === 'F' ? (v - 32) * 5 / 9 : v - 273.15;
    return to === 'C' ? c : to === 'F' ? c * 9 / 5 + 32 : c + 273.15;
  }

  /* ── 환율 ──────────────────────────────────────────────── */
  var FX_CODES = ['KRW', 'USD', 'JPY', 'EUR', 'CNY', 'GBP', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD', 'THB', 'VND', 'PHP', 'TWD'];
  var FX_NAMES = { KRW: '대한민국 원', USD: '미국 달러', JPY: '일본 엔', EUR: '유로', CNY: '중국 위안', GBP: '영국 파운드', AUD: '호주 달러', CAD: '캐나다 달러', CHF: '스위스 프랑', HKD: '홍콩 달러', SGD: '싱가포르 달러', THB: '태국 바트', VND: '베트남 동', PHP: '필리핀 페소', TWD: '대만 달러' };
  function loadFx(cb) {
    var KEY = 'calhub.fx';
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* ignore */ }
    if (cached && Date.now() - cached.t < 6 * 3600 * 1000) { cb(cached); return; }
    fetch('https://open.er-api.com/v6/latest/USD').then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.rates) {
        var data = { t: Date.now(), rates: j.rates };
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
        cb(data);
      } else cb(cached);
    }).catch(function () { cb(cached); });
  }

  /* ── GPA 등급표 ────────────────────────────────────────── */
  var GPA_TABLES = {
    '4.5': [['A+', 4.5], ['A0', 4.0], ['B+', 3.5], ['B0', 3.0], ['C+', 2.5], ['C0', 2.0], ['D+', 1.5], ['D0', 1.0], ['F', 0]],
    '4.3': [['A+', 4.3], ['A0', 4.0], ['A-', 3.7], ['B+', 3.3], ['B0', 3.0], ['B-', 2.7], ['C+', 2.3], ['C0', 2.0], ['C-', 1.7], ['D+', 1.3], ['D0', 1.0], ['D-', 0.7], ['F', 0]],
    '4.0': [['A', 4.0], ['B', 3.0], ['C', 2.0], ['D', 1.0], ['F', 0]],
  };

  /* ══ 계산기 정의 ═══════════════════════════════════════════ */
  var WIDGETS = {};

  /* 물타기 — 1열 = 단가, 2열 = 수량 (보유 줄과 추가 매수 줄이 열로 대응한다) */
  WIDGETS.single = {
    fields: [
      { k: 'avg', label: '보유 평균 단가', type: 'num', ph: '예: 50,000', quick: 'mid' },
      { k: 'qty', label: '보유 수량', type: 'num', ph: '예: 100', quick: 'qty' },
      { k: 'price', label: '추가 매수 단가', type: 'num', ph: '예: 40,000', quick: 'mid' },
      { k: 'add', label: '추가 매수 수량', type: 'num', ph: '예: 100', quick: 'qty' },
    ],
    compute: function (v) {
      var q = toNum(v.qty), a = toNum(v.avg), p = toNum(v.price), add = toNum(v.add);
      if (q == null || a == null || p == null || add == null || q < 0 || add < 0 || q + add === 0) return null;
      var newAvg = (q * a + add * p) / (q + add);
      var dec = Math.max((String(v.avg).split('.')[1] || '').length, (String(v.price).split('.')[1] || '').length, 2);
      var rows = [
        { label: '새 평균 단가', value: fmt(newAvg, dec), hero: true },
        { label: '총 보유 수량', value: fmt(q + add) },
        { label: '총 투자 금액', value: won(q * a + add * p) },
      ];
      var delta = a - newAvg;
      rows.push({ label: '평균 단가 변동', value: fmt(Math.abs(delta), dec) + (delta > 0 ? ' 내려감' : delta < 0 ? ' 올라감' : ' 변동 없음') });
      if (p > 0) {
        rows.push({ label: '본전까지 필요 상승률 (매수가 기준)', value: pct((newAvg / p - 1) * 100) });
        rows.push({ label: '현재 손익률 (매수가 기준)', value: pct((p / newAvg - 1) * 100) });
      }
      return rows;
    },
  };

  /* 다중 물타기 — 커스텀 (차수 추가) */
  WIDGETS.multi = {
    custom: function (host) {
      var start = { price: '', qty: '' };
      var stages = [{ price: '', qty: '' }];
      var MAX = 30;
      var form = el('div', 'cw-form cw-multi');
      var stageBox = el('div', 'cw-stages cw-span2');
      var result = el('div', 'cw-result');

      /* [quick]는 시작 보유 두 칸에만 준다 — 차수는 최대 30줄이라
       * 줄마다 버튼 넉 장을 깔면 표가 버튼밭이 된다. */
      function numField(label, obj, key, ph, quick) {
        var wrap = el('label', 'cw-field');
        wrap.appendChild(el('span', 'cw-label', label));
        var input = document.createElement('input');
        input.type = 'text'; input.inputMode = 'decimal'; input.placeholder = ph || '';
        input.value = obj[key];
        input.addEventListener('input', function () {
          var c = commaize(input.value);
          if (c !== input.value) input.value = c;
          obj[key] = c;
          update();
        });
        wrap.appendChild(input);
        var presets = quick && QUICK_PRESETS[quick];
        if (presets) {
          var qrow = el('div', 'cw-quick');
          presets.forEach(function (p) {
            var b = el('button', 'cw-quick-btn', p[0]);
            b.type = 'button';
            b.addEventListener('click', function (e) {
              e.preventDefault();
              obj[key] = commaize(String(addQuick(obj[key], p[1])));
              input.value = obj[key];
              update();
            });
            qrow.appendChild(b);
          });
          var clr = el('button', 'cw-quick-btn cw-quick-clear', '⌫');
          clr.type = 'button';
          clr.title = '이 칸만 지우기';
          clr.setAttribute('aria-label', '이 칸만 지우기');
          clr.addEventListener('click', function (e) {
            e.preventDefault();
            obj[key] = ''; input.value = ''; update();
          });
          qrow.appendChild(clr);
          wrap.appendChild(qrow);
        }
        return wrap;
      }

      function rebuildStages() {
        stageBox.innerHTML = '';
        stages.forEach(function (st, idx) {
          var row = el('div', 'cw-stage');
          row.appendChild(el('span', 'cw-stage-no', (idx + 1) + '차'));
          row.appendChild(numField('매수 단가', st, 'price'));
          row.appendChild(numField('추가 수량', st, 'qty'));
          if (stages.length > 1) {
            var del = el('button', 'cw-stage-del', '✕');
            del.type = 'button';
            del.addEventListener('click', function () { stages.splice(idx, 1); rebuildStages(); update(); });
            row.appendChild(del);
          }
          stageBox.appendChild(row);
        });
        var addBtn = el('button', 'cw-add-stage', '+ 차수 추가');
        addBtn.type = 'button';
        addBtn.disabled = stages.length >= MAX;
        addBtn.addEventListener('click', function () { if (stages.length < MAX) { stages.push({ price: '', qty: '' }); rebuildStages(); update(); } });
        stageBox.appendChild(addBtn);
      }

      function update() {
        var p0 = toNum(start.price), q0 = toNum(start.qty);
        if (p0 == null || q0 == null || q0 < 0) { renderRows(result, null); return; }
        var totQty = q0, totInvest = q0 * p0;
        var rows = [];
        var valid = 0;
        stages.forEach(function (st, idx) {
          var p = toNum(st.price), q = toNum(st.qty);
          if (p == null || q == null || q <= 0) return;
          valid++;
          totQty += q; totInvest += p * q;
          rows.push({ label: (idx + 1) + '차 누적 평균 단가 (수량 ' + fmt(totQty) + ')', value: fmt(totInvest / totQty, 2) });
        });
        if (!valid) { renderRows(result, null, '차수의 매수 단가·수량을 입력하면 누적 평균 단가가 계산됩니다.'); return; }
        rows.unshift({ label: '최종 평균 단가', value: fmt(totInvest / totQty, 2), hero: true });
        rows.push({ label: '총 보유 수량', value: fmt(totQty) });
        rows.push({ label: '총 투자 금액', value: won(totInvest) });
        renderRows(result, rows);
      }

      form.appendChild(numField('시작 평균 단가', start, 'price', '예: 10,000', 'mid'));
      form.appendChild(numField('시작 수량', start, 'qty', '예: 10', 'qty'));
      form.appendChild(stageBox);
      rebuildStages();
      host.appendChild(form);
      host.appendChild(result);
      update();
    },
  };

  /* 대출 — 2행은 개월 칸끼리(기간·거치기간) 나란히 둔다 */
  WIDGETS.loan = {
    fields: [
      { k: 'p', label: '대출 원금 (원)', type: 'num', ph: '예: 350,000,000', span2: true, quick: 'principal' },
      { k: 'r', label: '연이율 (%)', type: 'num', ph: '예: 1.7', quick: 'rate' },
      { k: 'm', label: '상환 방식', type: 'sel', def: 'annuity', opts: [['annuity', '원리금균등'], ['principal', '원금균등'], ['bullet', '만기일시'], ['graduated', '체증식']] },
      { k: 'n', label: '기간 (개월)', type: 'num', ph: '예: 360', quick: 'months' },
      { k: 'g', label: '거치기간 (개월)', type: 'num', ph: '0', quick: 'months' },
      // 체증식에서만 보인다 — 다른 방식에서는 계산에 쓰이지도 않는 칸이다.
      {
        k: 'gr', label: '체증률 (%)', type: 'num', def: '0.0008', span2: true,
        showIf: function (v) { return v.m === 'graduated'; },
      },
    ],
    compute: function (v) {
      var P = toNum(v.p), r = toNum(v.r), n = toInt(v.n), g = toInt(v.g) || 0;
      if (P == null || r == null || n == null) return null;
      var grad = v.m === 'graduated' ? toNum(v.gr) : null;
      var out = computeLoan(P, r, n, g, v.m, grad);
      if (!out) return null;
      var heroLabel = v.m === 'annuity' ? '월 상환액' : v.m === 'bullet' ? '월 이자' : '1회차 상환액';
      var rows = [
        { label: heroLabel, value: won(out.firstPay), hero: true },
      ];
      if (v.m === 'graduated') {
        // 체증식은 회차마다 금액이 달라 히어로 하나로는 상환 계획을 알 수 없다.
        // **만기에 한 번에 갚는 금액**을 빼면 특히 그렇다 — 앱과 같은 규칙.
        rows.push({ label: '매월 상환액 증가', value: '+' + won(out.stepUp) });
        rows.push({ label: '만기 일시상환액 (' + n + '회차)', value: won(out.lastPay) });
      }
      rows.push({ label: '총 이자', value: won(out.totalInterest) });
      rows.push({ label: '총 상환액', value: won(out.totalPay) });
      rows.push({ label: '대출 원금', value: won(P), dim: true });
      return rows;
    },
    detail: function (v) {
      var P = toNum(v.p), r = toNum(v.r), n = toInt(v.n), g = toInt(v.g) || 0;
      if (P == null || r == null || n == null) return null;
      var grad = v.m === 'graduated' ? toNum(v.gr) : null;
      var out = computeLoan(P, r, n, g, v.m, grad);
      if (!out) return null;
      var note = '회차마다 원 단위로 반올림하므로 **마지막 회차 금액이 다른 것이 정상**입니다'
        + ' — 은행 상환표와 같은 방식입니다.';
      if (g > 0) note = '거치기간 ' + g + '회차 동안은 이자만 내고 원금이 줄지 않습니다. ' + note;
      if (v.m === 'graduated') {
        note = '체증률은 완전상환에 맞춰 정해진 값이 아니라 만기에 잔액이 남고,'
          + ' 마지막 회차가 그것을 한 번에 갚습니다. ' + note;
      }
      return {
        title: '회차별 상환 내역',
        columns: [
          { label: '회차' },
          { label: '상환금', align: 'right' },
          { label: '이자', align: 'right' },
          { label: '원금', align: 'right' },
          { label: '남은 원금', align: 'right' },
        ],
        rows: out.schedule.map(function (s) {
          return {
            cls: s.grace ? 'cw-dim' : null,
            cells: [
              s.no + (s.grace ? ' (거치)' : ''),
              won(s.pay), won(s.interest), won(s.principal), won(s.balance),
            ],
          };
        }),
        note: note.replace(/\*\*/g, ''),
      };
    },
  };

  /* 예금 / 적금 공용 */
  function depositCompute(isSavings) {
    return function (v) {
      var P = toNum(v.p), r = toNum(v.r), n = toInt(v.n);
      if (P == null || r == null || n == null || P <= 0 || n <= 0 || n > 1200 || r < 0) return null;
      var i = r / 100 / 12;
      var pre;
      if (isSavings) {
        // 기수불(매월 초 납입) 기준 — 단리: 납입분마다 남은 개월치 이자, 월복리: 연금 종가
        pre = v.m === 'compound'
          ? (i === 0 ? 0 : P * (1 + i) * (Math.pow(1 + i, n) - 1) / i - P * n)
          : P * i * n * (n + 1) / 2;
      } else {
        pre = v.m === 'compound' ? P * (Math.pow(1 + i, n) - 1) : P * (r / 100) * (n / 12);
      }
      var preW = floorWon(pre);
      var taxRate = Number(v.t);
      var tax = floorWon(preW * taxRate / 100);
      var principal = isSavings ? P * n : P;
      return [
        { label: '만기 실수령액', value: won(principal + preW - tax), hero: true },
        { label: '원금 합계', value: won(principal) },
        { label: '세전 이자', value: won(preW) },
        { label: '이자 과세 (' + (taxRate ? taxRate + '%' : '비과세') + ')', value: won(tax) },
        { label: '세후 이자', value: won(preW - tax) },
      ];
    };
  }

  /* 예금·적금 월별 표 — 그 달까지 넣은 원금과 그때까지 붙은 세전 이자.
   *
   * **누적값은 요약과 같은 식을 회차 n에 그대로 적용**해서 구한다. 표를 위해
   * 다른 식을 쓰면 마지막 줄이 요약과 안 맞는다(회귀가 그것을 검사한다). */
  function depositDetail(isSavings) {
    return function (v) {
      var P = toNum(v.p), r = toNum(v.r), n = toInt(v.n);
      if (P == null || r == null || n == null || P <= 0 || n <= 0 || n > 1200 || r < 0) return null;
      var i = r / 100 / 12;
      var taxRate = Number(v.t);
      function preAt(k) {
        if (isSavings) {
          return v.m === 'compound'
            ? (i === 0 ? 0 : P * (1 + i) * (Math.pow(1 + i, k) - 1) / i - P * k)
            : P * i * k * (k + 1) / 2;
        }
        return v.m === 'compound' ? P * (Math.pow(1 + i, k) - 1) : P * (r / 100) * (k / 12);
      }
      var rows = [];
      for (var k = 1; k <= n; k++) {
        var principal = isSavings ? P * k : P;
        var preW = floorWon(preAt(k));
        var tax = floorWon(preW * taxRate / 100);
        rows.push({
          cells: [k, won(principal), won(preW), won(principal + preW - tax)],
        });
      }
      return {
        title: '월별 누적 내역',
        columns: [
          { label: '회차' },
          { label: isSavings ? '누적 납입액' : '원금', align: 'right' },
          { label: '누적 세전 이자', align: 'right' },
          { label: '그때 해지 시 실수령', align: 'right' },
        ],
        rows: rows,
        note: '이자는 원 단위로 절사합니다(예적금 관례). 마지막 줄이 만기 금액입니다.'
          + ' 중도 해지하면 약정 이율이 아니라 중도해지 이율이 적용되므로 실제 금액은'
          + ' 이 표보다 적을 수 있습니다.',
      };
    };
  }
  var TAX_OPTS = [['15.4', '일반과세 15.4%'], ['9.5', '세금우대 9.5%'], ['0', '비과세']];
  var METHOD_OPTS = [['simple', '단리'], ['compound', '월복리']];
  WIDGETS.deposit = {
    fields: [
      { k: 'p', label: '예치 금액 (원)', type: 'num', ph: '예: 10,000,000', span2: true, quick: 'principal' },
      { k: 'r', label: '연이율 (%)', type: 'num', ph: '예: 3.5', quick: 'rate' },
      { k: 'n', label: '기간 (개월)', type: 'num', ph: '예: 12', quick: 'months' },
      { k: 'm', label: '이자 방식', type: 'sel', def: 'simple', opts: METHOD_OPTS },
      { k: 't', label: '과세', type: 'sel', def: '15.4', opts: TAX_OPTS },
    ],
    compute: depositCompute(false),
    detail: depositDetail(false),
  };
  WIDGETS.savings = {
    fields: [
      { k: 'p', label: '월 납입액 (원)', type: 'num', ph: '예: 500,000', span2: true, quick: 'monthly' },
      { k: 'r', label: '연이율 (%)', type: 'num', ph: '예: 4.0', quick: 'rate' },
      { k: 'n', label: '기간 (개월)', type: 'num', ph: '예: 12', quick: 'months' },
      { k: 'm', label: '이자 방식', type: 'sel', def: 'simple', opts: METHOD_OPTS },
      { k: 't', label: '과세', type: 'sel', def: '15.4', opts: TAX_OPTS },
    ],
    compute: depositCompute(true),
    detail: depositDetail(true),
  };

  /* 자동차 대출 — 금액 줄 / 숫자 줄 / 선택 줄로 성격을 맞춘다 */
  WIDGETS.car_loan = {
    fields: [
      { k: 'price', label: '차량 가격 (원)', type: 'num', ph: '예: 30,000,000', quick: 'principal' },
      { k: 'down', label: '선수금 (원)', type: 'num', ph: '0', quick: 'mid' },
      { k: 'r', label: '할부 연이율 (%)', type: 'num', ph: '예: 5.5', quick: 'rate' },
      { k: 'n', label: '할부 기간 (개월)', type: 'num', ph: '예: 36', quick: 'months' },
      { k: 'car', label: '차종 (취득세)', type: 'sel', def: '7', span2: true, opts: [['7', '승용 7%'], ['4', '경차 4%'], ['5', '승합·화물 5%']] },
    ],
    compute: function (v) {
      var price = toNum(v.price), down = toNum(v.down) || 0, r = toNum(v.r), n = toInt(v.n);
      if (price == null || r == null || n == null || price <= 0) return null;
      var financed = price - down;
      if (financed < 0) return null;
      var acqTax = roundWon(price * Number(v.car) / 100);
      var out = financed > 0 ? computeLoan(financed, r, n, 0, 'annuity') : { firstPay: 0, totalInterest: 0, totalPay: 0 };
      if (!out) return null;
      return [
        { label: '월 할부금', value: won(out.firstPay), hero: true },
        { label: '할부 원금', value: won(financed) },
        { label: '할부 총 이자', value: won(out.totalInterest) },
        { label: '취득세', value: won(acqTax) },
        { label: '총 구입 비용 (차량가+이자+취득세)', value: won(price + out.totalInterest + acqTax) },
      ];
    },
    detail: function (v) {
      var price = toNum(v.price), down = toNum(v.down) || 0, r = toNum(v.r), n = toInt(v.n);
      if (price == null || r == null || n == null || price <= 0) return null;
      var financed = price - down;
      if (financed <= 0) return null;   // 일시불이면 보여 줄 회차가 없다
      var out = computeLoan(financed, r, n, 0, 'annuity');
      if (!out) return null;
      return {
        title: '회차별 할부 내역',
        columns: [
          { label: '회차' },
          { label: '할부금', align: 'right' },
          { label: '이자', align: 'right' },
          { label: '원금', align: 'right' },
          { label: '남은 원금', align: 'right' },
        ],
        rows: out.schedule.map(function (s) {
          return { cells: [s.no, won(s.pay), won(s.interest), won(s.principal), won(s.balance)] };
        }),
        note: '취득세·부대비용은 할부 원금에 넣지 않고 따로 계산합니다.'
          + ' 회차마다 원 단위로 반올림하므로 마지막 회차 금액이 다른 것이 정상입니다.',
      };
    },
  };

  /* 임금 */
  WIDGETS.wage = {
    fields: [
      { k: 'unit', label: '기준 단위', type: 'sel', def: 'hour', opts: [['hour', '시급'], ['month', '월급'], ['year', '연봉']] },
      { k: 'amt', label: function (v) { return ({ hour: '시급', month: '월급', year: '연봉' })[v.unit] + ' (원)'; }, type: 'num', ph: '예: 10,320', quick: 'monthly' },
      { k: 'week', label: '주 소정근로시간', type: 'num', def: '40' },
      { k: 'day', label: '하루 근로시간', type: 'num', def: '8' },
    ],
    compute: function (v) {
      var amt = toNum(v.amt), w = toNum(v.week), d = toNum(v.day);
      if (amt == null || w == null || d == null || amt <= 0 || w <= 0 || w > 80 || d <= 0 || d > 24) return null;
      var wh = w < 15 ? 0 : Math.min(w / 40 * 8, 8);          // 주휴시간
      var monthlyHours = Math.round((w + wh) * 365 / 84);     // 유급 주간 × 365/84 (40h → 209)
      var hourly = v.unit === 'hour' ? amt : v.unit === 'month' ? amt / monthlyHours : amt / 12 / monthlyHours;
      return [
        { label: '월급 (주휴 포함 ' + monthlyHours + '시간)', value: won(hourly * monthlyHours), hero: true },
        { label: '시급', value: won(hourly) },
        { label: '일급 (' + fmt(d) + '시간)', value: won(hourly * d) },
        { label: '주급 (주휴 ' + fmt(wh, 1) + '시간 포함)', value: won(hourly * (w + wh)) },
        { label: '연봉', value: won(hourly * monthlyHours * 12) },
        { label: '주휴수당 (월)', value: won(hourly * wh * 365 / 84), dim: true },
      ];
    },
  };

  /* 연봉 실수령액 — 4대보험 + 근로소득세(간이세액표)
   *
   * 표는 `assets/tax-2026.js`가 실어 주고 **이 페이지에서만** 불러온다(29KB).
   * 앱(`core/calc/net_pay_calc.dart`)과 **같은 순서·같은 반올림**이라야 값이 같다:
   * 보험료는 항목마다 10원 미만 절사한 뒤 더하고, 국민연금만 기준소득월액
   * (천원 절사 + 상·하한)을 따로 쓴다.
   *
   * ⚠️ 비율 곱은 전부 **정수비**로 편다 — `taxable * 0.03595`는 부동소수 오차로
   * 절사 경계에서 10원이 튄다. 원 단위 정수 × 정수는 안전 범위 안이다. */
  var NP = {
    pensionPct: [475, 10000],      // 4.75%
    healthPct: [3595, 100000],     // 3.595%
    carePct: [1314, 10000],        // 건강보험료의 13.14%
    empPct: [9, 1000],             // 0.9%
    stabilityPct: [25, 10000],     // 고용안정 0.25% (150인 미만 · 회사 부담)
    pensionFloor: 410000,
    pensionCap: 6590000,
  };
  function floor10(n) { return Math.floor(n / 10) * 10; }
  function rate(won, p) { return floor10(won * p[0] / p[1]); }

  /* 간이세액표 조회 — 표 밖(77만 미만)은 0, 1,000만 초과는 고시 산식. */
  function withholdingTax(taxable, fam, kids) {
    var T = window.CALHUB_TAX_2026;
    if (!T || taxable < T.floor) return 0;
    fam = Math.max(1, fam);

    function cell(f) {
      if (taxable > T.ceiling) {
        var base = T.atCeiling[f - 1], over = taxable - T.ceiling, add;
        if (taxable <= 14000000) add = Math.floor(over * 343 / 1000) + 25000;
        else if (taxable <= 28000000) add = 1397000 + Math.floor((taxable - 14000000) * 3724 / 10000);
        else if (taxable <= 30000000) add = 6610600 + Math.floor((taxable - 28000000) * 392 / 1000);
        else if (taxable <= 45000000) add = 7394600 + Math.floor((taxable - 30000000) * 40 / 100);
        else if (taxable <= 87000000) add = 13394600 + Math.floor((taxable - 45000000) * 42 / 100);
        else add = 31034600 + Math.floor((taxable - 87000000) * 45 / 100);
        return floor10(base + add);
      }
      if (taxable === T.ceiling) return T.atCeiling[f - 1];
      // 행 번호는 산술로 — 구간 폭이 5·10·20천원이라 경계값을 싣지 않아도 된다.
      var t = Math.floor(taxable / 1000), row;
      if (t < 1500) row = Math.floor((t - 770) / 5);
      else if (t < 3000) row = 146 + Math.floor((t - 1500) / 10);
      else row = 296 + Math.floor((t - 3000) / 20);
      var at = row * 44 + (f - 1) * 4;
      return parseInt(T.packed.substr(at, 4), 36) * 10;
    }

    var tax;
    if (fam <= 11) tax = cell(fam);
    else tax = cell(11) - (cell(10) - cell(11)) * (fam - 11); // 별표2 비고 4
    // 8세 이상 20세 이하 자녀 세액공제 (비고 3) — 음수면 0.
    if (kids === 1) tax -= 20830;
    else if (kids >= 2) tax -= 45830 + (kids - 2) * 33330;
    return tax < 0 ? 0 : tax;
  }

  WIDGETS.net_pay = {
    fields: [
      { k: 'basis', label: '급여 기준', type: 'sel', def: 'year', opts: [['year', '연봉'], ['month', '월급']] },
      { k: 'sev', label: '퇴직금', type: 'sel', def: 'apart', opts: [['apart', '별도'], ['within', '포함 (÷13)']], showIf: function (v) { return v.basis === 'year'; } },
      { k: 'amt', label: function (v) { return (v.basis === 'month' ? '월급' : '연봉') + ' (원)'; }, type: 'num', ph: '예: 50,000,000', span2: true, quick: 'principal' },
      { k: 'fam', label: '부양 가족 수 (본인 포함)', type: 'int', def: '1' },
      { k: 'kid', label: '8세 이상 20세 이하 자녀 수', type: 'int', def: '0' },
      { k: 'ntx', label: '비과세액 (월 · 식대 등)', type: 'num', ph: '예: 200,000', span2: true, quick: 'monthly' },
    ],
    compute: function (v) {
      var amt = toNum(v.amt);
      if (amt == null || amt <= 0) return null;
      var fam = Math.max(1, Math.min(11, Math.round(toNum(v.fam) || 1)));
      var kid = Math.max(0, Math.min(fam - 1, Math.round(toNum(v.kid) || 0)));
      var ntx = Math.max(0, Math.round(toNum(v.ntx) || 0));

      var gross = v.basis === 'month'
        ? Math.trunc(amt)
        : Math.trunc(amt / (v.sev === 'within' ? 13 : 12));
      var taxable = Math.max(0, gross - ntx);

      var pBase = Math.floor(taxable / 1000) * 1000;
      if (pBase > NP.pensionCap) pBase = NP.pensionCap;
      if (taxable > 0 && pBase < NP.pensionFloor) pBase = NP.pensionFloor;

      var pension = rate(pBase, NP.pensionPct);
      var health = rate(taxable, NP.healthPct);
      var care = rate(health, NP.carePct);
      var emp = rate(taxable, NP.empPct);
      var tax = withholdingTax(taxable, fam, kid);
      var local = floor10(tax / 10);
      var ded = pension + health + care + emp + tax + local;
      var net = gross - ded;

      var employer = pension + health + care + emp + rate(taxable, NP.stabilityPct);
      var src = (window.CALHUB_TAX_2026 || {}).source || '';

      return [
        { label: '월 예상 실수령액', value: won(net), hero: true },
        { label: '연 실수령액', value: won(net * 12) },
        { label: '세전 월 급여', value: won(gross) },
        { label: '국민연금 (4.75%)', value: won(pension) },
        { label: '건강보험 (3.595%)', value: won(health) },
        { label: '장기요양보험 (건강보험료의 13.14%)', value: won(care) },
        { label: '고용보험 (0.9%)', value: won(emp) },
        { label: '근로소득세 (간이세액표)', value: won(tax) },
        { label: '지방소득세 (소득세의 10%)', value: won(local) },
        { label: '공제액 합계 (월)', value: won(ded) },
        { label: '회사 부담액 (월 · 산재 제외)', value: won(employer), dim: true },
        { label: '기준', value: '2026년 요율 · ' + src, dim: true },
      ];
    },
  };

  /* 연비 */
  WIDGETS.fuel = {
    fields: [
      { k: 'dist', label: '주행거리 (km)', type: 'num', ph: '예: 420' },
      { k: 'liters', label: '주유량 (L)', type: 'num', ph: '예: 32' },
      { k: 'price', label: '유가 (원/L, 선택)', type: 'num', ph: '예: 1,650', span2: true },
    ],
    compute: function (v) {
      var dist = toNum(v.dist), l = toNum(v.liters), p = toNum(v.price);
      if (dist == null || l == null || dist <= 0 || l <= 0) return null;
      var kmpl = dist / l;
      var rows = [{ label: '연비', value: fmt(kmpl, 2) + ' km/L', hero: true }];
      if (p != null && p > 0) {
        rows.push({ label: '이번 주유 비용', value: won(l * p) });
        rows.push({ label: '1km당 비용', value: won(p / kmpl) });
        rows.push({ label: '100km당 비용', value: won(p / kmpl * 100) });
      }
      return rows;
    },
  };

  /* 비만도 */
  WIDGETS.bmi = {
    fields: [
      { k: 'h', label: '키 (cm)', type: 'num', ph: '예: 170' },
      { k: 'w', label: '몸무게 (kg)', type: 'num', ph: '예: 65' },
    ],
    compute: function (v) {
      var h = toNum(v.h), w = toNum(v.w);
      if (h == null || w == null || h <= 0 || w <= 0) return null;
      var m = h / 100;
      var bmi = w / (m * m);
      var grade = bmi < 18.5 ? '저체중' : bmi < 23 ? '정상' : bmi < 25 ? '비만 전단계(과체중)' : bmi < 30 ? '1단계 비만' : bmi < 35 ? '2단계 비만' : '3단계 비만';
      return [
        { label: 'BMI (체질량지수)', value: fmt(bmi, 1), hero: true },
        { label: '판정 (대한비만학회 기준)', value: grade },
        { label: '표준 체중 (BMI 22)', value: fmt(22 * m * m, 1) + ' kg' },
        { label: '정상 체중 범위', value: fmt(18.5 * m * m, 1) + ' ~ ' + fmt(22.9 * m * m, 1) + ' kg' },
      ];
    },
  };

  /* 퍼센트 */
  WIDGETS.percent = {
    fields: [
      {
        k: 'mode', label: '무엇을 계산할까요?', type: 'sel', def: 'of', span2: true,
        opts: [
          ['of', '전체 값의 몇 %는 얼마인가'],
          ['ratio', '부분은 전체의 몇 %인가'],
          ['change', '얼마에서 얼마로 몇 % 변했나'],
          ['updown', '몇 % 오르면(내리면) 얼마인가'],
        ],
      },
      { k: 'x', label: function (v) { return ({ of: '전체 값', ratio: '부분 값', change: '이전 값', updown: '기준 값' })[v.mode]; }, type: 'num', ph: '예: 50,000' },
      { k: 'y', label: function (v) { return ({ of: '비율 (%)', ratio: '전체 값', change: '이후 값', updown: '비율 (%)' })[v.mode]; }, type: 'num', ph: '예: 10' },
    ],
    compute: function (v) {
      var x = toNum(v.x), y = toNum(v.y);
      if (x == null || y == null) return null;
      if (v.mode === 'of') return [{ label: '전체 ' + fmt(x) + '의 ' + fmt(y) + '%', value: fmt(x * y / 100, 4), hero: true }];
      if (v.mode === 'ratio') { if (y === 0) return null; return [{ label: '전체 ' + fmt(y) + ' 중 ' + fmt(x), value: pct(x / y * 100, 2), hero: true }]; }
      if (v.mode === 'change') { if (x === 0) return null; return [{ label: fmt(x) + ' → ' + fmt(y) + ' 증감률', value: pct((y - x) / x * 100, 2), hero: true }]; }
      return [
        { label: fmt(y) + '% 오르면', value: fmt(x * (1 + y / 100), 4), hero: true },
        { label: fmt(y) + '% 내리면', value: fmt(x * (1 - y / 100), 4) },
      ];
    },
  };

  /* 할인 */
  WIDGETS.discount = {
    fields: [
      { k: 'price', label: '원래 가격 (원)', type: 'num', ph: '예: 59,000', span2: true, quick: 'mid' },
      { k: 'r1', label: '할인율 (%)', type: 'num', ph: '예: 20' },
      { k: 'r2', label: '추가 할인율 (%, 선택)', type: 'num', ph: '예: 10' },
    ],
    compute: function (v) {
      var p = toNum(v.price), r1 = toNum(v.r1), r2 = toNum(v.r2) || 0;
      if (p == null || r1 == null || p < 0 || r1 < 0 || r1 > 100 || r2 < 0 || r2 > 100) return null;
      var fin = p * (1 - r1 / 100) * (1 - r2 / 100);
      var rows = [
        { label: '할인된 가격', value: won(fin), hero: true },
        { label: '아끼는 금액', value: won(p - fin) },
      ];
      if (r2 > 0) rows.push({ label: '실효 할인율 (이중 할인은 곱)', value: pct((1 - (1 - r1 / 100) * (1 - r2 / 100)) * 100) });
      return rows;
    },
  };

  /* 부가세 */
  WIDGETS.vat = {
    fields: [
      { k: 'mode', label: '방향', type: 'sel', def: 'excl', span2: true, opts: [['excl', '공급가액 → 부가세 포함 합계'], ['incl', '합계 금액 → 공급가액 역산']] },
      { k: 'amt', label: function (v) { return v.mode === 'excl' ? '공급가액 (원)' : '부가세 포함 합계 (원)'; }, type: 'num', ph: '예: 10,000' },
      { k: 'rate', label: '세율 (%)', type: 'num', def: '10' },
    ],
    compute: function (v) {
      var a = toNum(v.amt), r = toNum(v.rate);
      if (a == null || r == null || a < 0 || r < 0) return null;
      var supply, vat;
      if (v.mode === 'excl') { supply = Math.round(a); vat = roundWon(a * r / 100); }
      else { supply = roundWon(a / (1 + r / 100)); vat = Math.round(a) - supply; }
      return [
        { label: '합계 금액', value: won(supply + vat), hero: true },
        { label: '공급가액', value: won(supply) },
        { label: '부가세 (' + fmt(r) + '%)', value: won(vat) },
      ];
    },
  };

  /* 단가 비교 */
  WIDGETS.unit_price = {
    fields: [
      { k: 'ap', label: '상품 A 가격 (원)', type: 'num', ph: '예: 2,800' },
      { k: 'aq', label: '상품 A 용량', type: 'num', ph: '예: 1,500' },
      { k: 'bp', label: '상품 B 가격 (원)', type: 'num', ph: '예: 2,500' },
      { k: 'bq', label: '상품 B 용량', type: 'num', ph: '예: 1,200' },
    ],
    compute: function (v) {
      var ap = toNum(v.ap), aq = toNum(v.aq), bp = toNum(v.bp), bq = toNum(v.bq);
      if (ap == null || aq == null || bp == null || bq == null || aq <= 0 || bq <= 0) return null;
      var ua = ap / aq, ub = bp / bq;
      var winner = ua === ub ? '두 상품이 같음' : ua < ub ? '상품 A가 유리' : '상품 B가 유리';
      var save = ua === ub ? 0 : (1 - Math.min(ua, ub) / Math.max(ua, ub)) * 100;
      return [
        { label: '판정', value: winner + (save ? ' (' + fmt(save, 1) + '% 저렴)' : ''), hero: true },
        { label: 'A 단위당 가격', value: fmt(ua, 2) + '원' },
        { label: 'B 단위당 가격', value: fmt(ub, 2) + '원' },
      ];
    },
  };

  /* 날짜 — 커스텀 (모드에 따라 둘째 칸이 날짜/일수로 바뀜) */
  WIDGETS.date_calc = {
    custom: function (host) {
      var mode = 'diff';
      var form = el('div', 'cw-form');
      var result = el('div', 'cw-result');

      var modeWrap = el('label', 'cw-field cw-span2');
      modeWrap.appendChild(el('span', 'cw-label', '모드'));
      var modeSel = document.createElement('select');
      [['diff', '두 날짜의 차이 (디데이)'], ['add', '날짜 더하기 / 빼기']].forEach(function (o) {
        var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; modeSel.appendChild(op);
      });
      modeWrap.appendChild(modeSel);

      var aWrap = el('label', 'cw-field');
      var aLab = el('span', 'cw-label', '시작 날짜');
      var aIn = document.createElement('input'); aIn.type = 'date';
      aWrap.appendChild(aLab); aWrap.appendChild(aIn);

      var bWrap = el('label', 'cw-field');
      var bLab = el('span', 'cw-label', '끝 날짜');
      var bDate = document.createElement('input'); bDate.type = 'date';
      var bNum = document.createElement('input'); bNum.type = 'text'; bNum.inputMode = 'numeric'; bNum.placeholder = '예: 100 (음수 = 빼기)';
      bWrap.appendChild(bLab); bWrap.appendChild(bDate);

      function update() {
        var a = parseDate(aIn.value);
        if (a == null) { renderRows(result, null, '날짜를 선택하면 바로 계산됩니다.'); return; }
        if (mode === 'diff') {
          var b = parseDate(bDate.value);
          if (b == null) { renderRows(result, null, '날짜를 선택하면 바로 계산됩니다.'); return; }
          var days = Math.round((b - a) / 86400000);
          renderRows(result, [
            { label: '날짜 차이', value: fmt(Math.abs(days)) + '일', hero: true },
            { label: '당일 포함 (양쪽 다)', value: fmt(Math.abs(days) + 1) + '일' },
            { label: '주 단위로', value: fmt(Math.floor(Math.abs(days) / 7)) + '주 ' + (Math.abs(days) % 7) + '일' },
          ]);
        } else {
          var addDays = toInt(bNum.value);
          if (addDays == null) { renderRows(result, null, '더할 일수를 입력하세요.'); return; }
          var ms = a + addDays * 86400000;
          renderRows(result, [
            { label: fmt(Math.abs(addDays)) + '일 ' + (addDays >= 0 ? '뒤' : '전'), value: fmtDate(ms), hero: true },
          ]);
        }
      }
      modeSel.addEventListener('change', function () {
        mode = modeSel.value;
        aLab.textContent = mode === 'diff' ? '시작 날짜' : '기준 날짜';
        bLab.textContent = mode === 'diff' ? '끝 날짜' : '더하거나 뺄 일수';
        bWrap.replaceChild(mode === 'diff' ? bDate : bNum, bWrap.lastChild);
        update();
      });
      [aIn, bDate, bNum].forEach(function (i) { i.addEventListener('input', update); i.addEventListener('change', update); });

      form.appendChild(modeWrap); form.appendChild(aWrap); form.appendChild(bWrap);
      host.appendChild(form); host.appendChild(result);
      update();
    },
  };

  /* 진법 변환 */
  WIDGETS.base_converter = {
    fields: [
      { k: 'v', label: '값', type: 'num', comma: false, ph: '예: 255 또는 FF' },
      { k: 'b', label: '입력 진법', type: 'sel', def: '10', opts: [['2', '2진수'], ['8', '8진수'], ['10', '10진수'], ['16', '16진수']] },
    ],
    compute: function (v) {
      var raw = String(v.v || '').trim().replace(/\s+/g, '');
      if (!raw) return null;
      var base = Number(v.b);
      var valid = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9a-fA-F]+$/ }[base];
      if (!valid.test(raw)) return [{ label: '입력 오류', value: base + '진수에 쓸 수 없는 문자가 있습니다', hero: true }];
      var n = 0n, B = BigInt(base);
      for (var i = 0; i < raw.length; i++) n = n * B + BigInt(parseInt(raw[i], base));
      return [
        { label: '10진수', value: n.toLocaleString('ko-KR'), hero: true },
        { label: '2진수', value: n.toString(2) },
        { label: '8진수', value: n.toString(8) },
        { label: '16진수', value: n.toString(16).toUpperCase() },
      ];
    },
  };

  /* 단위 변환 — 커스텀 (분류에 따라 단위 목록 변경) */
  WIDGETS.unit_converter = {
    custom: function (host) {
      var form = el('div', 'cw-form');
      var result = el('div', 'cw-result');
      var cat = 'length';

      function sel(labelText) {
        var wrap = el('label', 'cw-field');
        wrap.appendChild(el('span', 'cw-label', labelText));
        var s = document.createElement('select');
        wrap.appendChild(s);
        return { wrap: wrap, sel: s };
      }
      var catUi = sel('분류');
      Object.keys(UNIT_DATA).forEach(function (k) {
        var op = document.createElement('option'); op.value = k; op.textContent = UNIT_DATA[k].label; catUi.sel.appendChild(op);
      });
      var fromUi = sel('변환 전');
      var toUi = sel('변환 후');
      var valWrap = el('label', 'cw-field');
      valWrap.appendChild(el('span', 'cw-label', '값'));
      var valIn = document.createElement('input');
      valIn.type = 'text'; valIn.inputMode = 'decimal'; valIn.placeholder = '예: 84';
      valWrap.appendChild(valIn);

      function fillUnits() {
        [fromUi.sel, toUi.sel].forEach(function (s) { s.innerHTML = ''; });
        UNIT_DATA[cat].units.forEach(function (u, i) {
          [fromUi.sel, toUi.sel].forEach(function (s) {
            var op = document.createElement('option'); op.value = String(i); op.textContent = u[0]; s.appendChild(op);
          });
        });
        toUi.sel.selectedIndex = Math.min(1, toUi.sel.options.length - 1);
      }
      function update() {
        var raw = commaize(valIn.value);
        if (raw !== valIn.value) valIn.value = raw;
        var v = toNum(raw);
        if (v == null) { renderRows(result, null); return; }
        var units = UNIT_DATA[cat].units;
        var fu = units[Number(fromUi.sel.value)], tu = units[Number(toUi.sel.value)];
        var out;
        if (cat === 'temp') out = convTemp(v, fu[1], tu[1]);
        else out = v * fu[1] / tu[1];
        renderRows(result, [
          { label: fmt(v) + ' ' + fu[0] + ' =', value: fmt(out, 6) + ' ' + tu[0], hero: true },
        ]);
      }
      catUi.sel.addEventListener('change', function () { cat = catUi.sel.value; fillUnits(); update(); });
      [fromUi.sel, toUi.sel].forEach(function (s) { s.addEventListener('change', update); });
      valIn.addEventListener('input', update);

      form.appendChild(catUi.wrap); form.appendChild(valWrap);
      form.appendChild(fromUi.wrap); form.appendChild(toUi.wrap);
      fillUnits();
      host.appendChild(form); host.appendChild(result);
      update();
    },
  };

  /* 환율 — 커스텀 (환율 표 비동기 로드) */
  WIDGETS.exchange_rate = {
    custom: function (host) {
      var form = el('div', 'cw-form');
      var result = el('div', 'cw-result');
      var note = el('p', 'cw-fx-note', '환율 불러오는 중…');
      var rates = null, fetchedAt = null;

      function sel(labelText, def) {
        var wrap = el('label', 'cw-field');
        wrap.appendChild(el('span', 'cw-label', labelText));
        var s = document.createElement('select');
        FX_CODES.forEach(function (c) {
          var op = document.createElement('option'); op.value = c; op.textContent = c + ' — ' + FX_NAMES[c]; s.appendChild(op);
        });
        s.value = def;
        wrap.appendChild(s);
        return { wrap: wrap, sel: s };
      }
      var fromUi = sel('바꿀 통화', 'USD');
      var toUi = sel('받을 통화', 'KRW');
      var amtWrap = el('label', 'cw-field cw-span2');
      amtWrap.appendChild(el('span', 'cw-label', '금액'));
      var amtIn = document.createElement('input');
      amtIn.type = 'text'; amtIn.inputMode = 'decimal'; amtIn.placeholder = '예: 100';
      amtWrap.appendChild(amtIn);

      function update() {
        var raw = commaize(amtIn.value);
        if (raw !== amtIn.value) amtIn.value = raw;
        var amt = toNum(raw);
        if (!rates) { renderRows(result, null, '환율 정보를 불러오면 계산됩니다.'); return; }
        var f = fromUi.sel.value, t = toUi.sel.value;
        if (!rates[f] || !rates[t]) { renderRows(result, null, '해당 통화 환율이 없습니다.'); return; }
        var unit = rates[t] / rates[f];
        var rows = [{ label: '1 ' + f + ' = ' + fmt(unit, 4) + ' ' + t, value: '', dim: true }];
        if (amt != null) rows.unshift({ label: fmt(amt) + ' ' + f + ' =', value: fmt(amt * unit, 2) + ' ' + t, hero: true });
        renderRows(result, rows);
      }
      [fromUi.sel, toUi.sel].forEach(function (s) { s.addEventListener('change', update); });
      amtIn.addEventListener('input', update);

      form.appendChild(fromUi.wrap); form.appendChild(toUi.wrap); form.appendChild(amtWrap);
      host.appendChild(form); host.appendChild(result); host.appendChild(note);

      loadFx(function (data) {
        if (data && data.rates) {
          rates = data.rates; fetchedAt = data.t;
          note.textContent = '환율 기준: ' + new Date(fetchedAt).toLocaleString('ko-KR') + ' (자동 갱신·캐시)';
        } else {
          note.textContent = '환율을 불러오지 못했습니다. 네트워크 연결 후 새로고침해 주세요.';
        }
        update();
      });
      update();
    },
  };

  /* 분수 — 한 분수가 세 칸이라 3열. 첫 분수 줄과 둘째 분수 줄이 열로 정확히 대응한다
   * (2열 격자에 넣으면 ①분모와 연산이 한 줄에 서고 ②가 밀려 열이 어긋난다) */
  WIDGETS.fraction = {
    cols: 3,
    fields: [
      { k: 'ai', label: '① 정수', type: 'num', comma: false, ph: '0' },
      { k: 'an', label: '① 분자', type: 'num', comma: false, ph: '1' },
      { k: 'ad', label: '① 분모', type: 'num', comma: false, ph: '2' },
      { k: 'op', label: '연산', type: 'sel', def: '+', span2: true, opts: [['+', '＋ 더하기'], ['-', '－ 빼기'], ['*', '× 곱하기'], ['/', '÷ 나누기']] },
      { k: 'bi', label: '② 정수', type: 'num', comma: false, ph: '0' },
      { k: 'bn', label: '② 분자', type: 'num', comma: false, ph: '1' },
      { k: 'bd', label: '② 분모', type: 'num', comma: false, ph: '3' },
    ],
    compute: function (v) {
      function frac(iS, nS, dS) {
        var i = iS.trim() === '' ? null : BigInt(iS.trim() || '0');
        var n = nS.trim() === '' ? null : BigInt(nS.trim() || '0');
        var d = dS.trim() === '' ? 1n : BigInt(dS.trim());
        if (i == null && n == null) return null;
        if (d === 0n) return 'zero';
        var neg = (i != null && i < 0n);
        var ii = i == null ? 0n : (i < 0n ? -i : i);
        var nn = n == null ? 0n : n;
        var num = ii * d + nn;
        if (neg) num = -num;
        return { n: num, d: d };
      }
      try {
        var A = frac(v.ai || '', v.an || '', v.ad || '');
        var B = frac(v.bi || '', v.bn || '', v.bd || '');
        if (A === 'zero' || B === 'zero') return [{ label: '입력 오류', value: '분모에는 0을 쓸 수 없습니다', hero: true }];
        if (!A || !B) return null;
        var n, d;
        if (v.op === '+') { n = A.n * B.d + B.n * A.d; d = A.d * B.d; }
        else if (v.op === '-') { n = A.n * B.d - B.n * A.d; d = A.d * B.d; }
        else if (v.op === '*') { n = A.n * B.n; d = A.d * B.d; }
        else { if (B.n === 0n) return [{ label: '입력 오류', value: '0으로 나눌 수 없습니다', hero: true }]; n = A.n * B.d; d = A.d * B.n; }
        if (d < 0n) { d = -d; n = -n; }
        var g = bgcd(n, d); if (g > 1n) { n /= g; d /= g; }
        var rows = [{ label: '기약분수', value: d === 1n ? n.toString() : n.toString() + ' / ' + d.toString(), hero: true }];
        var absN = n < 0n ? -n : n;
        if (d !== 1n && absN > d) {
          var whole = absN / d, rem = absN % d;
          rows.push({ label: '대분수', value: (n < 0n ? '-' : '') + whole.toString() + '과 ' + rem.toString() + '/' + d.toString() });
        }
        rows.push({ label: '소수', value: fmt(Number(n) / Number(d), 8) });
        return rows;
      } catch (e) { return null; }
    },
  };

  /* 학점 — 커스텀 (과목 행 추가) */
  WIDGETS.gpa = {
    custom: function (host) {
      var scale = '4.5';
      var rows = [{ credit: '3', grade: 'A+' }, { credit: '3', grade: 'B+' }];
      var form = el('div', 'cw-form');
      var listBox = el('div', 'cw-stages cw-span2');
      var result = el('div', 'cw-result');

      var scaleWrap = el('label', 'cw-field cw-span2');
      scaleWrap.appendChild(el('span', 'cw-label', '만점 체계'));
      var scaleSel = document.createElement('select');
      ['4.5', '4.3', '4.0'].forEach(function (s) {
        var op = document.createElement('option'); op.value = s; op.textContent = s + ' 만점'; scaleSel.appendChild(op);
      });
      scaleWrap.appendChild(scaleSel);

      function rebuild() {
        listBox.innerHTML = '';
        var table = GPA_TABLES[scale];
        rows.forEach(function (row, idx) {
          if (!table.some(function (g) { return g[0] === row.grade; }) && row.grade !== 'P') row.grade = table[0][0];
          var line = el('div', 'cw-stage');
          line.appendChild(el('span', 'cw-stage-no', '과목 ' + (idx + 1)));
          var cWrap = el('label', 'cw-field');
          cWrap.appendChild(el('span', 'cw-label', '학점 수'));
          var cIn = document.createElement('input');
          cIn.type = 'text'; cIn.inputMode = 'decimal'; cIn.value = row.credit;
          cIn.addEventListener('input', function () { row.credit = cIn.value; update(); });
          cWrap.appendChild(cIn);
          var gWrap = el('label', 'cw-field');
          gWrap.appendChild(el('span', 'cw-label', '성적'));
          var gSel = document.createElement('select');
          table.forEach(function (g) { var op = document.createElement('option'); op.value = g[0]; op.textContent = g[0]; gSel.appendChild(op); });
          var pOp = document.createElement('option'); pOp.value = 'P'; pOp.textContent = 'P (평점 제외)'; gSel.appendChild(pOp);
          gSel.value = row.grade;
          gSel.addEventListener('change', function () { row.grade = gSel.value; update(); });
          gWrap.appendChild(gSel);
          line.appendChild(cWrap); line.appendChild(gWrap);
          if (rows.length > 1) {
            var del = el('button', 'cw-stage-del', '✕');
            del.type = 'button';
            del.addEventListener('click', function () { rows.splice(idx, 1); rebuild(); update(); });
            line.appendChild(del);
          }
          listBox.appendChild(line);
        });
        var addBtn = el('button', 'cw-add-stage', '+ 과목 추가');
        addBtn.type = 'button';
        addBtn.disabled = rows.length >= 30;
        addBtn.addEventListener('click', function () { rows.push({ credit: '3', grade: GPA_TABLES[scale][0][0] }); rebuild(); update(); });
        listBox.appendChild(addBtn);
      }

      function update() {
        var table = GPA_TABLES[scale];
        var pts = 0, gradedCredits = 0, totalCredits = 0, any = false;
        rows.forEach(function (row) {
          var credit = toNum(row.credit);
          if (credit == null || credit <= 0) return;
          any = true;
          totalCredits += credit;
          if (row.grade === 'P') return;
          var g = table.find(function (t) { return t[0] === row.grade; });
          if (!g) return;
          pts += credit * g[1];
          gradedCredits += credit;
        });
        if (!any || gradedCredits === 0) { renderRows(result, null, '과목의 학점 수와 성적을 넣으면 평점이 계산됩니다.'); return; }
        var gpa = pts / gradedCredits;
        renderRows(result, [
          { label: '평점평균 (' + scale + ' 만점)', value: fmt(gpa, 2), hero: true },
          { label: '반영 학점', value: fmt(gradedCredits) + '학점' },
          { label: '총 이수 학점 (P 포함)', value: fmt(totalCredits) + '학점' },
          { label: '만점 대비', value: pct(gpa / Number(scale) * 100, 1), dim: true },
        ]);
      }
      scaleSel.addEventListener('change', function () { scale = scaleSel.value; rebuild(); update(); });

      form.appendChild(scaleWrap); form.appendChild(listBox);
      rebuild();
      host.appendChild(form); host.appendChild(result);
      update();
    },
  };

  /* 소인수분해 */
  WIDGETS.prime_factor = {
    fields: [
      { k: 'n', label: '자연수 (15자리 이하)', type: 'num', ph: '예: 360', span2: true },
    ],
    compute: function (v) {
      var raw = String(v.n || '').replace(/[^0-9]/g, '');
      if (!raw) return null;
      if (raw.length > 15) return [{ label: '입력 오류', value: '15자리까지만 지원합니다', hero: true }];
      var n = BigInt(raw);
      if (n < 2n) return [{ label: raw, value: '2 이상의 자연수를 입력하세요', hero: true }];
      var map = factorize(n);
      var keys = Array.from(map.keys()).map(function (s) { return BigInt(s); }).sort(function (a, b) { return a < b ? -1 : 1; });
      var expr = keys.map(function (p) {
        var e = map.get(p.toString());
        return p.toString() + (e > 1 ? '^' + e : '');
      }).join(' × ');
      var count = 1n, sum = 1n;
      keys.forEach(function (p) {
        var e = BigInt(map.get(p.toString()));
        count *= e + 1n;
        var term = 1n, pw = 1n;
        for (var i = 0n; i < e; i++) { pw *= p; term += pw; }
        sum *= term;
      });
      var rows = [
        { label: '소인수분해', value: expr, hero: true },
        { label: '약수의 개수', value: count.toLocaleString('ko-KR') + '개' },
        { label: '약수의 합', value: sum.toLocaleString('ko-KR') },
      ];
      if (count <= 60n) {
        var divs = [1n];
        keys.forEach(function (p) {
          var e = map.get(p.toString());
          var next = [];
          divs.forEach(function (d) {
            var pw = 1n;
            for (var i = 0; i <= e; i++) { next.push(d * pw); pw *= p; }
          });
          divs = next;
        });
        divs.sort(function (a, b) { return a < b ? -1 : 1; });
        rows.push({ label: '약수 목록', value: divs.join(', '), dim: true });
      }
      return rows;
    },
  };

  /* 시간 — 커스텀 (모드에 따라 필드 변경) */
  WIDGETS.time_calc = {
    custom: function (host) {
      var mode = 'diff';
      var form = el('div', 'cw-form');
      var result = el('div', 'cw-result');

      var modeWrap = el('label', 'cw-field cw-span2');
      modeWrap.appendChild(el('span', 'cw-label', '모드'));
      var modeSel = document.createElement('select');
      [['diff', '두 시각의 차이'], ['add', '시각 더하기']].forEach(function (o) {
        var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; modeSel.appendChild(op);
      });
      modeWrap.appendChild(modeSel);

      function timeField(labelText, def) {
        var wrap = el('label', 'cw-field');
        var lab = el('span', 'cw-label', labelText);
        wrap.appendChild(lab);
        var input = document.createElement('input');
        input.type = 'time'; input.value = def || '';
        wrap.appendChild(input);
        return { wrap: wrap, input: input, lab: lab };
      }
      function numField(labelText, ph) {
        var wrap = el('label', 'cw-field');
        var lab = el('span', 'cw-label', labelText);
        wrap.appendChild(lab);
        var input = document.createElement('input');
        input.type = 'text'; input.inputMode = 'numeric'; input.placeholder = ph || '';
        wrap.appendChild(input);
        return { wrap: wrap, input: input, lab: lab };
      }
      var a = timeField('시작 시각', '09:00');
      var b = timeField('끝 시각', '18:00');
      var brk = numField('휴게시간 (분)', '예: 60');
      var addH = numField('더할 시간', '예: 5');
      var addM = numField('더할 분', '예: 30');
      addH.wrap.style.display = 'none';
      addM.wrap.style.display = 'none';

      function mins(s) {
        if (!s) return null;
        var m = s.split(':');
        return Number(m[0]) * 60 + Number(m[1]);
      }
      function update() {
        var am = mins(a.input.value);
        if (am == null) { renderRows(result, null); return; }
        if (mode === 'diff') {
          var bm = mins(b.input.value);
          if (bm == null) { renderRows(result, null); return; }
          var diff = bm - am;
          if (diff < 0) diff += 1440;
          var rest = toInt(brk.input.value) || 0;
          var net = Math.max(diff - rest, 0);
          renderRows(result, [
            { label: '경과 시간' + (rest ? ' (휴게 ' + rest + '분 차감)' : ''), value: Math.floor(net / 60) + '시간 ' + (net % 60) + '분', hero: true },
            { label: '소수 시간', value: fmt(net / 60, 2) + '시간' },
            { label: '휴게 차감 전', value: Math.floor(diff / 60) + '시간 ' + (diff % 60) + '분', dim: true },
          ]);
        } else {
          var h = toInt(addH.input.value) || 0;
          var m2 = toInt(addM.input.value) || 0;
          var total = am + h * 60 + m2;
          var dayShift = Math.floor(total / 1440);
          total = ((total % 1440) + 1440) % 1440;
          var hh = String(Math.floor(total / 60)).padStart(2, '0');
          var mm = String(total % 60).padStart(2, '0');
          renderRows(result, [
            { label: fmt(h) + '시간 ' + fmt(m2) + '분 뒤', value: hh + ':' + mm + (dayShift > 0 ? ' (+' + dayShift + '일)' : ''), hero: true },
          ]);
        }
      }
      modeSel.addEventListener('change', function () {
        mode = modeSel.value;
        var diff = mode === 'diff';
        b.wrap.style.display = diff ? '' : 'none';
        brk.wrap.style.display = diff ? '' : 'none';
        addH.wrap.style.display = diff ? 'none' : '';
        addM.wrap.style.display = diff ? 'none' : '';
        update();
      });
      [a.input, b.input, brk.input, addH.input, addM.input].forEach(function (i) {
        i.addEventListener('input', update); i.addEventListener('change', update);
      });

      form.appendChild(modeWrap);
      form.appendChild(a.wrap); form.appendChild(b.wrap); form.appendChild(brk.wrap);
      form.appendChild(addH.wrap); form.appendChild(addM.wrap);
      host.appendChild(form); host.appendChild(result);
      update();
    },
  };

  /* 일반 · 공학 계산기 */
  function exprWidget(sci) {
    return {
      custom: function (host) {
        var form = el('div', 'cw-form');
        var result = el('div', 'cw-result');
        var wrap = el('label', 'cw-field cw-span2');
        wrap.appendChild(el('span', 'cw-label', '수식'));
        var input = document.createElement('input');
        input.type = 'text';
        input.placeholder = sci ? '예: sin(30) + sqrt(2) ^ 2 또는 5!' : '예: (1200 + 300) × 0.85';
        wrap.appendChild(input);
        form.appendChild(wrap);
        var degSel = null;
        if (sci) {
          var dWrap = el('label', 'cw-field');
          dWrap.appendChild(el('span', 'cw-label', '각도 단위'));
          degSel = document.createElement('select');
          [['deg', '도 (deg)'], ['rad', '라디안 (rad)']].forEach(function (o) {
            var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; degSel.appendChild(op);
          });
          dWrap.appendChild(degSel);
          form.appendChild(dWrap);
        }
        function update() {
          var src = input.value;
          if (!src.trim()) { renderRows(result, null, sci ? 'sin·cos·tan·log·ln·sqrt·abs·π·e·^·! 을 쓸 수 있습니다.' : '+ − × ÷ % 괄호를 쓸 수 있습니다.'); return; }
          var out = null;
          try { out = evalExpr(src, sci, degSel ? degSel.value === 'deg' : false); } catch (e) { out = null; }
          renderRows(result, out == null
            ? [{ label: '수식을 확인해 주세요', value: '—', hero: true }]
            : [{ label: '= ', value: fmt(out, 10), hero: true }]);
        }
        input.addEventListener('input', update);
        if (degSel) degSel.addEventListener('change', update);
        host.appendChild(form); host.appendChild(result);
        update();
      },
    };
  }
  WIDGETS.standard_calc = exprWidget(false);
  WIDGETS.scientific_calc = exprWidget(true);

  /* ── 초기화 ────────────────────────────────────────────── */
  function init() {
    var hosts = document.querySelectorAll('[data-widget]');
    Array.prototype.forEach.call(hosts, function (host) {
      var id = host.getAttribute('data-widget');
      var spec = WIDGETS[id];
      if (!spec) { host.style.display = 'none'; return; }
      renderWidget(host, spec);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
