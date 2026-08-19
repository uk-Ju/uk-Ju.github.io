/* CalHub 홍보 사이트 공용 스크립트 — 초성 검색 · 광고 슬롯 · 공유(카카오/복사/시스템) */
(function () {
  'use strict';
  var CFG = window.CALHUB_CONFIG || {};
  var PAGE = window.CALHUB_PAGE || {};

  /* ── 한글 초성 검색 (app/lib/core/utils/hangul.dart 이식) ───────────── */
  var CHOSEONG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  var HANGUL_BASE = 0xac00, HANGUL_LAST = 0xd7a3, JUNG_JONG = 21 * 28;

  function choseongOf(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
        out += CHOSEONG[Math.floor((code - HANGUL_BASE) / JUNG_JONG)];
      } else {
        out += text[i];
      }
    }
    return out;
  }
  function isChoseongOnly(q) {
    if (!q) return false;
    for (var i = 0; i < q.length; i++) {
      if (CHOSEONG.indexOf(q[i]) === -1) return false;
    }
    return true;
  }
  function norm(s) { return s.toLowerCase().replace(/\s+/g, ''); }

  function matches(query, hays) {
    var q = norm(query);
    if (!q) return true;
    for (var i = 0; i < hays.length; i++) {
      if (hays[i].indexOf(q) !== -1) return true;
    }
    if (isChoseongOnly(q)) {
      for (var j = 0; j < hays.length; j++) {
        if (choseongOf(hays[j]).indexOf(q) !== -1) return true;
      }
    }
    return false;
  }

  /* ── 검색 UI ─────────────────────────────────────────────────────────── */
  function initSearch() {
    var input = document.querySelector('[data-search-input]');
    var form = document.querySelector('[data-search-form]');
    if (!input) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll('[data-calc-card]'));

    // 계산기 목록이 없는 페이지(상세)에서는 제출 시 홈으로 넘겨 검색한다.
    if (!cards.length) return;

    var sections = Array.prototype.slice.call(document.querySelectorAll('[data-cat-section]'));
    var status = document.querySelector('[data-search-status]');
    var infeeds = Array.prototype.slice.call(document.querySelectorAll('.ad-slot.ad-infeed'));

    function apply(query) {
      var shown = 0;
      cards.forEach(function (card) {
        var hays = (card.getAttribute('data-hay') || '').split('|');
        var ok = matches(query, hays);
        card.style.display = ok ? '' : 'none';
        if (ok) shown++;
      });
      sections.forEach(function (sec) {
        var any = sec.querySelector('[data-calc-card]:not([style*="display: none"])');
        sec.style.display = any ? '' : 'none';
      });
      var searching = norm(query).length > 0;
      infeeds.forEach(function (ad) { ad.style.display = searching ? 'none' : ''; });
      if (status) {
        if (searching) {
          status.hidden = false;
          status.textContent = shown
            ? '"' + query + '" 검색 결과 ' + shown + '개'
            : '"' + query + '"에 맞는 계산기가 없습니다. 앱에서 계산기를 제안할 수 있어요.';
        } else {
          status.hidden = true;
        }
      }
    }

    input.addEventListener('input', function () { apply(input.value); });
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); apply(input.value); });

    var q = new URLSearchParams(location.search).get('q');
    if (q) { input.value = q; apply(q); }
  }

  /* ── 광고 슬롯 ────────────────────────────────────────────────────────
   * 광고망 두 곳을 지원한다 (config.js에 채운 쪽이 쓰인다):
   *   1순위 AdSense  — 단가가 높지만 신규 사이트는 심사에서 떨어질 수 있다
   *   2순위 카카오 애드핏 — 국내 광고망, 심사가 수월해 AdSense 대기/탈락 시 대안
   * 둘 다 비어 있으면 자리 표시('AD')만 그려 레이아웃을 확인할 수 있게 둔다.
   */
  function initAds() {
    var slots = Array.prototype.slice.call(document.querySelectorAll('.ad-slot'));
    if (!slots.length) return;

    if (CFG.adsenseClient) { initAdSense(slots, CFG.adsenseClient); return; }
    if (hasAdfitUnit()) { initAdfit(slots); return; }

    slots.forEach(function (slot) {
      var ph = document.createElement('div');
      ph.className = 'ad-placeholder';
      ph.textContent = 'AD';
      slot.appendChild(ph);
    });
  }

  function initAdSense(slots, client) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client);
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);

    slots.forEach(function (slot) {
      var kind = slot.getAttribute('data-ad-kind') || 'article';
      var slotId = (CFG.adsenseSlots || {})[kind] || '';
      var ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.setAttribute('data-ad-client', client);
      if (slotId) ins.setAttribute('data-ad-slot', slotId);
      if (kind === 'rail') {
        ins.style.width = '160px';
        ins.style.height = '600px';
      } else {
        ins.setAttribute('data-ad-format', 'auto');
        ins.setAttribute('data-full-width-responsive', 'true');
      }
      slot.appendChild(ins);
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    });
  }

  /* 애드핏은 반응형이 없어 크기별로 광고 단위를 따로 만든다.
   * rail = 160×600(좁은 화면에선 레일 자체가 숨는다) · 가로 자리는 폭에 따라 728×90 / 320×100.
   *
   * ⚠️ **같은 광고단위 ID는 한 페이지에 한 번만 렌더링된다** (2026-08-14 실측 —
   * 홈 7개 슬롯 중 각 ID의 첫 등장 2개만 채워지고 나머지는 빈 채로 남았다).
   * 그래서 config의 각 항목은 **배열**로 받아 자리마다 다른 ID를 쓴다.
   * ID가 모자라면 그 자리는 아예 만들지 않는다 — 채워지지도 않을 요청을 보내지 않는다. */
  var ADFIT_SIZES = {
    rail: [160, 600],
    wide: [728, 90],
    mobile: [320, 100],
  };
  function unitList(v) {
    if (!v) return [];
    return (Array.isArray(v) ? v : [v]).filter(Boolean);
  }
  function hasAdfitUnit() {
    var u = CFG.adfitUnits || {};
    return unitList(u.rail).length + unitList(u.wide).length + unitList(u.mobile).length > 0;
  }
  function initAdfit(slots) {
    var u = CFG.adfitUnits || {};
    var narrow = window.innerWidth < 800;
    // 가로 자리는 화면 폭에 맞는 목록을 쓰고, 그쪽이 비어 있으면 다른 쪽으로 대체한다.
    var horizList = narrow
      ? (unitList(u.mobile).length ? unitList(u.mobile) : unitList(u.wide))
      : (unitList(u.wide).length ? unitList(u.wide) : unitList(u.mobile));
    var horizSize = narrow
      ? (unitList(u.mobile).length ? ADFIT_SIZES.mobile : ADFIT_SIZES.wide)
      : (unitList(u.wide).length ? ADFIT_SIZES.wide : ADFIT_SIZES.mobile);
    var pools = {
      rail: { ids: unitList(u.rail), size: ADFIT_SIZES.rail, next: 0 },
      horiz: { ids: horizList, size: horizSize, next: 0 },
    };

    var used = false;
    slots.forEach(function (slot) {
      var kind = slot.getAttribute('data-ad-kind') || 'article';
      var pool = pools[kind === 'rail' ? 'rail' : 'horiz'];
      var id = pool.ids[pool.next];
      if (!id) { slot.style.display = 'none'; return; }   // 남은 ID 없음 → 자리를 접는다
      pool.next += 1;
      var ins = document.createElement('ins');
      ins.className = 'kakao_ad_area';
      ins.style.display = 'none';
      ins.setAttribute('data-ad-unit', id);
      ins.setAttribute('data-ad-width', String(pool.size[0]));
      ins.setAttribute('data-ad-height', String(pool.size[1]));
      slot.appendChild(ins);
      used = true;
    });
    if (!used) return;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://t1.daumcdn.net/kas/static/ba.min.js';
    document.head.appendChild(s);
  }

  /* ── 토스트 ──────────────────────────────────────────────────────────── */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ── 공유 ────────────────────────────────────────────────────────────── */
  function pageUrl() { return PAGE.canonical || location.href; }
  function pageTitle() { return document.title; }
  function pageDesc() {
    var m = document.querySelector('meta[name="description"]');
    return m ? m.getAttribute('content') : '';
  }

  function copyLink() {
    var url = pageUrl();
    function done() { toast('링크가 복사되었습니다'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { legacyCopy(url); done(); });
    } else {
      legacyCopy(url); done();
    }
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function nativeShare() {
    if (navigator.share) {
      navigator.share({ title: pageTitle(), text: pageDesc(), url: pageUrl() }).catch(function () {});
    } else {
      copyLink();
    }
  }

  var kakaoLoading = null;
  function ensureKakao() {
    if (!CFG.kakaoJsKey) return Promise.reject(new Error('no-key'));
    if (window.Kakao && window.Kakao.isInitialized()) return Promise.resolve(window.Kakao);
    if (!kakaoLoading) {
      kakaoLoading = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
        s.onload = function () {
          try {
            if (!window.Kakao.isInitialized()) window.Kakao.init(CFG.kakaoJsKey);
            resolve(window.Kakao);
          } catch (e) { reject(e); }
        };
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return kakaoLoading;
  }

  function kakaoShare() {
    ensureKakao().then(function (Kakao) {
      // ⚠️ 링크는 **버튼까지 전부 등록된 사이트 도메인**이어야 한다 —
      // 스토어 주소를 직접 넣으면 카카오가 공유를 거부하므로 우리 도메인의 중계 페이지를 쓴다.
      var install = PAGE.appRedirect || pageUrl();
      Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: pageTitle(),
          description: pageDesc(),
          imageUrl: (PAGE.base || '') + '/assets/og-cover.png',
          link: { mobileWebUrl: pageUrl(), webUrl: pageUrl() },
        },
        buttons: [
          {
            title: '앱 무료 다운로드',
            link: { mobileWebUrl: install, webUrl: install },
          },
          {
            title: '웹에서 보기',
            link: { mobileWebUrl: pageUrl(), webUrl: pageUrl() },
          },
        ],
      });
    }).catch(function () {
      // 카카오 키 미설정·SDK 실패 → 시스템 공유(모바일 공유 시트에 카카오톡이 뜬다)로 폴백
      nativeShare();
    });
  }

  function initShare() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-share]') : null;
      if (!btn) return;
      var kind = btn.getAttribute('data-share');
      if (kind === 'copy') copyLink();
      else if (kind === 'native') nativeShare();
      else if (kind === 'kakao') kakaoShare();
    });
  }

  /* ── 시작 ────────────────────────────────────────────────────────────── */
  /* 계산기 전환 띠 — 지금 보고 있는 계산기를 보이는 자리로 밀어 준다.
   *
   * 띠는 카테고리 순서 그대로라, 뒤쪽 계산기(시간·소인수분해 등)를 보고
   * 있으면 강조된 항목이 스크롤 밖에 숨어 "내가 어디 있는지"가 안 보인다.
   * `scrollIntoView`를 쓰지 않는 이유는 그게 **세로 스크롤까지 건드려**
   * 페이지가 제멋대로 내려가기 때문이다 — 가로 위치만 직접 계산한다. */
  function initCalcSwitcher() {
    var bar = document.querySelector('[data-calc-switcher] .cs-inner');
    var cur = bar && bar.querySelector('[data-cs-current]');
    if (!bar || !cur) return;
    var target = cur.offsetLeft - (bar.clientWidth - cur.offsetWidth) / 2;
    bar.scrollLeft = Math.max(0, target);
  }

  function init() {
    initSearch();
    initAds();
    initShare();
    initCalcSwitcher();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
