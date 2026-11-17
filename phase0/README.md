# Phase 0: connector test

A throwaway MCP connector used to answer one question before the real build: can a user's LLM project read from Chalk and Iron and send it proposals?

- `api/mcp.js` is the whole service: a streamable-HTTP MCP endpoint with no dependencies.
- It serves sample data only and has no sign-in.
- Proposals are held in memory and are lost when the function restarts. The Vercel runtime logs keep a `PROPOSAL` line for each one.

## Tools

| Tool | Kind | What it does |
| --- | --- | --- |
| `get_today` | read | Returns a sample workout |
| `get_exercise_history` | read | Returns sample history for two exercises |
| `propose_today_change` | propose | Records a proposed change to today's workout |
| `propose_profile_update` | propose | Records a proposed coach profile |
| `get_proposal_status` | read | Returns a proposal's status |

## Endpoints

- `POST /mcp` is the connector link to paste into an LLM client.
- `GET /` shows the connector link, a self-test button, proposals received and recent calls.

## What to record

1. Does the client list the five tools?
2. Does a read tool work?
3. Does a propose tool work, or is it blocked as a write action?
4. Does the connector work inside an existing project?
5. Does it work in the client's iPhone app?

This folder is deleted once Phase 0 is answered.
