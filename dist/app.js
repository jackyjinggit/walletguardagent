(() => {
  'use strict';

  const STORAGE_KEY = 'agentguard-chat-v2';
  const PRICE = 10; // integer milli-MON
  const DEFAULT = {
    balance: 50, cap: 25, single: 15, spent: 0, blocked: 0,
    authorized: false, revoked: false, currentTask: '', taskId: '',
    messages: [], orders: [], nextTask: 1
  };
  const $ = (s, root = document) => root.querySelector(s);
  const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeText = s => esc(s).replace(/\n/g, '<br>');
  const money = n => `${(n / 1000).toFixed(3)} MON`;
  const makeId = prefix => `${prefix}-${Math.random().toString(36).slice(2,6).toUpperCase()}${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const copyDefault = () => structuredClone(DEFAULT);
  let state = loadState();
  let harness = { connected: false, label: '检测本地模型中', error: '' };
  let chatController = null;
  let chatBusy = false;
  let actionBusy = false;
  let toastTimer = 0;
  let drawerTab = 'overview';
  let drawerOrderId = '';
  let rulesError = '';

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!raw || raw.version !== 2 || !raw.state) return copyDefault();
      const s = { ...copyDefault(), ...raw.state };
      for (const k of ['balance','cap','single','spent','blocked','nextTask']) {
        if (!Number.isSafeInteger(s[k]) || s[k] < 0) s[k] = DEFAULT[k];
      }
      if (s.balance > 50000 || s.cap > 50000 || s.single > 50000 || s.spent > 50000 || s.cap < s.spent) return copyDefault();
      s.authorized = Boolean(s.authorized);
      s.revoked = Boolean(s.revoked);
      s.currentTask = typeof s.currentTask === 'string' ? s.currentTask.slice(0,2000) : '';
      s.taskId = typeof s.taskId === 'string' ? s.taskId : '';
      s.messages = Array.isArray(s.messages) ? s.messages.slice(-120).filter(validMessage) : [];
      s.orders = Array.isArray(s.orders) ? s.orders.slice(0,100).filter(validOrder).map(sanitizeOrder) : [];
      if (s.revoked) s.authorized = false;
      return s;
    } catch { return copyDefault(); }
  }
  function validMessage(m) { return m && typeof m === 'object' && typeof m.id === 'string' && ['user','assistant'].includes(m.role) && typeof m.type === 'string'; }
  function validOrder(o) { return o && typeof o === 'object' && typeof o.id === 'string' && Number.isSafeInteger(o.amount) && o.amount >= 0; }
  function sanitizeOrder(o) {
    const copy = { ...o };
    if (!['paid','blocked'].includes(copy.payment)) copy.payment = 'blocked';
    if (!['pending','delivered','failed','none'].includes(copy.report)) copy.report = copy.payment === 'paid' ? 'pending' : 'none';
    if (Array.isArray(copy.checks)) copy.checks = copy.checks.slice(0,12).map(c => ({ label: String(c?.label ?? '').slice(0,240), pass: Boolean(c?.pass) }));
    else delete copy.checks;
    return copy;
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({version:2,state})); } catch { toast('浏览器本地存储不可用，本次状态只保留在当前页面。'); } }

  const iconPaths = {
    shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    spark:'<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z"/>',
    arrow:'<path d="M5 12h14m-7-7 7 7-7 7"/>',
    send:'<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
    close:'<path d="m18 6-12 12M6 6l12 12"/>',
    coins:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    receipt:'<path d="M4 3h16v18l-3-2-3 2-4-2-3 2-3-2V3Z"/><path d="M8 8h8M8 12h8M8 16h4"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
    store:'<path d="M3 10h18l-2-6H5l-2 6Z"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"/>',
    ban:'<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>'
  };
  const icon = (name, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.spark}</svg>`;

  function render() {
    $('#app').innerHTML = `<header class="app-header">
      <div class="brand"><div class="brand-mark">${icon('shield',19)}</div><span class="brand-title">Agent<span>Guard</span></span><i class="brand-sep">·</i><span class="product-title">AI 采购助手</span></div>
      <div class="header-actions"><button class="model-state ${harness.connected?'connected':harness.error?'error':''}" data-action="retry-health" title="${esc(harness.error||'点击重新检查本地 DSH Harness')}"><i class="status-dot"></i><span>${esc(harness.label)}</span></button><button class="header-btn new-chat" data-action="new-chat">新对话</button><button class="header-btn context-mobile" data-action="open-drawer" data-tab="overview">${icon('menu',14)} 任务与预算</button><button class="header-btn" data-action="open-drawer" data-tab="orders">详情</button></div>
    </header>
    <div class="workspace"><section class="chat-pane"><div class="chat-scroll" id="chat-scroll"><div id="chat-content"></div></div>
      <div class="composer-wrap"><form class="composer" id="composer"><textarea id="composer-input" rows="1" maxlength="4000" placeholder="描述你想完成的任务…" aria-label="发送消息"></textarea><button class="send-btn" id="send-btn" type="submit" aria-label="发送" ${chatBusy?'disabled':''}>${chatBusy?icon('close',16):icon('send',16)}</button></form><div class="composer-hint">Enter 发送 · Shift + Enter 换行 · 采购和报告交付均为模拟</div></div>
    </section>${renderContext()}</div>
    <div class="drawer-shade ${drawerOpen()?'open':''}" data-action="close-drawer"></div>${renderDrawer()}`;
    bindTextarea();
    renderChat();
    bindDrawerForm();
    updateComposer();
  }

  function renderContext() {
    const remaining = Math.max(0,state.cap-state.spent);
    const authTitle = state.revoked ? '预算实例已永久撤销' : state.authorized ? '预算授权已生效' : '预算尚未授权';
    const authNote = state.revoked ? '此实例不再接受任何采购请求。' : state.authorized ? '每次采购仍需你明确确认。' : '授权后才可进行模拟采购。';
    return `<aside class="context-panel"><div class="context-title">任务与预算<span>${icon('shield',14)}</span></div><div class="context-eyebrow">当前演示实例</div>
      <div class="budget-card"><div class="balance-row"><div><div class="balance-label">剩余预算</div><div class="balance-value">${money(remaining).split(' ')[0]} <small>MON</small></div></div><div style="text-align:right"><div class="balance-label">已花费</div><div class="balance-value" style="font-size:15px">${money(state.spent).split(' ')[0]} <small>MON</small></div></div></div>
        <div class="spent-meter"><div class="meter-label"><span>累计使用</span><span>${money(state.spent)} / ${money(state.cap)}</span></div><div class="meter-track"><div class="meter-fill" style="width:${state.cap?Math.min(100,state.spent/state.cap*100):0}%"></div></div></div>
        <div class="auth-status"><div class="auth-icon ${state.revoked?'revoked':state.authorized?'active':''}">${icon(state.revoked?'ban':state.authorized?'check':'lock',14)}</div><div class="auth-copy"><b>${authTitle}</b><span>${authNote}</span></div></div>
        <div class="context-actions">${!state.authorized&&!state.revoked?'<button class="btn primary" data-action="authorize">明确授权预算</button>':''}${state.authorized&&!state.revoked?'<button class="btn" data-action="open-drawer" data-tab="overview">查看授权与规则</button>':''}${state.revoked?'<button class="btn" data-action="verify-revoked">验证撤销后请求</button>':''}<button class="btn ghost" data-action="open-drawer" data-tab="overview">预算详情 ${icon('arrow',12)}</button></div>
      </div>
      <div class="task-card-side"><div class="task-side-head">${icon('spark',13)} 当前任务</div>${state.currentTask?`<div class="task-side-title">${esc(state.currentTask)}</div><div class="task-side-empty">${esc(state.taskId||'等待建立任务')}</div>`:'<div class="task-side-empty">发送一条消息后，这里会显示当前任务。</div>'}</div>
      <div class="simulation-label">交互演示 · 所有采购与报告均为模拟。模型连接状态只依据本地 Harness 健康检查显示。${!harness.connected?`<details class="connection-details"><summary>连接详情</summary><p>${esc(harness.error||harness.label)}</p><button class="details-link" data-action="retry-health">重试连接</button></details>`:''}</div>
    </aside>`;
  }

  function drawerOpen() { return document.body.dataset.drawer === 'open'; }
  function renderDrawer() {
    if (!drawerOpen()) return '';
    return `<aside class="drawer open" aria-label="任务与预算详情"><div class="drawer-head"><div><h2>${drawerOrderId?'订单详情':'任务与预算'}</h2><p>交易与报告状态均为本地演示数据。</p></div><button class="icon-btn" data-action="close-drawer" aria-label="关闭详情">${icon('close',15)}</button></div>
      ${drawerOrderId?'':`<nav class="drawer-nav"><button data-action="drawer-tab" data-tab="overview" class="${drawerTab==='overview'?'active':''}">概览</button><button data-action="drawer-tab" data-tab="rules" class="${drawerTab==='rules'?'active':''}">预算规则</button><button data-action="drawer-tab" data-tab="orders" class="${drawerTab==='orders'?'active':''}">订单与记录</button><button data-action="drawer-tab" data-tab="tools" class="${drawerTab==='tools'?'active':''}">演示工具</button></nav>`}
      <div class="drawer-body">${drawerOrderId?renderOrderDetail():renderDrawerTab()}</div>
    </aside>`;
  }
  function renderDrawerTab() {
    if (drawerTab==='rules') return renderRules();
    if (drawerTab==='orders') return renderOrders();
    if (drawerTab==='tools') return renderTools();
    return renderOverview();
  }
  function renderOverview() {
    const rem=Math.max(0,state.cap-state.spent);
    return `<section class="drawer-section"><div class="drawer-section-title"><h3>预算使用情况</h3><small>${state.revoked?'永久撤销':state.authorized?'已授权':'未授权'}</small></div><div class="drawer-order-detail"><div class="kv-list"><div class="kv-row"><span>模拟余额</span><b>${money(state.balance)}</b></div><div class="kv-row"><span>累计授权上限</span><b>${money(state.cap)}</b></div><div class="kv-row"><span>单笔上限</span><b>${money(state.single)}</b></div><div class="kv-row"><span>已支付</span><b>${money(state.spent)}</b></div><div class="kv-row"><span>剩余累计授权</span><b>${money(rem)}</b></div><div class="kv-row"><span>固定收款方</span><b>DataLens</b></div></div></div></section>
      <section class="drawer-section"><div class="drawer-section-title"><h3>当前任务</h3><small>${esc(state.taskId||'未建立')}</small></div><div class="drawer-note">${state.currentTask?esc(state.currentTask):'尚未收到任务描述。'}</div></section>
      <section class="drawer-section"><div class="drawer-section-title"><h3>授权操作</h3></div>${state.revoked?'<div class="drawer-note">当前预算实例已永久撤销。已完成的采购与报告仍可查看。</div>':state.authorized?`<div class="drawer-note">预算授权已生效。每次固定报价采购仍要你在聊天中明确确认。</div><button class="btn danger" style="margin-top:10px;width:100%" data-action="revoke">永久撤销当前实例</button>`:`<div class="drawer-note">授权前不会发起任何采购。预算授权不会扣款；采购仍需独立确认。</div><button class="btn primary" style="margin-top:10px;width:100%" data-action="authorize">明确授权预算</button>`}</section>
      <section class="drawer-section"><button class="details-link" data-action="drawer-tab" data-tab="rules">查看和编辑详细规则 ${icon('arrow',12)}</button></section>`;
  }
  function renderRules() {
    return `<section class="drawer-section"><div class="drawer-section-title"><h3>当前预算规则</h3><small>金额精度 0.001 MON</small></div><div class="drawer-note">余额 ${money(state.balance)} 与累计授权 ${money(state.cap)} 分开管理。修改规则不会清零已支付金额。</div></section><form id="rules-form"><label class="form-field"><span>累计预算上限（MON）</span><input type="number" name="cap" min="0.001" max="50" step="0.001" value="${(state.cap/1000).toFixed(3)}" required ${state.revoked?'disabled':''}><small>不得低于已支付金额；撤销实例后无法修改。</small></label><label class="form-field"><span>单笔上限（MON）</span><input type="number" name="single" min="0.010" max="50" step="0.001" value="${(state.single/1000).toFixed(3)}" required ${state.revoked?'disabled':''}><small>唯一固定报告报价为 ${money(PRICE)}。</small></label><div class="form-error">${esc(rulesError)}</div><button class="btn primary" type="submit" ${state.revoked?'disabled':''}>保存规则</button></form>`;
  }
  function renderOrders() {
    if (!state.orders.length) return `<div class="drawer-note">还没有订单。对话中查看固定报告方案并完成授权后，订单会显示在这里。</div>`;
    return `<section class="drawer-section"><div class="drawer-section-title"><h3>采购与报告</h3><small>${state.orders.length} 条记录</small></div><div class="drawer-order-list">${state.orders.map(o=>`<div class="drawer-order"><div class="drawer-order-icon">${icon(o.payment==='paid'?'receipt':'ban',14)}</div><div class="drawer-order-main"><b>${money(o.amount)} · ${o.payment==='paid'?'已模拟付款':'已拦截'}</b><span>${esc(o.id)} · ${o.payment==='paid'?reportLabel(o.report):'未扣款'}</span></div><button data-action="order-detail" data-id="${esc(o.id)}">查看</button></div>`).join('')}</div></section>`;
  }
  function renderTools() {
    return `<section class="drawer-section"><div class="drawer-section-title"><h3>异常与保护演示</h3><small>仅本地模拟</small></div><div class="drawer-tool"><h4>测试超额请求</h4><p>请求 0.020 MON，偏离固定报价且高于默认单笔上限。</p><button class="btn small" data-action="demo-excess">模拟拦截</button></div><div class="drawer-tool"><h4>验证撤销后请求</h4><p>当前实例撤销后，使用正常固定报价再尝试一次，查看授权检查如何拦截。</p><button class="btn small" data-action="verify-revoked" ${state.revoked?'':'disabled'}>发起验证</button></div><div class="drawer-tool"><h4>重置演示状态</h4><p>重置会清除本浏览器保存的订单、报告和预算演示状态。</p><button class="btn danger small" data-action="reset-demo">重置演示</button></div></section>`;
  }
  function renderOrderDetail() {
    const o=state.orders.find(x=>x.id===drawerOrderId); if(!o){drawerOrderId='';drawerTab='orders';return renderOrders();}
    const checks=Array.isArray(o.checks)&&o.checks.length?`<div class="check-list">${o.checks.map(c=>`<div class="check-row ${c.pass?'':'fail'}">${icon(c.pass?'check':'close',14)}<span>${esc(c.label)}</span></div>`).join('')}</div>`:'<div class="drawer-note">该记录来自早期演示，未保存检查明细。</div>';
    const report=o.payment==='paid'&&o.report==='delivered'?`<div class="report-box"><h4>本月销售分析（预设模拟数据）</h4>销量较上月下降 18%。访客量变化较小，模拟分析将主要影响归因于转化率回落。此结论不对应真实业务数据。建议按渠道对比转化率、库存与促销触达。</div>`:'';
    const actions=o.payment!=='paid'?'':o.report==='pending'?`<div class="result-actions"><button class="btn primary small" data-action="deliver-report" data-id="${esc(o.id)}">模拟交付报告</button><button class="btn small" data-action="fail-report" data-id="${esc(o.id)}">模拟交付失败</button></div>`:o.report==='failed'?`<div class="result-actions"><button class="btn primary small" data-action="retry-report" data-id="${esc(o.id)}">${icon('refresh',12)} 重试原订单交付</button></div>`:'';
    return `<button class="details-link" data-action="back-orders">${icon('arrow',12)} 返回订单列表</button><div class="drawer-order-detail" style="margin-top:12px"><h3>${o.payment==='paid'?'已模拟付款':'请求已拦截'}</h3><p>${esc(o.id)} · ${esc(o.time||'')}</p><div class="kv-list"><div class="kv-row"><span>任务</span><b>${esc(o.taskId||'未关联')}</b></div><div class="kv-row"><span>服务商</span><b>DataLens</b></div><div class="kv-row"><span>金额</span><b>${money(o.amount)}</b></div><div class="kv-row"><span>付款状态</span><b>${o.payment==='paid'?'已模拟付款':'已拦截 · 未扣款'}</b></div><div class="kv-row"><span>报告状态</span><b>${o.payment==='paid'?reportLabel(o.report):'未生成'}</b></div>${o.credential?`<div class="kv-row"><span>模拟凭证</span><b>${esc(o.credential)}</b></div>`:''}</div></div><section class="drawer-section"><div class="drawer-section-title"><h3>当时的规则检查</h3></div>${checks}</section>${report}${actions}`;
  }
  function reportLabel(s) { return s==='delivered'?'已交付':s==='failed'?'交付失败':'待交付'; }

  function renderChat() {
    const host=$('#chat-content'); if(!host)return;
    if(!state.messages.length){
      const connectionFailed=!harness.connected&&(Boolean(harness.error)||harness.label!=='检测本地模型中');
      host.innerHTML=`<section class="welcome"><div class="welcome-logo">${icon('spark',25)}</div><h1>这次想让 AI 帮你完成什么？</h1><p>告诉我你的目标，我会先给出服务方案。你确认并授权预算后，再执行采购。</p><div class="example-list"><button class="example-chip" data-action="example" data-text="分析销售数据，解释本月销量下降原因，生成报告">分析本月销量下降原因</button><button class="example-chip" data-action="example" data-text="帮我整理最近一个月销售表现，并生成一份简明分析报告">整理月度销售表现</button></div><div class="message-action"><button class="btn small" data-action="show-demo-offer">${icon('file',13)} 查看报告服务方案</button></div><div class="demo-note">交互演示 · 所有采购与报告均为模拟。${connectionFailed?`AI 暂时连接不上，可以 <button class="details-link" data-action="retry-health">重试连接</button> 或先查看服务方案。`:harness.connected?'模型连接状态依据本地 DSH Harness 健康检查显示。':'正在检查本地模型连接。'}</div></section>`;
      return;
    }
    host.innerHTML=`<div class="messages">${state.messages.map(renderMessage).join('')}</div>`;
    const sc=$('#chat-scroll'); requestAnimationFrame(()=>{if(sc)sc.scrollTop=sc.scrollHeight;});
  }
  function renderMessage(m) {
    if(m.role==='user') return `<article class="message user"><div class="message-content">${safeText(m.content||'')}</div></article>`;
    const content=m.status==='loading'?'<span class="loading-dots">正在连接本地模型…</span>':safeText(m.content||'');
    const source=m.source?`<div class="message-meta">来源：${esc(m.source)}</div>`:'';
    let extra='';
    if(m.type==='assistant'&&m.status==='ready'&&m.offerAvailable) extra=`<div class="message-action"><button class="btn small" data-action="show-offer" data-message="${esc(m.id)}">${icon('file',13)} 查看首版固定报告方案</button></div>`;
    if(m.status==='error') extra=`<div class="result-card"><div class="result-head"><i class="status-dot" style="background:#c67968"></i>本地模型请求失败</div><p>${esc(m.error||'无法连接 DSH Harness。')}</p><div class="result-actions"><button class="btn small" data-action="retry-chat" data-id="${esc(m.id)}">${icon('refresh',12)} 重试</button></div></div>`;
    if(m.status==='cancelled') extra=`<div class="result-card"><div class="result-head">本次请求已取消</div><p>${esc(m.error||'没有收到模型回复。')}</p><div class="result-actions"><button class="btn small" data-action="retry-chat" data-id="${esc(m.id)}">${icon('refresh',12)} 重新发送</button></div></div>`;
    if(m.type==='offer') extra=renderOffer(m);
    if(m.type==='attempt') extra=renderAttempt(m);
    if(m.type==='purchase-result') extra=renderPurchaseResult(m);
    return `<article class="message"><div class="assistant-avatar">${icon(m.type==='offer'?'file':'spark',15)}</div><div class="message-body"><div class="speaker">${m.type==='offer'&&m.demo?'固定方案预览 · 产品信息':'AgentGuard'}</div>${m.type==='offer'?'':`<div class="message-text">${content}</div>${source}`}${extra}</div></article>`;
  }
  function renderOffer(m) {
    const paidOrder=m.paidOrderId&&state.orders.find(o=>o.id===m.paidOrderId&&o.payment==='paid');
    const action=paidOrder?`<button class="btn small" data-action="open-order" data-id="${esc(paidOrder.id)}">查看本次订单</button>`:state.revoked?'<button class="btn small" data-action="open-drawer" data-tab="overview">预算实例已撤销</button>':!state.authorized?`<button class="btn primary small" data-action="authorize">明确授权预算</button>`:`<button class="btn primary small" data-action="purchase" data-id="${esc(m.id)}">确认购买 · 0.010 MON（模拟）</button>`;
    return `<article class="offer-card"><div class="offer-top"><div class="offer-icon">${icon('file',19)}</div><div class="offer-copy"><div class="offer-kicker">首版唯一固定服务方案 · 当前只接 DataLens 固定报告</div><div class="offer-title">DataLens · 销售分析报告</div><p>用于分析销售变化与可能原因，交付一份简明报告。</p></div><div class="offer-price">0.010 <small>MON</small></div></div><div class="offer-details"><div class="offer-detail">${icon('check',13)}固定收款方：DataLens</div><div class="offer-detail">${icon('check',13)}交付内容：本地预设的月度销售分析演示报告</div><div class="offer-detail">${icon('info',13)}报价固定，AI 不能更改；不发送真实业务数据</div></div><div class="offer-footer"><span class="fixed-service">所有服务和交易均为模拟</span>${action}</div></article>`;
  }
  function renderAttempt(m) {
    return `<article class="check-card"><div class="result-head"><i class="status-dot" style="background:#c67968"></i>请求已拦截 · 未扣款</div><p>${esc(m.summary||'当前规则阻止了这笔请求。')}</p><div class="result-actions"><button class="btn small" data-action="open-order" data-id="${esc(m.orderId||'')}">查看订单</button></div></article>`;
  }
  function renderPurchaseResult(m) {
    const o=state.orders.find(x=>x.id===m.orderId); if(!o)return '';
    if(o.payment==='blocked') return '';
    const pending=o.report==='pending';
    const delivered=o.report==='delivered';
    const title=delivered?'规则检查通过 · 已模拟支付 0.010 MON，报告已交付':pending?'规则检查通过 · 已模拟支付 0.010 MON，报告待交付':'规则检查通过 · 已模拟支付 0.010 MON，报告交付失败';
    return `<article class="result-card"><div class="result-head"><i class="status-dot"></i>${title}</div><p>订单 ${esc(o.id)} · DataLens${o.credential?` · 模拟凭证 ${esc(o.credential)}`:''}</p>${pending?`<div class="result-actions"><button class="btn primary small" data-action="deliver-report" data-id="${esc(o.id)}">模拟交付报告</button><button class="btn small" data-action="open-order" data-id="${esc(o.id)}">查看订单与检查</button></div>`:delivered?`<div class="result-actions"><button class="btn small" data-action="open-order" data-id="${esc(o.id)}">查看报告与订单</button></div>`:`<p>交付失败可在订单详情中重试，重试不会重复扣款。</p><div class="result-actions"><button class="btn small" data-action="open-order" data-id="${esc(o.id)}">查看订单与重试</button></div>`}</article>`;
  }

  async function checkHarness() {
    try {
      const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),5000);
      const res=await fetch('/api/health',{method:'GET',headers:{Accept:'application/json'},signal:ctl.signal}); clearTimeout(timer);
      const data=await res.json().catch(()=>({}));
      const h=data?.harness;
      if(!res.ok) throw new Error(data?.error||`健康检查失败（HTTP ${res.status}）`);
      harness={connected:Boolean(h?.connected),label:h?.connected?(h.label||'本地模型已连接'):(h?.label||'本地模型未连接'),error:h?.connected?'':String(h?.reason||data?.error||'')};
    } catch(e) { harness={connected:false,label:'本地模型未连接',error:e.name==='AbortError'?'健康检查超时，请重试。':e.message||'无法读取本地 DSH Harness 状态，请重试。'}; }
    render();
  }
  function chatHistory() {
    return state.messages.filter(m=>m.role==='user'||(m.role==='assistant'&&m.type==='assistant'&&m.status==='ready'))
      .filter(m=>typeof m.content==='string')
      .map(m=>({role:m.role,content:m.content}));
  }
  async function sendChat(text, retryId='') {
    if(chatBusy) return;
    const input=$('#composer-input');
    if(!retryId) {
      const value=(text??input?.value??'').trim(); if(!value)return;
      const userMsg={id:makeId('MSG'),role:'user',type:'text',content:value};
      state.messages.push(userMsg);
      if(!state.taskId){state.currentTask=value.slice(0,400);state.taskId=makeId('TASK');}
      state.messages.push({id:makeId('MSG'),role:'assistant',type:'assistant',status:'loading',replyTo:userMsg.id,taskId:state.taskId,content:''});
    } else {
      const reply=state.messages.find(m=>m.id===retryId); if(!reply)return;
      reply.status='loading'; reply.error=''; reply.content='';
    }
    save(); chatBusy=true; render();
    const replyMsg=retryId?state.messages.find(m=>m.id===retryId):state.messages[state.messages.length-1];
    chatController=new AbortController();
    try {
      const messages=chatHistory();
      const context={
        balanceMilliMon:state.balance, cumulativeLimitMilliMon:state.cap,
        perPurchaseLimitMilliMon:state.single, spentMilliMon:state.spent,
        remainingMilliMon:Math.max(0,state.cap-state.spent), budgetAuthorized:state.authorized,
        authorizationRevoked:state.revoked, currentTask:state.currentTask.slice(0,400)
      };
      const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({messages,context}),signal:chatController.signal});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload?.error||`本地模型请求失败（HTTP ${response.status}）`);
      if(typeof payload?.reply!=='string'||!payload.reply.trim())throw new Error('本地模型没有返回可显示的回复。');
      replyMsg.status='ready'; replyMsg.content=payload.reply; replyMsg.source=payload.source==='dsh-harness'?'本地 DSH Harness':String(payload.source||'本地模型'); replyMsg.offerAvailable=true;
    } catch(e) {
      if(e.name==='AbortError'){replyMsg.status='cancelled';replyMsg.error='你已取消本次本地模型请求。';}
      else {replyMsg.status='error';replyMsg.error=e.message||'无法连接本地 DSH Harness。';}
    } finally { chatBusy=false; chatController=null; save(); render(); }
  }
  function cancelChat() { if(!chatController)return; chatController.abort(); }

  function showOffer(messageId) {
    const task=state.messages.find(m=>m.id===messageId&&m.role==='assistant'&&m.type==='assistant'&&m.offerAvailable);
    if(!task)return;
    if(state.messages.some(m=>m.type==='offer'&&m.forMessage===task.id))return toast('这轮固定方案已显示在对话中。');
    state.messages.push({id:makeId('MSG'),role:'assistant',type:'offer',forMessage:task.id,taskId:task.taskId,content:''});save();render();
  }
  function showDemoOffer(){
    if(!state.currentTask){state.currentTask='分析销售数据，解释本月销量下降原因，生成报告';state.taskId=makeId('TASK');}
    state.messages.push({id:makeId('MSG'),role:'assistant',type:'offer',demo:true,taskId:state.taskId,content:''});save();render();
  }
  function requestAuthorization() {
    if(state.revoked)return toast('当前预算实例已永久撤销。');
    if(state.authorized)return toast('预算授权已经生效。');
    const summary=`<div class="receipt-summary"><div class="receipt-row"><span>累计预算上限</span><b>${money(state.cap)}</b></div><div class="receipt-row"><span>单笔支付上限</span><b>${money(state.single)}</b></div><div class="receipt-row"><span>固定收款方</span><b>DataLens</b></div><div class="receipt-row"><span>固定报告报价</span><b>${money(PRICE)}</b></div><div class="receipt-row"><span>模拟余额</span><b>${money(state.balance)}</b></div></div><div class="drawer-note" style="margin-top:15px">授权本身不扣款。授权后，每笔采购仍需你点击「确认购买」，并通过规则检查。所有资金状态只保存在此浏览器的模拟实例中。</div>`;
    showDialog('授权本次预算','确认后，这个模拟预算实例可按以上规则采购固定报告。',summary,'<button class="btn" data-action="close-dialog">取消</button><button class="btn primary" data-action="confirm-authorization">确认授权预算</button>');
  }
  function authorize() {
    if(state.revoked||state.authorized)return;
    state.authorized=true; save(); closeDialog(); render(); toast('预算授权已明确生效；每次采购仍需单独确认。');
  }
  function checksFor(amount) {
    return [
      {label:state.revoked?'当前预算实例已永久撤销':'当前预算实例授权有效',pass:!state.revoked},
      {label:state.authorized?'预算已由用户明确授权':'尚未授权预算',pass:state.authorized},
      {label:`请求金额 ${money(amount)} 与固定报价 ${money(PRICE)} 一致`,pass:amount===PRICE},
      {label:`单笔上限 ${money(state.single)} 覆盖本次金额`,pass:amount<=state.single},
      {label:`本次累计 ${money(state.spent+amount)} 不超过授权 ${money(state.cap)}`,pass:state.spent+amount<=state.cap},
      {label:`模拟余额 ${money(state.balance)} 足够`,pass:state.balance>=amount},
      {label:'收款方为唯一固定服务商 DataLens',pass:true}
    ];
  }
  function createBlockedOrder(amount, checks, kind='blocked') {
    const order={id:makeId('AG'),amount,time:new Date().toLocaleString('zh-CN',{hour12:false}),payment:'blocked',report:'none',taskId:state.taskId,kind,checks:checks.map(c=>({label:String(c.label),pass:Boolean(c.pass)}))};
    state.blocked++; state.orders.unshift(order); return order;
  }
  function purchase(offerId) {
    if(actionBusy)return;
    const offer=state.messages.find(m=>m.id===offerId&&m.type==='offer'); if(!offer)return;
    // An offer represents one explicit purchase opportunity. Replaying its button
    // after payment opens the original order instead of creating another charge.
    const existing=state.orders.find(o=>o.id===offer.paidOrderId&&o.payment==='paid')
      ||state.orders.find(o=>o.offerId===offer.id&&o.payment==='paid');
    if(existing){offer.paidOrderId=existing.id;save();openDrawer('orders');drawerOrderId=existing.id;render();return;}
    if(state.revoked)return toast('此预算实例已永久撤销，不能购买。');
    if(!state.authorized){requestAuthorization();return;}
    const checks=checksFor(PRICE);
    if(!checks.every(c=>c.pass)) {
      const order=createBlockedOrder(PRICE,checks,'purchase');
      order.offerId=offer.id;
      const reasons=checks.filter(c=>!c.pass).map(c=>c.label).join('；');
      state.messages.push({id:makeId('MSG'),role:'assistant',type:'attempt',orderId:order.id,checks:order.checks,summary:`本次固定报告采购未通过规则检查：${reasons}。余额没有变化。`});
      save();render();return;
    }
    // This button is the user's explicit purchase confirmation. Checks run here before any balance changes.
    actionBusy=true;render();
    const offerTask=state.messages.find(m=>m.id===offerId);
    const order={id:makeId('AG'),amount:PRICE,time:new Date().toLocaleString('zh-CN',{hour12:false}),payment:'paid',report:'pending',taskId:offerTask?.taskId||state.taskId,offerId:offer.id,credential:makeId('SIM'),checks:checks.map(c=>({label:String(c.label),pass:Boolean(c.pass)})),kind:'purchase'};
    state.balance-=PRICE; state.spent+=PRICE; state.orders.unshift(order); offer.paidOrderId=order.id;
    state.messages.push({id:makeId('MSG'),role:'assistant',type:'purchase-result',orderId:order.id,content:''});
    save();actionBusy=false;render();
  }
  function deliverReport(orderId, mode='deliver') {
    if(actionBusy)return;
    const o=state.orders.find(x=>x.id===orderId); if(!o||o.payment!=='paid'||o.report==='delivered')return;
    if(mode==='fail'){o.report='failed';save();render();toast('报告交付失败已记录，付款未重复发生。');return;}
    actionBusy=true; render();
    setTimeout(()=>{o.report='delivered';actionBusy=false;save();render();toast(mode==='retry'?'原订单报告已重试交付，没有重复扣款。':'模拟报告已交付。');},300);
  }

  function demoExcess() {
    const checks=checksFor(20); const order=createBlockedOrder(20,checks,'excess');
    save();drawerOrderId=order.id;drawerTab='orders';render();toast('0.020 MON 请求已拦截，未扣款。');
  }
  function verifyRevoked() {
    if(!state.revoked)return toast('请先永久撤销当前预算实例。');
    const checks=checksFor(PRICE); const order=createBlockedOrder(PRICE,checks,'revoked-check');
    save(); drawerOrderId=order.id;drawerTab='orders';openDrawer();render();
  }
  function requestRevoke() {
    if(state.revoked)return toast('当前预算实例已经永久撤销。');
    if(state.single<PRICE){showDialog('先提高单笔上限',`撤销前检查要求单笔上限至少为 ${money(PRICE)}。`,'<div class="drawer-note">请在预算规则中先调整单笔上限。该修改不会清零已支付金额。</div>','<button class="btn" data-action="close-dialog">关闭</button><button class="btn primary" data-action="goto-rules">编辑预算规则</button>');return;}
    if(state.balance<PRICE){showDialog('模拟余额不足','撤销演示需要先保证余额足以完成一笔固定报价检查。',`<div class="receipt-summary"><div class="receipt-row"><span>当前余额</span><b>${money(state.balance)}</b></div><div class="receipt-row"><span>所需余额</span><b>${money(PRICE)}</b></div></div>`,'<button class="btn" data-action="close-dialog">关闭</button>');return;}
    const needed=state.spent+PRICE;
    if(state.cap<needed){
      showDialog('先提高累计授权上限','撤销演示前先确保额度充足，不能把额度不足冒充撤销。',`<div class="receipt-summary"><div class="receipt-row"><span>已支付</span><b>${money(state.spent)}</b></div><div class="receipt-row"><span>当前累计上限</span><b>${money(state.cap)}</b></div><div class="receipt-row"><span>需要的累计上限</span><b>${money(needed)}</b></div></div><div class="drawer-note" style="margin-top:14px">确认调整只会增加模拟授权上限，已支付金额不变。完成后还要再单独确认永久撤销。</div>`,'<button class="btn" data-action="close-dialog">取消</button><button class="btn primary" data-action="raise-cap-for-revoke">确认调整额度</button>');return;
    }
    confirmRevokeDialog();
  }
  function confirmRevokeDialog(){
    const checks=[{label:`模拟余额 ${money(state.balance)} 足以覆盖固定报价`,pass:state.balance>=PRICE},{label:`累计剩余 ${money(state.cap-state.spent)} 足以覆盖固定报价`,pass:state.cap-state.spent>=PRICE},{label:`单笔上限 ${money(state.single)} 不低于固定报价`,pass:state.single>=PRICE}];
    showDialog('永久撤销当前预算实例','这是不可逆的本地演示动作。',`<div class="dialog-checks">${checks.map(c=>`<div class="check-row ${c.pass?'':'fail'}">${icon(c.pass?'check':'close',14)}<span>${esc(c.label)}</span></div>`).join('')}</div><div class="drawer-note" style="margin-top:14px">确认后会模拟为撤销已生效，之后的正常报价请求将因授权失效被拦截。旧报告仍可查看。</div>`,'<button class="btn" data-action="close-dialog">返回</button><button class="btn danger" data-action="confirm-revoke" '+(checks.every(c=>c.pass)?'':'disabled')+'>永久撤销</button>');
  }
  function revokeNow() { if(state.revoked)return; state.revoked=true;state.authorized=false;save();closeDialog();render();toast('模拟撤销已生效：此预算实例不再允许采购。'); }
  function raiseCapForRevoke() { state.cap=Math.max(state.cap,state.spent+PRICE);rulesError='';save();closeDialog();confirmRevokeDialog(); }
  function confirmReset() {
    showDialog('重置全部演示状态','此操作会清除当前预算、订单、报告和本地聊天记录。',`<div class="receipt-summary"><div class="receipt-row"><span>当前已支付</span><b>${money(state.spent)}</b></div><div class="receipt-row"><span>当前订单</span><b>${state.orders.length} 条</b></div></div><div class="drawer-note" style="margin-top:14px">新实例会从未授权状态开始，预算 ${money(DEFAULT.cap)}，模拟余额 ${money(DEFAULT.balance)}。</div>`,'<button class="btn" data-action="close-dialog">保留当前状态</button><button class="btn danger" data-action="reset-confirm">确认重置</button>');
  }
  function resetDemo() { state=copyDefault();save();drawerTab='overview';drawerOrderId='';closeDialog();render();toast('已重置为新的未授权演示实例。'); }
  function newChat() { if(chatBusy)return toast('请先等待模型回复或取消当前请求。');state.messages=[];state.currentTask='';state.taskId='';save();render();toast('新对话已开始；预算和订单已保留。'); }

  function openDrawer(tab='overview') { if(tab)drawerTab=tab;drawerOrderId='';document.body.dataset.drawer='open';render(); }
  function closeDrawer() { document.body.dataset.drawer='';drawerOrderId='';render(); }
  function showDialog(title, subtitle, body, footer) {
    const dlg=$('#modal'); if(!dlg)return;
    dlg.innerHTML=`<div class="dialog-head"><div><h2 id="dialog-title">${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="icon-btn" data-action="close-dialog" aria-label="关闭">${icon('close',15)}</button></div><div class="dialog-body">${body}</div><div class="dialog-footer">${footer}</div>`;
    if(!dlg.open)dlg.showModal();
  }
  function closeDialog(){const dlg=$('#modal');if(dlg?.open)dlg.close();}
  function toast(message){const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500);}
  function toMilli(value){const n=Number(value);if(!Number.isFinite(n)||n<=0||n>50)return null;const m=Math.round(n*1000);return Math.abs(m/1000-n)<1e-7?m:null;}

  function bindTextarea(){const input=$('#composer-input');if(!input)return;input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,140)+'px';updateComposer();});input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#composer').requestSubmit();}});}
  function updateComposer(){const input=$('#composer-input'),btn=$('#send-btn');if(input)input.disabled=chatBusy;if(btn){btn.disabled=chatBusy?false:!input?.value.trim();btn.innerHTML=chatBusy?icon('close',16):icon('send',16);btn.setAttribute('aria-label',chatBusy?'取消当前请求':'发送');if(chatBusy){btn.type='button';btn.dataset.action='cancel-chat';}else{btn.type='submit';delete btn.dataset.action;}}}
  function bindDrawerForm(){const form=$('#rules-form');if(!form)return;form.addEventListener('submit',e=>{e.preventDefault();if(state.revoked)return;const cap=toMilli(form.elements.cap.value),single=toMilli(form.elements.single.value);if(cap===null||single===null||cap<state.spent||single<PRICE||cap<single){rulesError=`请确保累计上限不低于已支付 ${money(state.spent)}、单笔上限至少 ${money(PRICE)}，且累计上限不低于单笔上限。`;render();drawerTab='rules';openDrawer('rules');return;}state.cap=cap;state.single=single;rulesError='';save();render();toast('预算规则已更新，已支付金额保留。');});}

  document.addEventListener('submit',e=>{if(e.target?.id==='composer'){e.preventDefault();if(!chatBusy)sendChat();}});
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-action]'); if(!b)return;
    const a=b.dataset.action; if(actionBusy&&['purchase','deliver-report','retry-report'].includes(a))return;
    switch(a){
      case 'example': sendChat(b.dataset.text);break;
      case 'new-chat': newChat();break;
      case 'show-offer': showOffer(b.dataset.message);break;
      case 'authorize': requestAuthorization();break;
      case 'confirm-authorization': authorize();break;
      case 'purchase': purchase(b.dataset.id);break;
      case 'cancel-chat': cancelChat();break;
      case 'retry-chat': sendChat('',b.dataset.id);break;
      case 'retry-health': harness.label='检测本地模型中';harness.error='';render();checkHarness();break;
      case 'show-demo-offer': showDemoOffer();break;
      case 'open-drawer': openDrawer(b.dataset.tab||'overview');break;
      case 'close-drawer': closeDrawer();break;
      case 'drawer-tab': drawerOrderId='';drawerTab=b.dataset.tab;render();break;
      case 'order-detail': case 'open-order': drawerOrderId=b.dataset.id;drawerTab='orders';openDrawer('orders');drawerOrderId=b.dataset.id;render();break;
      case 'back-orders': drawerOrderId='';drawerTab='orders';render();break;
      case 'revoke': requestRevoke();break;
      case 'confirm-revoke': revokeNow();break;
      case 'raise-cap-for-revoke': raiseCapForRevoke();break;
      case 'goto-rules': closeDialog();openDrawer('rules');break;
      case 'demo-excess': demoExcess();break;
      case 'verify-revoked': verifyRevoked();break;
      case 'reset-demo': confirmReset();break;
      case 'reset-confirm': resetDemo();break;
      case 'deliver-report': deliverReport(b.dataset.id);break;
      case 'fail-report': deliverReport(b.dataset.id,'fail');break;
      case 'retry-report': deliverReport(b.dataset.id,'retry');break;
      case 'close-dialog': closeDialog();break;
    }
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if($('#modal')?.open)closeDialog();else if(drawerOpen())closeDrawer();}});
  $('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeDialog();});

  render();
  checkHarness();
})();
