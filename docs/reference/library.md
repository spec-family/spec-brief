# As a library

The package exports the engine the CLI runs, for a harness or an orchestrator that asks spec-brief its questions without starting a process.

```ts
import { BriefEngine } from '@spec-family/spec-brief';

const engine = await BriefEngine.open({ cwd: process.cwd() });
const findings = await engine.lint();
const ready = engine.ready();                        // what can run now
const { report } = await engine.collisions();        // who collides with whom
const { schedule } = await engine.schedule();        // the waves, computed
const plan = await engine.planArchive('012', { commit: 'HEAD', pr: 41 });
if (plan.blocking.length === 0) await engine.apply(plan);
```

Everything below the engine is a pure function of text: `parseBrief`, `lint`, `collisions`, `meet`, `globWitness`, `planArchive`. `MemoryFileSystem` runs an engine over files that were never written, which is how a harness can ask what archiving a brief would do.

`parseGlob`, `matchGlob`, `intersectGlobs` and `globBase` keep their 0.1 signatures as a compatibility layer over the spec-core engine. They follow its dialect: a literal is read as a file unless `parseGlob` is told otherwise (`{ literal: 'directory' | 'either' | (path) => ... }`, where `readingIn(files)` reads it from a tree), and `intersectGlobs` throws where `globWitness` would answer `undecided`.
