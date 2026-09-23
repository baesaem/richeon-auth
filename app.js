/* 리천 인증 센터 — 사용자 화면(#/) · 관리자 화면(#/admin?key=…) */
(function () {
  'use strict'
  const CFG = window.RICHEON_AUTH || {}
  const $ = (id) => document.getElementById(id)
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const fmt = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` }
  const fmtT = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : fmt(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
  const STATUS = { approved: '승인됨', pending: '승인 대기', needs_reapproval: '재승인 필요', revoked: '취소됨', none: '미등록' }
  const badge = (s) => `<span class="badge ${esc(s || 'none')}">${esc(STATUS[s] || s || '미등록')}</span>`
  const SRC = { blog: '블로그(무통장)', online: '온라인', admin: '관리자' }
  const LS = { theme: 'richeon_auth_theme', api: 'richeon_auth_api', token: 'richeon_auth_admin_token', uid: 'richeon_auth_last_uid' }
  const ls = { get: (k) => { try { return localStorage.getItem(k) } catch (_) { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch (_) {} } }

  // ── API ───────────────────────────────────────────────────
  const qs = new URLSearchParams(location.search)
  if (qs.get('api')) ls.set(LS.api, qs.get('api'))
  const API = ls.get(LS.api) || CFG.api
  async function call(fn, args, token) {
    let r
    try {
      // Apps Script 웹앱은 text/plain 본문이어야 CORS 사전 요청 없이 받는다(응답은 302 → 따라감)
      r = await fetch(API, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn, args: args || [], token }) })
    } catch (e) { throw Object.assign(new Error('서버에 연결할 수 없습니다. 인터넷 연결을 확인하세요.'), { code: 'network' }) }
    let j
    try { j = await r.json() } catch (_) { throw Object.assign(new Error('서버 응답을 읽을 수 없습니다. 잠시 후 다시 시도하세요.'), { code: 'bad_response' }) }
    if (!j.ok) throw Object.assign(new Error(j.error || '오류'), { code: j.code || '', data: j.data })
    return j.data
  }
  const admin = (fn, ...args) => call(fn, args, state.token)

  // ── 공통 UI ───────────────────────────────────────────────
  let toastT
  function toast(msg, kind) {
    const t = $('toast'); t.textContent = msg; t.className = 'toast show ' + (kind || '')
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast' }, kind === 'err' ? 5000 : 2800)
  }
  function modal(html, onMount) {
    $('modalBox').innerHTML = html; $('modal').classList.remove('hidden')
    if (onMount) onMount($('modalBox'))
    const first = $('modalBox').querySelector('input,textarea,select,button'); if (first) setTimeout(() => first.focus(), 30)
  }
  function closeModal() { $('modal').classList.add('hidden'); $('modalBox').innerHTML = '' }
  $('modal').addEventListener('mousedown', (e) => { if (e.target === $('modal')) closeModal() })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal() })
  function confirmBox(title, body, okLabel, danger) {
    return new Promise((res) => {
      modal(`<h3>${esc(title)}</h3><p class="small muted" style="margin:4px 0 16px">${body}</p>
        <div class="row" style="justify-content:flex-end"><button class="btn sm" id="mCancel">취소</button><button class="btn sm ${danger ? 'danger' : 'primary'}" id="mOk">${esc(okLabel || '확인')}</button></div>`)
      $('mCancel').onclick = () => { closeModal(); res(false) }
      $('mOk').onclick = () => { closeModal(); res(true) }
    })
  }
  async function busy(btn, fn) {
    if (!btn) return fn()
    const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'
    try { return await fn() } finally { btn.disabled = false; btn.innerHTML = html }
  }
  function copyText(text) {
    return (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).catch(() => {
      const el = document.createElement('textarea'); el.value = text; el.style.position = 'fixed'; el.style.opacity = '0'
      document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove()
    })
  }
  // 테마
  const applyTheme = (t) => { document.documentElement.dataset.theme = t; ls.set(LS.theme, t) }
  applyTheme(ls.get(LS.theme) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  $('btnTheme').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
  $('footVer').textContent = `인증 센터 ${CFG.siteVersion || ''}` + (API !== CFG.api ? ' · 시험 서버' : '')

  // ── 상태 · 라우팅 ────────────────────────────────────────
  const state = { route: 'user', key: '', token: ls.get(LS.token), uid: '', user: null, admin: null, tab: 'regs', filter: 'all', appFilter: 'all', msgUser: '', guide: null, guideP: null, utab: '' }
  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, '')
    const [path, q] = h.split('?')
    const p = new URLSearchParams(q || '')
    if (path === 'admin') { state.route = 'admin'; state.key = p.get('key') || '' }
    else { state.route = 'user'; state.preApp = path.startsWith('app/') ? path.slice(4) : '' }
  }
  window.addEventListener('hashchange', () => { parseRoute(); boot() })  // 관리자 키가 바뀔 수 있어 서버 확인부터 다시

  // 세션 캐시: 마지막 화면 자료를 먼저 그려 주고(즉시), 서버 응답이 오면 바꿔 그린다 — Apps Script는 요청마다 2~5초 걸린다
  const ss = { get: (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null') } catch (_) { return null } }, set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)) } catch (_) {} } }
  state.guide = ss.get('apply_guide')  // 지난 안내글(없으면 null → 첫 화면에서 받아 옴)
  function refreshing(on) { let el = $('refreshing'); if (!el) { el = document.createElement('div'); el.id = 'refreshing'; el.className = 'refreshing'; el.innerHTML = '<span class="spin"></span> 서버에서 새로 가져오는 중…'; document.body.appendChild(el) } el.classList.toggle('show', !!on) }

  async function boot() {
    parseRoute()
    // 관리자 화면에 로그인 토큰이 있으면 bootInfo와 자료 요청을 동시에 보낸다(직렬로 기다리면 두 배 느림)
    const adminAhead = state.route === 'admin' && state.token ? admin('getAdminData').then((d) => { state.admin = d; ss.set('admin_data', d) }, (e) => { state.adminErr = e }) : null
    try { state.boot = await call('bootInfo', [state.key]) }
    catch (e) {
      // 서버가 아직 예전 버전(v1)인지 구분: 예전 서버도 GET ?action= 에는 JSON으로 답한다
      let old = false
      try { const r = await fetch(API + '?action=ping', { redirect: 'follow' }); const j = await r.json(); old = !j.version } catch (_) { old = false }
      const msg = old
        ? '인증 서버가 아직 새 버전으로 배포되지 않았습니다. 관리자가 Apps Script(Code.gs)를 새 버전으로 다시 배포해야 인증 센터를 쓸 수 있습니다. 기존 앱의 인증번호는 그대로 유효합니다.'
        : e.message
      $('app').innerHTML = `<div class="card"><div class="notice ${old ? 'warn' : 'danger'}">⚠ ${esc(msg)}<br><span class="tiny muted">서버 주소: ${esc(API)}</span></div>${old ? '<p class="small muted" style="margin:12px 0 0">관리자 안내: 앱인증/gas/설치안내.md — 배포 관리 → 기존 배포 편집 → 새 버전 → 배포 (주소는 그대로).</p>' : ''}</div>`
      return
    }
    if (adminAhead) await adminAhead
    render()
  }

  function render() {
    if (!state.boot.configured) return renderSetup()
    if (state.route === 'admin') return renderAdmin()
    renderUser()
  }

  // ── 처음 설정 ─────────────────────────────────────────────
  function renderSetup() {
    $('app').innerHTML = `<div class="card fade" style="max-width:560px;margin:30px auto">
      <h2>인증 센터 처음 설정</h2><p class="sub">한 번만 설정하면 됩니다. 드라이브에 데이터 시트가 자동으로 만들어집니다.</p>
      <label class="f">관리자 비밀번호</label><input class="input" id="sPwd" type="password" placeholder="4자 이상">
      <label class="f">관리자 비밀번호 확인</label><input class="input" id="sPwd2" type="password">
      <label class="f">관리자 주소 키</label><div class="row"><input class="input grow" id="sKey" placeholder="영문·숫자 8자 이상"><button class="btn sm" id="sGen">자동 생성</button></div>
      <p class="help">관리자 화면 주소: …/#/admin?key=<b id="sKeyPrev">키</b></p>
      <button class="btn primary full" id="sGo" style="margin-top:16px">설정 시작</button><div class="field-err" id="sErr"></div></div>`
    const gen = () => { $('sKey').value = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); $('sKeyPrev').textContent = $('sKey').value }
    gen(); $('sGen').onclick = gen; $('sKey').oninput = () => { $('sKeyPrev').textContent = $('sKey').value || '키' }
    $('sGo').onclick = () => busy($('sGo'), async () => {
      $('sErr').textContent = ''
      if ($('sPwd').value.length < 4) return ($('sErr').textContent = '비밀번호는 4자 이상이어야 합니다.')
      if ($('sPwd').value !== $('sPwd2').value) return ($('sErr').textContent = '비밀번호가 서로 다릅니다.')
      try {
        const r = await call('firstTimeSetup', [$('sPwd').value, $('sKey').value.trim()])
        const adminUrl = location.origin + location.pathname + r.adminPath
        $('app').innerHTML = `<div class="card fade" style="max-width:560px;margin:30px auto"><h2>설정 완료</h2>
          <div class="notice warn" style="margin:10px 0">⚠ 관리자 주소는 다시 볼 수 없습니다. 지금 복사해 안전한 곳에 보관하세요.</div>
          <label class="f">관리자 주소(비공개)</label><div class="row"><input class="input grow" readonly value="${esc(adminUrl)}"><button class="btn sm" id="cpA">복사</button></div>
          <label class="f">데이터 시트</label><a href="${esc(r.spreadsheetUrl)}" target="_blank" rel="noopener">${esc(r.spreadsheetUrl)}</a>
          <div style="margin-top:18px"><a class="btn primary full" href="${esc(adminUrl)}">관리자 화면 열기</a></div></div>`
        $('cpA').onclick = () => copyText(adminUrl).then(() => toast('복사했습니다.', 'ok'))
        state.boot.configured = true
      } catch (e) { $('sErr').textContent = e.message }
    })
  }

  // ── 사용자 화면 ───────────────────────────────────────────
  function renderUser() {
    document.body.classList.remove('admin')
    const uid = state.uid || ls.get(LS.uid) || ''
    $('app').innerHTML = `
      <section class="card hero fade">
        <h1>정식판 인증번호 발급</h1>
        <p>구입하신 리천 앱을 정식판으로 쓰려면 사용자 ID로 인증번호를 받아 앱에 입력하세요. 인증번호 하나로 <b>여러 기기</b>에서 쓸 수 있고, 사용 중인 기기는 여기서 확인·해제합니다.</p>
        <div class="must-read" id="guideNote" ${state.guide === '' ? 'style="display:none"' : ''}><span class="grow">📢 인증번호를 신청하기 전에 <b>먼저 [📋 발급 신청 안내]를 꼭 읽어 보세요.</b></span><button class="btn sm gold" id="guideBtn">📋 발급 신청 안내 읽기</button></div>
        <div class="steps">
          <div class="step"><b>STEP 1</b>사용자 ID 확인 → 앱 인증 신청(입금자 정보)</div>
          <div class="step"><b>STEP 2</b>관리자 승인 후 인증번호 받기</div>
          <div class="step"><b>STEP 3</b>앱의 [정식판으로 전환]에 ID와 번호 입력</div>
        </div>
      </section>
      <section class="card fade" id="idCard">
        <h2><span class="n">1</span>사용자 ID</h2><p class="sub">구입(입금자명)할 때 쓴 사용자 ID(아이디)를 입력하세요. 처음이면 원하는 ID를 정해 입력하면 됩니다.</p>
        <div class="row"><input class="input grow" id="uid" placeholder="예: hong123" value="${esc(uid)}" autocomplete="username"><button class="btn primary" id="uidGo">확인</button></div>
        <div class="field-err" id="uidErr"></div>
      </section>
      <div id="userBody"></div>`
    $('uid').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) $('uidGo').click() })
    $('uidGo').onclick = () => busy($('uidGo'), loadUser)
    $('guideBtn').onclick = () => busy($('guideBtn'), async () => {
      let t = state.guide
      if (t == null) { try { t = await loadGuide() } catch (e) { return toast(e.message, 'err') } }
      if (!t) return toast('등록된 발급 신청 안내가 없습니다.')
      openGuide(t, $('newApp') ? () => openRegister($('newApp').value) : null)  // 앱 인증 신청 칸이 있으면 바로 신청으로
    })
    loadGuide().catch(() => {})  // 첫 화면에서 미리 받아 두기(지난 값이 있으면 그걸 먼저 씀)
    if (state.user && state.user.userId === uid) renderUserBody()
    else if (state.preApp && uid) loadUser()
  }

  // 발급 신청 안내글: 사용자 ID를 넣기 전에도 볼 수 있게 따로 받아 둔다(페이지당 한 번, 세션 캐시)
  function loadGuide() {
    if (!state.guideP) state.guideP = call('getApplyGuide').then((r) => setGuide(r.applyGuide), (e) => { state.guideP = null; if (/알 수 없는 요청/.test(e.message)) return setGuide(''); throw e })
    return state.guideP
  }
  function setGuide(t) {
    state.guide = String(t || ''); ss.set('apply_guide', state.guide)
    const note = $('guideNote'); if (note) note.style.display = state.guide ? '' : 'none'
    return state.guide
  }

  async function loadUser(quiet) {
    const uid = ($('uid') ? $('uid').value : state.uid).trim(); if ($('uidErr')) $('uidErr').textContent = ''
    if (!uid) return ($('uidErr').textContent = '사용자 ID를 입력하세요.')
    // 같은 ID의 지난 자료가 있으면 먼저 보여 주고, 서버 자료가 오면 바꿔 그린다
    const cached = !quiet && ss.get('user_' + uid)
    if (cached && !(state.user && state.user.userId === uid)) { state.user = cached; state.uid = uid; renderUserBody(); refreshing(true) }
    try { const d = await call('getUserData', [uid]); state.user = d; state.uid = uid; ls.set(LS.uid, uid); ss.set('user_' + uid, d); refreshing(false); renderUserBody() }
    catch (e) { refreshing(false); if ($('uidErr')) $('uidErr').textContent = e.message; else toast(e.message, 'err') }
  }
  // 사용자 동작 뒤: 화면 자료를 바로 고쳐 그리고 서버 자료는 뒤에서 새로 고침
  function userPatch(f) { try { f(state.user) } catch (_) {} renderUserBody(); refreshing(true); loadUser(true).catch(() => refreshing(false)) }

  function renderUserBody() {
    const u = state.user
    const newest = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') // 최근 것이 위로
    const regs = u.registrations.slice().sort(newest)
    const regById = Object.fromEntries(regs.map((r) => [r.appId, r]))
    const others = u.apps.filter((a) => !regById[a.appId]).slice().sort(newest)
    const preApp = state.preApp; state.preApp = ''
    if ('applyGuide' in u) setGuide(u.applyGuide)
    const guide = state.guide || ''
    // 2·3·4번 구역은 아래로 길게 늘어놓지 않고 탭으로 (앱 인증 신청 · 소유 앱 · 관리자에게 메시지)
    const tabs = [['register', '앱 인증 신청'], ['apps', '소유 앱(인증된 기기관리)'], ['msgs', '관리자에게 메시지']]
    if (preApp) state.utab = regById[preApp] ? 'apps' : 'register'
    if (!tabs.some(([k]) => k === state.utab)) state.utab = regs.length || !others.length ? 'apps' : 'register'
    const panel = {
      register: () => `<p class="sub">구입한 앱을 골라 인증 신청하세요.${guide ? ' 신청 전에 위의 <b>[📋 발급 신청 안내]</b>를 꼭 읽어 주세요.' : ''} 관리자가 확인한 뒤 승인하면 <b>소유 앱</b> 탭에서 인증번호를 받을 수 있습니다.</p>
        ${others.length ? `<div class="row"><select class="input grow" id="newApp">${others.map((a) => `<option value="${esc(a.appId)}" ${a.appId === preApp ? 'selected' : ''}>${esc(a.appName)}</option>`).join('')}</select><button class="btn primary" id="newAppGo">인증 신청</button></div>`
          : `<div class="empty">신청할 수 있는 앱이 남아 있지 않습니다. 이미 모든 앱을 신청하셨습니다. <b>소유 앱</b> 탭에서 상태와 인증번호를 확인하세요.</div>`}`,
      msgs: () => `<p class="sub">입금 안내, 기기 추가 요청 등을 남기면 관리자가 답장합니다.</p>
        <div class="thread" id="thread">${threadHtml(u.messages)}</div>
        <div class="row" style="margin-top:10px"><input class="input grow" id="msgIn" placeholder="메시지 입력"><button class="btn" id="msgGo">보내기</button></div>`,
      apps: () => `<div class="row between" style="flex-wrap:nowrap;align-items:flex-start;gap:10px"><p class="sub grow" style="margin:0 0 10px">앱마다 상태와 사용 중인 기기를 보여 줍니다. 승인된 앱은 [인증번호 받기]를 누르세요.</p><button class="ghost sm" id="reload" style="flex:none">새로고침</button></div>
        ${regs.length ? `<div class="apps">${regs.map(appCard).join('')}</div>` : `<div class="empty">아직 등록한 앱이 없습니다. ${others.length ? "<b>앱 인증 신청</b> 탭에서 구입한 앱을 신청하세요." : '신청할 수 있는 앱이 없습니다.'}</div>`}`,
    }
    $('userBody').innerHTML = `
      <section class="card fade" id="userTabs">
        <div class="tabs">${tabs.map(([k, l], i) => `<button class="tab ${state.utab === k ? 'active' : ''}" data-utab="${k}"><span class="tn">${i + 2}</span>${l}</button>`).join('')}</div>
        <div id="upanel">${panel[state.utab]()}</div>
      </section>
      <section class="card fade" id="codeCard" style="display:none"></section>`
    document.querySelectorAll('[data-utab]').forEach((b) => { b.onclick = () => { state.utab = b.dataset.utab; renderCounts() } })  // 인증번호 카드는 그대로 두고 다시 그림
    if ($('reload')) $('reload').onclick = () => busy($('reload'), loadUser)
    if ($('newAppGo')) $('newAppGo').onclick = () => openRegister($('newApp').value)
    if ($('msgGo')) {
      $('msgIn').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) $('msgGo').click() })
      $('msgGo').onclick = () => busy($('msgGo'), async () => {
        const m = $('msgIn').value.trim(); if (!m) return
        try { const r = await call('addMessage', [u.userId, m]); toast('보냈습니다.', 'ok'); userPatch((d) => { d.messages.push({ id: r.id, userId: u.userId, message: m, createdAt: r.createdAt, isAdminReply: false }) }) } catch (e) { toast(e.message, 'err') }
      })
    }
    document.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => userAction(b.dataset.act, b.dataset.app, b.dataset.dev, b) })
    if (preApp && regById[preApp] && regById[preApp].status === 'approved') userAction('code', preApp)
    const t = $('thread'); if (t) t.scrollTop = t.scrollHeight
  }

  function appCard(r) {
    const app = state.user.apps.find((a) => a.appId === r.appId) || { appName: r.appId }
    const n = r.devices.length, max = r.maxDevices || 0
    const pct = max ? Math.min(100, (n / max) * 100) : 0
    const cls = n >= max ? 'full' : pct >= 67 ? 'warn' : ''
    let action = ''
    if (r.status === 'approved') action = `<button class="btn gold" data-act="code" data-app="${esc(r.appId)}">인증번호 받기</button>`
    else if (r.status === 'revoked') action = `<button class="btn" data-act="register" data-app="${esc(r.appId)}">다시 인증 신청</button>`
    else action = `<span class="notice warn small">⏳ 관리자 확인을 기다리고 있습니다. 승인되면 여기서 인증번호를 받을 수 있습니다.</span>`
    return `<div class="app">
      <div class="row between"><div class="name">${esc(app.appName)}</div>${badge(r.status)}</div>
      ${app.description ? `<div class="desc">${esc(app.description)}</div>` : ''}
      ${r.status === 'approved' ? `<div class="meter"><span>기기 <b>${n}</b> / ${max}대</span><div class="bar"><i class="${cls}" style="width:${pct}%"></i></div></div>
      <div class="devs">${r.devices.length ? r.devices.map((d) => `<div class="dev"><span class="ico">${/모바일|android|ios|iphone/i.test(d.platform) ? '📱' : '💻'}</span><div class="grow"><div class="nm">${esc(d.deviceName || '이름 없는 기기')} <span class="muted tiny mono">#${esc(d.deviceTag)}</span></div><div class="mt">${esc(d.platform)}${d.appVersion ? ' · ' + esc(d.appVersion) : ''} · 마지막 사용 ${fmt(d.lastSeen)}</div></div><button class="ghost xs" data-act="release" data-app="${esc(r.appId)}" data-dev="${esc(d.id)}" title="이 기기 해제">해제</button></div>`).join('') : `<div class="tiny muted">아직 인증한 기기가 없습니다. 앱에서 인증하면 여기에 나타납니다.</div>`}</div>` : ''}
      <div class="row" style="margin-top:auto">${action}${app.appUrl ? `<a class="ghost sm" href="${esc(app.appUrl)}" target="_blank" rel="noopener">앱 열기 ↗</a>` : ''}</div>
    </div>`
  }

  const threadHtml = (msgs) => (msgs && msgs.length) ? msgs.map((m) => `<div class="msg ${m.isAdminReply ? 'admin' : ''}">${esc(m.message)}<span class="t">${m.isAdminReply ? '관리자 · ' : ''}${fmtT(m.createdAt)}</span></div>`).join('') : '<div class="empty" style="padding:14px">주고받은 메시지가 없습니다.</div>'

  async function userAction(act, appId, devId, btn) {
    const u = state.user
    if (act === 'register') return openRegister(appId)
    if (act === 'release') {
      if (!(await confirmBox('기기 해제', '이 기기에서는 앱이 다시 체험판으로 돌아가며, 다시 인증하면 다시 등록됩니다.', '해제', true))) return
      try { await call('releaseUserDevice', [u.userId, devId]); toast('해제했습니다.', 'ok'); userPatch((d) => { for (const r of d.registrations) r.devices = (r.devices || []).filter((x) => x.id !== devId) }) } catch (e) { toast(e.message, 'err') }
      return
    }
    if (act === 'code') {
      await busy(btn, async () => {
        try {
          const r = await call('getAuthCode', [u.userId, appId])
          if (!r.success) { toast(r.error, 'err'); await loadUser(); return }
          const app = u.apps.find((a) => a.appId === appId) || {}
          const card = $('codeCard'); card.style.display = ''
          card.innerHTML = `<h2>🔑 인증번호 <span class="chip gold">${esc(r.appName)}</span></h2><p class="sub">아래 번호를 복사해 앱의 <b>[정식판으로 전환]</b> 창에 사용자 ID와 함께 입력하세요. 같은 승인 기간에는 같은 번호가 발급됩니다.</p>
            <div class="codebox"><div class="lbl">License Code</div><div class="val" id="codeVal">${esc(r.code)}</div><div class="hint">사용자 ID <b>${esc(u.userId)}</b> · 발급 ${r.copyCount}/${r.maxCopies}회${r.remaining <= 2 ? ' · 남은 발급 ' + r.remaining + '회' : ''}</div></div>
            <div class="row" style="margin-top:12px"><button class="btn primary" id="cpCode">📋 인증번호 복사</button>${app.appUrl ? `<a class="btn" href="${esc(app.appUrl)}" target="_blank" rel="noopener">앱 열기 ↗</a>` : ''}<span class="tiny muted">기기 ${(state.user.registrations.find((x) => x.appId === appId) || {}).maxDevices || ''}대까지 같은 번호로 인증할 수 있습니다.</span></div>`
          $('cpCode').onclick = () => copyText(r.code).then(() => { toast('인증번호를 복사했습니다.', 'ok'); $('cpCode').textContent = '✅ 복사됨'; setTimeout(() => ($('cpCode').textContent = '📋 인증번호 복사'), 2000) })
          card.scrollIntoView({ behavior: 'smooth', block: 'center' })
          const regs = await call('getUserData', [u.userId]); state.user = regs; renderCounts()
        } catch (e) { toast(e.message, 'err') }
      })
    }
  }
  function renderCounts() { /* 인증번호 카드를 유지한 채 앱 목록만 새로 그림 */
    const card = $('codeCard'); const html = card ? card.innerHTML : ''; const shown = card && card.style.display !== 'none'
    renderUserBody(); if (shown) { $('codeCard').style.display = ''; $('codeCard').innerHTML = html; const b = $('cpCode'); if (b) b.onclick = () => copyText($('codeVal').textContent).then(() => toast('인증번호를 복사했습니다.', 'ok')) }
  }

  // 발급 신청 안내글: 줄바꿈 그대로 보여 주고, **글자**는 강조, '계좌'·'은행'이 든 줄은 강조 + 그 줄의 계좌번호는 복사 단추로
  const guideAccount = (t) => { for (const line of String(t || '').split('\n')) { if (!/계좌|은행/.test(line)) continue; const m = line.match(/\d{2,6}(?:-\d{2,6}){2,4}/); if (m) return m[0] } return '' }
  const guideLine = (l) => { const h = esc(l).replace(/\*\*(.+?)\*\*/g, '<strong class="em">$1</strong>'); return /계좌|은행/.test(l) ? `<span class="acct">${h}</span>` : h }
  const guideHtml = (t, compact) => `<div class="guide${compact ? ' compact' : ''}">${String(t || '').split('\n').map(guideLine).join('\n')}</div>`
  const bindCopyAccount = (btn, text) => { if (btn) btn.onclick = () => copyText(guideAccount(text)).then(() => toast('계좌번호를 복사했습니다: ' + guideAccount(text), 'ok')) }
  function openGuide(text, onApply) {
    const acct = guideAccount(text)
    modal(`<h3>📋 발급 신청 안내</h3>${guideHtml(text)}
      <div class="row" style="justify-content:flex-end;margin-top:14px">${acct ? '<button class="btn sm" id="gCopy">계좌번호 복사</button>' : ''}<button class="btn sm" id="gClose">닫기</button>${onApply ? '<button class="btn sm primary" id="gApply">인증 신청하기</button>' : ''}</div>`)
    bindCopyAccount($('gCopy'), text)
    $('gClose').onclick = closeModal
    if (onApply) $('gApply').onclick = () => { closeModal(); onApply() }
  }

  function openRegister(appId) {
    const app = state.user.apps.find((a) => a.appId === appId) || { appName: appId }
    const guide = state.guide != null ? state.guide : (state.user.applyGuide || '')
    modal(`<h3>인증 신청 — ${esc(app.appName)}</h3>
      ${guide ? `<div class="row between" style="margin-top:6px"><span class="tiny muted" style="font-weight:700">발급 신청 안내</span>${guideAccount(guide) ? '<button class="ghost xs" id="rCopy">계좌번호 복사</button>' : ''}</div>${guideHtml(guide, true)}` : ''}
      <p class="small muted" style="margin:${guide ? '12px' : '0'} 0 6px">구입 정보를 입력하면 관리자가 확인한 뒤 승인합니다. 승인 후 인증번호를 받을 수 있습니다.</p>
      <label class="f">구입처</label><div class="seg" id="src"><button data-v="blog" class="active">블로그(무통장 입금)</button><button data-v="online">온라인 구매</button></div>
      <label class="f">입금자 명 / 온라인 아이디</label><input class="input" id="rName" placeholder="사용자 ID와 같으면 비워 두세요">
      <label class="f">메시지(선택)</label><textarea class="input" id="rMsg" placeholder="관리자에게 전할 말"></textarea>
      <div class="field-err" id="rErr"></div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn sm" id="rCancel">취소</button><button class="btn sm primary" id="rGo">인증 신청</button></div>`)
    bindCopyAccount($('rCopy'), guide)
    let src = 'blog'
    $('src').querySelectorAll('button').forEach((b) => { b.onclick = () => { src = b.dataset.v; $('src').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)) } })
    $('rCancel').onclick = closeModal
    $('rGo').onclick = () => busy($('rGo'), async () => {
      const name = $('rName').value.trim(), msg = $('rMsg').value.trim()
      try {
        const r = await call('requestRegistration', [state.user.userId, appId, src, name, msg]); closeModal(); toast('신청했습니다. 관리자 승인 후 인증번호를 받을 수 있습니다.', 'ok')
        state.utab = 'apps'  // 신청한 앱의 상태를 바로 볼 수 있게 '소유 앱' 탭으로
        userPatch((d) => {
          const ex = d.registrations.find((x) => x.appId === appId)
          const row = { id: r.id, appId, status: 'pending', copyCount: 0, totalApprovals: 0, createdAt: new Date().toISOString(), approvedAt: '', purchaseSource: src, maxDevices: 3, devices: [] }
          if (ex) Object.assign(ex, row); else d.registrations.push(row)
          if (msg) d.messages.push({ id: 'tmp', userId: d.userId, message: msg, createdAt: new Date().toISOString(), isAdminReply: false })
        })
      } catch (e) { $('rErr').textContent = e.message }
    })
  }

  // ── 관리자 화면 ───────────────────────────────────────────
  function renderAdmin() {
    if (!state.boot.isAdminUrl) { $('app').innerHTML = `<div class="card" style="max-width:520px;margin:40px auto"><div class="notice danger">🔒 관리자 주소가 아닙니다. 설정할 때 받은 관리자 주소(키 포함)로 열어 주세요.</div></div>`; return }
    if (!state.token) return renderLogin()
    const fail = (e) => { if (e.code === 'auth_required') { state.token = null; ls.set(LS.token, null); renderLogin('로그인이 만료되었습니다.') } else $('app').innerHTML = `<div class="card"><div class="notice danger">⚠ ${esc(e.message)}</div></div>` }
    if (state.adminErr) { const e = state.adminErr; state.adminErr = null; return fail(e) }
    if (state.admin) return renderDash()           // boot()에서 미리 받아 둔 자료
    const cached = ss.get('admin_data')
    if (cached) { state.admin = cached; renderDash(); refreshing(true) }  // 지난 자료를 먼저 보여 주고 뒤에서 새로 고침
    else $('app').innerHTML = `<div class="loading"><span class="spin"></span> 관리자 자료 불러오는 중… (보통 3~6초)</div>`
    loadAdmin().then(() => { refreshing(false); renderDash() }).catch((e) => { refreshing(false); fail(e) })
  }
  function renderLogin(msg) {
    document.body.classList.remove('admin')
    $('app').innerHTML = `<div class="card fade" style="max-width:440px;margin:40px auto"><h2>🔧 관리자 로그인</h2><p class="sub">리천 인증 센터 관리자</p>
      ${msg ? `<div class="notice warn small">${esc(msg)}</div>` : ''}
      <label class="f">비밀번호</label><input class="input" id="aPwd" type="password" autocomplete="current-password">
      <label class="row small" style="margin:12px 0"><input type="checkbox" id="aKeep" checked> 이 브라우저에서 30일간 로그인 유지</label>
      <button class="btn primary full" id="aGo">로그인</button><div class="field-err" id="aErr"></div></div>`
    $('aPwd').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) $('aGo').click() })
    $('aGo').onclick = () => busy($('aGo'), async () => {
      try { const r = await call('adminLogin', [$('aPwd').value, state.key, $('aKeep').checked]); state.token = r.token; ls.set(LS.token, r.token); renderAdmin() }
      catch (e) { $('aErr').textContent = e.message }
    })
  }
  async function loadAdmin() { state.admin = await admin('getAdminData'); ss.set('admin_data', state.admin); return state.admin }
  // 관리 동작: 서버 응답이 오면 화면 자료를 바로 고쳐 그리고(patch), 전체 자료는 뒤에서 조용히 새로 고친다
  async function act(btn, fn, okMsg, patch) {
    await busy(btn, async () => {
      try {
        const r = await fn()
        if (okMsg) toast(okMsg, 'ok')
        if (patch) { try { patch(r, state.admin) } catch (_) {} renderDash() }
        refreshing(true)
        loadAdmin().then(() => { refreshing(false); if (state.route === 'admin' && state.token) renderDash() }).catch(() => refreshing(false))
      } catch (e) { toast(e.message, 'err') }
    })
  }
  const appName = (id) => { const a = (state.admin.apps || []).find((x) => x.appId === id); return a ? a.appName : id }

  function renderDash() {
    document.body.classList.add('admin') // 관리자 표가 넓어 화면을 넓게 쓴다
    const d = state.admin, s = d.stats
    $('app').innerHTML = `
      <div class="row between fade" style="margin-bottom:14px"><div><h1 style="margin:0;font-size:1.35rem">관리자 대시보드</h1><div class="tiny muted">서버 v${esc(d.serverVersion)} · ${d.spreadsheetUrl ? `<a href="${esc(d.spreadsheetUrl)}" target="_blank" rel="noopener">데이터 시트 열기 ↗</a>` : ''}</div></div>
        <div class="row"><a class="btn sm" href="${esc(location.origin + location.pathname)}#/" target="_blank" rel="noopener">👤 사용자 앱 열기 ↗</a><button class="ghost sm" id="aReload">새로고침</button><button class="ghost sm" id="aOut">로그아웃</button></div></div>
      <div class="stats fade">
        <div class="stat"><b>${s.total}</b><span>전체 등록</span></div>
        <div class="stat" style="${s.pending ? 'border-color:var(--warn)' : ''}"><b style="${s.pending ? 'color:var(--warn)' : ''}">${s.pending}</b><span>승인 대기</span></div>
        <div class="stat"><b style="color:var(--ok)">${s.approved}</b><span>승인됨</span></div>
        <div class="stat"><b>${s.needsReapproval}</b><span>재승인 필요</span></div>
        <div class="stat"><b>${s.devices}</b><span>등록 기기</span></div>
        <div class="stat"><b>${s.activeApps}/${s.totalApps}</b><span>활성 앱</span></div>
        <div class="stat ${d.unread.count ? 'hot' : ''}" id="stUnread"><b style="${d.unread.count ? 'color:var(--danger)' : ''}">${d.unread.count}</b><span>새 메시지</span></div>
      </div>
      <section class="card fade">
        <div class="tabs">${[['regs', '등록 관리'], ['apps', '앱 관리'], ['devices', '기기'], ['msgs', '메시지'], ['settings', '설정']].map(([k, l]) => `<button class="tab ${state.tab === k ? 'active' : ''}" data-tab="${k}">${l}${k === 'msgs' && d.unread.count ? `<span class="cnt">${d.unread.count}</span>` : ''}</button>`).join('')}</div>
        <div id="panel"></div>
      </section>`
    $('aReload').onclick = () => busy($('aReload'), async () => { await loadAdmin(); renderDash() })
    $('aOut').onclick = async () => { try { await admin('adminLogout') } catch (_) {} state.token = null; ls.set(LS.token, null); renderLogin() }
    $('stUnread').onclick = () => { state.tab = 'msgs'; renderDash() }
    document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => { state.tab = t.dataset.tab; renderDash() } })
    ;({ regs: panelRegs, apps: panelApps, devices: panelDevices, msgs: panelMsgs, settings: panelSettings })[state.tab]()
    watchTables()
  }
  // 표가 화면보다 넓어 가로로 밀려 있으면 오른쪽 단추 칸에 그림자를 준다(아직 더 있다는 표시)
  function watchTables() {
    document.querySelectorAll('.tbl-wrap').forEach((w) => {
      const upd = () => w.classList.toggle('scrolled', w.scrollWidth - w.clientWidth - w.scrollLeft > 1)
      w.onscroll = upd
      upd()
    })
  }
  window.addEventListener('resize', () => { if (document.body.classList.contains('admin')) watchTables() })
  // 자료 즉시 반영용 도우미
  const P = {
    reg: (id, f) => (r, d) => { const x = d.registrations.find((z) => z.id === id); if (x) f(x, r) },
    dropReg: (id) => (r, d) => { const x = d.registrations.find((z) => z.id === id); d.registrations = d.registrations.filter((z) => z.id !== id); if (x) d.devices = d.devices.filter((v) => !(v.appId === x.appId && v.userId === x.userId)); d.stats.total = d.registrations.length },
    dropDevice: (id) => (r, d) => { d.devices = d.devices.filter((v) => v.id !== id); d.stats.devices = d.devices.length },
    app: (id, f) => (r, d) => { const a = d.apps.find((z) => z.appId === id); if (a) f(a, r) },
    cfg: (key) => (r, d) => { d.config[key] = r.value },
  }

  function panelRegs() {
    const d = state.admin
    let list = d.registrations.filter((r) => (state.filter === 'all' || r.status === state.filter) && (state.appFilter === 'all' || r.appId === state.appFilter))
    list = list.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    const devCount = (r) => d.devices.filter((x) => x.appId === r.appId && x.userId === r.userId).length
    $('panel').innerHTML = `
      <div class="filters"><div class="seg">${[['all', '전체'], ['pending', '대기'], ['approved', '승인'], ['needs_reapproval', '재승인'], ['revoked', '취소']].map(([k, l]) => `<button class="${state.filter === k ? 'active' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
        <select class="input" style="width:auto;height:34px" id="appF"><option value="all">모든 앱</option>${d.apps.map((a) => `<option value="${esc(a.appId)}" ${state.appFilter === a.appId ? 'selected' : ''}>${esc(a.appName)}</option>`).join('')}</select>
        <span class="tiny muted right">기기 수 칸을 고치면 그 사용자만 예외로 적용됩니다(비우면 전체 설정 ${d.config.maxDevices}대).</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>사용자 ID</th><th>앱</th><th>상태</th><th>구입 정보</th><th>발급</th><th>승인</th><th>기기</th><th>등록일</th><th></th></tr></thead><tbody>
      ${list.length ? list.map((r) => `<tr>
        <td class="mono" style="font-weight:700">${esc(r.userId)}</td><td>${esc(appName(r.appId))}</td><td>${badge(r.status)}</td>
        <td class="small">${r.purchaseSource ? `${esc(SRC[r.purchaseSource] || r.purchaseSource)}<div class="tiny muted">${esc(r.purchaserName || '(본인 ID)')}</div>` : '<span class="muted">—</span>'}</td>
        <td><span class="chip">${r.copyCount}/${d.config.maxCopies}</span></td><td style="text-align:center">${r.totalApprovals}</td>
        <td><div class="row" style="gap:4px;flex-wrap:nowrap"><span class="chip ${devCount(r) >= (r.maxDevices || d.config.maxDevices) ? 'gold' : ''}">${devCount(r)}</span><input class="num" data-max="${esc(r.id)}" value="${r.maxDevices || ''}" placeholder="${d.config.maxDevices}" title="이 사용자의 최대 기기 수(비우면 전체 설정)"></div></td>
        <td class="tiny muted">${fmt(r.createdAt)}</td>
        <td><div class="row" style="gap:4px;flex-wrap:nowrap">
          ${r.status === 'pending' || r.status === 'needs_reapproval' ? `<button class="btn xs primary" data-a="approve" data-id="${esc(r.id)}">승인</button>` : ''}
          ${r.status === 'approved' ? `<button class="btn xs" data-a="revoke" data-id="${esc(r.id)}">취소</button>` : ''}
          <button class="btn xs danger" data-a="del" data-id="${esc(r.id)}" data-u="${esc(r.userId)}" data-app="${esc(appName(r.appId))}" title="이 등록 삭제">삭제</button></div></td></tr>`).join('') : `<tr><td colspan="9"><div class="empty">해당하는 등록이 없습니다.</div></td></tr>`}
      </tbody></table></div>`
    $('panel').querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { state.filter = b.dataset.f; panelRegs() } })
    $('appF').onchange = () => { state.appFilter = $('appF').value; panelRegs() }
    $('panel').querySelectorAll('[data-max]').forEach((inp) => {
      const save = () => { const v = inp.value.trim(); const cur = (d.registrations.find((r) => r.id === inp.dataset.max) || {}).maxDevices || ''; if (v === String(cur)) return; act(null, () => admin('setRegistrationMaxDevices', inp.dataset.max, v), v ? `이 사용자는 기기 ${v}대로 설정했습니다.` : '전체 설정을 따르도록 되돌렸습니다.', P.reg(inp.dataset.max, (x, r) => { x.maxDevices = r.maxDevices })) }
      inp.onchange = save; inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur() }
    })
    $('panel').querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.id
        if (b.dataset.a === 'approve') return act(b, () => admin('approveRegistration', id), '승인했습니다.', P.reg(id, (x, r) => { x.status = 'approved'; x.copyCount = 0; x.totalApprovals = r.totalApprovals; x.approvedAt = new Date().toISOString() }))
        if (b.dataset.a === 'revoke') { if (await confirmBox('등록 취소', '이 사용자의 앱은 모든 기기에서 체험판으로 돌아갑니다.', '취소하기', true)) act(b, () => admin('revokeRegistration', id), '취소했습니다.', P.reg(id, (x) => { x.status = 'revoked' })) }
        if (b.dataset.a === 'del') { if (await confirmBox('등록 삭제', `<b>${esc(b.dataset.u)}</b> · ${esc(b.dataset.app)} 등록과 그 기기 기록을 지웁니다. 되돌릴 수 없습니다.`, '삭제', true)) act(b, () => admin('deleteRegistration', id), '삭제했습니다.', P.dropReg(id)) }
      }
    })
  }

  function panelApps() {
    const d = state.admin
    const apps = d.apps.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) // 최근 추가한 앱이 위로
    $('panel').innerHTML = `
      <div class="row" style="margin-bottom:14px"><input class="input grow" id="nName" placeholder="새 앱 이름 (예: 학사일정 편성 도우미)"><input class="input grow" id="nDesc" placeholder="설명(선택)"><input class="input grow" id="nUrl" placeholder="앱 주소(선택) https://…"><button class="btn primary" id="nGo">앱 추가</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>앱</th><th>앱 ID</th><th>주소</th><th>상태</th><th>등록</th><th>기기</th><th>등록일</th><th></th></tr></thead><tbody>
      ${apps.length ? apps.map((a) => `<tr>
        <td><b>${esc(a.appName)}</b>${a.description ? `<div class="tiny muted">${esc(a.description)}</div>` : ''}</td><td class="mono tiny">${esc(a.appId)}</td>
        <td class="tiny">${a.appUrl ? `<a href="${esc(a.appUrl)}" target="_blank" rel="noopener">열기 ↗</a>` : '—'}</td>
        <td>${a.isActive ? '<span class="badge approved">활성</span>' : '<span class="badge revoked">비활성</span>'}</td>
        <td>${d.registrations.filter((r) => r.appId === a.appId).length}</td><td>${d.devices.filter((x) => x.appId === a.appId).length}</td><td class="tiny muted">${fmt(a.createdAt)}</td>
        <td><div class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn xs" data-e="${esc(a.appId)}">정보·키</button><button class="btn xs" data-c="${esc(a.appId)}" title="관리자용 만능 인증번호">🔑</button><button class="btn xs" data-t="${esc(a.appId)}">${a.isActive ? '비활성화' : '활성화'}</button>${!a.isActive ? `<button class="btn xs danger" data-d="${esc(a.appId)}">삭제</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="8"><div class="empty">등록된 앱이 없습니다.</div></td></tr>'}
      </tbody></table></div>`
    $('nGo').onclick = () => { const n = $('nName').value.trim(); if (!n) return toast('앱 이름을 입력하세요.', 'err'); act($('nGo'), async () => { const r = await admin('addApp', n, $('nDesc').value.trim(), $('nUrl').value.trim()); state.tab = 'apps'; setTimeout(() => openAppInfo(r.appId), 50) }, '앱을 추가했습니다.') }
    $('panel').querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => openAppInfo(b.dataset.e) })
    $('panel').querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { const a = d.apps.find((x) => x.appId === b.dataset.t); act(b, () => admin('updateApp', a.appId, null, null, !a.isActive, null), null, P.app(a.appId, (x) => { x.isActive = !x.isActive })) } })
    $('panel').querySelectorAll('[data-d]').forEach((b) => { b.onclick = async () => { if (await confirmBox('앱 삭제', '이 앱의 모든 등록과 기기 기록이 함께 지워집니다.', '삭제', true)) act(b, () => admin('deleteApp', b.dataset.d), '삭제했습니다.', (r, dd) => { dd.apps = dd.apps.filter((x) => x.appId !== b.dataset.d); dd.registrations = dd.registrations.filter((x) => x.appId !== b.dataset.d) }) } })
    $('panel').querySelectorAll('[data-c]').forEach((b) => {
      b.onclick = () => busy(b, async () => {
        try { const r = await admin('generateAdminCode', b.dataset.c)
          modal(`<h3>관리자 만능 인증번호 — ${esc(r.appName)}</h3><p class="small muted">앱의 인증 창에 아래 사용자 ID와 번호를 그대로 입력하세요. 기기 수 제한 없이 인증됩니다.</p>
            <label class="f">사용자 ID</label><div class="secret"><code>${esc(r.userId)}</code><button class="btn xs" data-cp="${esc(r.userId)}">복사</button></div>
            <label class="f">인증번호</label><div class="secret"><code class="mono" style="font-size:1rem;letter-spacing:.1em">${esc(r.code)}</code><button class="btn xs" data-cp="${esc(r.code)}">복사</button></div>
            <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn sm" id="mClose">닫기</button></div>`)
          $('mClose').onclick = closeModal; $('modalBox').querySelectorAll('[data-cp]').forEach((x) => { x.onclick = () => copyText(x.dataset.cp).then(() => toast('복사했습니다.', 'ok')) })
        } catch (e) { toast(e.message, 'err') }
      })
    })
  }
  function openAppInfo(appId) {
    const a = state.admin.apps.find((x) => x.appId === appId); if (!a) return
    modal(`<h3>앱 정보 — ${esc(a.appName)}</h3>
      <label class="f">앱 이름</label><input class="input" id="eName" value="${esc(a.appName)}">
      <label class="f">설명</label><input class="input" id="eDesc" value="${esc(a.description || '')}">
      <label class="f">앱 주소</label><input class="input" id="eUrl" value="${esc(a.appUrl || '')}" placeholder="https://…">
      <details class="adv" style="margin-top:14px"><summary>개발자용 — 앱에 넣을 값</summary>
        <label class="f">앱 ID</label><div class="secret"><code>${esc(a.appId)}</code><button class="btn xs" data-cp="${esc(a.appId)}">복사</button></div>
        <label class="f">비밀키(앱 안에만 두고 공개하지 마세요)</label><div class="secret"><code id="eSec">••••••••••••••••••••••••</code><button class="btn xs" id="eShow">보기</button><button class="btn xs" data-cp="${esc(a.appSecret)}">복사</button></div>
        <p class="help">인증번호 = SHA-256(사용자ID|앱ID|비밀키|승인차수). 서버 주소는 인증 센터 설정과 같습니다.</p></details>
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn sm" id="eCancel">취소</button><button class="btn sm primary" id="eSave">저장</button></div>`)
    $('eShow').onclick = () => { $('eSec').textContent = a.appSecret; $('eShow').remove() }
    $('modalBox').querySelectorAll('[data-cp]').forEach((x) => { x.onclick = () => copyText(x.dataset.cp).then(() => toast('복사했습니다.', 'ok')) })
    $('eCancel').onclick = closeModal
    $('eSave').onclick = () => { const v = { appName: $('eName').value.trim(), description: $('eDesc').value.trim(), appUrl: $('eUrl').value.trim() }; act($('eSave'), async () => { await admin('updateApp', a.appId, v.appName, v.description, null, v.appUrl); closeModal() }, '저장했습니다.', P.app(a.appId, (x) => Object.assign(x, v))) }
  }

  function panelDevices() {
    const d = state.admin
    const list = d.devices.slice().sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''))
    $('panel').innerHTML = `<p class="small muted" style="margin:0 0 12px">앱에서 인증한 기기입니다. 기본 한도는 인증번호당 <b>${d.config.maxDevices}대</b>(설정에서 변경)이고, 사용자별 예외는 등록 관리의 기기 칸에서 정합니다.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>사용자 ID</th><th>앱</th><th>기기</th><th>환경</th><th>앱 버전</th><th>처음</th><th>마지막 사용</th><th></th></tr></thead><tbody>
      ${list.length ? list.map((x) => `<tr><td class="mono" style="font-weight:700">${esc(x.userId)}</td><td>${esc(appName(x.appId))}</td><td>${esc(x.deviceName || '이름 없음')} <span class="tiny muted mono">#${esc(x.deviceId.slice(-6))}</span></td><td class="small">${esc(x.platform)}</td><td class="tiny">${esc(x.appVersion)}</td><td class="tiny muted">${fmt(x.firstSeen)}</td><td class="tiny muted">${fmtT(x.lastSeen)}</td><td><button class="btn xs danger" data-r="${esc(x.id)}">해제</button></td></tr>`).join('') : '<tr><td colspan="8"><div class="empty">등록된 기기가 없습니다.</div></td></tr>'}
      </tbody></table></div>`
    $('panel').querySelectorAll('[data-r]').forEach((b) => { b.onclick = async () => { if (await confirmBox('기기 해제', '이 기기의 앱은 체험판으로 돌아갑니다. 사용자가 다시 인증하면 다시 등록됩니다.', '해제', true)) act(b, () => admin('adminRemoveDevice', b.dataset.r), '해제했습니다.', P.dropDevice(b.dataset.r)) } })
  }

  function panelMsgs() {
    const d = state.admin
    const byUser = {}
    d.messages.forEach((m) => { (byUser[m.userId] = byUser[m.userId] || []).push(m) })
    const users = Object.keys(byUser).sort((a, b) => (d.unread.byUser[b] || 0) - (d.unread.byUser[a] || 0) || byUser[b].slice(-1)[0].createdAt.localeCompare(byUser[a].slice(-1)[0].createdAt))
    if (!state.msgUser || !byUser[state.msgUser]) state.msgUser = users[0] || ''
    $('panel').innerHTML = `<div class="row" style="align-items:flex-start;gap:16px">
      <div style="width:220px;flex:none"><div class="row between" style="margin-bottom:6px"><span class="tiny muted">사용자</span>${d.unread.count ? `<button class="ghost xs" id="mRead">모두 읽음</button>` : ''}</div>
        ${users.length ? users.map((u) => `<button class="btn full sm ${u === state.msgUser ? 'primary' : ''}" style="justify-content:space-between;margin-bottom:4px" data-u="${esc(u)}">${esc(u)}${d.unread.byUser[u] ? `<span class="cnt" style="background:var(--danger);color:#fff;border-radius:99px;padding:0 6px;font-size:.7rem">${d.unread.byUser[u]}</span>` : ''}</button>`).join('') : '<div class="empty" style="padding:10px">메시지가 없습니다.</div>'}</div>
      <div class="grow">${state.msgUser ? `<div class="thread" id="aThread">${threadHtml(byUser[state.msgUser])}</div><div class="row" style="margin-top:10px"><input class="input grow" id="aMsg" placeholder="${esc(state.msgUser)}에게 답장"><button class="btn primary" id="aMsgGo">보내기</button></div>` : ''}</div></div>`
    $('panel').querySelectorAll('[data-u]').forEach((b) => { b.onclick = () => { state.msgUser = b.dataset.u; panelMsgs() } })
    if ($('mRead')) $('mRead').onclick = () => act($('mRead'), () => admin('markMessagesRead'), null, (r, dd) => { dd.unread = { count: 0, byUser: {}, lastReadAt: r.at } })
    if ($('aMsgGo')) { $('aMsg').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) $('aMsgGo').click() }); $('aMsgGo').onclick = () => { const m = $('aMsg').value.trim(); if (!m) return; const to = state.msgUser; act($('aMsgGo'), () => admin('addAdminReply', to, m), '답장을 보냈습니다.', (r, dd) => { dd.messages.push({ id: r.id, userId: to, message: m, createdAt: r.createdAt, isAdminReply: true }) }) } }
    const t = $('aThread'); if (t) t.scrollTop = t.scrollHeight
  }

  function panelSettings() {
    const d = state.admin, c = d.config
    const mail = d.mail || { enabled: !String(d.serverVersion).startsWith('3'), note: '' }  // 예전 서버: Apps Script면 메일 가능
    const hasGuide = 'applyGuide' in d
    const num =(id, label, val, help) => `<div class="row between" style="padding:10px 0;border-bottom:1px solid var(--line)"><div><b class="small">${label}</b><div class="tiny muted">${help}</div></div><div class="row"><input class="num" id="${id}" value="${val}"><button class="btn xs" data-cfg="${id}">저장</button></div></div>`
    $('panel').innerHTML = `
      <h3 style="margin:0 0 4px;font-size:.98rem">기기 · 발급 한도</h3>
      ${num('maxDevices', '인증번호당 기기 수', c.maxDevices, '한 사용자가 같은 인증번호로 인증할 수 있는 기기 수. 사용자별 예외는 등록 관리에서.')}
      ${num('maxCopies', '인증번호 발급 횟수', c.maxCopies, '이 횟수를 넘으면 관리자 재승인이 필요합니다.')}
      ${num('maxApprovals', '사용자당 총 승인 횟수', c.maxApprovals, '이 횟수를 넘으면 더 승인할 수 없습니다.')}
      ${hasGuide ? `<h3 style="margin:22px 0 4px;font-size:.98rem">발급 신청 안내글</h3>
      <p class="help" style="margin:0 0 8px">사용자 화면의 <b>[📋 발급 신청 안내]</b> 단추와 인증 신청 창에 그대로 보입니다. 줄바꿈은 그대로 나오고, <b>**강조할 글**</b>처럼 별표 두 개로 감싸면 강조됩니다. '계좌'나 '은행'이 들어간 줄은 자동으로 강조되며 그 줄의 계좌번호는 사용자가 복사할 수 있습니다. 비우고 저장하면 안내를 숨깁니다.</p>
      <textarea class="input" id="gText" rows="12" maxlength="5000" placeholder="예: 후원 금액, 입금자명 쓰는 법, 후원 계좌…">${esc(d.applyGuide || '')}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn sm primary" id="gGo">안내글 저장</button><button class="btn sm" id="gPrev">미리보기</button><span class="tiny muted right" id="gLen"></span></div>` : ''}
      <h3 style="margin:22px 0 4px;font-size:.98rem">알림 · 주소</h3>
      <label class="f">관리자 알림 이메일</label><div class="row"><input class="input grow" id="cEmail" value="${esc(d.adminEmail)}" placeholder="비워 두면 알림 없음"><button class="btn sm" id="cEmailGo">저장</button>${mail.enabled ? '<button class="btn sm" id="cEmailTest">테스트 발송</button>' : ''}</div>
      <p class="help">사용자가 인증번호 발급(앱 등록)을 신청하면 이 주소로 <b>발급 신청 안내 메일</b>(사용자 ID·앱·구입처·입금자·메시지와 관리자 화면 바로가기)을 보냅니다. 비워 두면 보내지 않습니다.${mail.enabled && mail.note ? ' ' + esc(mail.note) : ''}</p>
      ${mail.enabled ? '' : `<div class="notice warn small" style="margin-top:8px">⚠ ${esc(mail.note || '이 서버는 아직 메일 발송이 연결되지 않았습니다.')}</div>`}
      <label class="f">인증 센터 주소(예전 링크·메일에서 안내할 주소)</label><div class="row"><input class="input grow" id="cSite" value="${esc(d.siteUrl)}"><button class="btn sm" id="cSiteGo">저장</button></div>
      <h3 style="margin:22px 0 4px;font-size:.98rem">관리자 계정</h3>
      <div class="row"><input class="input grow" id="pCur" type="password" placeholder="현재 비밀번호"><input class="input grow" id="pNew" type="password" placeholder="새 비밀번호(4자 이상)"><input class="input grow" id="pNew2" type="password" placeholder="새 비밀번호 확인"><button class="btn sm" id="pGo">비밀번호 변경</button></div>
      <p class="help">바꾸면 모든 기기에서 다시 로그인해야 합니다.</p>
      <div class="row" style="margin-top:8px"><input class="input grow" id="kNew" placeholder="새 관리자 주소 키(영문·숫자 8자 이상)"><button class="btn sm" id="kGo">주소 키 변경</button></div>
      ${d.backup && d.backup.note ? '<h3 style="margin:22px 0 4px;font-size:.98rem">백업</h3><p class="small muted">' + esc(d.backup.note) + ' · 데이터 시트의 <b>파일 → 버전 기록</b>으로도 언제든 되돌릴 수 있습니다.</p>' : ''}
      <div style="${d.backup && d.backup.note ? 'display:none' : ''}">      <h3 style="margin:22px 0 4px;font-size:.98rem">백업</h3>
      <div class="row"><select class="input" style="width:auto" id="bInt">${[['off', '사용 안 함'], ['hourly', '매 시간'], ['daily', '매일 새벽 3시'], ['weekly', '매주 일요일'], ['monthly', '매월 1일']].map(([k, l]) => `<option value="${k}" ${d.backup.interval === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn sm" id="bGo">저장</button><button class="btn sm" id="bNow">지금 백업</button><button class="ghost sm" id="bList">백업 목록</button><span class="tiny muted">${d.backup.lastBackupAt ? '마지막 백업 ' + fmtT(d.backup.lastBackupAt) : ''}${d.backup.interval !== 'off' && !d.backup.active ? ' · ⚠ 트리거가 없습니다. 편집기에서 setBackupInterval을 한 번 실행하세요.' : ''}</span></div>
      <div id="bOut" class="small" style="margin-top:8px"></div></div>`
    $('panel').querySelectorAll('[data-cfg]').forEach((b) => { b.onclick = () => act(b, () => admin('updateConfig', b.dataset.cfg, $(b.dataset.cfg).value), '저장했습니다.', P.cfg(b.dataset.cfg)) })
    if (hasGuide) {
      const len = () => { $('gLen').textContent = `${$('gText').value.length.toLocaleString()} / 5,000자` }
      len(); $('gText').oninput = len
      $('gPrev').onclick = () => { const t = $('gText').value.trim(); if (!t) return toast('안내글이 비어 있어 사용자 화면에는 안내 단추가 보이지 않습니다.', 'err'); openGuide(t) }
      $('gGo').onclick = () => act($('gGo'), () => admin('setApplyGuide', $('gText').value), $('gText').value.trim() ? '안내글을 저장했습니다.' : '안내글을 비웠습니다. 사용자 화면에 안내가 보이지 않습니다.', (r, dd) => { dd.applyGuide = r.applyGuide })
    }
    $('cEmailGo').onclick = () => act($('cEmailGo'), () => admin('setAdminEmail', $('cEmail').value), '저장했습니다.', (r, dd) => { dd.adminEmail = r.email })
    if ($('cEmailTest')) $('cEmailTest').onclick = () => busy($('cEmailTest'), async () => { try { await admin('sendTestEmail', $('cEmail').value); toast('테스트 메일을 보냈습니다.', 'ok') } catch (e) { toast(e.message, 'err') } })
    $('cSiteGo').onclick = () => act($('cSiteGo'), () => admin('setSiteUrl', $('cSite').value), '저장했습니다.')
    $('pGo').onclick = () => { if ($('pNew').value !== $('pNew2').value) return toast('새 비밀번호가 서로 다릅니다.', 'err'); busy($('pGo'), async () => { try { await admin('changeAdminPassword', $('pCur').value, $('pNew').value); toast('비밀번호를 바꿨습니다. 다시 로그인하세요.', 'ok'); state.token = null; ls.set(LS.token, null); renderLogin() } catch (e) { toast(e.message, 'err') } }) }
    $('kGo').onclick = () => busy($('kGo'), async () => { try { const r = await admin('changeAdminUrlKey', $('kNew').value.trim()); const url = location.origin + location.pathname + r.adminPath; modal(`<h3>관리자 주소가 바뀌었습니다</h3><p class="small muted">새 주소를 보관하세요. 예전 주소로는 들어올 수 없습니다.</p><div class="row"><input class="input grow" readonly value="${esc(url)}"><button class="btn sm" id="kCp">복사</button></div><div class="row" style="justify-content:flex-end;margin-top:14px"><a class="btn sm primary" href="${esc(url)}">새 주소로 이동</a></div>`); $('kCp').onclick = () => copyText(url).then(() => toast('복사했습니다.', 'ok')) } catch (e) { toast(e.message, 'err') } })
    $('bGo').onclick = () => act($('bGo'), () => admin('setBackupInterval', $('bInt').value), '저장했습니다.')
    $('bNow').onclick = () => busy($('bNow'), async () => { try { const r = await admin('runBackupNow'); toast('백업했습니다: ' + r.fileName, 'ok'); await loadAdmin() } catch (e) { toast(e.message, 'err') } })
    $('bList').onclick = () => busy($('bList'), async () => { try { const l = await admin('listBackups'); $('bOut').innerHTML = l.length ? l.map((f) => `<div>📄 <a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a> <span class="tiny muted">${fmtT(f.date)} · ${Math.round(f.size / 1024)} KB</span></div>`).join('') : '<span class="muted">백업 파일이 없습니다.</span>' } catch (e) { toast(e.message, 'err') } })
  }

  boot()
})()
