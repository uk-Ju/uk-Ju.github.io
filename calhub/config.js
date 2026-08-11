/**
 * CalHub 웹사이트 런타임 설정 — 키를 채우면 기능이 켜진다 (재생성 불필요).
 *
 * kakaoJsKey   : developers.kakao.com > 내 애플리케이션 > 앱 키 > JavaScript 키.
 *                플랫폼(Web)에 배포 도메인을 등록해야 공유가 동작한다.
 *                비어 있으면 [카카오톡 공유] 버튼은 시스템 공유/링크 복사로 대체된다.
 * adsenseClient: AdSense 승인 후 발급되는 'ca-pub-…' 게시자 ID.
 *                비어 있으면 광고 자리에 자리 표시 박스만 그려진다.
 * adsenseSlots : 광고 단위별 슬롯 ID (AdSense > 광고 > 광고 단위에서 생성).
 *                rail = 좌우 세로 배너, infeed = 목록 사이, article = 본문 중간.
 */
window.CALHUB_CONFIG = {
  kakaoJsKey: '',
  adsenseClient: '',
  adsenseSlots: {
    rail: '',
    infeed: '',
    article: '',
  },
};
