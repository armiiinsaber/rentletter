// lib/greeting.js  PURE. The one greeting line on the dashboard, from the hour the CLIENT gives
// (components/dashboard/HomeView.js reads new Date().getHours() after mount), so the server's
// clock never decides it. greetingFor(21, 'Sam') -> "Good evening, Sam."
export const greetWordFor = (hour) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
export const greetingFor = (hour, firstName) => `${greetWordFor(Number(hour) || 0)}${firstName ? `, ${firstName}` : ''}.`;
