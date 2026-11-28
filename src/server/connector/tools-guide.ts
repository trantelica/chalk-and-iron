import { z } from 'zod';
import { ConnectorError } from './errors';
import { allGuides, findGuide } from './guides';
import type { ToolDef } from './tools';

// get_guide (design Section 3, "Coach guides"): the coach reads the playbook
// for a kind of request before acting on it. It reads nothing from the
// database and writes nothing: the guides are files shipped with the server.

const input = z.object({ topic: z.string().trim().max(60).optional() }).strict();

export function getGuide(args: z.infer<typeof input>): Record<string, unknown> {
  const all = allGuides();
  if (!args.topic) {
    return {
      guides: all.map((g) => ({ topic: g.topic, when: g.when, version: g.version })),
      how: 'Before acting on a kind of request, call get_guide with its topic and follow that guide.',
    };
  }
  const g = findGuide(args.topic);
  if (!g) {
    const topics = all.map((x) => x.topic);
    throw new ConnectorError('not_found', `There is no guide called "${args.topic.slice(0, 60)}". The guides are: ${topics.join(', ')}.`, { guides: topics });
  }
  return {
    topic: g.topic,
    version: g.version,
    guide: g.text,
    follow: 'Follow this guide for this request. The user\'s coach intake, above all "how to coach me", outranks its defaults.',
  };
}

export const GUIDE_TOOLS: ToolDef[] = [
  {
    name: 'get_guide',
    input,
    readOnly: true,
    // The caller is not used: a guide is the same for everyone and touches no data.
    run: async (_caller, args: z.infer<typeof input>) => getGuide(args),
    // The call log notes which guide was read (a topic that exists, never other text).
    topicOf: (args: z.infer<typeof input>) => (args.topic && findGuide(args.topic) ? args.topic : null),
  },
];
