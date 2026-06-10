// /pages/realtors.js
// Now redirects to / since the homepage IS the realtor landing page.
// Kept as a route for any inbound links pointing to /realtors.

export async function getServerSideProps() {
  return {
    redirect: { destination: '/', permanent: false },
  };
}

export default function RealtorsRedirect() {
  return null;
}
