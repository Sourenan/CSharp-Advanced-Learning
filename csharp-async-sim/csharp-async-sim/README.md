# C# Sync/Async Visual Simulator (Event Engine + Scenario Scripts)

## What this is
A tiny, runnable HTML app that visualizes async/await behavior using a generic **event engine**.
You can:
- choose a scenario (I/O await, Task.Run CPU offload, ConfigureAwait(false), WhenAll)
- choose an environment (UI vs ASP.NET Core vs Console)
- Step / Play / Reset
- click any timeline step to jump

## How to run
1) Unzip the folder
2) Open `index.html` in a browser (Chrome/Edge recommended)
   - No build tools required
   - No server required

## How to add a scenario
Open `scenarios.js` and append a new object to `SCENARIOS`:
- id, title, code, events[]

Events are intentionally simple and extensible. V2 can add:
- deadlock_block
- lock_acquire/release
- threadpool_queue_len_change
- when_all_join
- etc.

## Notes on correctness
- For I/O awaits: the I/O is shown in the OS lane; no thread is blocked while waiting.
- For CPU offload: `Task.Run` queues work to the ThreadPool, and a worker executes it.
- Continuation target depends on environment and captureContext:
  - UI env: captured context resumes on UI, ConfigureAwait(false) resumes on ThreadPool
  - ASP.NET Core/Console: resumes on ThreadPool (no UI sync context)

Enjoy building on it.
