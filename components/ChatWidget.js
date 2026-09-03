// /components/ChatWidget.js
// Floating chat bubble in bottom-right with expandable chat window.
// Used on both home page and landlord dashboard.

import { useState, useRef, useEffect } from 'react';
import { ACTIONS } from '../lib/assistantActions';
import { useAdapter } from '../lib/dashboardAdapter';
// Single token source — this file previously forked its own copy of the palette.
import { C as COLORS } from './theme';

const MARKETING_GREETING = "Hi! I'm the Rentletter assistant. I can help with how the product works, pricing, or how to use it. What can I help with?";
const DASHBOARD_GREETING = "Hi! I'm your Rentletter assistant. Ask me how anything works, or tell me what to do — “create the invite link for 88 Harbour”, “request documents from James”, “email the landlord report”, “set minimum income to $85k”. I’ll show you exactly what will happen and do it when you confirm. Which applicant to choose is always your call.";

// Per-mode copy. mode="dashboard" is the in-app realtor product-help assistant; default is the
// homepage marketing assistant (unchanged).
const MODES = {
  marketing: {
    greeting: MARKETING_GREETING,
    eyebrow: 'AI Assistant · Beta',
    title: 'Rentletter Help',
    placeholder: 'Ask anything about Rentletter...',
  },
  dashboard: {
    greeting: DASHBOARD_GREETING,
    eyebrow: 'Product help · Beta',
    title: 'How-to assistant',
    placeholder: 'Ask how to use the dashboard...',
  },
};

// embedded: rendered inside the assistant panel's Ask tab, filling its section, with no floating
// launcher and no fixed positioning. Everything else is the same chat.
export default function ChatWidget({ mode = 'marketing', embedded = false }) {
  const cfg = MODES[mode] || MODES.marketing;
  const isDashboard = mode === 'dashboard';
  const adapter = useAdapter(); // actions execute through the dashboard adapter; /api/chat stays a real call
  const [open, setOpen] = useState(embedded);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: cfg.greeting },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const launcherRef = useRef(null);
  const [launcherDim, setLauncherDim] = useState(false);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // Auto-focus input when chat opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current.focus(), 100);
    }
    if (open) setHasUnread(false);
  }, [open]);

  // Never a full-contrast blob over another control: soften the launcher when a button/link/field is
  // behind it, full opacity over neutral/empty space. Presentation only — it stays fully tappable.
  // rAF-throttled; recomputed on scroll/resize. When the chat is open it's the ink close button (full).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const btn = launcherRef.current;
    if (!btn) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      if (open) { setLauncherDim(false); return; }
      const r = btn.getBoundingClientRect();
      const pts = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + 10, r.top + 10], [r.right - 10, r.top + 10],
        [r.left + 10, r.bottom - 10], [r.right - 10, r.bottom - 10],
      ];
      let overControl = false;
      for (const [x, y] of pts) {
        const behind = document.elementsFromPoint(x, y).find((e) => e !== btn && !btn.contains(e));
        if (behind && behind.closest('button, a[href], [role="button"], input, select, textarea')) { overControl = true; break; }
      }
      setLauncherDim(overControl);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [open]);

  const sendMessage = async () => {
    const cleaned = input.trim();
    if (!cleaned || loading) return;

    setError('');
    const newMessages = [...messages, { role: 'user', content: cleaned }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Dashboard: the page publishes the realtor's OWN listings/applicants (already in their
        // browser) as context so the assistant can resolve "James" → an id. Only ids/names travel;
        // the server never executes — it proposes, and execution happens here with this session.
        body: JSON.stringify({ messages: newMessages.filter((m) => typeof m.content === 'string'), mode, context: isDashboard ? (window.__rlAssistantContext || null) : undefined }),
      });
      const bodyText = await r.text();
      let json = null;
      try { json = bodyText ? JSON.parse(bodyText) : null; } catch (e) {}

      if (!r.ok) {
        setError(json?.error || 'Something went wrong. Try again or email info@rentletter.ca.');
      } else if (json?.reply) {
        const msg = { role: 'assistant', content: json.reply };
        if (json.proposal && ACTIONS[json.proposal.action]) msg.proposal = json.proposal;
        if (json.clarify?.options?.length) msg.clarify = json.clarify;
        setMessages([...newMessages, msg]);
      } else {
        setError('No response. Please try again.');
      }
    } catch (e) {
      setError('Connection issue. Please try again or email info@rentletter.ca.');
      console.error('[chat] send error:', e);
    }
    setLoading(false);
  };

  // ── Layer 2: confirmation → execution (never without a tap) ──
  const ctxNow = () => (typeof window !== 'undefined' && window.__rlAssistantContext) || {};
  const chooseOption = (msgIndex, clarify, opt) => {
    const def = ACTIONS[clarify.action]; if (!def) return;
    const params = { ...opt.params };
    setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, clarify: null, chosen: opt.label } : m)).concat([{ role: 'assistant', content: 'Here’s what I’ll do — confirm to go ahead.', proposal: { action: clarify.action, params } }]));
  };
  const runProposal = async (msgIndex, proposal) => {
    const def = ACTIONS[proposal.action]; if (!def) return;
    setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, running: true } : m)));
    try {
      const result = await def.execute({ ...ctxNow(), adapter }, proposal.params);
      setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, running: false, done: true } : m)).concat([{ role: 'assistant', content: `✓ ${result.text}` }]));
      if (result.patch) window.dispatchEvent(new CustomEvent('rl:assistant-applied', { detail: { action: proposal.action, ...result.patch } }));
    } catch (e) {
      setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, running: false } : m)).concat([{ role: 'assistant', content: `That didn’t go through: ${e.message || 'unknown error'}. Nothing was changed.` }]));
    }
  };
  const cancelProposal = (msgIndex) => setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, proposal: null, cancelled: true } : m)));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating bubble button */}
      {!embedded && <button
        ref={launcherRef}
        onClick={() => setOpen(!open)}
        onFocus={() => setLauncherDim(false)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        style={{
          position: 'fixed',
          bottom: 'clamp(16px, 3vw, 24px)',
          right: 'clamp(16px, 3vw, 24px)',
          width: 56, height: 56,
          borderRadius: '50%',
          background: open ? COLORS.ink : COLORS.red,
          color: COLORS.paper,
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 6px 24px rgba(15, 15, 16, 0.18)',
          fontSize: 'var(--t-d3)',
          // Soften to ~0.5 when floating over a control so it's never a full-contrast blob on top of
          // another button; full opacity over neutral space (and while open / on focus). Stays tappable.
          opacity: (!open && launcherDim) ? 0.5 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
          transition: 'background 0.2s, transform 0.15s, opacity 0.2s',
          fontWeight: 700,
        }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.94)'}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
        {open ? '×' : '?'}
      </button>}

      {/* Chat window */}
      {open && (
        <div
          role="dialog"
          aria-label="Rentletter assistant"
          style={{
            position: 'fixed',
            bottom: 'clamp(80px, 12vw, 96px)',
            right: 'clamp(16px, 3vw, 24px)',
            width: 'min(380px, calc(100vw - 32px))',
            height: 'min(580px, calc(100vh - 140px))',
            background: COLORS.paper,
            boxShadow: '0 24px 64px rgba(15, 15, 16, 0.22), 0 4px 12px rgba(15, 15, 16, 0.06)',
            border: `1px solid ${COLORS.rule}`,
            borderRadius: 18,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            overflow: 'hidden',
            fontFamily: "-apple-system, 'Inter', sans-serif",
            animation: 'chatSlide 0.25s ease-out',
            ...(embedded ? { position: 'relative', bottom: 'auto', right: 'auto', width: '100%', height: '100%', flex: 1, minHeight: 0, boxShadow: 'none', border: 'none', borderRadius: 0, animation: 'none' } : {}),
          }}>
          {/* Header */}
          <div style={{
            background: COLORS.ink, color: COLORS.paper,
            padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${COLORS.ink}`,
          }}>
            <div>
              <div style={{ fontSize: 10, color: '#a4adbb', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {cfg.eyebrow}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                {cfg.title}
              </div>
            </div>
            {!embedded && <button onClick={() => setOpen(false)}
              aria-label="Close chat"
              style={{ background: 'transparent', border: 'none', color: COLORS.paper, fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1, opacity: 0.7 }}>
              ×
            </button>}
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'flex', flexDirection: 'column', gap: 10,
            background: COLORS.paper,
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  background: m.role === 'user' ? COLORS.ink : COLORS.paperDeep,
                  color: m.role === 'user' ? COLORS.paper : COLORS.ink,
                  fontSize: 14, lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                }}>
                  {m.content}
                </div>
                {/* CONFIRMATION CARD — what will happen, to whom, with what. Fires only on the button. */}
                {m.proposal && (() => {
                  const def = ACTIONS[m.proposal.action]; const d = def.describe({ ...ctxNow(), adapter }, m.proposal.params);
                  return (
                    <div style={{ width: '100%', marginTop: 8, background: COLORS.ink, color: COLORS.paper, borderRadius: 12, padding: '12px 14px', position: 'relative', overflow: 'hidden' }}>
                      <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 36, height: 3, background: COLORS.red }} />
                      <div style={{ fontSize: 10.5, color: '#ff6b70', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>{m.done ? 'Done' : 'Confirm'}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3, marginBottom: 6 }}>{d.title}</div>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 3 }}>{d.lines.map((l, k) => <li key={k} style={{ fontSize: 12.5, color: '#c8c2b3', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{l}</li>)}</ul>
                      {d.blocked && <div style={{ marginTop: 8, fontSize: 12.5, color: '#f0b9bb' }}>{d.blocked}</div>}
                      {!m.done && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <button type="button" disabled={!!m.running || !!d.blocked} onClick={() => runProposal(i, m.proposal)} style={{ background: COLORS.red, color: COLORS.paper, border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: m.running || d.blocked ? 'not-allowed' : 'pointer', opacity: d.blocked ? 0.5 : 1, minHeight: 38 }}>{m.running ? 'Working…' : d.confirm}</button>
                          <button type="button" disabled={!!m.running} onClick={() => cancelProposal(i)} style={{ background: 'transparent', color: '#c8c2b3', border: '1px solid #3a3a3e', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 38 }}>Cancel</button>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {m.cancelled && <div style={{ fontSize: 12, color: COLORS.inkMute, marginTop: 6 }}>Cancelled — nothing was done.</div>}
                {/* CLARIFY — the assistant never guesses which listing/applicant: pick one. */}
                {m.clarify && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {m.clarify.options.map((o, k) => <button key={k} type="button" onClick={() => chooseOption(i, m.clarify, o)} style={{ background: COLORS.paper, color: COLORS.ink, border: `1px solid ${COLORS.ink}`, borderRadius: 999, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 34 }}>{o.label}</button>)}
                  </div>
                )}
                {m.chosen && <div style={{ fontSize: 12, color: COLORS.inkMute, marginTop: 6 }}>You chose {m.chosen}.</div>}
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '12px 14px',
                  background: COLORS.paperDeep,
                  borderRadius: '12px 12px 12px 4px',
                  display: 'flex', gap: 5, alignItems: 'center',
                }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: COLORS.inkMute,
                      animation: `chatDot 1.2s ease-in-out ${i * 0.15}s infinite`,
                      display: 'inline-block',
                    }} />
                  ))}
                </div>
              </div>
            )}
            {error && (
              <div style={{
                padding: '10px 12px',
                background: '#fdf0ef',
                borderLeft: `3px solid ${COLORS.red}`,
                borderRadius: 8,
                fontSize: 12, color: COLORS.ink, lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: 12,
            borderTop: `1px solid ${COLORS.rule}`,
            background: COLORS.paper,
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={cfg.placeholder}
                rows={1}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  fontSize: 14,
                  border: `1px solid ${COLORS.rule}`,
                  borderRadius: 10,
                  background: COLORS.paper,
                  color: COLORS.ink,
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  maxHeight: 100,
                }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                style={{
                  background: (loading || !input.trim()) ? '#c8c2b3' : COLORS.red,
                  color: COLORS.paper,
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: (loading || !input.trim()) ? 'not-allowed' : 'pointer',
                  minHeight: 40,
                  whiteSpace: 'nowrap',
                }}>
                Send
              </button>
            </div>
            <div style={{ fontSize: 10, color: COLORS.inkMute, marginTop: 8, lineHeight: 1.45, textAlign: 'center' }}>
              {isDashboard
                ? <>Product how-to only — not tenant-selection or legal advice. Deciding who to choose is your judgment. For account help, email <a href="mailto:info@rentletter.ca" style={{ color: COLORS.inkSoft }}>info@rentletter.ca</a>.</>
                : <>AI assistant — general info only, not legal or financial advice. For account help, email <a href="mailto:info@rentletter.ca" style={{ color: COLORS.inkSoft }}>info@rentletter.ca</a>.</>}
            </div>
          </div>

          <style jsx>{`
            @keyframes chatSlide {
              from { opacity: 0; transform: translateY(12px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes chatDot {
              0%, 80%, 100% { opacity: 0.2; transform: scale(0.7); }
              40% { opacity: 1; transform: scale(1.1); }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
