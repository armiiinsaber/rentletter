// pages/landlord.js: the old dashboard URL. A permanent redirect to /dashboard, the query kept, so nothing bookmarked or emailed breaks.
export async function getServerSideProps({ resolvedUrl }) { return { redirect: { destination: `/dashboard${resolvedUrl.includes('?') ? resolvedUrl.slice(resolvedUrl.indexOf('?')) : ''}`, permanent: true } }; }
export default function LandlordRedirect() { return null; }
