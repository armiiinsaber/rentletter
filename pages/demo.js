// /pages/demo.js
// Convenience redirect: /demo → /demo/dashboard
// The public product demo (the real dashboard components over fake in-memory data)
// lives at /demo/dashboard. The real realtor dashboard at /landlord is now
// auth-gated (Supabase), so the demo has its own route to stay open to visitors.
export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/demo/dashboard',
      permanent: false,
    },
  };
}

export default function Demo() {
  return null;
}
