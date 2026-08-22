// eslint.config.mjs — a single guard: `no-undef`. It catches the class of bug `npm run build`
// cannot (a hook or helper used without being imported: the page compiles, then throws at
// runtime on that code path). Run with `npm run lint` (uses npx; nothing is installed).
// If eslint is ever added to devDependencies, `next build` will pick this config up too.
import reactHooks from 'eslint-plugin-react-hooks';

export default [{
  ignores: ['.next/**', 'node_modules/**'],
}, {
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 2024, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } },
    globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly', fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', Blob: 'readonly', FileReader: 'readonly', CustomEvent: 'readonly', Event: 'readonly', requestAnimationFrame: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', console: 'readonly', process: 'readonly', Buffer: 'readonly', performance: 'readonly', ResizeObserver: 'readonly', IntersectionObserver: 'readonly', MediaRecorder: 'readonly', VideoEncoder: 'readonly', VideoFrame: 'readonly', createImageBitmap: 'readonly', alert: 'readonly', confirm: 'readonly', Intl: 'readonly', TextEncoder: 'readonly', HTMLElement: 'readonly', crypto: 'readonly', globalThis: 'readonly', Promise: 'readonly', Map: 'readonly', Set: 'readonly', JSON: 'readonly', Math: 'readonly', Number: 'readonly', String: 'readonly', Array: 'readonly', Object: 'readonly', Date: 'readonly', Error: 'readonly', RegExp: 'readonly', Boolean: 'readonly', parseInt: 'readonly', parseFloat: 'readonly', isNaN: 'readonly', encodeURIComponent: 'readonly', decodeURIComponent: 'readonly', Uint8Array: 'readonly', Uint32Array: 'readonly', Infinity: 'readonly', NaN: 'readonly', undefined: 'readonly', Symbol: 'readonly', AbortController: 'readonly', Response: 'readonly', Request: 'readonly', Headers: 'readonly', MutationObserver: 'readonly', screen: 'readonly', location: 'readonly', history: 'readonly', matchMedia: 'readonly', scrollTo: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly', getComputedStyle: 'readonly', OffscreenCanvas: 'readonly', ImageBitmap: 'readonly', HTMLInputElement: 'readonly', HTMLSelectElement: 'readonly', WebSocket: 'readonly', React: 'readonly', cancelAnimationFrame: 'readonly', Image: 'readonly', HTMLCanvasElement: 'readonly', Audio: 'readonly', FormData: 'readonly', XMLHttpRequest: 'readonly', DOMParser: 'readonly', Node: 'readonly', Element: 'readonly', atob: 'readonly', btoa: 'readonly', structuredClone: 'readonly', queueMicrotask: 'readonly', self: 'readonly', __dirname: 'readonly', require: 'readonly', module: 'readonly' } },
  linterOptions: { reportUnusedDisableDirectives: 'off' },
  plugins: { 'react-hooks': reactHooks },
  rules: { 'no-undef': 'error', 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'off' },
}];
