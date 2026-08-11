/**
 * CalHub 웹사이트 런타임 설정 — 키를 채우면 기능이 켜진다 (사이트 재생성 불필요).
 *
 * ── 카카오톡 공유 ──────────────────────────────────────────────────────────
 * kakaoJsKey : developers.kakao.com > 내 애플리케이션 > 앱 키 > **JavaScript 키**.
 *              앱 설정 > 플랫폼 > Web 에 `https://uk-ju.github.io` 등록 필수
 *              (등록 안 하면 그 도메인에서 SDK가 거부된다).
 *              비어 있으면 [카카오톡 공유] 버튼은 시스템 공유 시트로 폴백한다
 *              (동작은 하지만 링크만 가고 썸네일 카드가 안 간다).
 *
 * ── 광고 ───────────────────────────────────────────────────────────────────
 * 아래 둘 중 채운 쪽이 쓰인다. **AdSense가 우선**, 없으면 애드핏, 둘 다 없으면 'AD' 자리 표시.
 *
 * adsenseClient : AdSense 승인 후 발급되는 'ca-pub-…' 게시자 ID.
 * adsenseSlots  : 광고 단위별 슬롯 ID (AdSense > 광고 > 광고 단위에서 생성).
 *                 rail = 좌우 세로 배너, infeed = 목록 사이, article = 본문 중간.
 *
 * adfitUnits    : 카카오 애드핏(adfit.kakao.com) 광고 단위 ID('DAN-…').
 *                 **애드핏은 반응형이 없어 크기별로 단위를 따로 만들어야 한다**:
 *                   rail   = 160×600 (좌우 레일)
 *                   wide   = 728×90  (넓은 화면의 가로 자리)
 *                   mobile = 320×100 (좁은 화면의 가로 자리)
 *                 셋 다 만들 필요는 없다 — wide나 mobile 하나만 넣어도 양쪽에 그것을 쓴다.
 */
window.CALHUB_CONFIG = {
  // JS 키는 클라이언트에 노출되는 공개 값이다(비밀키 아님) — 보호는 위 플랫폼 도메인 등록이 한다.
  kakaoJsKey: '7cf9d61965a963abbfcb5dbf0122bc14',

  adsenseClient: '',
  adsenseSlots: {
    rail: '',
    infeed: '',
    article: '',
  },

  adfitUnits: {
    rail: '',
    wide: '',
    mobile: '',
  },
};
