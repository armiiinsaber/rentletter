// components/LegalPage.js
// Shared shell + lightweight markdown renderer for the public legal pages (/privacy,
// /terms). Public + indexable. Renders a verbatim content string supporting: "# " H1,
// "## " H2, "- " bullets, **bold** inline, and paragraphs (one per line). On-brand,
// ~720px reading column, mobile-first. A "Draft — pending legal review" banner sits at
// the very top of every page.
import Head from 'next/head';
import Link from 'next/link';
import ChatWidget from './ChatWidget';
import { C, R } from './theme';
import { GlobalStyle, Wordmark, ScrollHeader, Icon } from './ui';

// Render inline **bold** within a line.
function inline(text) {
  return String(text).split('**').map((part, i) => (i % 2 === 1 ? <strong key={i} style={{ fontWeight: 700, color: C.ink }}>{part}</strong> : part));
}

// Parse the content string into ordered blocks.
function parseBlocks(content) {
  const blocks = [];
  let bullets = null;
  const flush = () => { if (bullets) { blocks.push({ type: 'ul', items: bullets }); bullets = null; } };
  for (const raw of String(content).split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flush(); continue; }
    if (line.startsWith('## ')) { flush(); blocks.push({ type: 'h2', text: line.slice(3) }); }
    else if (line.startsWith('# ')) { flush(); blocks.push({ type: 'h1', text: line.slice(2) }); }
    else if (line.startsWith('- ')) { if (!bullets) bullets = []; bullets.push(line.slice(2)); }
    else { flush(); blocks.push({ type: 'p', text: line.trim() }); }
  }
  flush();
  return blocks;
}

const pStyle = { fontSize: 'clamp(14.5px, 2.2vw, 16px)', color: C.inkSoft, lineHeight: 1.7, margin: '0 0 16px', overflowWrap: 'anywhere' };

export default function LegalPage({ content, metaTitle, metaDescription }) {
  const blocks = parseBlocks(content);
  return (
    <>
      <Head>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
      </Head>
      <GlobalStyle />

      <div style={{ minHeight: '100vh', background: C.paper, color: C.ink, overflowX: 'hidden' }}>
        <ScrollHeader maxWidth={880}>
          <Link href="/" aria-label="Rentletter home" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></Link>
          <Link href="/" style={{ color: C.inkSoft, fontSize: 13, fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={14} /></span> Back to home
          </Link>
        </ScrollHeader>

        <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(28px, 6vw, 56px) clamp(20px, 4vw, 40px) 72px' }}>
          {/* Draft banner — at the very top of every legal page. */}
          <div role="note" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: C.amberTint, border: `1px solid ${C.amber}`, borderLeft: `4px solid ${C.amber}`, borderRadius: R.ctrl, padding: '11px 14px', marginBottom: 28 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.paper, background: C.amber, padding: '3px 9px', borderRadius: R.pill, whiteSpace: 'nowrap' }}>Draft</span>
            <span style={{ fontSize: 13.5, color: C.ink, fontWeight: 600 }}>Pending legal review.</span>
          </div>

          {blocks.map((b, i) => {
            if (b.type === 'h1') {
              return <h1 key={i} className="rl-serif" style={{ fontSize: 'clamp(32px, 6vw, 46px)', letterSpacing: '-0.025em', lineHeight: 1.08, color: C.ink, margin: '0 0 14px' }}>{b.text}</h1>;
            }
            if (b.type === 'h2') {
              return <h2 key={i} style={{ fontSize: 'clamp(18px, 3vw, 22px)', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.3, color: C.ink, margin: '36px 0 12px' }}>{inline(b.text)}</h2>;
            }
            if (b.type === 'ul') {
              return (
                <ul key={i} style={{ margin: '0 0 16px', paddingLeft: 22, display: 'grid', gap: 8 }}>
                  {b.items.map((it, j) => <li key={j} style={{ ...pStyle, margin: 0 }}>{inline(it)}</li>)}
                </ul>
              );
            }
            return <p key={i} style={pStyle}>{inline(b.text)}</p>;
          })}
        </main>

        {/* Footer with the legal links (present wherever a footer appears). */}
        <footer style={{ borderTop: `1px solid ${C.rule}`, background: C.card, padding: 'clamp(28px, 5vw, 44px) clamp(20px, 4vw, 40px)' }}>
          <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', gap: 'clamp(14px, 3vw, 28px)', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/" style={FOOTLINK}>Home</Link>
            <Link href="/privacy" style={FOOTLINK}>Privacy Policy</Link>
            <Link href="/terms" style={FOOTLINK}>Terms of Service</Link>
            <a href="mailto:info@rentletter.ca" style={FOOTLINK}>info@rentletter.ca</a>
            <span style={{ fontSize: 12.5, color: C.inkMute, marginLeft: 'auto' }}>© {new Date().getFullYear()} 1001557180 Ontario Inc.</span>
          </div>
        </footer>
      </div>
      <ChatWidget />
    </>
  );
}

const FOOTLINK = { color: C.inkSoft, fontSize: 13, fontWeight: 500, textDecoration: 'none' };
