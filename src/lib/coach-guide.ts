// What you can ask your coach (Nate, 27 Nov 2026: a guide instead of
// copy-and-paste). One list, shared by the Coach screen, Coach setup and the
// coach instructions. Every example is something the connector's tools can
// really carry out (src/server/connector/descriptions.ts): the coach reads
// with the get_ and list_ tools and proposes with the five propose_ tools.
// The app never calls an AI; people talk to the coach in ChatGPT or Claude.

export interface GuideGroup {
  id: string;
  title: string;
  /** A line before the examples, when the app can do something itself first. */
  intro?: string;
  /** The coach guides (get_guide topics) for these requests, named in the coach instructions. */
  coachGuides: string[];
  examples: string[];
  /** One line on what happens next. */
  next: string;
}

const CARD = 'Your coach sends a card. You accept or decline it in Chalk and Iron, and nothing changes until you do.';

export const GUIDE_GROUPS: GuideGroup[] = [
  {
    id: 'gym',
    title: 'In the gym',
    intro: "You can change today's workout yourself: swap an exercise, change the order or skip one. If that isn't enough, ask your coach:",
    examples: ['The bench is taken.', 'I only have 30 minutes today.', 'My shoulder is sore, change today\'s workout.', 'The cable machine is busy, break up my superset.'],
    coachGuides: ['today_change'],
    next: CARD,
  },
  {
    id: 'planning',
    title: 'Planning',
    examples: ['Build me a new pull workout.', 'Plan my next campaign.', 'Add a face pull to my exercises.'],
    coachGuides: ['campaign_design', 'workout_design'],
    next: CARD + ' A new campaign arrives as a draft for you to activate.',
  },
  {
    id: 'checking-in',
    title: 'Checking in',
    examples: ['Weekly check-in.', 'How did my last workout go?', 'How are my bench press numbers going?', 'Write my week up for my accountability partner.'],
    coachGuides: ['weekly_checkin'],
    next: 'Your coach reads your training and answers in the chat. If it suggests a change, it sends a card, and nothing changes until you accept it.',
  },
  {
    id: 'declined',
    title: 'If you decline a coach\'s card',
    examples: ['Try again with the push workout I declined yesterday.', 'Which of your cards are still waiting for me?'],
    coachGuides: ['after_decline'],
    next: 'Your coach reads why you declined and sends a new card. Nothing changes until you accept it.',
  },
  {
    id: 'about-you',
    title: 'About you and your gyms',
    examples: ['Add a rower to my gym.', 'My dumbbells only go up to 80 pounds.', 'Change my coach style to challenging.', 'I can train four days a week now.'],
    coachGuides: ['intake'],
    next: CARD,
  },
];

/** Every example, in order, for the coach instructions. */
export const GUIDE_EXAMPLES: string[] = GUIDE_GROUPS.flatMap((g) => g.examples);

/** The reply the coach gives to "check setup". The version rises with every change to the instructions. */
export const COACH_INSTRUCTIONS_VERSION = 7;
export const CHECK_SETUP_REPLY = `Chalk and Iron coach ready, instructions version ${COACH_INSTRUCTIONS_VERSION}`;

export const NO_COACH_LINK_LINE = 'No coach link is saved yet. Add it in Coach setup, step 5.';
