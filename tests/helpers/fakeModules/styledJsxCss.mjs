// styled-jsx/css for the unit tests' loader (tests/helpers/fakeStackHook.mjs), which compiles a
// component's JSX without styled-jsx: a <style jsx> there renders as a plain <style> with its text.
// The real module only throws (the build compiles every css tag away), so here each tag gives back
// the style's text, which the plain <style> then renders as it always has in these tests. What the
// build makes of the tags, and the name each style gets, is held by tests/styleNames.test.mjs.
const text = (strings, values) => strings.reduce((out, s, i) => out + s + (i < values.length ? String(values[i]) : ''), '');
export default function css(strings, ...values) { return text(strings, values); }
css.global = (strings, ...values) => text(strings, values);
css.resolve = (strings, ...values) => ({ className: '', styles: text(strings, values) });
export const global = css.global;
export const resolve = css.resolve;
