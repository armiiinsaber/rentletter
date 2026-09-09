// Stands in for @anthropic-ai/sdk: the document analysis answers with fixed extracted fields.
const stack = () => { const s = globalThis.__rlStack; if (!s) throw new Error('installFakeStack was not called'); return s; };
export default class Anthropic { constructor(opts) { this.opts = opts; this.messages = { create: (body, extra) => stack().anthropic.messages.create(body, extra) }; } }
