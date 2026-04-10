// ═══════════════════════════════════════════
// Inviting Events — AI Concierge Chat Widget
// Add to any page: <script src="/assets/js/chat.js"></script>
// ═══════════════════════════════════════════
(function(){
const API = 'https://ie-api.fancy-brook-a8e8.workers.dev/api/chat';
let history = [];
let isOpen = false;

// Inject CSS
const style = document.createElement('style');
style.textContent = `
.ie-chat-fab{position:fixed;bottom:28px;right:28px;width:52px;height:52px;border-radius:50%;background:#611f1d;border:1px solid rgba(255,255,240,0.12);color:#fffff0;cursor:pointer;z-index:998;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(97,31,29,0.4);transition:all 0.3s}
.ie-chat-fab:hover{background:#7a2522;transform:scale(1.06)}
.ie-chat-fab:active{transform:scale(0.95)}
.ie-chat-fab svg{width:24px;height:24px;transition:transform 0.3s}
.ie-chat-fab.open svg{transform:rotate(90deg)}
@media(max-width:480px){.ie-chat-fab{bottom:24px;right:20px;width:48px;height:48px}.ie-chat-fab svg{width:22px;height:22px}}

.ie-chat-overlay{position:fixed;inset:0;background:rgba(6,6,6,0.5);z-index:999;opacity:0;pointer-events:none;transition:opacity 0.3s;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.ie-chat-overlay.open{opacity:1;pointer-events:all}

.ie-chat-sheet{position:fixed;bottom:0;right:0;z-index:1000;width:100%;max-width:400px;height:70vh;max-height:600px;background:#0d0d0d;border-top:1px solid rgba(255,255,255,0.06);border-left:1px solid rgba(255,255,255,0.06);border-radius:20px 20px 0 0;display:flex;flex-direction:column;transform:translateY(calc(100% + 100px));transition:transform 0.4s cubic-bezier(0.32,0.72,0,1);overflow:hidden;visibility:hidden}
.ie-chat-sheet.open{transform:translateY(0);visibility:visible}
@media(min-width:481px){.ie-chat-sheet{right:28px;bottom:92px;border-radius:16px;border:1px solid rgba(255,255,255,0.06);max-height:520px;height:auto;min-height:400px;box-shadow:0 12px 48px rgba(0,0,0,0.5)}}
@media(max-width:480px){.ie-chat-sheet{max-width:100%;height:80vh;max-height:none}}

.ie-chat-head{padding:18px 18px 14px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:12px;flex-shrink:0}
.ie-chat-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#611f1d,#7a2522);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 20px rgba(97,31,29,0.3)}
.ie-chat-avatar img{width:20px;height:20px;filter:brightness(2)}
.ie-chat-head-info{flex:1}
.ie-chat-head-title{font-family:'Julius Sans One',sans-serif;font-size:0.5rem;letter-spacing:2px;color:rgba(255,255,240,0.4)}
.ie-chat-head-sub{font-family:'Cardo',serif;font-size:0.95rem;color:#fffff0}
.ie-chat-close{width:32px;height:32px;border-radius:50%;background:rgba(255,255,240,0.04);border:1px solid rgba(255,255,240,0.08);color:#fffff0;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ie-chat-close svg{width:14px;height:14px}

.ie-chat-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.ie-chat-msg{max-width:85%;padding:10px 14px;border-radius:12px;font-family:'Questrial',sans-serif;font-size:0.88rem;line-height:1.5;animation:ie-msg-in 0.3s ease}
@keyframes ie-msg-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.ie-chat-msg.bot{align-self:flex-start;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,240,0.85);border-bottom-left-radius:4px}
.ie-chat-msg.user{align-self:flex-end;background:#611f1d;color:#fffff0;border-bottom-right-radius:4px}
.ie-chat-msg.typing{color:rgba(255,255,240,0.3)}
.ie-chat-msg.typing span{animation:ie-dots 1.4s infinite}
.ie-chat-msg.typing span:nth-child(2){animation-delay:0.2s}
.ie-chat-msg.typing span:nth-child(3){animation-delay:0.4s}
@keyframes ie-dots{0%,80%,100%{opacity:0.3}40%{opacity:1}}

.ie-chat-input-wrap{padding:12px;border-top:1px solid rgba(255,255,255,0.04);display:flex;gap:8px;flex-shrink:0}
.ie-chat-input{flex:1;padding:10px 14px;background:rgba(255,255,240,0.04);border:1px solid rgba(255,255,240,0.08);border-radius:24px;color:#fffff0;font-family:'Questrial',sans-serif;font-size:0.88rem;outline:none;transition:border-color 0.3s}
.ie-chat-input:focus{border-color:#611f1d}
.ie-chat-input::placeholder{color:rgba(255,255,240,0.2)}
.ie-chat-send{width:38px;height:38px;border-radius:50%;background:#611f1d;border:none;color:#fffff0;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;flex-shrink:0}
.ie-chat-send:hover{background:#7a2522}
.ie-chat-send:disabled{opacity:0.3;cursor:default}
.ie-chat-send svg{width:16px;height:16px}

.ie-chat-footer{padding:6px 12px 10px;text-align:center;font-size:0.62rem;color:rgba(255,255,240,0.15);font-family:'Questrial',sans-serif;flex-shrink:0}
`;
document.head.appendChild(style);

// Inject HTML
const container = document.createElement('div');
container.innerHTML = `
<button class="ie-chat-fab" id="ie-chat-fab" aria-label="Chat with us">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
</button>
<div class="ie-chat-overlay" id="ie-chat-overlay"></div>
<div class="ie-chat-sheet" id="ie-chat-sheet">
  <div class="ie-chat-head">
    <div class="ie-chat-avatar"><img src="https://www.theinvitingevents.com/wp-content/uploads/2024/05/Inviting-Events-favicon-2.png" alt="IE"></div>
    <div class="ie-chat-head-info">
      <div class="ie-chat-head-title">Inviting Events</div>
      <div class="ie-chat-head-sub">Concierge</div>
    </div>
    <button class="ie-chat-close" id="ie-chat-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
  </div>
  <div class="ie-chat-messages" id="ie-chat-messages">
    <div class="ie-chat-msg bot">Hi there! Ask me anything about our spaces, pricing, or availability.</div>
  </div>
  <div class="ie-chat-input-wrap">
    <input class="ie-chat-input" id="ie-chat-input" type="text" placeholder="Ask about pricing, rooms, availability..." autocomplete="off">
    <button class="ie-chat-send" id="ie-chat-send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>
  </div>
  <div class="ie-chat-footer">Powered by AI · Responses may not always be accurate</div>
</div>`;
document.body.appendChild(container);

// Don't show on admin or live portal
if (window.location.pathname.startsWith('/admin') || window.location.pathname.startsWith('/live')) {
  document.getElementById('ie-chat-fab').style.display = 'none';
  return;
}

// Elements
const fab = document.getElementById('ie-chat-fab');
const overlay = document.getElementById('ie-chat-overlay');
const sheet = document.getElementById('ie-chat-sheet');
const closeBtn = document.getElementById('ie-chat-close');
const msgContainer = document.getElementById('ie-chat-messages');
const input = document.getElementById('ie-chat-input');
const sendBtn = document.getElementById('ie-chat-send');

function open() { isOpen = true; fab.classList.add('open'); overlay.classList.add('open'); sheet.classList.add('open'); setTimeout(() => input.focus(), 400); }
function close() { isOpen = false; fab.classList.remove('open'); overlay.classList.remove('open'); sheet.classList.remove('open'); }

fab.addEventListener('click', () => isOpen ? close() : open());
overlay.addEventListener('click', close);
closeBtn.addEventListener('click', close);

function addMsg(text, role) {
  const div = document.createElement('div');
  div.className = 'ie-chat-msg ' + role;
  div.textContent = text;
  msgContainer.appendChild(div);
  msgContainer.scrollTop = msgContainer.scrollHeight;
  return div;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'ie-chat-msg bot typing';
  div.id = 'ie-typing';
  div.innerHTML = '<span>·</span><span>·</span><span>·</span>';
  msgContainer.appendChild(div);
  msgContainer.scrollTop = msgContainer.scrollHeight;
}
function hideTyping() { document.getElementById('ie-typing')?.remove(); }

async function send() {
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  sendBtn.disabled = true;

  addMsg(msg, 'user');
  history.push({ role: 'user', content: msg });
  showTyping();

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, history: history.slice(-6) })
    });
    const data = await res.json();
    hideTyping();
    addMsg(data.reply || 'I apologize, something went wrong. Please try again.', 'bot');
    history.push({ role: 'assistant', content: data.reply });
  } catch (e) {
    hideTyping();
    addMsg('I\'m having trouble connecting. Please try again or reach out at theinvitingevents.com/contact/', 'bot');
  }
  sendBtn.disabled = false;
  input.focus();
}

sendBtn.addEventListener('click', send);
input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
})();
