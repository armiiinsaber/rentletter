// components/AboutText.js  About me as it is shown, wherever it is shown: the tenant's page, the
// suggestion, the English version, a realtor's and a listing agent's view of a shared profile.
// Each line the tenant wrote is a paragraph of its own and takes its direction from its own
// first letter (lib/aboutTranslation.js aboutParagraphs): Persian, Arabic and Hebrew start from
// the right with the punctuation at the left end, and a number or a Latin word inside keeps its
// own order. A blank line the tenant left is kept as space. Nothing here changes a word.
import { aboutParagraphs } from '../lib/aboutTranslation';

export default function AboutText({ text, className, style = null, ...rest }) {
  return (
    <div {...rest} style={{ display: 'grid', minWidth: 0 }}>
      {aboutParagraphs(text).map((p, i) => (
        <p key={i} dir={p.dir} className={className} style={{ ...(style || {}), margin: 0, marginTop: i && p.gap ? '0.8em' : 0, textAlign: p.dir === 'rtl' ? 'right' : 'left', textWrap: 'wrap' }}>{p.text}</p>
      ))}
    </div>
  );
}
