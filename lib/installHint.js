// lib/installHint.js  PURE. Who sees the install hint (components/dashboard/InstallHint.js), and what
// it says. The component decides after mount; this is the rule, so it can be tested without a page.
export const INSTALL_HINT_KEY = 'rl_install_hint_dismissed';
export const INSTALL_HINT_COPY = Object.freeze({
  title: 'Add Rentletter to your Home Screen.',
  body: 'Tap Share, then Add to Home Screen.',
  dismiss: 'Dismiss',
});

// Safari on an iPhone, iPod or iPad (an iPad reports a Mac with touch), not another browser or an
// app's own web view, which cannot add to the Home Screen from its share button.
export function isIosSafari(ua = '', maxTouchPoints = 0) {
  const ios = /iP(hone|od|ad)/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const safari = /Version\/[\d.]+.*Safari\//.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|YaBrowser|DuckDuckGo|FBAN|FBAV|Instagram|LinkedInApp|Line\/|Snapchat|Twitter)/.test(ua);
  return ios && safari;
}
export const showInstallHint = ({ ua, maxTouchPoints = 0, standalone = false, displayStandalone = false, dismissed = false }) =>
  isIosSafari(ua, maxTouchPoints) && !standalone && !displayStandalone && !dismissed;
