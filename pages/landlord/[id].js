// pages/landlord/[id].js: the old listing URL. A permanent redirect to /listing/{id}, the query kept, so nothing bookmarked or emailed breaks.
export async function getServerSideProps({ params, resolvedUrl }) { return { redirect: { destination: `/listing/${encodeURIComponent(String(params.id))}${resolvedUrl.includes('?') ? resolvedUrl.slice(resolvedUrl.indexOf('?')) : ''}`, permanent: true } }; }
export default function ListingRedirect() { return null; }
