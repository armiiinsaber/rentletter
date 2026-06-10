// /pages/demo.js
// Convenience redirect: /demo → /landlord?demo=pmc
// Easier URL to share in sales calls.

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/landlord?demo=pmc',
      permanent: false,
    },
  };
}

export default function Demo() {
  return null;
}
