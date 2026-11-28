'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import { IntakeForm, useIntake } from '@/components/coach-intake-form';
import { CoachLinkBox, ConnectedApps, ConnectionTest, useCoachLink } from '@/components/coach-connection';
import { COACH_INSTRUCTIONS } from '@/lib/coach-instructions';
import { CHECK_SETUP_REPLY } from '@/lib/coach-guide';
import { CoachGuide } from '@/components/coach-guide';

// Coach setup (spec Section 5, "Browser planner: new screens"), in order: the
// coach intake, connecting ChatGPT or Claude, the coach instructions to copy,
// checking the setup, the coach link, the connection test, "let's get started"
// and the guide to what you can ask your coach. The connected coach apps, with
// Disconnect, are at the bottom.

type Shot = { file: string | null; caption: string };
type Step = { text: string; shot?: Shot };

// Where a real screenshot goes: put the image in public/coach-setup/ and set
// `file` to its name (for example 'chatgpt-add-app.png'). Until then the page
// shows a plainly marked placeholder. No app screen is drawn or invented here.
const CHATGPT: Step[] = [
  { text: 'Open ChatGPT on the web (chatgpt.com) and sign in. Click your name at the bottom left, then Settings.' },
  { text: 'Open Apps (it may be named Connectors), then Advanced settings, and switch on Developer mode. Developer mode is what lets ChatGPT use a connector you add yourself.', shot: { file: null, caption: 'ChatGPT: Settings, Apps, Advanced settings, Developer mode switched on' } },
  { text: 'Go back to Apps and click Create (or Add). Name it Chalk and Iron, paste the connector link from above, and choose OAuth (sign-in) if it asks how it signs in. Click Create.', shot: { file: null, caption: 'ChatGPT: the new app form with the connector link pasted' } },
  { text: 'ChatGPT opens a Chalk and Iron page. Sign in with your passkey if it asks, then press Allow.', shot: { file: null, caption: 'The Chalk and Iron approval page (Allow and Deny)' } },
  { text: 'Open your coach project in ChatGPT (or make one: Projects, New project). In the project, open its instructions and paste the instructions from step 3. In a chat inside the project, add Chalk and Iron from the tools or + menu so the coach can use it.', shot: { file: null, caption: 'ChatGPT: a project with the instructions pasted and Chalk and Iron switched on' } },
];
const CLAUDE: Step[] = [
  { text: 'Open Claude on the web (claude.ai) and sign in. Click your name, then Settings, then Connectors.' },
  { text: 'Click Add custom connector. Name it Chalk and Iron, paste the connector link from above, and click Add.', shot: { file: null, caption: 'Claude: Add custom connector with the connector link pasted' } },
  { text: 'Click Connect beside Chalk and Iron. Claude opens a Chalk and Iron page. Sign in with your passkey if it asks, then press Allow.', shot: { file: null, caption: 'The Chalk and Iron approval page (Allow and Deny)' } },
  { text: 'Open your coach project in Claude (or make one: Projects, New project). Open the project\'s instructions and paste the instructions from step 3. In a chat inside the project, make sure Chalk and Iron is switched on in the tools menu.', shot: { file: null, caption: 'Claude: a project with the instructions pasted and Chalk and Iron switched on' } },
];

function Screenshot({ shot }: { shot: Shot }) {
  if (shot.file) {
    return <figure className="shot"><img src={`/coach-setup/${shot.file}`} alt={shot.caption} /><figcaption className="muted">{shot.caption}</figcaption></figure>;
  }
  return (
    <figure className="shot" aria-label="Screenshot placeholder">
      <strong>Screenshot to come</strong>
      <figcaption className="muted">{shot.caption}</figcaption>
    </figure>
  );
}

function Head({ n, title }: { n: number; title: string }) {
  return <div className="step-head"><span className="step-no" aria-hidden="true">{n}</span><h2>{title}</h2></div>;
}

export default function CoachSetup() {
  const intake = useIntake();
  const coachLink = useCoachLink();
  const [origin, setOrigin] = useState('');
  const [app, setApp] = useState<'chatgpt' | 'claude'>('chatgpt');
  useEffect(() => setOrigin(window.location.origin), []);
  const connector = `${origin}/mcp`;
  const steps = app === 'chatgpt' ? CHATGPT : CLAUDE;

  return (
    <>
      <div className="muted">
        Set up your coach in order. Your coach is your own ChatGPT or Claude project: you talk to it there, not inside Chalk and Iron. Chalk and Iron receives the coach&apos;s cards for you to accept or decline. It reads your training in Chalk and Iron and can only propose changes: nothing changes until you accept it in the app. Nothing on this page calls an AI service.
      </div>

      <section className="pbox step" aria-label="Step 1, the coach intake">
        <Head n={1} title="Tell your coach about you" />
        <IntakeForm intake={intake} />
        <div className="muted">You can change any answer later on <Link href="/planner/profile">Profile and gyms</Link>, where you also set your gym&apos;s equipment.</div>
      </section>

      <section className="pbox step" aria-label="Step 2, connect your coach app">
        <Head n={2} title="Connect ChatGPT or Claude" />
        <div className="stack">
          <div className="muted">Your connector link. You paste this into your coach app. There is no key or password to copy.</div>
          <div className="row">
            <input type="text" readOnly aria-label="Connector link" value={connector} onFocus={(e) => e.currentTarget.select()} style={{ minWidth: 280, flex: 1 }} />
            <CopyButton text={connector} label="Copy the link" />
          </div>
        </div>
        <div className="app-pick" role="group" aria-label="Which coach app">
          <button className={`btn ${app === 'chatgpt' ? 'selected' : ''}`} aria-pressed={app === 'chatgpt'} onClick={() => setApp('chatgpt')}>ChatGPT</button>
          <button className={`btn ${app === 'claude' ? 'selected' : ''}`} aria-pressed={app === 'claude'} onClick={() => setApp('claude')}>Claude</button>
        </div>
        <ol className="how-list" aria-label={`Steps for ${app === 'chatgpt' ? 'ChatGPT' : 'Claude'}`}>
          {steps.map((s, i) => (
            <li key={i}>
              <div>{s.text}</div>
              {s.shot && <Screenshot shot={s.shot} />}
            </li>
          ))}
        </ol>
        <div className="muted">The apps change their menus now and then. If a name differs a little, look for the closest one. Connecting needs a ChatGPT or Claude plan that allows your own connectors.</div>
      </section>

      <section className="pbox step" aria-label="Step 3, the coach instructions">
        <Head n={3} title="Give your coach its instructions" />
        <div className="muted">Paste this into the instructions of your coach project, once the connector is attached. It tells the coach to read your data first and to only propose changes.</div>
        <CopyButton text={COACH_INSTRUCTIONS} label="Copy the instructions" className="btn primary small-primary" />
        <textarea className="copy-box" readOnly aria-label="Coach instructions" value={COACH_INSTRUCTIONS} onFocus={(e) => e.currentTarget.select()} />
        <div className="muted">In ChatGPT, start each chat inside your coach project, so these instructions apply. If it ever answers without using Chalk and Iron, name it: type <em>@Chalk and Iron</em> in your message. Your own ChatGPT or Claude personal settings (such as custom instructions and memory) also shape your coach&apos;s tone.</div>
      </section>

      <section className="pbox step" aria-label="Step 4, check your setup">
        <Head n={4} title="Check your setup" />
        <div className="muted">In a chat inside your coach project, send this. Your coach should reply with exactly one line:</div>
        <div className="row"><strong>&ldquo;check setup&rdquo;</strong><CopyButton text="check setup" label="Copy" /></div>
        <div className="row"><code aria-label="Expected reply">{CHECK_SETUP_REPLY}</code></div>
        <div className="muted">If it replies with anything else, paste the instructions from step 3 into your coach project again, and send &ldquo;check setup&rdquo; once more.</div>
      </section>

      <section className="pbox step" aria-label="Step 5, the coach link">
        <Head n={5} title="Save your coach link" />
        <CoachLinkBox link={coachLink.link} reload={coachLink.reload} />
      </section>

      <section className="pbox step" aria-label="Step 6, the connection test">
        <Head n={6} title="Test the connection" />
        <div className="muted">Start the test, then ask your coach a question about you in your coach chat. When it reads your data, this page tells you the connection works.</div>
        <ConnectionTest />
      </section>

      <section className="pbox step" aria-label="Step 7, let's get started">
        <Head n={7} title="Let's get started" />
        <div className="muted">In your coach chat, say this. Your coach reads your answers, asks about anything you left open, and proposes a first campaign. Its proposals arrive in <Link href="/planner/proposals">Proposals</Link> and on your phone&apos;s Coach screen for you to accept or decline.</div>
        <div className="row"><strong>&ldquo;Let&apos;s get started&rdquo;</strong><CopyButton text="Let's get started" label="Copy" /></div>
      </section>

      <CoachGuide link={coachLink.link ?? null} onSetupPage />

      <h2>Connected coach apps</h2>
      <div className="pbox"><ConnectedApps /></div>
    </>
  );
}
