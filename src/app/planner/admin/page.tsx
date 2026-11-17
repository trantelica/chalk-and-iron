'use client';
import { useCallback, useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { inviteLink, inviteText, resetLink, resetText } from '@/lib/link-text';

// Admin page (spec Section 5, design Section 4). Accounts and single-use
// links only. Every action is checked again inside the database.

interface Account { id: string; display_name: string; email: string; joined: string; account_status: string; is_admin: boolean; delete_requested_at: string | null; purge_after: string | null }
interface LinkRow { id: string; purpose: string; label: string; for_name: string | null; created_at: string; expires_at: string; state: string; used_by_name: string | null }

export default function Admin() {
  const sb = browserClient();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [error, setError] = useState('');
  const [label, setLabel] = useState('');
  const [paste, setPaste] = useState('');

  const load = useCallback(async () => {
    const a = await sb.rpc('admin_list_accounts');
    if (a.error) { setError(a.error.message); return; }
    setAccounts(a.data as Account[]);
    const l = await sb.rpc('admin_list_links');
    setLinks((l.data ?? []) as LinkRow[]);
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: string, args: Record<string, unknown>, ask?: string) {
    if (ask && !confirm(ask)) return;
    setError('');
    const r = await sb.rpc(fn, args);
    if (r.error) setError(r.error.message);
    await load();
    return r.data;
  }
  async function setActive(a: Account, active: boolean) {
    if (!active && !confirm(`Deactivate ${a.display_name}? They cannot sign in and their coach connection stops. Nothing is deleted.`)) return;
    const r = await fetch('/api/admin/set-active', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: a.id, active }) }).then((x) => x.json());
    if (r.error) setError(r.error);
    await load();
  }
  async function makeInvite() {
    const data = (await act('admin_create_invite', { p_label: label })) as Array<{ code: string; expires_at: string }> | undefined;
    if (!data?.[0]) return;
    setPaste(inviteText(label, inviteLink(window.location.origin, data[0].code), new Date(data[0].expires_at)));
    setLabel('');
  }
  async function makeReset(a: Account) {
    if (!confirm(`Reset ${a.display_name}'s sign-in? Their passkeys stop working and they are signed out everywhere, straight away. They get back in only with the new link.`)) return;
    setError('');
    const r = await fetch('/api/admin/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: a.id }) })
      .then((x) => x.json()).catch(() => ({ error: 'No connection. Try again.' }));
    await load();
    if (r.error) { setError(r.error); return; }
    setPaste(resetText(a.display_name, resetLink(window.location.origin, r.code), new Date(r.expires_at)));
  }

  return (
    <main className="page wide">
      <h1>Admin</h1>
      <p className="muted">Accounts and single-use links. You cannot see anyone&apos;s training data here. The app sends nothing: copy the text and send it from your own email or messages.</p>
      {error && <div className="error">{error}</div>}

      <h2>Invite someone</h2>
      <div className="row">
        <input type="text" placeholder="Who it is for" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
        <button className="btn primary" onClick={makeInvite}>Make invite</button>
      </div>
      {paste && (
        <div className="panel">
          <div className="muted">Ready to paste. This is the only time the link is shown.</div>
          <textarea readOnly value={paste} onFocus={(e) => e.currentTarget.select()} />
          <div className="row">
            <button className="btn" onClick={() => navigator.clipboard.writeText(paste)}>Copy</button>
            <button className="btn" onClick={() => setPaste('')}>Done</button>
          </div>
        </div>
      )}

      <h2>Accounts</h2>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id}>
              <td>{a.display_name} {a.is_admin && <span className="tag on">ADMIN</span>}</td>
              <td>{a.email}</td>
              <td>{new Date(a.joined).toLocaleDateString()}</td>
              <td>{a.delete_requested_at ? `Deleting ${new Date(a.purge_after!).toLocaleDateString()}` : a.account_status}</td>
              <td className="row">
                {a.account_status === 'active'
                  ? <button className="btn" onClick={() => setActive(a, false)}>Deactivate</button>
                  : <button className="btn" onClick={() => setActive(a, true)}>Reactivate</button>}
                <button className="btn" onClick={() => makeReset(a)}>Reset sign-in</button>
                <button className="btn" onClick={() => act('admin_set_admin', { p_user: a.id, p_admin: !a.is_admin })}>{a.is_admin ? 'Remove admin' : 'Make admin'}</button>
                {a.delete_requested_at
                  ? <button className="btn" onClick={() => act('admin_undo_delete', { p_user: a.id })}>Undo delete</button>
                  : <button className="btn" onClick={() => act('admin_request_delete', { p_user: a.id }, `Delete ${a.display_name} and all their data after 14 days? You can undo it until then.`)}>Delete</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Links</h2>
      <table>
        <thead><tr><th>Kind</th><th>For</th><th>Made</th><th>State</th><th></th></tr></thead>
        <tbody>
          {links.map((l) => (
            <tr key={l.id}>
              <td>{l.purpose}</td>
              <td>{l.for_name ?? l.label}{l.used_by_name ? ` (used by ${l.used_by_name})` : ''}</td>
              <td>{new Date(l.created_at).toLocaleDateString()}</td>
              <td>{l.state}{l.state === 'waiting' ? ` until ${new Date(l.expires_at).toLocaleDateString()}` : ''}</td>
              <td>{l.state === 'waiting' && <button className="btn" onClick={() => act('admin_cancel_link', { p_invite: l.id })}>Cancel</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <a className="btn" href="/app">Back</a>
    </main>
  );
}
