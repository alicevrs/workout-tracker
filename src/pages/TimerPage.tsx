import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BlockEditor } from '../components/BlockEditor';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/ui';
import { db } from '../db/db';
import { useProfile } from '../db/repo';
import type { Block, BlockFormat } from '../db/types';
import { formatDuration } from '../lib/dates';
import { describeBlock, estimateBlockSeconds, FORMAT_INFO, newBlock } from '../lib/program';
import { blockToPerformed, createSession } from '../lib/session';
import { timerAudio } from '../lib/timer/audio';

const QUICK: BlockFormat[] = ['tabata', 'amrap', 'emom', 'for_time', 'intervals', 'timed_sets'];

export default function TimerPage() {
  const navigate = useNavigate();
  const profile = useProfile();
  const [block, setBlock] = useState<Block>(() => newBlock('tabata', profile.defaultPrepSec));
  const programs = useLiveQuery(() => db.programs.toArray(), []);
  const active = useLiveQuery(() => db.sessions.where('status').equals('in_progress').toArray(), []);

  const start = async () => {
    timerAudio.unlock(); // inside the tap, so iOS allows sound
    const s = createSession({ title: `${FORMAT_INFO[block.format].label} timer` });
    s.blocks = [blockToPerformed(structuredClone(block))];
    await db.sessions.add(s);
    navigate(`/workout/${s.id}?run=all`);
  };

  return (
    <div className="page">
      <PageHeader title="Timer" subtitle="Quick timers create a logged workout" />
      <div className="grid two">
        <section className="card">
          <h2 className="mb">Quick timer</h2>
          <div className="scroll-x mb" role="group" aria-label="Timer format">
            {QUICK.map((f) => (
              <button key={f} className="chip" aria-pressed={block.format === f} onClick={() => setBlock(newBlock(f, profile.defaultPrepSec))}>
                {FORMAT_INFO[f].label}
              </button>
            ))}
          </div>
          <BlockEditor block={block} onChange={setBlock} />
          <button className="btn primary block mt" style={{ minHeight: 60 }} onClick={start} disabled={block.format === 'timed_sets' && block.entries.length === 0}>
            <Icon name="play" /> Start {FORMAT_INFO[block.format].label} · {describeBlock(block)}
            {estimateBlockSeconds(block) > 0 && block.format !== 'for_time' ? ` · ${formatDuration(estimateBlockSeconds(block) + block.timer.prepSec)}` : ''}
          </button>
        </section>

        <section className="card">
          <h2 className="mb">From a program</h2>
          {active && active.length > 0 && (
            <div className="mb">
              {active.map((s) => (
                <Link key={s.id} to={`/workout/${s.id}`} className="row" style={{ minHeight: 48 }}>
                  <Icon name="play" /> <span className="grow">Resume {s.title}</span>
                </Link>
              ))}
            </div>
          )}
          {programs?.length ? (
            programs.flatMap((p) =>
              p.days.map((d) => (
                <div key={d.id} className="row" style={{ minHeight: 52 }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <strong>{d.name}</strong> <span className="small muted">· {p.name}</span>
                    <div className="small faint ellipsis">{d.blocks.map((b) => FORMAT_INFO[b.format].short).join(' + ') || 'No blocks'}</div>
                  </div>
                  <button
                    className="btn small"
                    disabled={!d.blocks.length}
                    onClick={async () => {
                      timerAudio.unlock();
                      const s = createSession({ program: p, day: d });
                      await db.sessions.add(s);
                      navigate(`/workout/${s.id}?run=all`);
                    }}
                  >
                    <Icon name="timer" /> Run
                  </button>
                </div>
              )),
            )
          ) : (
            <p className="small muted">
              No programs yet. <Link to="/programs">Create one</Link> to run its blocks back to back.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
