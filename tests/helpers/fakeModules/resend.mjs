// Stands in for resend: every send is recorded on the installed fake stack.
const stack = () => { const s = globalThis.__rlStack; if (!s) throw new Error('installFakeStack was not called'); return s; };
export class Resend { constructor(key) { this.key = key; this.emails = { send: (mail) => stack().resend.emails.send(mail) }; } }
