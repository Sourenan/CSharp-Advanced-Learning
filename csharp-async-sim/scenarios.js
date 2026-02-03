/**
 * Scenario scripts (JSON-like objects).
 * Each scenario is just a list of timestamped events.
 * Add new scenarios by appending to SCENARIOS.
 */
const SCENARIOS = [
  {
    id: "io_await_readasync",
    title: "I/O: await stream.ReadAsync (no thread runs while waiting)",
    summary: "Visualizes a true async I/O await: the UI/request thread yields while the OS completes the read, then the continuation resumes later.",
    goals: [
      "Show that no managed thread is blocked during I/O.",
      "Highlight the moment the continuation target is chosen.",
      "Compare UI vs server environments for resuming work."
    ],
    code: `async Task FooAsync(Stream stream)
{
    // UI/Request thread runs until the await
    var bytes = await stream.ReadAsync(buffer, 0, buffer.Length);
    // Continuation runs later
    Console.WriteLine(bytes);
}`,
    events: [
      { t: 0, type: "call", lane: "ui", method: "FooAsync", note: "FooAsync begins on the UI/request thread." },
      { t: 1, type: "await", lane: "ui", method: "FooAsync", taskId: "t1", awaitable: "io", captureContext: true, note: "await registers a continuation and the method suspends." },
      { t: 2, type: "io_start", taskId: "t1", op: "stream.ReadAsync", note: "The OS starts the I/O operation; no managed thread is busy." },
      // method yields back to caller/event loop while I/O is pending
      { t: 3, type: "yield", lane: "ui", method: "FooAsync", note: "Control returns to the caller or event loop." },
      // I/O completes; continuation scheduled (target decided by environment + captureContext)
      { t: 4, type: "io_complete", taskId: "t1", note: "I/O completes and the task can finish." },
      { t: 5, type: "schedule_continuation", taskId: "t1", note: "The runtime picks where to resume based on the captured context." },
      { t: 6, type: "resume", lane: "auto", method: "FooAsync", taskId: "t1", note: "Continuation executes on the chosen lane." },
      { t: 7, type: "return", lane: "auto", method: "FooAsync", note: "FooAsync completes after the continuation." }
    ]
  },

  {
    id: "cpu_taskrun",
    title: "CPU: await Task.Run(() => Bar()) (ThreadPool worker runs Bar)",
    summary: "Shows CPU-bound work offloaded to a ThreadPool worker while the caller awaits completion.",
    goals: [
      "Make the ThreadPool queue visible.",
      "Show that the UI/request thread is free while CPU work runs.",
      "Explain where the continuation resumes."
    ],
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
      { t: 0, type: "call", lane: "ui", method: "FooAsync", note: "FooAsync starts on the current thread." },
      { t: 1, type: "queue_tp", taskId: "t2", work: "Bar()", note: "Task.Run queues Bar() to the ThreadPool." },
      { t: 2, type: "await", lane: "ui", method: "FooAsync", taskId: "t2", awaitable: "taskrun", captureContext: true, note: "FooAsync awaits the Task.Run task." },
      { t: 3, type: "yield", lane: "ui", method: "FooAsync", note: "The awaiting thread is free to do other work." },
      { t: 4, type: "tp_start", lane: "tp", workerId: "W1", taskId: "t2", work: "Bar()", note: "A ThreadPool worker starts executing Bar()." },
      { t: 5, type: "tp_complete", lane: "tp", workerId: "W1", taskId: "t2", note: "CPU work finishes on the worker." },
      { t: 6, type: "schedule_continuation", taskId: "t2", note: "Continuation target is selected based on environment/context." },
      { t: 7, type: "resume", lane: "auto", method: "FooAsync", taskId: "t2", note: "FooAsync resumes after Bar() finishes." },
      { t: 8, type: "return", lane: "auto", method: "FooAsync", note: "FooAsync completes." }
    ]
  },

  {
    id: "ui_context_capture_vs_false",
    title: "UI: ConfigureAwait(false) changes where continuation runs",
    summary: "Demonstrates how ConfigureAwait(false) avoids resuming on the UI thread.",
    goals: [
      "Contrast captured vs non-captured contexts.",
      "Show the continuation running on the ThreadPool.",
      "Reinforce the meaning of ConfigureAwait(false)."
    ],
    code: `async Task FooAsync(Stream stream)
{
    // CaptureContext = false means: do NOT return to UI thread
    var bytes = await stream.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false);
    // In UI app: continuation runs on ThreadPool, not UI
    Console.WriteLine(bytes);
}`,
    events: [
      { t: 0, type: "call", lane: "ui", method: "FooAsync", note: "FooAsync begins on the UI thread." },
      { t: 1, type: "await", lane: "ui", method: "FooAsync", taskId: "t3", awaitable: "io", captureContext: false, note: "ConfigureAwait(false) says: do not capture the UI context." },
      { t: 2, type: "io_start", taskId: "t3", op: "stream.ReadAsync", note: "The OS performs the I/O work." },
      { t: 3, type: "yield", lane: "ui", method: "FooAsync", note: "UI thread is free while I/O is pending." },
      { t: 4, type: "io_complete", taskId: "t3", note: "I/O finishes and completion is signaled." },
      { t: 5, type: "schedule_continuation", taskId: "t3", note: "Continuation is scheduled to the ThreadPool because context wasn't captured." },
      { t: 6, type: "resume", lane: "auto", method: "FooAsync", taskId: "t3", note: "Continuation runs on the ThreadPool." },
      { t: 7, type: "return", lane: "auto", method: "FooAsync", note: "FooAsync returns after writing the result." }
    ]
  },

  {
    id: "whenall_fanout",
    title: "Task.WhenAll fan-out/fan-in (2 I/O tasks)",
    summary: "Shows two concurrent I/O tasks and how Task.WhenAll resumes after both complete.",
    goals: [
      "Visualize fan-out of multiple I/O operations.",
      "Show that continuations wait for all tasks to finish.",
      "Highlight how the join point resumes."
    ],
    code: `async Task FooAsync()
{
    var tA = httpClient.GetAsync(urlA);
    var tB = httpClient.GetAsync(urlB);
    await Task.WhenAll(tA, tB);
    Console.WriteLine("Both done");
}`,
    events: [
      { t: 0, type: "call", lane: "ui", method: "FooAsync", note: "FooAsync starts and kicks off two requests." },
      { t: 1, type: "await", lane: "ui", method: "FooAsync", taskId: "tA", awaitable: "io", captureContext: true, note: "First HTTP call begins and is awaited." },
      { t: 2, type: "io_start", taskId: "tA", op: "http.GetAsync(A)", note: "Request A is in flight." },
      { t: 3, type: "await", lane: "ui", method: "FooAsync", taskId: "tB", awaitable: "io", captureContext: true, note: "Second HTTP call begins and is awaited." },
      { t: 4, type: "io_start", taskId: "tB", op: "http.GetAsync(B)", note: "Request B is in flight." },
      { t: 5, type: "yield", lane: "ui", method: "FooAsync", note: "Caller thread is free while both requests run." },

      { t: 6, type: "io_complete", taskId: "tA", note: "Request A completes." },
      { t: 7, type: "io_complete", taskId: "tB", note: "Request B completes." },

      // Fan-in: WhenAll completes after both are complete
      { t: 8, type: "schedule_continuation", taskId: "whenAll", note: "WhenAll completes once every task is done." },
      { t: 9, type: "resume", lane: "auto", method: "FooAsync", taskId: "whenAll", note: "Continuation resumes after the fan-in join." },
      { t: 10, type: "return", lane: "auto", method: "FooAsync", note: "FooAsync finishes after both results are available." }
    ]
  }
];
