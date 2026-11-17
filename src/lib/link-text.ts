// The ready-to-paste text an admin sends from their own email or messages.
// The app sends nothing itself (spec Section 2, Accounts).

export function inviteLink(origin: string, code: string): string {
  // The secret sits after "#", so it is never sent to the server or written
  // to its logs when the link is opened.
  return `${origin.replace(/\/+$/, '')}/register#code=${code}`;
}

export function resetLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/reset#code=${code}`;
}

export function inviteText(name: string, link: string, expires: Date): string {
  const who = name.trim() ? `Hi ${name.trim()},` : 'Hi,';
  return [
    who,
    '',
    "You're invited to Chalk and Iron, a lifting tracker where your own ChatGPT or Claude project is your coach.",
    '',
    'To join:',
    '1. On your iPhone, open this link in Safari. It works once, for you only:',
    `   ${link}`,
    '2. Type your name and email, then create a passkey with Face ID. There is no password.',
    '3. Add the app to your home screen: tap Share, then "Add to Home Screen".',
    '4. Open it from the home screen and allow notifications when it asks.',
    '5. Follow the steps in the app to connect your coach.',
    '',
    `The link stops working on ${formatDay(expires)}. If it expires, ask me for a new one.`,
  ].join('\n');
}

export function resetText(name: string, link: string, expires: Date): string {
  return [
    `Hi ${name.trim()},`,
    '',
    'Here is a link to set up your Chalk and Iron sign-in again:',
    `   ${link}`,
    '',
    'Open it on your iPhone in Safari and create a new passkey with Face ID. It works once.',
    'Opening it signs you out everywhere and disconnects your coach, so connect your coach again afterward from the app.',
    'Your training history is not touched.',
    '',
    `The link stops working on ${formatDay(expires)}.`,
  ].join('\n');
}

function formatDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
