let currentStep = 0;
let choices = [];
let interactionLocked = false;
let currentPosition = { x: 120, y: 260 };
let activeChoices = null;
let activeStemGroup = null;
let isBallDragging = false;
let dragProgress = 0;
let dragChoice = null;
let choiceHistory = [];
let dragStartClientX = null;
let dragLatestClientX = null;
let labelPathCounter = 0;
let restingDragState = null;

const progressText = document.getElementById("progress");
const promptText = document.getElementById("prompt");
const viewport = document.getElementById("journey-viewport");
const world = document.getElementById("journey-world");
const svg = document.getElementById("journey-svg");
const activeGroup = document.getElementById("active-group");
const revealedGroup = document.getElementById("revealed-group");
const ball = document.getElementById("ball");
const startDot = document.getElementById("start-dot");
const buttonA = document.getElementById("choice-a");
const buttonB = document.getElementById("choice-b");
const buttonC = document.getElementById("choice-c");
const restartButton = document.getElementById("restart-btn");
const resultPanel = document.getElementById("result-panel");
const resultSequence = document.getElementById("result-sequence");
const resultTitle = document.getElementById("result-title");
const resultDescription = document.getElementById("result-description");

const SVG_NS = "http://www.w3.org/2000/svg";
const WORLD_WIDTH = 4600;
const FORK_INTERACTION = {
  commitProgress: 0.94,
  undoProgressMax: 0.18,
  undoDragPx: 70,
  verticalBiasPx: 22,
  verticalStrongBiasPx: 58
};

const stepConfigs = [
  { dx: 1050, offsets: { A: -188, B: -20, C: 160 } },
  { dx: 980, offsets: { A: -170, B: 8, C: 178 } },
  { dx: 960, offsets: { A: -158, B: 0, C: 168 } },
  { dx: 930, offsets: { A: -142, B: 16, C: 156 } }
];

const totalDecisionSteps = stepConfigs.length;

const roomChoiceLabels = [
  { A: "Sun Hall", B: "Gallery Threshold", C: "Fireplace Nook" },
  { A: "Studio Landing", B: "Mirror Landing", C: "Library Turn" },
  { A: "Glass Atrium", B: "Cedar Corridor", C: "Garden Passage" },
  { A: "Tower Stair", B: "Music Alcove", C: "Courtyard Bridge" }
];

const finalSpaces = [
  { title: "Sky Map Room", vibe: "clear-sighted and future focused" },
  { title: "Pivot Lounge", vibe: "adaptive and intuitive" },
  { title: "Workshop Gallery", vibe: "experimental and hands-on" },
  { title: "Story Parlor", vibe: "narrative rich and human" },
  { title: "Strategy Study", vibe: "calm and deliberate" },
  { title: "Pattern Observatory", vibe: "analytical and connective" },
  { title: "Explorer Courtyard", vibe: "curious and grounded" },
  { title: "Momentum Loft", vibe: "bold and kinetic" },
  { title: "Lantern Conservatory", vibe: "gentle and reflective" },
  { title: "Blueprint Den", vibe: "structured and inventive" },
  { title: "Tide Listening Room", vibe: "attentive and steady" },
  { title: "Northern Window Suite", vibe: "open-minded and bright" }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function reducedMotionEnabled() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setWorldTransitionEnabled(enabled) {
  world.style.transition = enabled ? "" : "none";
}

function setButtonsDisabled(disabled) {
  buttonA.disabled = disabled;
  buttonB.disabled = disabled;
  buttonC.disabled = disabled;
}

function clearActiveChoices() {
  activeGroup.replaceChildren();
  activeChoices = null;
  activeStemGroup = null;
}

function createSvgPath(className, d) {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("class", className);
  path.setAttribute("d", d);
  return path;
}

function createSvgText(label, x, y) {
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("class", "track-label");
  text.setAttribute("x", x.toFixed(0));
  text.setAttribute("y", y.toFixed(0));
  text.textContent = label;
  return text;
}

function createPathLabel(label, pathId, startOffset = "60%") {
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("class", "track-label");

  const textPath = document.createElementNS(SVG_NS, "textPath");
  textPath.setAttribute("href", `#${pathId}`);
  textPath.setAttribute("startOffset", startOffset);
  textPath.textContent = label;

  text.append(textPath);
  return text;
}

function setBallPosition(point) {
  ball.setAttribute("cx", point.x.toFixed(2));
  ball.setAttribute("cy", point.y.toFixed(2));
}

function clientToSvgPoint(clientX, clientY) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function panToPoint(point) {
  const viewportWidth = viewport.clientWidth;
  const targetX = point.x - viewportWidth * 0.33;
  const maxX = WORLD_WIDTH - viewportWidth;
  const clamped = clamp(targetX, 0, maxX);
  world.style.transform = `translateX(${-clamped}px)`;
}

function updateProgress() {
  if (currentStep < totalDecisionSteps) {
    progressText.textContent = `Step ${currentStep + 1} of ${totalDecisionSteps}`;
    promptText.textContent = currentStep === 0
      ? "You are at the front door."
      : "Choose which room to enter next.";

    const labels = roomChoiceLabels[currentStep];
    buttonA.textContent = `Room A: ${labels.A}`;
    buttonB.textContent = `Room B: ${labels.B}`;
    buttonC.textContent = `Room C: ${labels.C}`;
  } else {
    progressText.textContent = "Complete";
    promptText.textContent = "You arrive at your space.";
    buttonA.textContent = "Room A";
    buttonB.textContent = "Room B";
    buttonC.textContent = "Room C";
  }
}

function buildStepChoices(stepIndex) {
  const config = stepConfigs[stepIndex];
  const x0 = currentPosition.x;
  const y0 = currentPosition.y;
  const splitX = x0 + config.dx * 0.28;
  const splitY = y0 + (stepIndex % 2 === 0 ? -8 : 8);
  const x1 = x0 + config.dx;

  const stemD = `M ${x0} ${y0} C ${x0 + config.dx * 0.12} ${y0}, ${x0 + config.dx * 0.22} ${splitY}, ${splitX} ${splitY}`;
  const stemGroup = document.createElementNS(SVG_NS, "g");
  stemGroup.setAttribute("class", "fork-stem");
  stemGroup.append(createSvgPath("track-outline", stemD), createSvgPath("track-fill", stemD));
  activeGroup.append(stemGroup);
  activeStemGroup = stemGroup;

  const options = {};
  Object.keys(config.offsets).forEach((choiceKey) => {
    const offset = config.offsets[choiceKey];
    const endY = clamp(y0 + offset, 70, 440);
    const c1x = splitX + config.dx * 0.11;
    const c2x = splitX + config.dx * 0.41;
    const c1y = splitY + offset * 0.44;
    const c2y = splitY + offset * 0.93;
    const branchD = `M ${splitX} ${splitY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x1} ${endY}`;
    const travelD = `${stemD} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x1} ${endY}`;

    const optionGroup = document.createElementNS(SVG_NS, "g");
    optionGroup.setAttribute("data-choice", choiceKey);

    const outline = createSvgPath("track-outline", branchD);
    const fill = createSvgPath("track-fill", branchD);
    const labelPathId = `branch-label-path-${labelPathCounter}`;
    labelPathCounter += 1;
    fill.setAttribute("id", labelPathId);
    const travel = createSvgPath("travel-path", travelD);
    const roomLabel = roomChoiceLabels[stepIndex][choiceKey];
    const labelOffset = choiceKey === "A" ? "58%" : choiceKey === "B" ? "60%" : "62%";
    const label = createPathLabel(roomLabel, labelPathId, labelOffset);

    optionGroup.append(outline, fill, label, travel);
    activeGroup.append(optionGroup);

    options[choiceKey] = {
      end: { x: x1, y: endY },
      group: optionGroup,
      travelPath: travel
    };
  });

  activeChoices = options;
}

function animateBallAlongPath(pathElement, options = {}) {
  const { reverse = false, duration = 920 } = options;

  return new Promise((resolve) => {
    if (reducedMotionEnabled()) {
      const total = pathElement.getTotalLength();
      const edgePoint = pathElement.getPointAtLength(reverse ? 0 : total);
      setBallPosition(edgePoint);
      resolve();
      return;
    }

    setWorldTransitionEnabled(false);

    const pathLength = pathElement.getTotalLength();
    const start = performance.now();
    const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    function frame(now) {
      const raw = Math.min((now - start) / duration, 1);
      const eased = easeInOut(raw);
      const travelProgress = reverse ? 1 - eased : eased;
      const point = pathElement.getPointAtLength(pathLength * travelProgress);
      setBallPosition(point);
      panToPoint(point);

      if (raw < 1) {
        requestAnimationFrame(frame);
      } else {
        setWorldTransitionEnabled(true);
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}

function moveSelectedPathToRevealed(choice) {
  const selected = activeChoices[choice];
  const stemToKeep = activeStemGroup;

  if (stemToKeep) {
    revealedGroup.append(stemToKeep);
  }

  Object.keys(activeChoices)
    .filter((choiceKey) => choiceKey !== choice)
    .forEach((choiceKey) => {
      const otherGroup = activeChoices[choiceKey].group;
      otherGroup.classList.add("hidden-option");
      otherGroup.remove();
    });

  selected.group.classList.add("selected-option");
  revealedGroup.append(selected.group);

  return {
    stemGroup: stemToKeep,
    selectedGroup: selected.group
  };
}

function sequenceHash(sequence) {
  let hash = 0;
  for (let i = 0; i < sequence.length; i += 1) {
    hash = (hash * 37 + sequence.charCodeAt(i) * (i + 1)) % 100000;
  }
  return hash;
}

function buildOutcomeDescription(sequence, space) {
  const counts = { A: 0, B: 0, C: 0 };
  sequence.split("").forEach((ch) => {
    counts[ch] += 1;
  });

  let traitLine = "You balance instinct, reflection, and experimentation across the house.";
  if (counts.A > counts.B && counts.A > counts.C) {
    traitLine = "You favor high-view choices and future-focused moves, shaping clear direction from every fork.";
  } else if (counts.B > counts.A && counts.B > counts.C) {
    traitLine = "You choose reflective, centered rooms, turning complexity into calm and coherent judgment.";
  } else if (counts.C > counts.A && counts.C > counts.B) {
    traitLine = "You follow adventurous turns and energetic routes, converting uncertainty into momentum.";
  }

  return `You arrive at your space. ${space.title} feels ${space.vibe}. ${traitLine}`;
}

function showResult() {
  const sequence = choices.join("");
  const index = sequenceHash(sequence) % finalSpaces.length;
  const chosenSpace = finalSpaces[index];

  resultSequence.textContent = `Sequence: ${sequence}`;
  resultTitle.textContent = `You arrive at your space: ${chosenSpace.title}`;
  resultDescription.textContent = buildOutcomeDescription(sequence, chosenSpace);
  resultPanel.hidden = false;
}

async function commitChoice(choice, skipAnimation = false) {
  if (interactionLocked || currentStep >= totalDecisionSteps || !activeChoices || !activeChoices[choice]) {
    return;
  }

  interactionLocked = true;
  setButtonsDisabled(true);

  const selected = activeChoices[choice];
  if (!skipAnimation) {
    await animateBallAlongPath(selected.travelPath);
  } else {
    setBallPosition(selected.end);
    panToPoint(selected.end);
  }

  const startPoint = { ...currentPosition };
  const keptGroups = moveSelectedPathToRevealed(choice);
  choices.push(choice);
  currentPosition = selected.end;
  choiceHistory.push({
    choice,
    start: startPoint,
    end: { ...selected.end },
    travelPath: selected.travelPath,
    stemGroup: keptGroups.stemGroup,
    selectedGroup: keptGroups.selectedGroup
  });
  currentStep += 1;

  clearActiveChoices();

  if (currentStep < totalDecisionSteps) {
    buildStepChoices(currentStep);
    setButtonsDisabled(false);
  } else {
    showResult();
  }

  updateProgress();
  interactionLocked = false;
}

async function undoLastChoice() {
  if (interactionLocked || currentStep === 0 || choiceHistory.length === 0) {
    return;
  }

  interactionLocked = true;
  setButtonsDisabled(true);

  const last = choiceHistory[choiceHistory.length - 1];
  if (last.travelPath) {
    await animateBallAlongPath(last.travelPath, { reverse: true, duration: 760 });
  }

  clearActiveChoices();
  choiceHistory.pop();

  if (last.selectedGroup && last.selectedGroup.parentNode) {
    last.selectedGroup.remove();
  }

  if (last.stemGroup && last.stemGroup.parentNode) {
    last.stemGroup.remove();
  }

  choices.pop();
  currentStep -= 1;
  currentPosition = { ...last.start };

  setBallPosition(currentPosition);
  panToPoint(currentPosition);
  buildStepChoices(currentStep);
  updateProgress();

  setButtonsDisabled(false);
  interactionLocked = false;
}

function updateDragPosition(clientX, clientY) {
  if (!activeChoices) {
    return;
  }

  const pointer = clientToSvgPoint(clientX, clientY);
  const startX = currentPosition.x;
  const firstKey = Object.keys(activeChoices)[0];
  const endX = activeChoices[firstKey].end.x;
  const progress = clamp((pointer.x - startX) / (endX - startX), 0, 1);
  const verticalDelta = pointer.y - currentPosition.y;

  let preferredChoice = null;
  if (verticalDelta <= -FORK_INTERACTION.verticalStrongBiasPx) {
    preferredChoice = "A";
  } else if (verticalDelta >= FORK_INTERACTION.verticalStrongBiasPx) {
    preferredChoice = "C";
  } else if (verticalDelta <= -FORK_INTERACTION.verticalBiasPx) {
    preferredChoice = "A";
  } else if (verticalDelta >= FORK_INTERACTION.verticalBiasPx) {
    preferredChoice = "C";
  }

  let nearestChoice = null;
  let nearestPoint = null;
  let minDistance = Infinity;

  Object.keys(activeChoices).forEach((choiceKey) => {
    const path = activeChoices[choiceKey].travelPath;
    const point = path.getPointAtLength(path.getTotalLength() * progress);
    const distance = Math.hypot(pointer.x - point.x, pointer.y - point.y);
    let score = distance;

    if (preferredChoice) {
      if (choiceKey === preferredChoice) {
        score *= 0.52;
      } else if (choiceKey === "B") {
        score *= 1.25;
      } else {
        score *= 1.15;
      }
    }

    if (score < minDistance) {
      minDistance = score;
      nearestChoice = choiceKey;
      nearestPoint = point;
    }
  });

  dragChoice = nearestChoice;
  dragProgress = progress;
  restingDragState = {
    choice: nearestChoice,
    progress,
    point: { x: nearestPoint.x, y: nearestPoint.y }
  };
  setWorldTransitionEnabled(false);
  setBallPosition(nearestPoint);
  panToPoint(nearestPoint);
}

function setupBallDragHandlers() {
  ball.addEventListener("pointerdown", (event) => {
    if (interactionLocked || currentStep >= totalDecisionSteps || !activeChoices) {
      return;
    }

    isBallDragging = true;
    if (restingDragState) {
      dragProgress = restingDragState.progress;
      dragChoice = restingDragState.choice;
    } else {
      dragProgress = 0;
      dragChoice = null;
    }
    dragStartClientX = event.clientX;
    dragLatestClientX = event.clientX;
    ball.setPointerCapture(event.pointerId);
    updateDragPosition(event.clientX, event.clientY);
    event.preventDefault();
  });

  ball.addEventListener("pointermove", (event) => {
    if (!isBallDragging || interactionLocked) {
      return;
    }

    dragLatestClientX = event.clientX;
    updateDragPosition(event.clientX, event.clientY);
  });

  const finishDrag = () => {
    if (!isBallDragging) {
      return;
    }

    const canCommit = dragChoice && dragProgress > FORK_INTERACTION.commitProgress;
    const draggedLeft =
      dragStartClientX !== null &&
      dragLatestClientX !== null &&
      dragStartClientX - dragLatestClientX > FORK_INTERACTION.undoDragPx;
    const shouldUndo = !canCommit && dragProgress < FORK_INTERACTION.undoProgressMax && draggedLeft && currentStep > 0;

    isBallDragging = false;
    dragStartClientX = null;
    dragLatestClientX = null;

    if (canCommit) {
      restingDragState = null;
      commitChoice(dragChoice, true);
      return;
    }

    if (shouldUndo) {
      restingDragState = null;
      undoLastChoice();
      return;
    }

    if (restingDragState?.point) {
      dragProgress = restingDragState.progress;
      dragChoice = restingDragState.choice;
      setBallPosition(restingDragState.point);
      panToPoint(restingDragState.point);
    }
    setWorldTransitionEnabled(true);
  };

  ball.addEventListener("pointerup", finishDrag);
  ball.addEventListener("pointercancel", finishDrag);
}

function setupButtonHandlers() {
  buttonA.addEventListener("click", () => commitChoice("A"));
  buttonB.addEventListener("click", () => commitChoice("B"));
  buttonC.addEventListener("click", () => commitChoice("C"));
}

function setupSwipeHandlers() {
  const minSwipeDistance = 45;
  let touchStartX = null;
  let pointerStartX = null;

  viewport.addEventListener(
    "touchstart",
    (event) => {
      if (interactionLocked || currentStep >= totalDecisionSteps || isBallDragging) {
        return;
      }
      touchStartX = event.changedTouches[0].clientX;
    },
    { passive: true }
  );

  viewport.addEventListener(
    "touchend",
    (event) => {
      if (touchStartX === null || interactionLocked || currentStep >= totalDecisionSteps || isBallDragging) {
        return;
      }

      const delta = event.changedTouches[0].clientX - touchStartX;
      touchStartX = null;

      if (Math.abs(delta) < minSwipeDistance) {
        return;
      }

      if (delta < 0) {
        commitChoice("A");
      } else {
        commitChoice("C");
      }
    },
    { passive: true }
  );

  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" || interactionLocked || currentStep >= totalDecisionSteps || isBallDragging) {
      return;
    }
    pointerStartX = event.clientX;
  });

  viewport.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch" || pointerStartX === null || interactionLocked || currentStep >= totalDecisionSteps || isBallDragging) {
      return;
    }

    const delta = event.clientX - pointerStartX;
    pointerStartX = null;

    if (Math.abs(delta) < minSwipeDistance) {
      return;
    }

    if (delta < 0) {
      commitChoice("A");
    } else {
      commitChoice("C");
    }
  });
}

function setupKeyboardHandlers() {
  document.addEventListener("keydown", (event) => {
    if (interactionLocked || currentStep >= totalDecisionSteps) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") {
      event.preventDefault();
      commitChoice("A");
    }

    if (key === "arrowup" || key === "b") {
      event.preventDefault();
      commitChoice("B");
    }

    if (key === "arrowright" || key === "c") {
      event.preventDefault();
      commitChoice("C");
    }
  });
}

function restartQuiz() {
  currentStep = 0;
  choices = [];
  interactionLocked = false;
  isBallDragging = false;
  dragProgress = 0;
  dragChoice = null;
  choiceHistory = [];
  dragStartClientX = null;
  dragLatestClientX = null;
  restingDragState = null;
  currentPosition = { x: 120, y: 260 };

  clearActiveChoices();
  revealedGroup.replaceChildren();
  setBallPosition(currentPosition);

  startDot.setAttribute("cx", "120");
  startDot.setAttribute("cy", "260");

  resultSequence.textContent = "Sequence: ----";
  resultTitle.textContent = "Outcome";
  resultDescription.textContent = "";
  resultPanel.hidden = true;

  buildStepChoices(0);
  setButtonsDisabled(false);
  updateProgress();
  setWorldTransitionEnabled(true);
  panToPoint(currentPosition);
}

function init() {
  setupButtonHandlers();
  setupSwipeHandlers();
  setupBallDragHandlers();
  setupKeyboardHandlers();
  restartButton.addEventListener("click", restartQuiz);

  buildStepChoices(0);
  setBallPosition(currentPosition);
  setWorldTransitionEnabled(true);
  panToPoint(currentPosition);
  updateProgress();
}

window.addEventListener("resize", () => panToPoint(currentPosition));

init();
