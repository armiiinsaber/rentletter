// Resolves the repo's extensionless relative imports (Next resolves them; plain Node does not).
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); } catch (e) {
    if (spec.startsWith('.') || spec.startsWith('/')) { for (const ext of ['.js', '/index.js']) { try { return await next(spec + ext, ctx); } catch (e2) { /* next */ } } }
    throw e;
  }
}
