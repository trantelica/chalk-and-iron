// The outbox: changes made on the phone and not yet confirmed by the server
// (design Section 6). Each change is written to the phone's storage the
// moment it is made, then sent in order whenever there is a connection: on
// app open, on reconnect, after each change, and every so often while some
// wait. A change leaves the outbox only when the server confirms it.
//
// Storage and the network are passed in, so the tests can run it against the
// test database with the network switched off and on.

import { enqueue, settle, type Change, type NewChange, type SyncAnswer } from '@/rules/sync';

export interface OutboxDeps {
  load(): Change[];
  save(queue: Change[]): void;
  /** Sends changes to the server. Throws when there is no connection or no sign-in. */
  send(changes: Change[]): Promise<SyncAnswer>;
  now?: () => number;
}

export type OutboxStatus =
  | { state: 'saved' } // nothing waiting
  | { state: 'waiting'; count: number } // changes waiting, about to send
  | { state: 'sending'; count: number }
  | { state: 'offline'; count: number } // the last try found no connection
  | { state: 'signed_out'; count: number }
  | { state: 'conflict'; count: number; conflict: NonNullable<SyncAnswer['conflict']> };

export class Outbox {
  private queue: Change[];
  private inFlight = new Set<string>();
  private running: Promise<void> | null = null;
  private again = false;
  status: OutboxStatus = { state: 'saved' };
  /** Changes the server refused, kept so the phone can say so. */
  rejected: { change: Change; reason: string }[] = [];
  private listeners = new Set<(o: Outbox) => void>();
  private answerListeners = new Set<(a: SyncAnswer) => void>();

  constructor(private deps: OutboxDeps) {
    this.queue = deps.load();
    this.status = this.queue.length ? { state: 'waiting', count: this.queue.length } : { state: 'saved' };
  }

  get entries(): readonly Change[] { return this.queue; }
  get count() { return this.queue.length; }

  onChange(fn: (o: Outbox) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  onAnswer(fn: (a: SyncAnswer) => void) { this.answerListeners.add(fn); return () => { this.answerListeners.delete(fn); }; }
  private emit() { for (const fn of this.listeners) fn(this); }

  /** Writes changes to storage in the same step, before anything is sent. */
  add(changes: NewChange[]) {
    if (!changes.length) return;
    this.queue = enqueue(this.queue, changes, this.inFlight, this.now());
    this.deps.save(this.queue);
    if (this.status.state !== 'conflict') this.status = { state: 'waiting', count: this.queue.length };
    this.emit();
  }

  /** Puts a change at the front, ahead of one the server is holding back (a conflict). */
  addFirst(change: NewChange) {
    const [c] = enqueue([], [change], this.inFlight, this.now());
    this.queue = [c, ...this.queue];
    this.deps.save(this.queue);
    this.emit();
  }

  /** Takes out unsent changes that match, for example a session's put the person chose to replace. */
  drop(match: (c: Change) => boolean) {
    this.queue = this.queue.filter((c) => this.inFlight.has(c.id) || !match(c));
    this.deps.save(this.queue);
    this.emit();
  }

  clearConflict() {
    if (this.status.state === 'conflict') this.status = this.queue.length ? { state: 'waiting', count: this.queue.length } : { state: 'saved' };
    this.emit();
  }

  private now() { return (this.deps.now ?? Date.now)(); }

  /** Sends everything waiting, in order. Safe to call at any time and as often as wanted. */
  flush(): Promise<void> {
    if (this.running) { this.again = true; return this.running; }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.sendAll();
        } while (this.again && this.status.state !== 'conflict' && this.status.state !== 'offline' && this.status.state !== 'signed_out');
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async sendAll() {
    while (this.queue.length) {
      if (this.status.state === 'conflict') return;
      const batch = this.queue.slice(0, 100);
      batch.forEach((c) => this.inFlight.add(c.id));
      this.status = { state: 'sending', count: this.queue.length };
      this.emit();
      let answer: SyncAnswer;
      try {
        answer = await this.deps.send(batch);
      } catch (e) {
        batch.forEach((c) => this.inFlight.delete(c.id));
        const signedOut = /not_signed_in|JWT|401|403/i.test(String((e as Error)?.message ?? e));
        this.status = { state: signedOut ? 'signed_out' : 'offline', count: this.queue.length };
        this.emit();
        return;
      }
      batch.forEach((c) => this.inFlight.delete(c.id));
      for (const r of answer.rejected) {
        const change = this.queue.find((c) => c.id === r.id);
        if (change) this.rejected.push({ change, reason: r.reason });
      }
      this.queue = settle(this.queue, answer);
      this.deps.save(this.queue);
      for (const fn of this.answerListeners) fn(answer);
      if (answer.conflict) {
        this.status = { state: 'conflict', count: this.queue.length, conflict: answer.conflict };
        this.emit();
        return;
      }
      const progressed = answer.done.length + answer.rejected.length > 0;
      this.status = this.queue.length ? { state: 'waiting', count: this.queue.length } : { state: 'saved' };
      this.emit();
      if (!progressed) return; // nothing moved: try again later rather than spin
    }
  }
}
