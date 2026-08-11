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

  /* ── 광고 슬롯 (AdSense) ─────────────────────────────────────────────── */
  function initAds() {
    var slots = Array.prototype.slice.call(document.querySelectorAll('.ad-slot'));
    if (!slots.length) return;
    var client = CFG.adsenseClient;

    if (!client) {
      slots.forEach(function (slot) {
        var ph = document.createElement('div');
        ph.className = 'ad-placeholder';
        ph.textContent = 'AD';
        slot.appendChild(ph);
      });
      return;
    }

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
            link: { mobileWebUrl: PAGE.playHome, webUrl: PAGE.playHome },
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
  function init() {
    initSearch();
    initAds();
    initShare();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
