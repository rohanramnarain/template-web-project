const totalDecisionSteps = 3;
let currentStep = 0;
let choices = [];
let interactionLocked = false;
let currentPosition = { x: 120, y: 260 };
let activeChoices = null;
let activeStemGroup = null;
let isBallDragging = false;
let dragProgress = 0;
let dragChoice = null;

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
const restartButton = document.getElementById("restart-btn");
const resultPanel = document.getElementById("result-panel");
const resultSequence = document.getElementById("result-sequence");
const resultTitle = document.getElementById("result-title");
const resultDescription = document.getElementById("result-description");

const SVG_NS = "http://www.w3.org/2000/svg";
const WORLD_WIDTH = 3400;
const WORLD_HEIGHT = 520;

const stepConfigs = [
  { dx: 900, offsets: { A: -120, B: 110 } },
  { dx: 900, offsets: { A: -150, B: 140 } },
  { dx: 900, offsets: { A: -90, B: 95 } }
];

const roomChoiceLabels = [
  { A: "Sun Hall", B: "Fireplace Nook" },
  { A: "Studio Landing", B: "Library Turn" },
  { A: "Glass Atrium", B: "Garden Passage" }
];

const outcomes = {
  AAA: {
    title: "Sky Map Room",
    description: "You arrive at your space. This room belongs to a Sunrise Cartographer: you choose high routes and clear views, mapping possibilities before anyone else sees them."
  },
  AAB: {
    title: "Pivot Lounge",
    description: "You arrive at your space. This room reflects a Gentle Disruptor: you lead with vision, then pivot with instinct. Your decisions are thoughtful but never rigid."
  },
  ABA: {
    title: "Workshop Gallery",
    description: "You arrive at your space. This room suits a Curious Builder: you test ideas in the wild and keep what works. Your path grows stronger with each bend."
  },
  ABB: {
    title: "Story Parlor",
    description: "You arrive at your space. This room is for a Story Weaver: you gather surprising detours into a coherent narrative, and people follow because your path feels human."
  },
  BAA: {
    title: "Strategy Study",
    description: "You arrive at your space. This room matches a Quiet Strategist: you move calmly through complexity and make sharp choices at the right moments."
  },
  BAB: {
    title: "Pattern Observatory",
    description: "You arrive at your space. This room fits a Pattern Hunter: you notice hidden links between distant ideas, then turn them into practical direction."
  },
  BBA: {
    title: "Explorer Courtyard",
    description: "You arrive at your space. This room belongs to a Grounded Explorer: you are open to risk but anchored by purpose, balancing courage and care."
  },
  BBB: {
    title: "Momentum Loft",
    description: "You arrive at your space. This room reflects a Bold Pathfinder: you commit fully and keep moving, turning uncertain terrain into momentum."
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function reducedMotionEnabled() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function updateProgress() {
  if (currentStep < totalDecisionSteps) {
    progressText.textContent = `Step ${currentStep + 1} of ${totalDecisionSteps}`;
    if (currentStep === 0) {
      promptText.textContent = "You are at the front door.";
    } else {
      promptText.textContent = "Choose which room to enter next.";
    }

    const stepLabels = roomChoiceLabels[currentStep];
    buttonA.textContent = `Room A: ${stepLabels.A}`;
    buttonB.textContent = `Room B: ${stepLabels.B}`;
  } else {
    progressText.textContent = "Complete";
    promptText.textContent = "You arrive at your space.";
    buttonA.textContent = "Room A";
    buttonB.textContent = "Room B";
  }
}

function setButtonsDisabled(disabled) {
  buttonA.disabled = disabled;
  buttonB.disabled = disabled;
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

function buildStepChoices(stepIndex) {
  const config = stepConfigs[stepIndex];
  const x0 = currentPosition.x;
  const y0 = currentPosition.y;
  const splitX = x0 + config.dx * 0.38;
  const splitY = y0 + (stepIndex % 2 === 0 ? -8 : 8);
  const x1 = x0 + config.dx;

  const options = {};

  const stemD = `M ${x0} ${y0} C ${x0 + config.dx * 0.12} ${y0}, ${x0 + config.dx * 0.24} ${splitY}, ${splitX} ${splitY}`;
  const stemGroup = document.createElementNS(SVG_NS, "g");
  stemGroup.setAttribute("class", "fork-stem");
  stemGroup.append(
    createSvgPath("track-outline", stemD),
    createSvgPath("track-fill", stemD)
  );
  activeGroup.append(stemGroup);
  activeStemGroup = stemGroup;

  ["A", "B"].forEach((choiceKey) => {
    const endY = clamp(y0 + config.offsets[choiceKey], 85, 430);
    const branchC1x = splitX + config.dx * 0.16;
    const branchC2x = splitX + config.dx * 0.48;
    const branchC1y = splitY + config.offsets[choiceKey] * 0.25;
    const branchC2y = splitY + config.offsets[choiceKey] * 0.95;
    const branchD = `M ${splitX} ${splitY} C ${branchC1x} ${branchC1y}, ${branchC2x} ${branchC2y}, ${x1} ${endY}`;
    const travelD = `${stemD} C ${branchC1x} ${branchC1y}, ${branchC2x} ${branchC2y}, ${x1} ${endY}`;

    const optionGroup = document.createElementNS(SVG_NS, "g");
    optionGroup.setAttribute("data-choice", choiceKey);

    const outline = createSvgPath("track-outline", branchD);
    const fill = createSvgPath("track-fill", branchD);
    const travel = createSvgPath("travel-path", travelD);
    const roomLabel = roomChoiceLabels[stepIndex][choiceKey];
    const label = createSvgText(roomLabel, x1 - 190, endY + (choiceKey === "A" ? -16 : 28));

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
  const minX = 0;
  const maxX = WORLD_WIDTH - viewportWidth;
  const clamped = clamp(targetX, minX, maxX);
  world.style.transform = `translateX(${-clamped}px)`;
}

function animateBallAlongPath(pathElement) {
  return new Promise((resolve) => {
    if (reducedMotionEnabled()) {
      const end = pathElement.getPointAtLength(pathElement.getTotalLength());
      setBallPosition(end);
      resolve();
      return;
    }

    const pathLength = pathElement.getTotalLength();
    const duration = 920;
    const start = performance.now();

    const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    function frame(now) {
      const raw = Math.min((now - start) / duration, 1);
      const eased = easeInOut(raw);
      const point = pathElement.getPointAtLength(pathLength * eased);
      setBallPosition(point);
      panToPoint(point);

      if (raw < 1) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}

function moveSelectedPathToRevealed(choice) {
  const selected = activeChoices[choice];
  const unselectedChoice = choice === "A" ? "B" : "A";
  const unselected = activeChoices[unselectedChoice];

  if (activeStemGroup) {
    revealedGroup.append(activeStemGroup);
  }

  selected.group.classList.add("selected-option");
  unselected.group.classList.add("hidden-option");
  unselected.group.remove();
  revealedGroup.append(selected.group);
}

function showResult() {
  const sequence = choices.join("");
  const outcome = outcomes[sequence];

  resultSequence.textContent = `Sequence: ${sequence}`;
  resultTitle.textContent = `You arrive at your space: ${outcome.title}`;
  resultDescription.textContent = outcome.description;
  resultPanel.hidden = false;
}

async function handleChoice(choice) {
  if (interactionLocked || currentStep >= totalDecisionSteps || !activeChoices) {
    return;
  }

  interactionLocked = true;
  setButtonsDisabled(true);

  const selected = activeChoices[choice];
  await animateBallAlongPath(selected.travelPath);
  moveSelectedPathToRevealed(choice);

  choices.push(choice);
  currentPosition = selected.end;
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

async function commitChoice(choice, skipAnimation = false) {
  if (interactionLocked || currentStep >= totalDecisionSteps || !activeChoices) {
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

  moveSelectedPathToRevealed(choice);
  choices.push(choice);
  currentPosition = selected.end;
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

function updateDragPosition(clientX, clientY) {
  if (!activeChoices) {
    return;
  }

  const pointer = clientToSvgPoint(clientX, clientY);
  const startX = currentPosition.x;
  const endX = activeChoices.A.end.x;
  const raw = (pointer.x - startX) / (endX - startX);
  const progress = clamp(raw, 0, 1);

  const pathA = activeChoices.A.travelPath;
  const pathB = activeChoices.B.travelPath;

  const pointA = pathA.getPointAtLength(pathA.getTotalLength() * progress);
  const pointB = pathB.getPointAtLength(pathB.getTotalLength() * progress);

  const distA = Math.hypot(pointer.x - pointA.x, pointer.y - pointA.y);
  const distB = Math.hypot(pointer.x - pointB.x, pointer.y - pointB.y);

  dragChoice = distA <= distB ? "A" : "B";
  dragProgress = progress;

  const selectedPoint = dragChoice === "A" ? pointA : pointB;
  setBallPosition(selectedPoint);
  panToPoint(selectedPoint);
}

function setupBallDragHandlers() {
  ball.addEventListener("pointerdown", (event) => {
    if (interactionLocked || currentStep >= totalDecisionSteps || !activeChoices) {
      return;
    }

    isBallDragging = true;
    dragProgress = 0;
    dragChoice = null;
    ball.setPointerCapture(event.pointerId);
    updateDragPosition(event.clientX, event.clientY);
    event.preventDefault();
  });

  ball.addEventListener("pointermove", (event) => {
    if (!isBallDragging || interactionLocked) {
      return;
    }

    updateDragPosition(event.clientX, event.clientY);
  });

  const finishDrag = () => {
    if (!isBallDragging) {
      return;
    }

    const canCommit = dragChoice && dragProgress > 0.95;
    isBallDragging = false;

    if (canCommit) {
      commitChoice(dragChoice, true);
      return;
    }

    dragProgress = 0;
    dragChoice = null;
    setBallPosition(currentPosition);
    panToPoint(currentPosition);
  };

  ball.addEventListener("pointerup", finishDrag);
  ball.addEventListener("pointercancel", finishDrag);
}

function setupButtonHandlers() {
  buttonA.addEventListener("click", () => commitChoice("A"));
  buttonB.addEventListener("click", () => commitChoice("B"));
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
        commitChoice("B");
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
      commitChoice("B");
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

    if (key === "arrowright" || key === "b") {
      event.preventDefault();
      commitChoice("B");
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
  currentPosition = { x: 120, y: 260 };

  clearActiveChoices();
  revealedGroup.replaceChildren();
  setBallPosition(currentPosition);

  startDot.setAttribute("cx", "120");
  startDot.setAttribute("cy", "260");

  resultSequence.textContent = "Sequence: ---";
  resultTitle.textContent = "Outcome";
  resultDescription.textContent = "";
  resultPanel.hidden = true;

  buildStepChoices(0);
  setButtonsDisabled(false);
  updateProgress();
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
  panToPoint(currentPosition);
  updateProgress();
}

window.addEventListener("resize", () => panToPoint(currentPosition));

init();
