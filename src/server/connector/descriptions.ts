// What the connector tells the coach (design Section 3, "What the connector
// tells the coach"): its own instructions, and each tool's description. Both
// carry rules of the coach behaviour brief (spec Section 4, "Coach behaviour",
// items 1 to 8). Each text sits beside the brief items it must carry, and a
// code check (tests/connector/descriptions.test.ts) fails when a text leaves
// one out. The five propose tools (stage 4E) are at the end.
//
// Coach guides (28 Nov 2026, design Section 3, "Coach guides"): procedures
// live in the guides (src/server/connector/guides/*.md), which the coach
// fetches with get_guide; each description names its guide. A brief rule may
// now live in a guide as well (GUIDE_BRIEF), or in the block the user pastes
// (BLOCK_BRIEF). BRIEF_RULES lists every rule the check carries, and each
// must have at least one home.

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
  'For each kind of request, call get_guide with its topic first and follow it; call get_guide with no topic for the list.',
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
      'Guides: call get_guide with no topic for the list, and read the guide for each kind of request before acting.',
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
      'The equipment list may be incomplete, especially for a large gym. If you are not sure the user has a piece of equipment, ask them in the chat; if they have it, propose adding it to the gym with propose_profile_update so you never ask again. If they do not, offer the exercise\'s alternate (list_exercises shows its bodyweight, basic gym and full gym alternates) and ask only about the swap.',
      'A gym\'s notes may hold a line starting "Weights:" with its dumbbell range, kettlebell sizes, plates and heaviest barbell load. Read it, and never propose a dumbbell, kettlebell or barbell load the gym cannot provide.',
      'At most 50 gyms come back; pass the returned "next" to get more.',
    ].join(' '),
    brief: [{ brief: 1, phrase: 'read the gym before proposing' }, { brief: 6, phrase: 'ask them in the chat' }, { brief: 6, phrase: 'offer the exercise\'s alternate' }],
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
  get_guide: {
    name: 'get_guide',
    title: 'Get guide',
    description: [
      'The playbook for one kind of request: the steps to follow and the rules that matter for it. Read the guide before acting on that kind of request, and follow it.',
      'With no topic, the list of guides: each topic, when to read it, and its version. An unknown topic returns not_found with the list.',
      'The user\'s coach intake, above all "how to coach me", outranks a guide\'s defaults. Reads none of the user\'s data.',
    ].join(' '),
    brief: [{ brief: 1, phrase: 'read the guide before acting' }],
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
      'What the Library designs and what Plan runs: get_guide(\'ontology\').',
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
      'Read get_guide(\'after_decline\') before acting on a declined card.',
    ].join(' '),
    brief: [{ brief: 4, phrase: 'after a decline, read the reason' }, { brief: 4, phrase: 'ask once why' }],
  },
  list_proposals: {
    name: 'list_proposals',
    title: 'List proposals',
    description: [
      'Recent proposals, newest first: id, which coach app made it, kind, what it applies to, its summary lines, status, times and any decline reason. Filter by status, kind or date. Default 20, at most 100; pass "next" for more.',
      'Read this before proposing, so you do not propose the same thing twice. After a decline, read the reason; if the idea comes up again, say it was declined before and why now is different. If there is no reason, ask once why.',
      'Read get_guide(\'after_decline\') before acting on a declined card.',
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
      'Read get_guide(\'weekly_checkin\') first: it says what to report, when to ask before proposing, and the pace check.',
      'Use it for the weekly check-in, set against the user\'s priorities, with one or two adjustments and at most one proposal.',
      'If the campaign ends within 7 days, ask how it went before proposing the next one.',
    ].join(' '),
    brief: [
      { brief: 3, phrase: 'weekly check-in' }, { brief: 3, phrase: 'ask how it went before proposing the next one' }, { brief: 8, phrase: 'at most one proposal' },
    ],
  },

  // ------------------------------------------------------------ propose tools (stage 4E)
  propose_exercise: {
    name: 'propose_exercise',
    title: 'Propose an exercise',
    description: [
      'Propose a new exercise for the library, or changes to an existing one (give "exercise", its id or exact name). Nothing changes until the user accepts it in the app.',
      'A new exercise needs a name (equipment, then variation, then movement, for example "Cable Overhead Triceps Extension"), muscle_group, equipment, default_unit, work_seconds and rest_seconds, and all three alternates: bodyweight, basic_gym and full_gym.',
      'Use muscle group, focus and equipment values exactly as get_vocabulary gives them. Look at list_exercises before proposing an exercise: one the library already has, or one too close in name, is refused.',
      'Read get_guide(\'workout_design\') first for how to name, place and set up a new exercise.',
      'Write summary_lines as one clear line per change. Related changes belong in one proposal, never several.',
      'After it succeeds, tell the user it is waiting in the app for them to accept or decline. If it returns an error, fix the call and try again before telling the user.',
    ].join(' '),
    brief: [
      { brief: 2, phrase: 'nothing changes until the user accepts it in the app' },
      { brief: 1, phrase: 'before proposing an exercise' },
      { brief: 7, phrase: 'one clear line per change' },
      { brief: 8, phrase: 'related changes belong in one proposal' },
      { brief: 2, phrase: 'waiting in the app' },
      { brief: 6, phrase: 'fix the call and try again' },
    ],
  },
  propose_workout: {
    name: 'propose_workout',
    title: 'Propose a workout',
    description: [
      'Propose a new workout, or a change to one (give "workout", its id or exact name; then "items" is the whole new list). Nothing changes until the user accepts it in the app.',
      'Read get_guide(\'workout_design\') first and follow it.',
      'Ask the user two or three short questions first (how the last block went, new aches, how long they have), fewer when the intake already answers them; read list_workouts, the gym and recent history before proposing.',
      'Each item names an exercise from the library, or one you bring in "new_exercises" in this same proposal, with sets, reps and optional rest and superset letter. A superset holds two or three exercises, each with the same number of sets.',
      'Bundle every new exercise the workout needs into this proposal so the user approves it once. Each new exercise needs all three alternates and vocabulary values exactly as get_vocabulary gives them.',
      'Write summary_lines as one clear line per change. After it succeeds, tell the user it is waiting in the app for them to accept or decline. If it returns an error, fix the call and try again before telling the user.',
    ].join(' '),
    brief: [
      { brief: 2, phrase: 'nothing changes until the user accepts it in the app' },
      { brief: 2, phrase: 'ask the user two or three short questions first' },
      { brief: 1, phrase: 'read list_workouts, the gym and recent history before proposing' },
      { brief: 8, phrase: 'bundle every new exercise the workout needs into this proposal' },
      { brief: 7, phrase: 'one clear line per change' },
      { brief: 2, phrase: 'waiting in the app' },
      { brief: 6, phrase: 'fix the call and try again' },
    ],
  },
  propose_campaign: {
    name: 'propose_campaign',
    title: 'Propose a campaign',
    description: [
      'Propose a new campaign (1 to 6 weeks; it arrives as a draft the user starts from Plan), or changes to one (give "campaign_id"), or on its own "shift_forward_weeks": 1 to shift an existing campaign forward a week. Nothing changes until the user accepts it in the app.',
      'Read get_guide(\'campaign_design\') first and follow it.',
      'Ask the user two or three short questions first (how the last block went, new aches, days available), fewer when the intake already answers them; read the active campaign, list_workouts, the gym and recent history before proposing.',
      'Each day gives its week, weekday (1 is Monday) and a workout or "rest": true, with optional per-day overrides of sets, reps, weight and rest. Bundle every new exercise and new workout the campaign needs into this one proposal, so the user approves it once; never send them as separate cards.',
      'Keep each superset to two or three exercises with the same number of sets, on every day. Write summary_lines as one clear line per change.',
      'After it succeeds, tell the user it is waiting in the app for them to accept or decline. If it returns an error, fix the call and try again before telling the user.',
    ].join(' '),
    brief: [
      { brief: 2, phrase: 'nothing changes until the user accepts it in the app' },
      { brief: 2, phrase: 'ask the user two or three short questions first' },
      { brief: 1, phrase: 'read the active campaign, list_workouts, the gym and recent history before proposing' },
      { brief: 8, phrase: 'bundle every new exercise and new workout the campaign needs into this one proposal' },
      { brief: 8, phrase: 'never send them as separate cards' },
      { brief: 7, phrase: 'one clear line per change' },
      { brief: 2, phrase: 'waiting in the app' },
      { brief: 6, phrase: 'fix the call and try again' },
    ],
  },
  propose_today_change: {
    name: 'propose_today_change',
    title: 'Propose a change to today',
    description: [
      'Propose a change to today\'s workout only: it never changes the library or the campaign, and never a set already logged. Nothing changes until the user accepts it in the app, and the card ends at the 3:00 am rollover.',
      'When the user tells you something that happens now, such as a taken machine, propose straight away, without questions: they are probably in the gym. Read get_today first for what is planned or running, and get_guide(\'today_change\').',
      'Each change has an "action": swap (exercise, to_exercise), set_sets, set_reps, set_weight, set_rest, add, remove, reorder or break_superset. break_superset names the superset by its letter or by one member, and needs nothing else.',
      'A set_sets on a superset member must be matched on every other member, or break the superset first in the same proposal. Bundle related changes in one proposal and write summary_lines as one clear line per change.',
      'After it succeeds, tell the user it is waiting in the app for them to accept or decline. If it returns an error, fix the call and try again before telling the user.',
    ].join(' '),
    brief: [
      { brief: 2, phrase: 'nothing changes until the user accepts it in the app' },
      { brief: 2, phrase: 'propose straight away' },
      { brief: 1, phrase: 'read get_today first' },
      { brief: 8, phrase: 'bundle related changes in one proposal' },
      { brief: 7, phrase: 'one clear line per change' },
      { brief: 2, phrase: 'waiting in the app' },
      { brief: 6, phrase: 'fix the call and try again' },
    ],
  },
  propose_profile_update: {
    name: 'propose_profile_update',
    title: 'Propose a profile update',
    description: [
      'Propose changes to the user\'s coach profile (goals, injuries and limits, weekly schedule, notes and the intake: coach style, experience, priorities, progression pace, workout minutes, days per week, variety, exercises liked, exercises to avoid, how to coach me), and or to a gym (add one, or edit one with its id or exact name). Nothing changes until the user accepts it in the app.',
      'Read get_guide(\'intake\') first: it covers the intake, profile changes, gym equipment and gym weights.',
      'Run the intake as a short conversation, then propose the answers as one profile update. Leave out what the user did not answer.',
      'Change the progression pace only after a pace check: compare the chosen pace with what the history shows, say so to the user, and then propose it.',
      'A gym\'s equipment is free text in the user\'s own words, not get_vocabulary values, and a gym can be large. Change it one item at a time with add_equipment and remove_equipment (never the whole list), after reading the gym with list_gyms. They are applied to the gym\'s list when the user accepts, so nothing added in the meantime is lost. When the user confirms they have equipment the gym does not list, add it to the gym here.',
      'Write summary_lines as one clear line per change, for example "Add Rower and Sandbag to Big Gym" or "Remove Spin Bike from Big Gym". For a long list say how many, for example "Add 40 items to Big Gym: Rower, Sandbag and 38 more".',
      'After it succeeds, tell the user it is waiting in the app for them to accept or decline. If it returns an error, fix the call and try again before telling the user.',
    ].join(' '),
    brief: [
      { brief: 2, phrase: 'nothing changes until the user accepts it in the app' },
      { brief: 6, phrase: 'run the intake as a short conversation' },
      { brief: 5, phrase: 'only after a pace check' },
      { brief: 7, phrase: 'one clear line per change' },
      { brief: 2, phrase: 'waiting in the app' },
      { brief: 6, phrase: 'fix the call and try again' },
    ],
  },
};

/** Brief rules carried by the guides (design Section 3, "Coach guides"), checked against each guide's text. */
export const GUIDE_BRIEF: Record<string, BriefItem[]> = {
  ontology: [
    { brief: 2, phrase: 'every change is a card (a proposal) the user accepts or declines in the app' },
  ],
  campaign_design: [
    { brief: 1, phrase: 'read `get_profile`' },
    { brief: 3, phrase: 'ask how it went before proposing the next one' },
    { brief: 2, phrase: 'ask two or three short questions first' },
    { brief: 8, phrase: 'bundle every new exercise and new workout the campaign needs into this one card' },
    { brief: 8, phrase: 'never send them as separate cards' },
    { brief: 5, phrase: 'start from the progression pace' },
    { brief: 7, phrase: 'one clear line per change' },
  ],
  workout_design: [
    { brief: 1, phrase: 'read `get_profile`' },
    { brief: 2, phrase: 'ask two or three short questions first' },
    { brief: 8, phrase: 'bundle every new exercise the workout needs into this card' },
    { brief: 6, phrase: 'if you are not sure the user has a piece of equipment, ask' },
    { brief: 6, phrase: 'offer the exercise\'s alternate' },
    { brief: 7, phrase: 'one clear line per change' },
  ],
  today_change: [
    { brief: 2, phrase: 'propose straight away, without questions' },
    { brief: 1, phrase: 'read `get_today`' },
    { brief: 8, phrase: 'bundle related changes in one card' },
    { brief: 6, phrase: 'fix the call and try again' },
  ],
  weekly_checkin: [
    { brief: 3, phrase: 'sessions done, planned days missed, total volume, records and efficiency, set against the user\'s priorities' },
    { brief: 3, phrase: 'one or two things to adjust' },
    { brief: 3, phrase: 'ask how it went before proposing the next one' },
    { brief: 3, phrase: 'ask what got in the way rather than pushing harder' },
    { brief: 8, phrase: 'make at most one proposal' },
    { brief: 5, phrase: 'compare the progression pace with the history' },
    { brief: 5, phrase: 'never a silent change' },
    { brief: 7, phrase: 'weights in the user\'s units' },
  ],
  intake: [
    { brief: 6, phrase: 'ask the intake as a short conversation' },
    { brief: 6, phrase: 'propose the answers as one `propose_profile_update`' },
    { brief: 5, phrase: 'change the progression pace only after a pace check' },
  ],
  after_decline: [
    { brief: 4, phrase: 'read the reason' },
    { brief: 4, phrase: 'do not send the same thing straight back' },
    { brief: 4, phrase: 'say that the user declined it before, and why now is different' },
    { brief: 4, phrase: 'ask the user once in the chat why' },
    { brief: 4, phrase: 'a decline is never a lasting ban' },
  ],
};

/** Brief rules carried by the block the user pastes (src/lib/coach-instructions.ts). */
export const BLOCK_BRIEF: BriefItem[] = [
  { brief: 1, phrase: 'read before proposing' },
  { brief: 1, phrase: 'for a quick question, read only what it needs' },
  { brief: 2, phrase: 'a change to today: propose it straight away' },
  { brief: 2, phrase: 'ask two or three short questions first' },
  { brief: 2, phrase: 'nothing changes until i accept it in the app' },
  { brief: 6, phrase: 'when unsure, ask rather than guess' },
  { brief: 6, phrase: 'if a propose tool returns an error, fix it and try again before telling me' },
  { brief: 6, phrase: 'tell me what the app refused and why' },
  { brief: 7, phrase: 'supportive: lead with what went well' },
  { brief: 7, phrase: 'weights in my units' },
  { brief: 8, phrase: 'one request, one proposal, one card' },
];

/**
 * Every rule of the coach behaviour brief (spec Section 4, items 1 to 8) as
 * the check carries it. Each must be carried by at least one home: the
 * connector's instructions, a tool description, a guide, or the pasted block
 * (tests/connector/descriptions.test.ts). Moving a rule from one home to
 * another moves its line; dropping a rule means removing it here, on purpose.
 */
export const BRIEF_RULES: BriefItem[] = [
  { brief: 1, phrase: 'read before proposing' },
  { brief: 1, phrase: 'read the gym before proposing' },
  { brief: 1, phrase: 'before proposing a weight' },
  { brief: 1, phrase: 'before proposing an exercise' },
  { brief: 1, phrase: 'exercises to avoid' },
  { brief: 2, phrase: 'only propose' },
  { brief: 2, phrase: 'nothing changes until the user accepts it in the app' },
  { brief: 2, phrase: 'waiting in the app' },
  { brief: 2, phrase: 'propose straight away' },
  { brief: 2, phrase: 'ask two or three short questions first' },
  { brief: 3, phrase: 'weekly check-in' },
  { brief: 3, phrase: 'ask how it went before proposing the next one' },
  { brief: 3, phrase: 'ask what got in the way' },
  { brief: 3, phrase: 'one or two things to adjust' },
  { brief: 4, phrase: 'after a decline, read the reason' },
  { brief: 4, phrase: 'ask once why' },
  { brief: 4, phrase: 'say it was declined before' },
  { brief: 4, phrase: 'a decline is never a lasting ban' },
  { brief: 5, phrase: 'progression pace' },
  { brief: 5, phrase: 'only after a pace check' },
  { brief: 5, phrase: 'compare the progression pace with the history' },
  { brief: 6, phrase: 'ask rather than guess' },
  { brief: 6, phrase: 'run the intake as a short conversation' },
  { brief: 6, phrase: 'fix the call and try again' },
  { brief: 6, phrase: 'offer the exercise\'s alternate' },
  { brief: 6, phrase: 'use these exact names' },
  { brief: 7, phrase: 'tone' },
  { brief: 7, phrase: 'weights in the user\'s units' },
  { brief: 7, phrase: 'one clear line per change' },
  { brief: 8, phrase: 'one request, one proposal' },
  { brief: 8, phrase: 'at most one proposal' },
  { brief: 8, phrase: 'do not propose the same thing twice' },
  { brief: 8, phrase: 'never send them as separate cards' },
];
