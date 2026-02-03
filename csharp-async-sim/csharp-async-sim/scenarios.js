/**
 * Scenario scripts (JSON-like objects).
 * Each scenario is just a list of timestamped events.
 * Add new scenarios by appending to SCENARIOS.
 */
const SCENARIOS = [
  {
    id: "io_await_readasync",
    title: "I/O: await stream.ReadAsync (no thread runs while waiting)",
    code: `async Task FooAsync(Stream stream)
{
    // UI/Request thread runs until the await
    var bytes = await stream.ReadAsync(buffer, 0, buffer.Length);
    // Continuation runs later
    Console.WriteLine(bytes);
}`,
    events: [
      { t: 0, type: "call", lane: "ui", method: "FooAsync" },
      { t: 1, type: "await", lane: "ui", method: "FooAsync", taskId: "t1", awaitable: "io", captureContext: true },
      { t: 2, type: "io_start", taskId: "t1", op: "stream.ReadAsync" },
      // method yields back to caller/event loop while I/O is pending
      { t: 3, type: "yield", lane: "ui", method: "FooAsync" },
      // I/O completes; continuation scheduled (target decided by environment + captureContext)
      { t: 4, type: "io_complete", taskId: "t1" },
      { t: 5, type: "schedule_continuation", taskId: "t1" },
      { t: 6, type: "resume", lane: "auto", method: "FooAsync", taskId: "t1" },
      { t: 7, type: "return", lane: "auto", method: "FooAsync" }
    ]
  },

  {
    id: "cpu_taskrun",
    title: "CPU: await Task.Run(() => Bar()) (ThreadPool worker runs Bar)",
    code: `async Task FooAsync()
{
    // current thread yields while worker runs CPU work
    await Task.Run(() => Bar()); // CPU-bound offload
    Console.WriteLine("Back after Bar");
}

void Bar()
{
    Thread.Sleep(2000); // simulate CPU work
}`,
    events: [
      { t: 0, type: "call", lane: "ui", method: "FooAsync" },
      { t: 1, type: "queue_tp", taskId: "t2", work: "Bar()" },
      { t: 2, type: "await", lane: "ui", method: "FooAsync", taskId: "t2", awaitable: "taskrun", captureContext: true },
      { t: 3, type: "yield", lane: "ui", method: "FooAsync" },
      { t: 4, type: "tp_start", lane: "tp", workerId: "W1", taskId: "t2", work: "Bar()" },
      { t: 5, type: "tp_complete", lane: "tp", workerId: "W1", taskId: "t2" },
      { t: 6, type: "schedule_continuation", taskId: "t2" },
      { t: 7, type: "resume", lane: "auto", method: "FooAsync", taskId: "t2" },
      { t: 8, type: "return", lane: "auto", method: "FooAsync" }
    ]
  },

  {
    id: "ui_context_capture_vs_false",
    title: "UI: ConfigureAwait(false) changes where continuation runs",
    code: `async Task FooAsync(Stream stream)
{
    // CaptureContext = false means: do NOT return to UI thread
    var bytes = await stream.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false);
    // In UI app: continuation runs on ThreadPool, not UI
    Console.WriteLine(bytes);
}`,
    events: [
      { t: 0, type: "call", lane: "ui", method: "FooAsync" },
      { t: 1, type: "await", lane: "ui", method: "FooAsync", taskId: "t3", awaitable: "io", captureContext: false },
      { t: 2, type: "io_start", taskId: "t3", op: "stream.ReadAsync" },
      { t: 3, type: "yield", lane: "ui", method: "FooAsync" },
      { t: 4, type: "io_complete", taskId: "t3" },
      { t: 5, type: "schedule_continuation", taskId: "t3" },
      { t: 6, type: "resume", lane: "auto", method: "FooAsync", taskId: "t3" },
      { t: 7, type: "return", lane: "auto", method: "FooAsync" }
    ]
  },

  {
    id: "whenall_fanout",
    title: "Task.WhenAll fan-out/fan-in (2 I/O tasks)",
    code: `async Task FooAsync()
{
    var tA = httpClient.GetAsync(urlA);
    var tB = httpClient.GetAsync(urlB);
    await Task.WhenAll(tA, tB);
    Console.WriteLine("Both done");
}`,
    events: [
      { t: 0, type: "call", lane: "ui", method: "FooAsync" },
      { t: 1, type: "await", lane: "ui", method: "FooAsync", taskId: "tA", awaitable: "io", captureContext: true },
      { t: 2, type: "io_start", taskId: "tA", op: "http.GetAsync(A)" },
      { t: 3, type: "await", lane: "ui", method: "FooAsync", taskId: "tB", awaitable: "io", captureContext: true },
      { t: 4, type: "io_start", taskId: "tB", op: "http.GetAsync(B)" },
      { t: 5, type: "yield", lane: "ui", method: "FooAsync" },

      { t: 6, type: "io_complete", taskId: "tA" },
      { t: 7, type: "io_complete", taskId: "tB" },

      // Fan-in: WhenAll completes after both are complete
      { t: 8, type: "schedule_continuation", taskId: "whenAll" },
      { t: 9, type: "resume", lane: "auto", method: "FooAsync", taskId: "whenAll" },
      { t: 10, type: "return", lane: "auto", method: "FooAsync" }
    ]
  }
];
