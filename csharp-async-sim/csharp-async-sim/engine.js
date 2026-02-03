/**
 * Generic event engine for the simulator.
 * Applies events to a small world-state and exposes helpers for rendering.
 */

(function () {
  const LaneIds = ["ui", "tp", "io", "caller"];

  function defaultRules(env) {
    // In UI apps (WPF/WinForms): captured context => resume on UI thread.
    // In ASP.NET Core and Console: no special sync context, resume on ThreadPool.
    return {
      continuationTarget: (captureContext) => {
        if (env === "ui") return captureContext ? "ui" : "tp";
        return "tp";
      }
    };
  }

  function createInitialState(env) {
    const lanes = {};
    LaneIds.forEach(id => lanes[id] = { id, stack: [], suspended: new Set() });
    return {
      env,
      lanes,
      tasks: {}, // taskId -> {state,label,continuationTarget}
      lastEvent: null
    };
  }

  function ensureTask(state, taskId, label) {
    if (!state.tasks[taskId]) {
      state.tasks[taskId] = { id: taskId, state: "created", label: label || taskId, continuationTarget: null };
    }
    if (label) state.tasks[taskId].label = label;
  }

  function applyEvent(state, e, rules) {
    // clone-ish (simple deep clone for small state)
    const s = JSON.parse(JSON.stringify(state));
    // restore Sets (JSON loses them)
    for (const lid of Object.keys(s.lanes)) {
      s.lanes[lid].suspended = new Set(state.lanes[lid].suspended || []);
    }

    s.lastEvent = e;

    const lane = (e.lane === "auto") ? null : e.lane;

    switch (e.type) {
      case "call":
        s.lanes[e.lane].stack.push(e.method);
        return s;

      case "return": {
        const targetLane = (e.lane === "auto") ? inferLaneFromTask(s, e.taskId) : e.lane;
        if (!targetLane) return s;
        const st = s.lanes[targetLane].stack;
        if (st.length && st[st.length - 1] === e.method) st.pop();
        // also clear suspended marker if any
        s.lanes[targetLane].suspended.delete(e.method);
        return s;
      }

      case "await": {
        ensureTask(s, e.taskId, e.awaitable);
        s.tasks[e.taskId].state = "awaited";
        // mark method as suspended (visual)
        s.lanes[e.lane].suspended.add(e.method);
        // store captureContext on task for later schedule step
        s.tasks[e.taskId].captureContext = (e.captureContext !== undefined) ? !!e.captureContext : null;
        return s;
      }

      case "yield":
        // purely visual; no stack pop (your method has returned to caller in reality)
        // Keep stack but show suspended.
        return s;

      case "io_start":
        ensureTask(s, e.taskId, e.op);
        s.tasks[e.taskId].state = "running_io";
        s.tasks[e.taskId].label = e.op;
        return s;

      case "io_complete":
        ensureTask(s, e.taskId);
        s.tasks[e.taskId].state = "completed";
        return s;

      case "queue_tp":
        ensureTask(s, e.taskId, e.work);
        s.tasks[e.taskId].state = "queued_tp";
        s.tasks[e.taskId].label = e.work;
        return s;

      case "tp_start":
        ensureTask(s, e.taskId, e.work);
        s.tasks[e.taskId].state = "running_tp";
        s.tasks[e.taskId].workerId = e.workerId;
        return s;

      case "tp_complete":
        ensureTask(s, e.taskId);
        s.tasks[e.taskId].state = "completed";
        return s;

      case "schedule_continuation": {
        // determine which task's continuation we're scheduling
        const taskId = e.taskId;
        ensureTask(s, taskId, taskId);
        const capture = (s.tasks[taskId].captureContext !== null && s.tasks[taskId].captureContext !== undefined)
          ? s.tasks[taskId].captureContext
          : (s.env === "ui"); // default capture in UI
        const target = rules.continuationTarget(!!capture);
        s.tasks[taskId].continuationTarget = target;
        return s;
      }

      case "resume": {
        // lane may be auto: resolve from task continuationTarget
        let targetLane = e.lane;
        if (targetLane === "auto") {
          const t = s.tasks[e.taskId];
          targetLane = (t && t.continuationTarget) ? t.continuationTarget : (s.env === "ui" ? "ui" : "tp");
        }
        // resume by un-suspending and ensuring method exists on stack (if missing, push)
        s.lanes[targetLane].suspended.delete(e.method);
        const st = s.lanes[targetLane].stack;
        if (!st.length || st[st.length - 1] !== e.method) st.push(e.method);
        return s;
      }

      default:
        return s;
    }
  }

  function inferLaneFromTask(state, taskId) {
    if (!taskId) return null;
    const t = state.tasks[taskId];
    if (!t) return null;
    return t.continuationTarget || (state.env === "ui" ? "ui" : "tp");
  }

  // Export
  window.SimEngine = {
    createInitialState,
    defaultRules,
    applyEvent,
  };
})();
