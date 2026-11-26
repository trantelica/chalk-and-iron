// What the connector tells the coach (design Section 3, "What the connector
// tells the coach"): its own instructions, and each tool's description. Both
// carry rules of the coach behaviour brief (spec Section 4, "Coach behaviour",
// items 1 to 8). Each text sits beside the brief items it must carry, and a
// code check (tests/connector/descriptions.test.ts) fails when a text leaves
// one out. Stages 4C and 4E add the other sixteen tools here.

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
};
