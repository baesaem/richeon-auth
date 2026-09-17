// 인증 센터 설정 — 서버: Cloudflare Worker(richeon-auth-api, 2026-09-17~) → 드라이브 시트를 Sheets API로 직접 읽고 씀. 예전 Apps Script 주소(AKfycbw0GG…)도 같은 시트로 계속 동작
// 시험할 때는 주소 뒤에 ?api=http://localhost:4180/exec 를 붙이면 그 주소를 쓴다(브라우저에 기억).
window.RICHEON_AUTH = {
  api: 'https://richeon-auth-api.richeon.workers.dev/',
  siteVersion: '2026.09.17',
  contact: 'http://baesaem.kr',
}
