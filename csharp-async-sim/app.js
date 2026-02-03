/**
 * Wires UI controls to the engine and draws the lanes.
 */
(function () {
  const scenarioSelect = document.getElementById("scenarioSelect");
  const envSelect = document.getElementById("envSelect");
  const resetBtn = document.getElementById("resetBtn");
  const stepBtn = document.getElementById("stepBtn");
  const playBtn = document.getElementById("playBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const speedRange = document.getElementById("speedRange");
  const speedVal = document.getElementById("speedVal");

  const codeBlock = document.getElementById("codeBlock");
  const timeline = document.getElementById("timeline");
  const trace = document.getElementById("trace");
  const scenarioSummary = document.getElementById("scenarioSummary");
  const scenarioGoals = document.getElementById("scenarioGoals");
  const stepDetail = document.getElementById("stepDetail");

  const laneUI = document.getElementById("lane-ui");
  const laneIO = document.getElementById("lane-io");
  const laneTP = document.getElementById("lane-tp");

  const stepLabel = document.getElementById("stepLabel");
  const stepMax = document.getElementById("stepMax");
  const lastEvent = document.getElementById("lastEvent");

  let currentScenario = null;
  let env = envSelect.value;
  let rules = SimEngine.defaultRules(env);
  let initialState = SimEngine.createInitialState(env);
  let state = initialState;
  let idx = -1;
  let timer = null;
  let speed = parseFloat(speedRange.value);

  function init() {
    // Populate scenarios
    for (const s of SCENARIOS) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.title;
      scenarioSelect.appendChild(opt);
    }

    scenarioSelect.value = SCENARIOS[0].id;
    loadScenario(SCENARIOS[0].id);

    scenarioSelect.addEventListener("change", () => loadScenario(scenarioSelect.value));
    envSelect.addEventListener("change", () => {
      env = envSelect.value;
      rules = SimEngine.defaultRules(env);
      reset();
    });

    resetBtn.addEventListener("click", () => reset());
    stepBtn.addEventListener("click", () => step());
    playBtn.addEventListener("click", () => play());
    pauseBtn.addEventListener("click", () => pause());

    speedRange.addEventListener("input", () => {
      speed = parseFloat(speedRange.value);
      speedVal.textContent = speed + "x";
      if (timer) { pause(); play(); }
    });

    render();
  }

  function loadScenario(id) {
    currentScenario = SCENARIOS.find(s => s.id === id);
    reset();
    codeBlock.textContent = currentScenario.code;
    updateScenarioGuide();
    buildTimeline();
    render();
  }

  function reset() {
    pause();
    initialState = SimEngine.createInitialState(env);
    state = initialState;
    idx = -1;
    buildTimeline();
    render();
  }

  function step() {
    if (!currentScenario) return;
    if (idx + 1 >= currentScenario.events.length) return;

    idx++;
    const e = currentScenario.events[idx];

    // Some events use lane="auto"; engine resolves lane at resume/return time.
    state = SimEngine.applyEvent(state, e, rules);

    render();
    highlightTimeline();
  }

  function play() {
    if (!currentScenario) return;
    playBtn.disabled = true;
    pauseBtn.disabled = false;

    const intervalMs = Math.max(250, 900 / speed);
    timer = setInterval(() => {
      if (idx + 1 >= currentScenario.events.length) {
        pause();
        return;
      }
      step();
    }, intervalMs);
  }

  function pause() {
    playBtn.disabled = false;
    pauseBtn.disabled = true;
    if (timer) clearInterval(timer);
    timer = null;
  }

  function buildTimeline() {
    timeline.innerHTML = "";
    if (!currentScenario) return;
    stepMax.textContent = currentScenario.events.length.toString();
    stepLabel.textContent = Math.max(0, idx + 1).toString();

    currentScenario.events.forEach((e, i) => {
      const div = document.createElement("div");
      div.className = "item";
      div.dataset.index = i.toString();
      div.textContent = formatEvent(e);
      div.addEventListener("click", () => jumpTo(i));
      timeline.appendChild(div);
    });
    highlightTimeline();
  }

  function jumpTo(targetIdx) {
    pause();
    initialState = SimEngine.createInitialState(env);
    state = initialState;
    idx = -1;
    for (let i = 0; i <= targetIdx; i++) {
      idx = i;
      state = SimEngine.applyEvent(state, currentScenario.events[i], rules);
    }
    render();
    highlightTimeline();
  }

  function highlightTimeline() {
    const children = [...timeline.children];
    children.forEach(c => c.classList.remove("active"));
    if (idx >= 0 && idx < children.length) children[idx].classList.add("active");
    stepLabel.textContent = Math.max(0, idx + 1).toString();
  }

  function formatEvent(e) {
    const lane = e.lane ? ` lane=${e.lane}` : "";
    const method = e.method ? ` method=${e.method}` : "";
    const task = e.taskId ? ` task=${e.taskId}` : "";
    const extra = e.work ? ` work=${e.work}` : (e.op ? ` op=${e.op}` : "");
    return `${e.type}${lane}${method}${task}${extra ? " " + extra : ""}`;
  }

  function render() {
    // update status
    const e = (idx >= 0 && currentScenario) ? currentScenario.events[idx] : null;
    lastEvent.textContent = e ? formatEvent(e) : "—";
    stepLabel.textContent = Math.max(0, idx + 1).toString();
    stepMax.textContent = currentScenario ? currentScenario.events.length.toString() : "0";
    updateStepDetail(e);

    // trace (simple)
    trace.textContent = buildTrace(state, e);

    // lanes
    renderLane(laneUI, "ui", state);
    renderLane(laneIO, "io", state);
    renderLane(laneTP, "tp", state);

    // animate a box depending on the last event
    animateFromEvent(e);
  }

  function updateScenarioGuide() {
    if (!currentScenario) return;
    scenarioSummary.textContent = currentScenario.summary || "";
    scenarioGoals.innerHTML = "";
    (currentScenario.goals || []).forEach(goal => {
      const li = document.createElement("li");
      li.textContent = goal;
      scenarioGoals.appendChild(li);
    });
    updateStepDetail(null);
  }

  function updateStepDetail(event) {
    if (!stepDetail) return;
    if (!event || !event.note) {
      stepDetail.textContent = "Select a step to see why it matters.";
      return;
    }
    stepDetail.textContent = event.note;
  }

  function buildTrace(state, last) {
    const lines = [];
    lines.push(`Environment: ${state.env}`);
    if (last) lines.push(`Last: ${formatEvent(last)}`);
    lines.push("");
    lines.push("Stacks:");
    for (const lid of ["ui","io","tp"]) {
      const st = state.lanes[lid].stack.join(" -> ") || "(empty)";
      lines.push(`  ${lid}: ${st}`);
    }
    lines.push("");
    lines.push("Tasks:");
    const tasks = Object.values(state.tasks);
    if (!tasks.length) lines.push("  (none)");
    tasks.forEach(t => {
      lines.push(`  ${t.id}: state=${t.state} label=${t.label}${t.continuationTarget ? " cont=" + t.continuationTarget : ""}`);
    });
    return lines.join("\n");
  }

  function renderLane(container, laneId, state) {
    container.innerHTML = "";
    // stack pills
    const stackDiv = document.createElement("div");
    stackDiv.className = "stack";
    const lane = state.lanes[laneId];
    lane.stack.forEach(m => {
      const f = document.createElement("div");
      f.className = "frame" + (lane.suspended && lane.suspended.has(m) ? " suspended" : "");
      f.textContent = m + (lane.suspended && lane.suspended.has(m) ? " (awaiting)" : "");
      stackDiv.appendChild(f);
    });
    container.appendChild(stackDiv);

    // task boxes on lane
    // Only show tasks relevant to the lane for simplicity
    const tasks = Object.values(state.tasks);
    tasks.forEach((t, i) => {
      const b = document.createElement("div");
      b.className = "box " + laneClassForTask(t, laneId);
      b.textContent = labelForTask(t, laneId);
      b.style.left = calcLeftForTask(t, laneId);
      b.style.opacity = shouldShowTaskOnLane(t, laneId) ? "1" : "0";
      container.appendChild(b);
    });
  }

  function shouldShowTaskOnLane(task, laneId) {
    if (laneId === "io") return task.state === "running_io";
    if (laneId === "tp") return task.state === "queued_tp" || task.state === "running_tp" || (task.continuationTarget === "tp" && task.state === "completed");
    if (laneId === "ui") return (task.continuationTarget === "ui" && task.state === "completed") || task.state === "awaited";
    return false;
  }

  function laneClassForTask(task, laneId) {
    if (laneId === "io") return "io";
    if (laneId === "tp") return (task.state === "queued_tp" || task.state === "running_tp") ? "tp" : "cont";
    if (laneId === "ui") return task.state === "awaited" ? "ui" : "cont";
    return "ui";
  }

  function labelForTask(task, laneId) {
    if (laneId === "io") return task.label;
    if (laneId === "tp" && (task.state === "queued_tp" || task.state === "running_tp")) return task.label;
    if (task.continuationTarget) return "Continuation";
    return task.label;
  }

  function calcLeftForTask(task, laneId) {
    // simple positions
    if (laneId === "io") return task.state === "running_io" ? "40%" : "12px";
    if (laneId === "tp") {
      if (task.state === "queued_tp") return "12px";
      if (task.state === "running_tp") return "40%";
      return "70%";
    }
    if (laneId === "ui") {
      if (task.state === "awaited") return "40%";
      return "70%";
    }
    return "12px";
  }

  function animateFromEvent(e) {
    // For v1, animation is handled via CSS transitions as boxes re-render.
    // This function can be expanded later for richer per-event visuals (arrows, highlights).
  }

  init();
})();
