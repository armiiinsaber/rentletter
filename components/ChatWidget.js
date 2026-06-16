// /components/ChatWidget.js
// Floating chat bubble in bottom-right with expandable chat window.
// Used on both home page and landlord dashboard.

import { useState, useRef, useEffect } from 'react';

const COLORS = {
  paper: '#faf8f3',
  paperDeep: '#f2eee3',
  ink: '#0f0f10',
  inkSoft: '#3a3a3c',
  inkMute: '#86868b',
  rule: '#e3ddd0',
  red: '#d72027',
  redDark: '#a8161c',
  green: '#2d7d4a',
};

const INITIAL_GREETING = "Hi! I'm the Rentletter assistant. I can help with how the product works, pricing, or how to use it. What can I help with?";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: INITIAL_GREETING },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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
        body: JSON.stringify({ messages: newMessages }),
      });
      const bodyText = await r.text();
      let json = null;
      try { json = bodyText ? JSON.parse(bodyText) : null; } catch (e) {}

      if (!r.ok) {
        setError(json?.error || 'Something went wrong. Try again or email info@rentletter.ca.');
      } else if (json?.reply) {
        setMessages([...newMessages, { role: 'assistant', content: json.reply }]);
      } else {
        setError('No response. Please try again.');
      }
    } catch (e) {
      setError('Connection issue. Please try again or email info@rentletter.ca.');
      console.error('[chat] send error:', e);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating bubble button */}
      <button
        onClick={() => setOpen(!open)}
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
          fontSize: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
          transition: 'background 0.2s, transform 0.15s',
          fontWeight: 700,
        }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.94)'}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
        {open ? '×' : '?'}
      </button>

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
                AI Assistant · Beta
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                Rentletter Help
              </div>
            </div>
            <button onClick={() => setOpen(false)}
              aria-label="Close chat"
              style={{ background: 'transparent', border: 'none', color: COLORS.paper, fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1, opacity: 0.7 }}>
              ×
            </button>
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
                placeholder="Ask anything about Rentletter..."
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
              AI assistant — general info only, not legal or financial advice. For account help, email <a href="mailto:info@rentletter.ca" style={{ color: COLORS.inkSoft }}>info@rentletter.ca</a>.
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
