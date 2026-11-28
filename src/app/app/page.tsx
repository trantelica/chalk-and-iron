import { redirect } from 'next/navigation';
import Link from 'next/link';
import { serverClient } from '@/lib/supabase/server';
import { HomeActions } from './home-actions';
import { ProposalCards } from '@/components/proposal-cards';
import { trainingDay, addDays, mondayOf } from '@/rules/days';
import { checkInWeeks, checkInLine } from '@/rules/checkins';
import { OpenCoachLink } from '@/components/coach-guide';
import { safeCoachLink } from '@/rules/coach-intake';
import { loadToday } from '@/server/today';
import type { DayState } from '@/rules/today';

const STATE: Record<DayState, string> = { done: 'Done', missed: 'Missed', today: 'Today', upcoming: '', rest: 'Rest', off: '' };

// The phone's home screen (spec Section 5): the Today panel with today's
// workout and its Start button, pending coach proposals, the campaign week at
// a glance, and Start another workout. Today's workout comes from a day sent
// to the phone or the active campaign (src/rules/today.ts); both are made in
// the planner (Phase 3) or by the coach (Phase 4).
export default async function PhoneHome() {
  const supabase = await serverClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/signin');
  const { data: p } = await supabase
    .from('profiles')
    .select('display_name, is_admin, reset_notice_at, delete_requested_at, time_zone, coach_link')
    .maybeSingle();
  if (!p) {
    return (
      <main className="page">
        <h1>Chalk and Iron</h1>
        <div className="error">This account can&apos;t be opened right now. It may have been deactivated, or its sign-in reset. Ask your admin.</div>
        <HomeActions />
      </main>
    );
  }
  const { count } = await supabase.from('exercises').select('id', { count: 'exact', head: true });
  const timeZone = (p as { time_zone?: string }).time_zone ?? 'America/Denver';
  const date = trainingDay(new Date(), timeZone);
  // The button follows the state: Resume when a workout is running, Start otherwise (Nathan, 19 Nov).
  const [{ data: running }, today] = await Promise.all([
    supabase.from('sessions').select('workout_name').eq('status', 'active').maybeSingle(),
    loadToday(supabase, date),
  ]);
  // Weeks the coach read the weekly summary (spec Section 5, Home): marks and the count in a row.
  const { data: marks } = await supabase.from('weekly_checkins').select('week_start').gte('week_start', addDays(mondayOf(date), -7 * 60));
  const checkInStarts = (marks ?? []).map((m) => m.week_start as string);
  const checkLine = checkInLine(checkInStarts, date);
  const coachLink = safeCoachLink((p as { coach_link?: string | null }).coach_link);
  const checkWeeks = checkInWeeks(checkInStarts, date);
  const ids = today.workout?.items.map((i) => i.exerciseId) ?? [];
  const { data: named } = ids.length ? await supabase.from('exercises').select('id, name').in('id', ids) : { data: [] };
  const names = ids.map((id) => (named ?? []).find((x) => x.id === id)?.name as string | undefined).filter(Boolean) as string[];
  const dayText = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const w = today.workout;
  const c = today.campaign;
  return (
    <main className="page">
      <h1>Chalk and Iron</h1>
      {p.reset_notice_at && (
        <HomeActions
          notice={
            <>
              <div>Welcome back. Your sign-in was reset.</div>
              <div><strong>Action required: reconnect your coach.</strong></div>
              <div className="notice-detail">
                The reset disconnected ChatGPT or Claude. Open your coach app&apos;s connector settings, find Chalk and Iron, and connect it again.
              </div>
            </>
          }
        />
      )}
      {p.delete_requested_at && (
        <div className="notice">Your account is set to be deleted. <Link href="/planner/account">Cancel deletion</Link></div>
      )}
      <div className="display">Hi, {p.display_name}</div>
      {/* A card waiting for a decision sits above Today, so it cannot be missed (Nate, 21 Nov). */}
      <ProposalCards className="panel cards inbox-top" />
      <section className="panel today" aria-label="Today">
        <div className="lab">Today · {dayText}</div>
        {running ? (
          <>
            <div className="display big">{running.workout_name}</div>
            <div className="muted">In progress.</div>
            <Link className="btn primary link-btn" href="/app/workout">Resume {running.workout_name}</Link>
          </>
        ) : w ? (
          <>
            <div className="display big">{w.name}</div>
            <div className="muted">
              {w.items.length} exercise{w.items.length === 1 ? '' : 's'}{names.length ? `: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ', and more' : ''}` : ''}
            </div>
            {today.doneToday
              ? <div className="accent-text">Done today.</div>
              : <Link className="btn primary link-btn" href="/app/workout?start=today">Start {w.name}</Link>}
          </>
        ) : (
          <div className="muted">
            {c ? 'Nothing planned today: a rest day in your campaign.' : 'No workout planned for today. Planned days arrive with the planner and your coach.'}
          </div>
        )}
        {!running && <Link className={`btn link-btn ${!w || today.doneToday ? 'primary' : ''}`} href="/app/workout">Start another workout</Link>}
      </section>
      {c && (
        <section className="panel" aria-label="This week">
          <div className="lab">{c.name}{c.week ? ` · Week ${c.week} of ${c.weekCount}` : ''}</div>
          {c.lastWeek && (
            <div className="notice" role="note" aria-label="Last week of your campaign">
              <div>This is the last week of {c.name}. Ask your coach in ChatGPT or Claude for the next campaign.</div>
              <OpenCoachLink link={coachLink} />
            </div>
          )}
          <div className="week-row">
            {c.days.map((d) => (
              <div key={d.date} className={`wk-day ${d.state} ${d.isToday ? 'is-today' : ''}`}>
                <b>{d.label}</b>
                <span className="wk-name">{d.state === 'off' ? '' : d.workout ?? 'Rest'}</span>
                <span className="lab">{STATE[d.state]}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {checkInStarts.length > 0 && (
        <section className="panel" aria-label="Weekly check-ins">
          <div className="lab">Weekly check-ins</div>
          <div className="ci-weeks">
            {checkWeeks.map((w) => (
              <div key={w.weekStart} className={`ci-week ${w.marked ? 'done' : ''} ${w.isThisWeek ? 'this-week' : ''}`} aria-label={`${w.title}: ${w.isThisWeek ? 'not over yet' : w.marked ? 'checked in' : 'no check-in'}`}>
                <b>{w.title}</b>
                {w.isThisWeek ? <span>not over yet</span> : <span className="ci-mark">{w.marked ? '✓' : '–'}</span>}
              </div>
            ))}
          </div>
          <div>{checkLine}</div>
          <div className="muted">A week gets its tick when your coach reads that week&apos;s summary. Only finished weeks count.</div>
        </section>
      )}
      <section className="panel" aria-label="Inbox summary">
        <div className="lab">Inbox</div>
        <div>{today.pendingProposals ? `${today.pendingProposals} waiting for your decision, at the top of this screen.` : 'Nothing waiting.'}</div>
        <div className="muted">Days sent from the planner and your coach&apos;s cards arrive here.</div>
        <Link className="btn link-btn" href="/app/coach">Open the Coach screen</Link>
      </section>
      <div className="muted">Your library holds {count ?? 0} exercises.</div>
      <HomeActions passkeyCheck />
      <div className="row">
        <Link className="btn" href="/planner">Planner</Link>
        <Link className="btn" href="/planner/account">Account</Link>
        {p.is_admin && <Link className="btn" href="/planner/admin">Admin</Link>}
      </div>
    </main>
  );
}
