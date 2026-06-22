// /pages/demo.js
// Convenience redirect: /demo → /demo/dashboard?demo=pmc
// The public sales demo (rich review/ranked/compare experience with sample data)
// lives at /demo/dashboard. The real realtor dashboard at /landlord is now
// auth-gated (Supabase), so the demo has its own route to stay open to visitors.
export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/demo/dashboard?demo=pmc',
      permanent: false,
    },
  };
}

export default function Demo() {
  return null;
}
