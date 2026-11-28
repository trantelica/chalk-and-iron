// "Ask my coach" (Nate, 27 Nov 2026, keeping rule 1: the app never calls an AI).
// The phone has no chat with the coach. The coach lives in the user's own
// ChatGPT or Claude project, so Ask my coach copies a ready-made message and
// opens that project, and the user pastes it there.

export interface CoachMessage { id: string; label: string; text: string }

/** The ready messages on the Coach screen, in the order shown. */
export const COACH_MESSAGES: CoachMessage[] = [
  { id: 'weekly', label: 'Weekly check-in', text: 'Weekly check-in: please read my last week and tell me how it went.' },
  { id: 'gym-taken', label: "Something's taken at the gym, change today's workout", text: "Something I need is taken at the gym. Please change today's workout." },
  { id: 'next-campaign', label: 'Plan my next campaign', text: 'Please plan my next campaign.' },
  { id: 'last-workout', label: 'How did my last workout go?', text: 'How did my last workout go?' },
];

/** Home's last-week note (stage 4H). */
export const LAST_WEEK_MESSAGE = 'My campaign ends this week. Ask me how it went, then propose the next one.';

/** A swap that the three stored alternates and the library search did not cover. */
export function swapMessage(exerciseName: string): string {
  return `I'm in the middle of a workout and want another exercise instead of ${exerciseName}. Please propose a swap for today.`;
}

export const COPIED_LINE = 'Copied. Paste it into your coach chat and send.';
export const NO_LINK_LINE = 'No coach link is saved yet, so nothing was opened. The message is copied: paste it into your coach chat. To save the link, open the planner, then Coach setup, step 4.';
export const COPY_FAILED_LINE = 'Could not copy automatically. Press and hold the message below to select it, copy it, and paste it into your coach chat.';
