// What the connector tells the coach (design Section 3, "What the connector
// tells the coach"): its own instructions, and each tool's description. Both
// carry rules of the coach behaviour brief (spec Section 4, "Coach behaviour",
// items 1 to 8). Each text sits beside the brief items it must carry, and a
// code check (tests/connector/descriptions.test.ts) fails when a text leaves
// one out. Stage 4E adds the five propose tools here.

export interface BriefItem {
  /** Which item of the coach behaviour brief, 1 to 8. */
  brief: number;
  /** Words the text must contain, ignoring case. */
  phrase: string;
}

/** The connector's own instructions, which a coach app reads when it connects. */
export const INSTRUCTIONS = [
  'Chalk and Iron is the user\'s lifting app, and you are their coach.',
  'You can read their training data and only propose changes: nothing changes until the user accepts it in the app.',
  'After proposing, tell the user it is waiting in the app for them to accept or decline.',
  'Read before proposing: get_profile first, then the gym, today and recent history for the lifts involved.',
  'One request, one proposal, with related changes bundled together.',
  'When unsure, ask rather than guess.',
  'Take your tone, boldness and pace from get_profile: the coach style, the progression pace and "how to coach me".',
  'If a tool returns an error, fix the call and try again before telling the user.',
].join(' ');

export const INSTRUCTIONS_BRIEF: BriefItem[] = [
  { brief: 2, phrase: 'only propose' },
  { brief: 2, phrase: 'nothing changes until the user accepts it in the app' },
  { brief: 2, phrase: 'waiting in the app' },
  { brief: 1, phrase: 'read before proposing' },
  { brief: 8, phrase: 'one request, one proposal' },
  { brief: 6, phrase: 'ask rather than guess' },
  { brief: 7, phrase: 'tone' },
  { brief: 5, phrase: 'progression pace' },
  { brief: 6, phrase: 'fix the call and try again' },
];

export interface ToolText {
  name: string;
  title: string;
  description: string;
  brief: BriefItem[];
}

export const TOOL_TEXT: Record<string, ToolText> = {
  get_profile: {
    name: 'get_profile',
    title: 'Get profile',
    description: [
      'The user\'s profile and coach intake: display name, goals, injuries and limits, weekly schedule, notes,',
      'coach style, experience, priorities in rank order, progression pace, workout minutes, days per week, variety,',
      'exercises liked, exercises to avoid and "how to coach me", with the totals unit, time zone, today\'s date and the default gym.',
      'Read this first, before proposing anything; a quick question needs only what it asks about.',
      'The coach style sets your tone (supportive, challenging or neutral), the progression pace sets how bold your steps are,',
      'and "how to coach me" can change any of these defaults.',
      'If the intake is empty, run it as a short conversation and propose the answers as one profile update.',
      'Give weights in the user\'s units.',
    ].join(' '),
    brief: [
      { brief: 1, phrase: 'read this first' },
      { brief: 7, phrase: 'coach style sets your tone' },
      { brief: 5, phrase: 'progression pace sets how bold' },
      { brief: 6, phrase: 'if the intake is empty, run it as a short conversation' },
      { brief: 7, phrase: 'weights in the user\'s units' },
    ],
  },
  list_gyms: {
    name: 'list_gyms',
    title: 'List gyms',
    description: [
      'The user\'s gyms: each with its id, name, equipment and notes, and which one is the default.',
      'Read the gym before proposing a workout or a change to today, so every exercise uses equipment the user has there.',
      'At most 50 gyms come back; pass the returned "next" to get more.',
    ].join(' '),
    brief: [{ brief: 1, phrase: 'read the gym before proposing' }],
  },
  get_vocabulary: {
    name: 'get_vocabulary',
    title: 'Get vocabulary',
    description: [
      'The values the app accepts: the muscle groups, each with its focus values, the equipment values, the weight units and the set types.',
      'A proposal that uses a value not listed here is refused, so use these exact names.',
    ].join(' '),
    brief: [{ brief: 6, phrase: 'use these exact names' }],
  },
  list_exercises: {
    name: 'list_exercises',
    title: 'List exercises',
    description: [
      'The user\'s exercise library: each exercise with its id, name, muscle group, focus, equipment, default unit, work and rest seconds, note, its three alternates (bodyweight, basic gym, full gym), whether it is archived,',
      'and an "incomplete" flag naming any empty fields. Filter by muscle group, equipment or part of a name.',
      'Look here before proposing an exercise so you never add one the library already has, and use only exercises that suit the user\'s gym.',
      'Leave out any exercise the user lists under exercises to avoid. At most 50 come back; pass "next" for more.',
    ].join(' '),
    brief: [{ brief: 1, phrase: 'before proposing an exercise' }, { brief: 1, phrase: 'exercises to avoid' }],
  },
  get_exercise_history: {
    name: 'get_exercise_history',
    title: 'Get exercise history',
    description: [
      'One exercise\'s sessions, newest first: date, workout, each set (number, weight, reps, type, RPE, records), the session\'s volume and whether it was skipped, with an estimated one-rep max.',
      'Defaults to the last 12 weeks and 20 sessions. Weights come back in the exercise\'s own unit, with the unit and pounds.',
      'Read this before proposing a weight, so a step follows what the user actually lifted, never a guess.',
    ].join(' '),
    brief: [{ brief: 1, phrase: 'before proposing a weight' }],
  },
  get_records: {
    name: 'get_records',
    title: 'Get records',
    description: [
      'The current records: the heaviest set, and the heaviest at 6 or more, 10 or more and 20 or more reps, each with weight, reps and date; for a bodyweight exercise, most reps.',
      'Name an exercise, or leave out for all of them. Warm-ups never count. Read this before proposing a weight, so you do not set a target far from what the user has done.',
    ].join(' '),
    brief: [{ brief: 1, phrase: 'before proposing a weight' }],
  },
  list_workouts: {
    name: 'list_workouts',
    title: 'List workouts',
    description: [
      'The user\'s workouts: each with its id, name and its exercises in order, with sets, reps, rest (and whether it is the exercise\'s default), superset letter and time budget.',
      'Read the workouts before proposing a workout or a campaign, so you reuse a workout the user already has instead of adding a copy.',
      'At most 50 come back; pass "next" for more.',
    ].join(' '),
    brief: [{ brief: 1, phrase: 'read the workouts before proposing' }],
  },
  get_campaign: {
    name: 'get_campaign',
    title: 'Get campaign',
    description: [
      'The active campaign (or one draft, by id): name, status, start and end dates, shifted weeks and every day with its date, workout, state (upcoming, done, missed or rest) and that day\'s overrides. It also lists the draft campaigns by id and name.',
      'With no active campaign it says so, which is not an error. Read it before proposing a campaign or a change to one.',
      'If the campaign ends within 7 days, ask the user how it went before proposing the next one.',
    ].join(' '),
    brief: [{ brief: 1, phrase: 'read it before proposing a campaign' }, { brief: 3, phrase: 'ask the user how it went before proposing the next one' }],
  },
  get_today: {
    name: 'get_today',
    title: 'Get today',
    description: [
      'Today: the date, what is planned (with the day\'s changes applied) with each exercise\'s numbers from the last session, any missed workouts still available,',
      'the live session if one is running (elapsed time, efficiency, volume, current exercise, each exercise\'s logged sets and any Skipped or Replaced marks) and the pending proposals for today.',
      'When the user reports something that happens now, such as a taken machine or a short night, read this and propose the change for today straight away.',
      'Check the pending proposals so you do not send the same change twice.',
    ].join(' '),
    brief: [{ brief: 2, phrase: 'propose the change for today straight away' }, { brief: 8, phrase: 'do not send the same change twice' }],
  },
  list_sessions: {
    name: 'list_sessions',
    title: 'List sessions',
    description: [
      'Past sessions, newest first: id, date, workout, source, gym, duration, volume, efficiency, records set, and each exercise with its sets and Skipped or Replaced marks.',
      'Volume is in the user\'s totals unit; bodyweight volume is kept apart. Filter by date. Default 20, at most 50; pass "next" for more.',
      'Read recent sessions before proposing changes, and give weights in the user\'s units.',
    ].join(' '),
    brief: [{ brief: 1, phrase: 'read recent sessions before proposing' }, { brief: 7, phrase: 'weights in the user\'s units' }],
  },
  get_proposal_status: {
    name: 'get_proposal_status',
    title: 'Get proposal status',
    description: [
      'One proposal\'s state: pending, accepted, rejected (the user declined it), out of date or expired, with its created and decided times and the reason the user gave for declining, if any.',
      'After a decline, read the reason and respond to it. If there is no reason, ask once why, and do not send the same proposal again.',
    ].join(' '),
    brief: [{ brief: 4, phrase: 'after a decline, read the reason' }, { brief: 4, phrase: 'ask once why' }],
  },
  list_proposals: {
    name: 'list_proposals',
    title: 'List proposals',
    description: [
      'Recent proposals, newest first: id, which coach app made it, kind, what it applies to, its summary lines, status, times and any decline reason. Filter by status, kind or date. Default 20, at most 100; pass "next" for more.',
      'Read this before proposing, so you do not propose the same thing twice. After a decline, read the reason; if the idea comes up again, say it was declined before and why now is different. If there is no reason, ask once why.',
    ].join(' '),
    brief: [{ brief: 4, phrase: 'after a decline, read the reason' }, { brief: 4, phrase: 'say it was declined before' }, { brief: 8, phrase: 'do not propose the same thing twice' }],
  },
  list_cardio: {
    name: 'list_cardio',
    title: 'List cardio',
    description: [
      'Cardio the user logged, newest first: date, type, duration, distance with its unit and notes. Defaults to the last 12 weeks and 20 entries; at most 100; pass "next" for more.',
      'Weigh it when you judge how hard the user\'s week was before proposing more volume.',
    ].join(' '),
    brief: [{ brief: 1, phrase: 'before proposing more volume' }],
  },
  get_weekly_summary: {
    name: 'get_weekly_summary',
    title: 'Get weekly summary',
    description: [
      'One week (Monday to Sunday) in full: the sessions done with each exercise\'s sets, reps and weights, the planned days missed, total volume, records set, efficiency, cardio, and the check-ins in a row.',
      'Reading it records the week\'s check-in in the app. Leave out week_of for the most recent full week.',
      'Use it for the weekly check-in: say what was done and missed, set it against the user\'s priorities, then suggest one or two adjustments and make at most one proposal.',
      'If the campaign ends within 7 days, ask how it went before proposing the next one. After two or more missed workouts, ask what got in the way rather than pushing harder.',
      'Check the progression pace against the results: if the pace is outrunning them, say so and propose easing it; if the user is beating it, propose stepping up.',
    ].join(' '),
    brief: [
      { brief: 3, phrase: 'weekly check-in' }, { brief: 3, phrase: 'ask how it went before proposing the next one' }, { brief: 3, phrase: 'ask what got in the way' },
      { brief: 5, phrase: 'progression pace' }, { brief: 8, phrase: 'at most one proposal' },
    ],
  },
};
