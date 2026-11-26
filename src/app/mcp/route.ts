import { handleMcp } from '@/server/connector/mcp';

// The coach connector's permanent link: https://chalkandiron.vercel.app/mcp
// (design Section 3). The user pastes it into ChatGPT or Claude.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = (request: Request) => handleMcp(request);
export const GET = (request: Request) => handleMcp(request);
export const DELETE = (request: Request) => handleMcp(request);
export const OPTIONS = (request: Request) => handleMcp(request);
