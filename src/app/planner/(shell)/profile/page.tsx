'use client';
import Link from 'next/link';
import { IntakeForm, useIntake } from '@/components/coach-intake-form';
import { Collapsible } from '@/components/collapsible';
import { intakeProgress } from '@/rules/coach-intake';
import { GymsSection } from '@/components/gym-editor';

// Profile and gyms (spec Section 5): the coach intake's answers, editable, and
// the gym equipment lists. The same intake as on Coach setup.
export default function Profile() {
  const intake = useIntake();
  return (
    <>
      <div className="muted">What your coach knows about you, and the equipment in your gyms. Your coach reads this every time. New to this? <Link href="/planner/coach-setup">Coach setup</Link> walks through it in order.</div>
      <h2>About you</h2>
      <div className="pbox">
        <Collapsible title="Your answers" summary={intake.data ? `${intakeProgress(intake.data).answered} of ${intakeProgress(intake.data).total} answered` : 'Loading…'}>
          <IntakeForm intake={intake} />
        </Collapsible>
      </div>
      <h2>Gyms and equipment</h2>
      <div className="pbox"><GymsSection /></div>
    </>
  );
}
