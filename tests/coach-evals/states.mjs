// The coach eval account's starting data, and the states each scenario needs
// (docs/SPEC.md Section 8, "Coach behaviour (evals)"; docs/TECHNICAL_DESIGN.md
// Section 9, "Coach behaviour evals").
//
// buildState(name, { starter, now }) returns the state in the shape the
// database's reset step takes (public.load_coach_eval_state). Every date is
// worked out from `now`, in the account's time zone, so "the campaign ends
// this week" or "yesterday's proposal" is true whenever a reset runs.
//
// The fixed data set: two gyms (a full home gym, and a hotel gym with
// dumbbells to 50 lb, a bench and bands), an intake filled in, eight weeks of
// history plus this week so far, an active six-week campaign (week 4 now),
// a finished one before it, past proposals (one declined yesterday with a
// reason, one declined ten days ago with none, one declined four weeks ago,
// one accepted), four weekly check-ins in a row, and some rowing.
//
// Plain JavaScript with no imports, so the reset script runs it with plain
// Node, in GitHub's runs or on a Mac, with nothing to build first.

export const TIME_ZONE = 'America/Denver';

/** Each state, the scenarios that use it, and what makes it differ from the standard one. */
export const STATES = {
  empty_profile: 'E1. A new account: the starter library only. No intake, gyms, history, campaign or proposals.',
  intake_no_campaign: 'E2. The standard account, but both campaigns have finished and nothing is planned.',
  standard: 'E3, E6, E9, E16, E17, E18, E19. The fixed data set: two gyms, an intake, eight weeks of history, an active campaign in week 4 of 6, past proposals and check-ins.',
  workout_running: 'E4. Standard, with today\'s Push A running: just started, at Barbell Bench Press, nothing logged yet.',
  workout_running_superset: 'E5. Standard, with today\'s Push A running: in the cable superset (pushdown and lateral raise), one round done.',
  declined_no_reason: 'E7. Standard, but the proposal declined with no reason was declined today, after the one with a reason.',
  campaign_last_week: 'E8, E10. Standard, but the active campaign is in its last week: it ends this Sunday.',
  two_missed: 'E11. Standard, but last week two of the three planned workouts were missed.',
  steady_all_hit: 'E12. Standard, with pace Steady, and every rep of every set hit at the last Barbell Bench Press session.',
  aggressive_misses: 'E13. Campaign in its last week, pace Aggressive, and reps missed on the main lifts for the last three weeks.',
  style_supportive: 'E14. Standard, with coach style Supportive.',
  style_challenging: 'E14. Standard, with coach style Challenging.',
  knee_injury: 'E15. Standard, with a knee injury, and Barbell Back Squat under exercises to avoid.',
};

// ------------------------------------------------------------------ dates

const pad = (n) => String(n).padStart(2, '0');
function partsIn(timeZone, at) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  return Object.fromEntries(f.formatToParts(at).map((x) => [x.type, Number(x.value)]));
}
export function addDays(date, days) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekday(date) {
  const n = new Date(date + 'T00:00:00Z').getUTCDay();
  return n === 0 ? 7 : n;
}
export const mondayOf = (date) => addDays(date, 1 - weekday(date));
/** The training day a moment belongs to: before 3:00 am counts as the day before (spec Section 10). */
export function trainingDay(at, timeZone = TIME_ZONE) {
  const p = partsIn(timeZone, at);
  const day = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return p.hour < 3 ? addDays(day, -1) : day;
}
/** A wall-clock time on a date in the time zone, as a moment. */
function at(date, hour, minute = 0, timeZone = TIME_ZONE) {
  const guess = Date.parse(`${date}T${pad(hour)}:${pad(minute)}:00Z`);
  const p = partsIn(timeZone, new Date(guess));
  const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return new Date(guess - (shown - guess));
}
const iso = (d) => d.toISOString();
const plusSeconds = (d, s) => new Date(d.getTime() + s * 1000);

// ------------------------------------------------------------------ the plan

const WORKOUTS = {
  push: {
    name: 'Push A',
    items: [
      { exercise: 'Barbell Bench Press', sets: 4, reps: 6, start: 175, step: 5 },
      { exercise: 'Barbell Overhead Press', sets: 3, reps: 8, start: 95, step: 5 },
      { exercise: 'Cable Rope Pushdown', sets: 3, reps: 12, start: 50, step: 5, superset: 'A' },
      { exercise: 'Cable Lateral Raise', sets: 3, reps: 15, start: 15, step: 2.5, superset: 'A' },
    ],
  },
  pull: {
    name: 'Pull A',
    items: [
      { exercise: 'Barbell Deadlift', sets: 3, reps: 5, start: 255, step: 10 },
      { exercise: 'Cable Lat Pulldown', sets: 3, reps: 10, start: 120, step: 5 },
      { exercise: 'Cable Seated Row', sets: 3, reps: 10, start: 110, step: 5 },
      { exercise: 'Barbell Curl', sets: 3, reps: 10, start: 55, step: 5 },
    ],
  },
  legs: {
    name: 'Legs A',
    items: [
      { exercise: 'Barbell Back Squat', sets: 4, reps: 6, start: 205, step: 5 },
      { exercise: 'Barbell Romanian Deadlift', sets: 3, reps: 8, start: 155, step: 5 },
      { exercise: 'Selectorized Machine Leg Extension', sets: 3, reps: 12, start: 90, step: 5 },
      { exercise: 'Selectorized Machine Standing Calf Raise', sets: 3, reps: 15, start: 130, step: 10 },
    ],
  },
};
const MAIN_LIFTS = ['Barbell Bench Press', 'Barbell Overhead Press', 'Barbell Back Squat', 'Barbell Deadlift'];
const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const BASE_INTAKE = {
  goals: 'Bench 225 by March. Deadlift 315.',
  injuries_and_limits: '',
  notes: '',
  coach_style: 'neutral',
  experience: 'intermediate',
  priorities: [{ value: 'strength' }, { value: 'muscle' }, { value: 'habit' }],
  progression_pace: 'moderate',
  workout_minutes: 60,
  days_per_week: 3,
  variety: 'some',
  exercises_liked: 'Deadlifts, pull-ups, anything with a barbell.',
  exercises_to_avoid: '',
  how_to_coach_me: 'Short answers. Give me the numbers.',
};

const EMPTY_INTAKE = {
  goals: '', injuries_and_limits: '', weekly_schedule: '', notes: '', coach_style: null, experience: null,
  priorities: [], progression_pace: null, workout_minutes: null, days_per_week: null, variety: null,
  exercises_liked: '', exercises_to_avoid: '', how_to_coach_me: '',
};

const HOME_EQUIPMENT = ['barbell', 'dumbbell', 'kettlebell', 'cable', 'selectorized machine', 'plate-loaded machine',
  'Smith machine', 'bodyweight', 'band', 'cardio machine', 'bench', 'squat rack', 'rower'];

// ------------------------------------------------------------------ building

/**
 * Builds one state.
 * @param {keyof typeof STATES} name
 * @param {{ starter: { exercises: Array<{ name: string, work_seconds: number, rest_seconds: number }> }, now?: Date }} opts
 */
export function buildState(name, { starter, now = new Date() }) {
  if (!(name in STATES)) throw new Error(`Unknown eval state "${name}". Known: ${Object.keys(STATES).join(', ')}`);
  const lib = new Map(starter.exercises.map((e) => [e.name, e]));
  const libFor = (n) => {
    const e = lib.get(n);
    if (!e) throw new Error(`The starter library has no "${n}"`);
    return e;
  };
  const id = () => crypto.randomUUID();
  const today = trainingDay(now);
  const thisMonday = mondayOf(today);

  if (name === 'empty_profile') {
    return { name, profile: { time_zone: TIME_ZONE, totals_unit: 'lb' }, coach_profile: EMPTY_INTAKE, rows: [] };
  }

  // What differs from the standard state.
  const lastWeekOnly = name === 'campaign_last_week' || name === 'aggressive_misses';
  const noCampaign = name === 'intake_no_campaign';
  const running = name === 'workout_running' ? 'start' : name === 'workout_running_superset' ? 'superset' : null;

  // Training days: Push on today's weekday, Pull two days later, Legs four days later,
  // so today always has Push A planned (and the running states run it).
  const wd = weekday(today);
  const days = [
    { key: 'push', weekday: wd },
    { key: 'pull', weekday: ((wd + 1) % 7) + 1 },
    { key: 'legs', weekday: ((wd + 3) % 7) + 1 },
  ];
  const schedule = [...days].sort((x, y) => x.weekday - y.weekday)
    .map((d) => `${DAY_NAMES[d.weekday]} ${WORKOUTS[d.key].name.replace(' A', '').toLowerCase()}`).join(', ');

  const intake = { ...BASE_INTAKE, weekly_schedule: schedule };
  if (name === 'steady_all_hit') intake.progression_pace = 'steady';
  if (name === 'aggressive_misses') intake.progression_pace = 'aggressive';
  if (name === 'style_supportive') intake.coach_style = 'supportive';
  if (name === 'style_challenging') intake.coach_style = 'challenging';
  if (name === 'knee_injury') {
    intake.injuries_and_limits = 'Left knee: sore after deep squats since a fall in October. Fine for leg extensions and Romanian deadlifts.';
    intake.exercises_to_avoid = 'Barbell Back Squat';
  }

  // Gyms.
  const home = id();
  const hotel = id();
  const gyms = [
    { id: home, name: 'Home gym', equipment: HOME_EQUIPMENT, notes: 'Garage gym. Power rack, adjustable bench, cable tower, dumbbells to 100 lb, a rower.', is_default: true },
    { id: hotel, name: 'Hotel gym', equipment: ['dumbbell', 'bench', 'band', 'bodyweight'], notes: 'Dumbbells from 5 to 50 lb, one adjustable bench, light to heavy bands. No barbell, no cables, no machines.', is_default: false },
  ];

  // Workouts and their items.
  const workouts = [];
  const items = [];
  const workoutId = {};
  for (const [key, w] of Object.entries(WORKOUTS)) {
    workoutId[key] = id();
    workouts.push({ id: workoutId[key], name: w.name });
    w.items.forEach((it, i) => items.push({
      workout_id: workoutId[key], position: i, exercise: it.exercise, sets: it.sets, reps: it.reps, superset_letter: it.superset ?? null,
    }));
  }

  // Campaigns: a finished five-week base block, then the current block.
  // Standard: six weeks from three Mondays ago, so this is week 4 of 6.
  // Last week: four weeks from three Mondays ago, so it ends this Sunday.
  // No campaign: three weeks from three Mondays ago, finished last Sunday.
  const firstMonday = addDays(thisMonday, -56);
  const blockStart = addDays(thisMonday, -21);
  const campaigns = [
    { id: id(), name: 'Base Block', start_date: firstMonday, week_count: 5, status: 'finished' },
    {
      id: id(), name: 'Strength Block', start_date: blockStart,
      week_count: noCampaign ? 3 : lastWeekOnly ? 4 : 6, status: noCampaign ? 'finished' : 'active',
    },
  ];
  const campaignDays = [];
  const dayId = new Map(); // `${campaign index}:${week}:${weekday}` -> id
  campaigns.forEach((c, ci) => {
    for (let week = 1; week <= c.week_count; week += 1) {
      for (const d of days) {
        const did = id();
        dayId.set(`${ci}:${week}:${d.weekday}`, did);
        campaignDays.push({ id: did, campaign_id: c.id, week, weekday: d.weekday, workout_id: workoutId[d.key] });
      }
    }
  });
  const dayFor = (date) => {
    for (let ci = campaigns.length - 1; ci >= 0; ci -= 1) {
      const c = campaigns[ci];
      const week = Math.floor((Date.parse(mondayOf(date)) - Date.parse(c.start_date)) / (7 * 86400_000)) + 1;
      if (week >= 1 && week <= c.week_count) {
        const did = dayId.get(`${ci}:${week}:${weekday(date)}`);
        if (did) return did;
      }
    }
    return null;
  };

  // History: every planned day from eight Mondays ago up to yesterday.
  const sessions = [];
  const blocks = [];
  const sessionExercises = [];
  const sets = [];
  let running_session_patch = null;

  const weekIndex = (date) => Math.floor((Date.parse(mondayOf(date)) - Date.parse(firstMonday)) / (7 * 86400_000)); // 0..8
  const missed = (key, date) => {
    const w = weekIndex(date);
    if (key === 'legs' && w === 2) return true; // one ordinary miss, six weeks ago
    if (name === 'two_missed' && w === 7 && (key === 'pull' || key === 'legs')) return true;
    return false;
  };

  /** Weight and reps for one exercise's sets in one session. */
  function plannedSets(it, date, isLastOfLift) {
    const w = weekIndex(date);
    let weight = it.start + it.step * Math.floor(w / 2);
    const reps = Array(it.sets).fill(it.reps);
    if (name === 'aggressive_misses' && MAIN_LIFTS.includes(it.exercise) && w >= 5) {
      // Big jumps every week for the last three, and reps missed each time.
      weight = it.start + it.step * 3 + it.step * 2 * (w - 4);
      for (let s = 1; s < it.sets; s += 1) reps[s] = Math.max(1, it.reps - s);
    } else if (MAIN_LIFTS.includes(it.exercise) && isLastOfLift) {
      // The latest session of a main lift: the last set one rep short, unless this state hits every rep.
      if (name !== 'steady_all_hit') reps[it.sets - 1] = it.reps - 1;
    } else if (MAIN_LIFTS.includes(it.exercise) && w % 3 === 2) {
      reps[it.sets - 1] = it.reps - 1;
    }
    return reps.map((r) => ({ weight, reps: r }));
  }

  const plannedDates = [];
  for (let date = firstMonday; date < today; date = addDays(date, 1)) {
    const d = days.find((x) => x.weekday === weekday(date));
    if (d && !missed(d.key, date)) plannedDates.push({ date, key: d.key });
  }
  const lastDateOf = {};
  for (const p of plannedDates) lastDateOf[p.key] = p.date;

  function addSession({ date, key, live }) {
    const w = WORKOUTS[key];
    const sid = id();
    const start = live ? plusSeconds(now, live === 'start' ? -240 : -1500) : at(date, 17, 30);
    let clock = start;
    const blockList = [];
    // Group items into blocks: one per single exercise, one per superset.
    for (const it of w.items) {
      const last = blockList[blockList.length - 1];
      if (it.superset && last && last.letter === it.superset) last.items.push(it);
      else blockList.push({ letter: it.superset ?? null, items: [it] });
    }
    let total = 0;
    let current = null;
    blockList.forEach((b, bi) => {
      const bid = id();
      const ex = b.items.map((it) => ({ it, e: libFor(it.exercise) }));
      const rounds = b.items[0].sets;
      const budget = b.letter
        ? rounds * ex.reduce((s, x) => s + x.e.work_seconds, 0) + (rounds - 1) * ex[0].e.rest_seconds
        : rounds * ex[0].e.work_seconds + (rounds - 1) * ex[0].e.rest_seconds;
      // Live sessions: which blocks are done, which is under way.
      let state = 'done';
      let roundsDone = rounds;
      if (live === 'start') { state = bi === 0 ? 'current' : 'open'; roundsDone = 0; }
      if (live === 'superset') {
        if (b.letter) { state = 'current'; roundsDone = 1; } else if (bi > blockList.findIndex((x) => x.letter)) { state = 'open'; roundsDone = 0; }
      }
      const factor = 1 + (((bi + weekIndex(date)) % 4) - 1) * 0.07; // 0.93 to 1.14 of the budget
      const used = state === 'done' ? Math.round(budget * factor) : state === 'current' ? Math.round((budget / rounds) * roundsDone) : 0;
      const blockStart = clock;
      blocks.push({
        id: bid, session_id: sid, position: bi, superset_letter: b.letter, time_budget_seconds: budget,
        clock_started_at: state === 'open' || (state === 'current' && roundsDone === 0) ? null : iso(blockStart),
        clock_banked_seconds: state === 'current' ? 0 : used,
        clock_running_since: state === 'current' && roundsDone > 0 ? iso(blockStart) : null,
        clock_stopped_at: state === 'done' ? iso(plusSeconds(blockStart, used)) : null,
      });
      ex.forEach(({ it, e }, pi) => {
        const seid = id();
        const planned = plannedSets(it, date, !live && lastDateOf[key] === date);
        sessionExercises.push({
          id: seid, session_id: sid, block_id: bid, exercise: it.exercise, exercise_name_then: it.exercise, position_in_block: pi,
          planned_set_types: Array(it.sets).fill('working'), planned_reps: it.reps, planned_rest_seconds: e.rest_seconds,
          work_seconds: e.work_seconds, state: state === 'done' ? 'done' : 'open', origin: 'plan',
        });
        if (state === 'current' && pi === 0) current = seid;
        planned.slice(0, roundsDone).forEach((s, si) => {
          sets.push({
            session_exercise_id: seid, set_number: si + 1, weight_lb: s.weight, entered_value: s.weight, entered_unit: 'lb',
            reps: s.reps, set_type: 'working', logged_at: iso(plusSeconds(blockStart, Math.round((used / Math.max(roundsDone, 1)) * (si + 1)))),
          });
        });
      });
      clock = plusSeconds(clock, used + 60);
      total += used + 60;
    });
    const campaignDay = dayFor(date);
    const session = {
      id: sid, local_date: date, source_kind: campaignDay ? 'campaign_day' : 'ad_hoc', campaign_day_id: campaignDay,
      workout_id: workoutId[key], workout_name: w.name, gym_id: home, started_at: iso(start),
      status: live ? 'active' : 'finished', ended_at: live ? null : iso(plusSeconds(start, total)),
      finish_reason: live ? null : 'user', clock_banked_seconds: live ? 0 : total,
      clock_running_since: live ? iso(start) : null, last_activity_at: iso(live ? now : plusSeconds(start, total)),
    };
    sessions.push(session);
    if (live) running_session_patch = { id: sid, current };
  }

  for (const p of plannedDates) addSession(p);
  if (running) addSession({ date: today, key: 'push', live: running });
  if (running_session_patch?.current) {
    sessions.find((s) => s.id === running_session_patch.id).current_session_exercise_id = running_session_patch.current;
  }

  // Rowing on a rest day, most weeks.
  const cardio = [];
  for (let w = 0; w < 8; w += 1) {
    if (w === 4) continue;
    const date = addDays(addDays(firstMonday, 7 * w), ((wd + 4) % 7));
    if (date >= today || days.some((d) => d.weekday === weekday(date))) continue;
    cardio.push({ local_date: date, type: 'Rower', duration_seconds: 1200 + 60 * w, distance: 4.5 + 0.1 * w, distance_unit: 'km', notes: '' });
  }

  // Past proposals.
  const ago = (daysBack, hour = 18) => at(addDays(today, -daysBack), hour);
  const noReasonWhen = name === 'declined_no_reason' ? plusSeconds(now, -1800) : ago(10);
  const proposals = [
    {
      source: 'ChatGPT', kind: 'campaign', applies_to: 'campaign', status: 'accepted',
      summary_lines: ['New campaign: Strength Block, 6 weeks from ' + blockStart,
        'Push A, Pull A and Legs A on ' + schedule.toLowerCase()],
      payload: {}, created_at: iso(ago(24)), decided_at: iso(ago(24, 19)),
    },
    {
      source: 'ChatGPT', kind: 'campaign', applies_to: 'campaign', status: 'rejected',
      summary_lines: ['Legs A: Barbell Back Squat becomes Barbell Front Squat for weeks 1 to 3'],
      payload: {}, created_at: iso(ago(28)), decided_at: iso(ago(28, 19)), decline_reason: 'Front squats hurt my wrists.',
    },
    {
      source: 'ChatGPT', kind: 'workout', applies_to: 'library', status: 'rejected',
      summary_lines: ['Pull A: add Cable Face Pull, 3 sets of 15, after Cable Seated Row'],
      payload: {}, created_at: iso(noReasonWhen), decided_at: iso(plusSeconds(noReasonWhen, 600)),
    },
    {
      source: 'ChatGPT', kind: 'workout', applies_to: 'library', status: 'rejected',
      summary_lines: ['Push A: Barbell Bench Press becomes 5 sets of 6',
        'Push A: add Dumbbell Incline Bench Press, 4 sets of 10, after Barbell Bench Press',
        'Push A: add Cable Standing Fly, 3 sets of 15, at the end'],
      payload: {}, created_at: iso(ago(1)), decided_at: iso(ago(1, 19)), decline_reason: 'too much volume',
    },
  ].sort((x, y) => x.created_at.localeCompare(y.created_at));

  // Weekly check-ins: the last four full weeks in a row, and one before a gap.
  const checkins = [-7, -4, -3, -2, -1].map((w) => {
    const week = addDays(thisMonday, 7 * w);
    return { week_start: week, first_read_at: iso(at(addDays(week, 7), 8)) };
  });

  return {
    name,
    profile: { time_zone: TIME_ZONE, totals_unit: 'lb' },
    coach_profile: intake,
    rows: [
      { table: 'gyms', rows: gyms },
      { table: 'workouts', rows: workouts },
      { table: 'workout_items', rows: items },
      { table: 'campaigns', rows: campaigns },
      { table: 'campaign_days', rows: campaignDays },
      { table: 'sessions', rows: sessions },
      { table: 'session_blocks', rows: blocks },
      { table: 'session_exercises', rows: sessionExercises },
      { table: 'set_logs', rows: sets },
      { table: 'cardio_logs', rows: cardio },
      { table: 'proposals', rows: proposals },
      { table: 'weekly_checkins', rows: checkins },
    ],
  };
}
