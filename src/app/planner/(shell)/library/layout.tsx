import { Tabs } from '../shell';

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="muted">Your reusable building blocks. Editing here changes the default everywhere it is used.</div>
      <Tabs tabs={[['/planner/library/exercises', 'Exercises'], ['/planner/library/workouts', 'Workouts'], ['/planner/library/campaigns', 'Campaigns']]} label="Library" />
      {children}
    </>
  );
}
