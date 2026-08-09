/* =========================================================
   CAT NOSE ID
   v0.9.0
   Roboflow RF-DETR Cat Face Detection
   Local Household Cat Profiles
   Automatic Reference Frame Selection
========================================================= */

/* =========================================================
   ROBOFLOW
========================================================= */

const ROBOFLOW_WORKFLOW_URL =
  "https://serverless.roboflow.com/miroslav-nemeth/workflows/cat-face-data-atoiv";

/*
   Temporary prototype key.
   IMPORTANT:
   This must later be moved to a backend/proxy.
*/
const ROBOFLOW_API_KEY =
  "w4cawsZFX6ady8eie8XB";

/* =========================================================
   SETTINGS
========================================================= */

const MODEL_SCORE_THRESHOLD = 0.20;
const CAPTURE_CONFIDENCE = 0.30;

const MAX_SAMPLES = 9;
const MAX_CANDIDATES = 36;

const PROFILE_STORAGE_KEY =
  "catNoseIdProfiles_v3";

const MAX_SCAN_TIME = 10000;
const INFERENCE_INTERVAL = 900;
const MIN_SAMPLE_INTERVAL = 350;

const RECOGNITION_MIN_SCORE = 0.72;

/* =========================================================
   STATE
========================================================= */

let cameraStream = null;

let modelReady = false;
let modelLoading = false;

let inferenceRunning = false;
let inferenceBusy = false;

let lastInferenceTime = 0;
let scanStartedAt = 0;
let lastAcceptedSampleTime = 0;

let scanMode = "enroll";

let samples = [];
let recognitionCandidates = [];

let bestDetection = null;
let scanFinished = false;

let profileManagerInitialized = false;

/* =========================================================
   DOM
========================================================= */

const screens = [
  "home",
  "camera",
  "videoTest",
  "profile"
];

const video =
  document.getElementById("video");

const detectionOverlay =
  document.getElementById("detectionOverlay");

const frameCanvas =
  document.getElementById("frameCanvas");

const frameCounter =
  document.getElementById("frameCounter");

const qualityText =
  document.getElementById("qualityText");

const qualityBar =
  document.getElementById("qualityBar");

const instruction =
  document.getElementById("instruction");

const engineStatus =
  document.getElementById("engineStatus");

const scanResult =
  document.getElementById("scanResult");

const detectorNote =
  document.getElementById("detectorNote");

const mediaInput =
  document.getElementById("mediaInput");

const sourceVideo =
  document.getElementById("sourceVideo");

const videoCanvas =
  document.getElementById("videoCanvas");

const videoQuality =
  document.getElementById("videoQuality");

const videoQualityBar =
  document.getElementById("videoQualityBar");

const videoResult =
  document.getElementById("videoResult");

const videoSamples =
  document.getElementById("videoSamples");

/* =========================================================
   SCREEN
========================================================= */

function showScreen(name) {

  screens.forEach(id => {

    const element =
      document.getElementById(id);

    if (!element) return;

    element.classList.toggle(
      "active",
      id === name
    );

  });

}

/* =========================================================
   STATUS
========================================================= */

function setStatus(text) {

  if (engineStatus) {
    engineStatus.textContent = text;
  }

}

function setInstruction(text) {

  if (instruction) {
    instruction.textContent = text;
  }

}

/* =========================================================
   ROBOFLOW INITIALIZATION
========================================================= */

async function initializeRoboflow() {

  if (modelReady) {
    return true;
  }

  if (modelLoading) {
    return false;
  }

  modelLoading = true;

  try {

    setStatus(
      "Roboflow AI sa pripája..."
    );

    if (
      !ROBOFLOW_WORKFLOW_URL ||
      !ROBOFLOW_WORKFLOW_URL.startsWith(
        "https://serverless.roboflow.com/"
      )
    ) {
      throw new Error(
        "Neplatná Roboflow Workflow URL."
      );
    }

    if (
      !ROBOFLOW_API_KEY ||
      ROBOFLOW_API_KEY.length < 10
    ) {
      throw new Error(
        "Roboflow API key nie je nastavený."
      );
    }

    /*
      IMPORTANT:
      We do NOT send an empty image here.

      The actual connection is tested on the
      first real camera frame.
    */

    modelReady = true;

    setStatus(
      "Roboflow AI je pripravené"
    );

    if (detectorNote) {

      detectorNote.textContent =
        "Roboflow RF-DETR je pripravené. Aplikácia automaticky vyberá najlepšie zábery.";

    }

    return true;

  } catch (error) {

    console.error(
      "ROBOFLOW INITIALIZATION ERROR:",
      error
    );

    modelReady = false;

    setStatus(
      "Roboflow AI sa nepodarilo pripraviť"
    );

    if (detectorNote) {

      detectorNote.textContent =
        error.message ||
        "Roboflow AI sa nepodarilo pripraviť.";

    }

    return false;

  } finally {

    modelLoading = false;

  }

}

/* =========================================================
   ROBOFLOW WORKFLOW
========================================================= */

async function runRoboflowWorkflow(dataUrl) {

  if (!dataUrl) {
    throw new Error(
      "Chýba obrazový frame."
    );
  }

  const base64 =
    dataUrl.includes(",")
      ? dataUrl.split(",")[1]
      : dataUrl;

  const response =
    await fetch(
      ROBOFLOW_WORKFLOW_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          api_key:
            ROBOFLOW_API_KEY,

          inputs: {

            image: {
              type: "base64",
              value: base64
            }

          }

        })
      }
    );

  if (!response.ok) {

    let details = "";

    try {

      details =
        JSON.stringify(
          await response.json()
        );

    } catch (_) {

      details =
        await response.text();

    }

    throw new Error(
      "Roboflow HTTP " +
      response.status +
      ": " +
      details
    );

  }

  const result =
    await response.json();

  console.log(
    "ROBOFLOW RESULT:",
    result
  );

  return extractPredictions(
    result
  );

}

/* =========================================================
   RESPONSE PARSER
========================================================= */

function extractPredictions(result) {

  const found = [];

  function walk(value) {

    if (!value) return;

    if (
      typeof value !==
      "object"
    ) {
      return;
    }

    if (Array.isArray(value)) {

      for (
        const item of value
      ) {
        walk(item);
      }

      return;
    }

    /*
      Standard Roboflow prediction.
    */

    if (
      value.x !== undefined &&
      value.y !== undefined &&
      value.width !== undefined &&
      value.height !== undefined
    ) {

      const confidence =
        Number(
          value.confidence ??
          value.score ??
          0
        );

      if (
        confidence > 0
      ) {

        found.push({

          x:
            Number(value.x),

          y:
            Number(value.y),

          width:
            Number(value.width),

          height:
            Number(value.height),

          confidence,

          class:
            value.class ||
            value.class_name ||
            "cat-face"

        });

      }

    }

    for (
      const key of Object.keys(value)
    ) {

      walk(value[key]);

    }

  }

  walk(result);

  return found;

}

/* =========================================================
   CANVAS
========================================================= */

function canvasToDataUrl(
  canvas,
  quality = 0.80
) {

  if (!canvas) {
    return null;
  }

  return canvas.toDataURL(
    "image/jpeg",
    quality
  );

}

/* =========================================================
   CAMERA
========================================================= */

async function startCamera() {

  try {

    setStatus(
      "Spúšťam kameru..."
    );

    cameraStream =
      await navigator.mediaDevices.getUserMedia({

        video: {

          facingMode: {
            ideal: "environment"
          },

          width: {
            ideal: 1280
          },

          height: {
            ideal: 720
          },

          frameRate: {
            ideal: 30,
            max: 30
          }

        },

        audio: false

      });

    video.srcObject =
      cameraStream;

    await video.play();

    showScreen("camera");

    resetScan();

    setupOverlay();

    if (
      scanMode ===
      "identify"
    ) {

      setInstruction(
        "Hľadám uloženú mačku..."
      );

    } else {

      setInstruction(
        "Namier kameru na tvár mačky..."
      );

    }

    setStatus(
      "Kamera aktívna — pripájam AI"
    );

    const ready =
      await initializeRoboflow();

    if (!ready) {

      setInstruction(
        "Roboflow AI sa nepodarilo pripraviť."
      );

      return;

    }

    setStatus(
      "Kamera + Roboflow AI sú pripravené"
    );

    setInstruction(
      scanMode === "identify"
        ? "Hľadám mačku..."
        : "Hľadám tvár mačky..."
    );

    inferenceRunning = true;
    scanFinished = false;

    scanStartedAt =
      performance.now();

    requestAnimationFrame(
      inferenceLoop
    );

  } catch (error) {

    console.error(
      "CAMERA ERROR:",
      error
    );

    setStatus(
      "Kameru sa nepodarilo spustiť"
    );

    alert(
      "Kameru sa nepodarilo spustiť.\n\nPovoľ kameru v prehliadači."
    );

  }

}

/* =========================================================
   STOP CAMERA
========================================================= */

function stopCamera() {

  inferenceRunning =
    false;

  scanFinished =
    true;

  if (cameraStream) {

    cameraStream
      .getTracks()
      .forEach(track => {
        track.stop();
      });

    cameraStream = null;

  }

  if (video) {

    video.pause();
    video.srcObject = null;

  }

  clearOverlay();

  showScreen("home");

  refreshProfileManager();

}

/* =========================================================
   RESET
========================================================= */

function resetScan() {

  samples = [];
  recognitionCandidates = [];

  bestDetection = null;

  scanFinished = false;
  inferenceBusy = false;

  lastInferenceTime = 0;
  lastAcceptedSampleTime = 0;

  scanStartedAt =
    performance.now();

  updateCounter();

  if (qualityText) {
    qualityText.textContent = "—";
  }

  if (qualityBar) {
    qualityBar.style.width = "0%";
  }

  if (scanResult) {
    scanResult.classList.add(
      "hidden"
    );
  }

  clearOverlay();

}

/* =========================================================
   OVERLAY
========================================================= */

function setupOverlay() {

  if (
    !video ||
    !video.videoWidth ||
    !video.videoHeight
  ) {
    return;
  }

  detectionOverlay.width =
    video.videoWidth;

  detectionOverlay.height =
    video.videoHeight;

}

function clearOverlay() {

  if (!detectionOverlay) {
    return;
  }

  const ctx =
    detectionOverlay.getContext(
      "2d"
    );

  ctx.clearRect(
    0,
    0,
    detectionOverlay.width,
    detectionOverlay.height
  );

}

/* =========================================================
   INFERENCE LOOP
========================================================= */

async function inferenceLoop(
  timestamp
) {

  if (
    !inferenceRunning ||
    scanFinished
  ) {
    return;
  }

  if (
    timestamp -
    scanStartedAt >
    MAX_SCAN_TIME
  ) {

    await finishAutomaticScan();

    return;

  }

  if (inferenceBusy) {

    requestAnimationFrame(
      inferenceLoop
    );

    return;

  }

  if (
    timestamp -
    lastInferenceTime <
    INFERENCE_INTERVAL
  ) {

    requestAnimationFrame(
      inferenceLoop
    );

    return;

  }

  lastInferenceTime =
    timestamp;

  inferenceBusy = true;

  try {

    await runCameraInference();

  } catch (error) {

    console.error(
      "INFERENCE ERROR:",
      error
    );

    setStatus(
      "Chyba komunikácie s Roboflow"
    );

  } finally {

    inferenceBusy = false;

  }

  if (
    inferenceRunning &&
    !scanFinished
  ) {

    requestAnimationFrame(
      inferenceLoop
    );

  }

}

/* =========================================================
   CAMERA INFERENCE
========================================================= */

async function runCameraInference() {

  if (
    !modelReady ||
    !video ||
    video.readyState < 2
  ) {
    return;
  }

  if (!frameCanvas) {
    return;
  }

  frameCanvas.width =
    video.videoWidth;

  frameCanvas.height =
    video.videoHeight;

  const ctx =
    frameCanvas.getContext(
      "2d"
    );

  ctx.drawImage(
    video,
    0,
    0,
    frameCanvas.width,
    frameCanvas.height
  );

  const dataUrl =
    canvasToDataUrl(
      frameCanvas,
      0.72
    );

  /*
    THIS IS THE FIRST REAL AI REQUEST.
  */

  const predictions =
    await runRoboflowWorkflow(
      dataUrl
    );

  const detection =
    selectBestDetection(
      predictions
    );

  drawDetection(
    detection
  );

  if (!detection) {

    if (qualityText) {
      qualityText.textContent =
        "Hľadám...";
    }

    if (qualityBar) {
      qualityBar.style.width =
        "5%";
    }

    setInstruction(
      "Hľadám tvár mačky..."
    );

    return;

  }

  const percentage =
    Math.round(
      detection.confidence *
      100
    );

  if (qualityText) {
    qualityText.textContent =
      percentage + "%";
  }

  if (qualityBar) {

    qualityBar.style.width =
      Math.max(
        5,
        Math.min(
          100,
          percentage
        )
      ) + "%";

  }

  bestDetection =
    detection;

  setInstruction(
    "Tvár mačky detegovaná — " +
    percentage +
    "%"
  );

  if (
    detection.confidence >=
    CAPTURE_CONFIDENCE
  ) {

    await considerAutomaticCapture(
      detection
    );

  }

}

/* =========================================================
   BEST DETECTION
========================================================= */

function selectBestDetection(
  predictions
) {

  if (
    !Array.isArray(
      predictions
    )
  ) {
    return null;
  }

  let best = null;

  for (
    const prediction of predictions
  ) {

    const confidence =
      Number(
        prediction.confidence ||
        0
      );

    if (
      confidence <
      MODEL_SCORE_THRESHOLD
    ) {
      continue;
    }

    const width =
      Number(
        prediction.width
      );

    const height =
      Number(
        prediction.height
      );

    if (
      !width ||
      !height
    ) {
      continue;
    }

    const candidate = {

      confidence,

      className:
        prediction.class ||
        "cat-face",

      bbox: {

        x:
          Number(
            prediction.x
          ),

        y:
          Number(
            prediction.y
          ),

        width,
        height

      }

    };

    if (
      !best ||
      candidate.confidence >
      best.confidence
    ) {

      best =
        candidate;

    }

  }

  return best;

}

/* =========================================================
   DRAW
========================================================= */

function drawDetection(
  detection
) {

  if (!detectionOverlay) {
    return;
  }

  const ctx =
    detectionOverlay.getContext(
      "2d"
    );

  ctx.clearRect(
    0,
    0,
    detectionOverlay.width,
    detectionOverlay.height
  );

  if (!detection) {
    return;
  }

  const b =
    detection.bbox;

  const left =
    b.x -
    b.width / 2;

  const top =
    b.y -
    b.height / 2;

  ctx.lineWidth = 4;

  ctx.strokeStyle =
    "#00ff88";

  ctx.strokeRect(
    left,
    top,
    b.width,
    b.height
  );

  ctx.font =
    "bold 20px Arial";

  ctx.fillStyle =
    "#00ff88";

  ctx.fillText(
    "CAT FACE " +
    Math.round(
      detection.confidence *
      100
    ) +
    "%",
    left,
    Math.max(
      25,
      top - 8
    )
  );

}

/* =========================================================
   QUALITY
========================================================= */

function calculateCaptureQuality(
  detection
) {

  const b =
    detection.bbox;

  const fw =
    video.videoWidth;

  const fh =
    video.videoHeight;

  if (
    !b ||
    !fw ||
    !fh
  ) {
    return 0;
  }

  const area =
    b.width *
    b.height;

  const frameArea =
    fw *
    fh;

  const areaRatio =
    area /
    frameArea;

  const sizeScore =
    Math.min(
      100,
      (
        areaRatio /
        0.003
      ) * 100
    );

  const confidenceScore =
    detection.confidence *
    100;

  const centerX =
    b.x / fw;

  const centerY =
    b.y / fh;

  const distance =
    Math.sqrt(
      Math.pow(
        centerX - 0.5,
        2
      ) +
      Math.pow(
        centerY - 0.5,
        2
      )
    );

  const centerScore =
    Math.max(
      0,
      100 -
      distance * 140
    );

  return Math.round(
    confidenceScore * 0.55 +
    sizeScore * 0.25 +
    centerScore * 0.20
  );

}

/* =========================================================
   DUPLICATE CHECK
========================================================= */

function isDuplicateSample(
  detection
) {

  const list =
    scanMode === "enroll"
      ? samples
      : recognitionCandidates;

  if (!list.length) {
    return false;
  }

  const previous =
    list[list.length - 1].bbox;

  const current =
    detection.bbox;

  if (
    !previous ||
    !current
  ) {
    return false;
  }

  const movement =
    Math.sqrt(
      Math.pow(
        current.x -
        previous.x,
        2
      ) +
      Math.pow(
        current.y -
        previous.y,
        2
      )
    );

  const sizeChange =
    Math.abs(
      current.width -
      previous.width
    ) /
    Math.max(
      1,
      previous.width
    );

  return (
    movement < 18 &&
    sizeChange < 0.08
  );

}

/* =========================================================
   CAPTURE CURRENT FRAME
========================================================= */

function captureCurrentFrame(
  detection
) {

  if (
    !video.videoWidth ||
    !video.videoHeight
  ) {
    return null;
  }

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    video.videoWidth;

  canvas.height =
    video.videoHeight;

  const ctx =
    canvas.getContext(
      "2d"
    );

  ctx.drawImage(
    video,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas.toDataURL(
    "image/jpeg",
    0.88
  );

}

/* =========================================================
   AUTOMATIC CAPTURE
========================================================= */

async function considerAutomaticCapture(
  detection
) {

  const now =
    Date.now();

  if (
    now -
    lastAcceptedSampleTime <
    MIN_SAMPLE_INTERVAL
  ) {
    return;
  }

  if (
    isDuplicateSample(
      detection
    )
  ) {
    return;
  }

  const image =
    captureCurrentFrame(
      detection
    );

  if (!image) {
    return;
  }

  const candidate = {

    image,

    confidence:
      detection.confidence,

    quality:
      calculateCaptureQuality(
        detection
      ),

    bbox: {
      ...detection.bbox
    },

    timestamp: now

  };

  if (
    scanMode === "enroll"
  ) {

    if (
      samples.length >=
      MAX_CANDIDATES
    ) {
      return;
    }

    samples.push(
      candidate
    );

  } else {

    if (
      recognitionCandidates.length >=
      MAX_CANDIDATES
    ) {
      return;
    }

    recognitionCandidates.push(
      candidate
    );

  }

  lastAcceptedSampleTime =
    now;

  updateCounter();

  setInstruction(
    scanMode === "enroll"
      ? "Záber automaticky uložený — hľadám ďalší..."
      : "Záber získaný — porovnávam..."
  );

}

/* =========================================================
   SELECT BEST REFERENCES
========================================================= */

function selectBestReferenceSamples(
  candidates,
  count
) {

  if (!candidates.length) {
    return [];
  }

  const pool =
    [...candidates].sort(
      (a, b) => {

        const scoreA =
          a.quality +
          a.confidence * 100;

        const scoreB =
          b.quality +
          b.confidence * 100;

        return scoreB - scoreA;

      }
    );

  const selected = [];

  /*
    Always start with the strongest image.
  */

  selected.push(
    pool.shift()
  );

  while (
    selected.length < count &&
    pool.length
  ) {

    let bestIndex = 0;
    let bestScore = -Infinity;

    for (
      let i = 0;
      i < pool.length;
      i++
    ) {

      const candidate =
        pool[i];

      let minDistance =
        Infinity;

      for (
        const existing
        of selected
      ) {

        const dx =
          candidate.bbox.x -
          existing.bbox.x;

        const dy =
          candidate.bbox.y -
          existing.bbox.y;

        const distance =
          Math.sqrt(
            dx * dx +
            dy * dy
          );

        minDistance =
          Math.min(
            minDistance,
            distance
          );

      }

      const qualityScore =
        (
          candidate.quality +
          candidate.confidence *
          100
        ) / 2;

      const diversityScore =
        Math.min(
          1,
          minDistance * 6
        ) * 100;

      const score =
        qualityScore * 0.70 +
        diversityScore * 0.30;

      if (
        score >
        bestScore
      ) {

        bestScore =
          score;

        bestIndex =
          i;

      }

    }

    selected.push(
      pool.splice(
        bestIndex,
        1
      )[0]
    );

  }

  return selected;

}

/* =========================================================
   FINISH SCAN
========================================================= */

async function finishAutomaticScan() {

  if (scanFinished) {
    return;
  }

  scanFinished = true;
  inferenceRunning = false;

  if (
    scanMode === "enroll"
  ) {

    samples =
      selectBestReferenceSamples(
        samples,
        MAX_SAMPLES
      );

    updateCounter();

    if (samples.length) {

      setInstruction(
        samples.length +
        " najlepších záberov vybraných automaticky."
      );

      showScanResult();

    } else {

      showScanFailure();

    }

    return;

  }

  if (
    scanMode === "identify"
  ) {

    samples =
      selectBestReferenceSamples(
        recognitionCandidates,
        Math.min(
          5,
          recognitionCandidates.length
        )
      );

    updateCounter();

    await identifyCurrentCat();

  }

}

/* =========================================================
   SCAN RESULT
========================================================= */

function showScanResult() {

  if (!scanResult) {
    return;
  }

  scanResult.classList.remove(
    "hidden"
  );

  scanResult.innerHTML = `

    <p style="margin:0;font-weight:700;">
      REFERENČNÉ ZÁBERY VYBRANÉ
    </p>

    <p style="margin:8px 0 0;">
      Automaticky vybraných:
      ${samples.length}
    </p>

    <p style="margin:8px 0 0;opacity:.75;">
      Aplikácia vybrala najkvalitnejšie a dostatočne odlišné zábery.
    </p>

  `;

  if (
    currentScreen() ===
    "camera"
  ) {

    setTimeout(
      () => {
        showScreen("profile");
      },
      700
    );

  }

}

function showScanFailure() {

  if (!scanResult) {
    return;
  }

  scanResult.classList.remove(
    "hidden"
  );

  scanResult.innerHTML = `

    <p style="margin:0;font-weight:700;">
      TVÁR MAČKY NEBOLA DETEGOVANÁ
    </p>

    <p style="margin:8px 0 0;opacity:.75;">
      Počas automatického skenovania sa nepodarilo získať vhodný záber.
    </p>

  `;

}

/* =========================================================
   CURRENT SCREEN
========================================================= */

function currentScreen() {

  for (
    const id of screens
  ) {

    const el =
      document.getElementById(
        id
      );

    if (
      el &&
      el.classList.contains(
        "active"
      )
    ) {
      return id;
    }

  }

  return "home";

}

/* =========================================================
   LOCAL PROFILES
========================================================= */

function loadCatProfiles() {

  try {

    const raw =
      localStorage.getItem(
        PROFILE_STORAGE_KEY
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    return Array.isArray(
      parsed
    )
      ? parsed
      : [];

  } catch (error) {

    console.error(
      "PROFILE LOAD ERROR:",
      error
    );

    return [];

  }

}

function saveCatProfiles(
  profiles
) {

  localStorage.setItem(
    PROFILE_STORAGE_KEY,
    JSON.stringify(
      profiles
    )
  );

}

/* =========================================================
   VISUAL FINGERPRINT
========================================================= */

async function createVisualFingerprint(
  dataUrl
) {

  return new Promise(
    resolve => {

      const image =
        new Image();

      image.onload =
        () => {

          const canvas =
            document.createElement(
              "canvas"
            );

          const size = 32;

          canvas.width =
            size;

          canvas.height =
            size;

          const ctx =
            canvas.getContext(
              "2d",
              {
                willReadFrequently:
                  true
              }
            );

          ctx.drawImage(
            image,
            0,
            0,
            size,
            size
          );

          const data =
            ctx.getImageData(
              0,
              0,
              size,
              size
            ).data;

          const gray = [];
          const rgb = [];

          for (
            let i = 0;
            i < data.length;
            i += 4
          ) {

            const r =
              data[i];

            const g =
              data[i + 1];

            const b =
              data[i + 2];

            const value =
              (
                0.299 * r +
                0.587 * g +
                0.114 * b
              ) / 255;

            gray.push(
              value
            );

            rgb.push(
              r / 255,
              g / 255,
              b / 255
            );

          }

          resolve({
            gray,
            rgb
          });

        };

      image.onerror =
        () => resolve(null);

      image.src =
        dataUrl;

    }
  );

}

/* =========================================================
   VECTOR SIMILARITY
========================================================= */

function vectorSimilarity(
  a,
  b
) {

  if (
    !a ||
    !b ||
    a.length !== b.length
  ) {
    return 0;
  }

  let sum = 0;
  let aa = 0;
  let bb = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {

    sum +=
      a[i] * b[i];

    aa +=
      a[i] * a[i];

    bb +=
      b[i] * b[i];

  }

  if (
    aa === 0 ||
    bb === 0
  ) {
    return 0;
  }

  return (
    sum /
    (
      Math.sqrt(aa) *
      Math.sqrt(bb)
    )
  );

}

/* =========================================================
   COMPARE
========================================================= */

function compareFingerprints(
  a,
  b
) {

  if (!a || !b) {
    return 0;
  }

  const grayScore =
    vectorSimilarity(
      a.gray,
      b.gray
    );

  const rgbScore =
    vectorSimilarity(
      a.rgb,
      b.rgb
    );

  return (
    grayScore * 0.72 +
    rgbScore * 0.28
  );

}

/* =========================================================
   IDENTIFY CAT
========================================================= */

async function identifyCurrentCat() {

  const profiles =
    loadCatProfiles();

  if (!profiles.length) {

    showIdentificationResult({
      type: "empty",
      message:
        "Zatiaľ nemáš uloženú žiadnu mačku."
    });

    return;

  }

  if (!samples.length) {

    showIdentificationResult({
      type: "empty",
      message:
        "Nepodarilo sa zachytiť vhodný záber."
    });

    return;

  }

  setInstruction(
    "Porovnávam mačku s uloženými profilmi..."
  );

  const candidateFingerprints =
    [];

  for (
    const sample of samples
  ) {

    const fp =
      await createVisualFingerprint(
        sample.image
      );

    if (fp) {
      candidateFingerprints.push(
        fp
      );
    }

  }

  const results = [];

  for (
    const profile of profiles
  ) {

    const scores = [];

    for (
      const reference
      of profile.samples || []
    ) {

      if (
        !reference.fingerprint
      ) {
        continue;
      }

      for (
        const candidateFp
        of candidateFingerprints
      ) {

        scores.push(
          compareFingerprints(
            candidateFp,
            reference.fingerprint
          )
        );

      }

    }

    if (!scores.length) {
      continue;
    }

    scores.sort(
      (a, b) =>
        b - a
    );

    const top =
      scores.slice(
        0,
        Math.min(
          5,
          scores.length
        )
      );

    const score =
      top.reduce(
        (sum, value) =>
          sum + value,
        0
      ) /
      top.length;

    results.push({
      profile,
      score
    });

  }

  results.sort(
    (a, b) =>
      b.score -
      a.score
  );

  const winner =
    results[0] ||
    null;

  const runnerUp =
    results[1] ||
    null;

  const margin =
    winner &&
    runnerUp
      ? winner.score -
        runnerUp.score
      : 1;

  const accepted =
    !!winner &&
    winner.score >=
      RECOGNITION_MIN_SCORE &&
    margin >= 0.035;

  if (!accepted) {

    showIdentificationResult({
      type: "unknown",
      score:
        winner
          ? winner.score
          : 0,
      winner:
        winner
          ? winner.profile
          : null
    });

    return;

  }

  showIdentificationResult({
    type: "match",
    score:
      winner.score,
    winner:
      winner.profile
  });

}

/* =========================================================
   IDENTIFICATION RESULT
========================================================= */

function showIdentificationResult(
  result
) {

  if (!scanResult) {
    return;
  }

  scanResult.classList.remove(
    "hidden"
  );

  if (
    result.type ===
    "match"
  ) {

    const name =
      result.winner.name;

    const percent =
      Math.round(
        result.score * 100
      );

    scanResult.innerHTML = `

      <p style="margin:0;font-size:22px;font-weight:800;">
        🐱 ${escapeHtml(name)}
      </p>

      <p style="margin:8px 0 0;">
        MAČKA ROZPOZNANÁ
      </p>

      <p style="margin:8px 0 0;opacity:.75;">
        Zhoda:
        ${percent}%
      </p>

    `;

    setInstruction(
      "Mačka rozpoznaná: " +
      name
    );

    return;

  }

  if (
    result.type ===
    "unknown"
  ) {

    scanResult.innerHTML = `

      <p style="margin:0;font-weight:700;">
        MAČKU SA NEPODARILO SPOĽAHLIVO ROZPOZNAŤ
      </p>

      <p style="margin:8px 0 0;opacity:.75;">
        Najlepší výsledok:
        ${Math.round(
          result.score * 100
        )}%
      </p>

    `;

    setInstruction(
      "Mačka nie je dostatočne podobná uloženým profilom."
    );

    return;

  }

  scanResult.innerHTML = `

    <p style="margin:0;font-weight:700;">
      ${escapeHtml(
        result.message
      )}
    </p>

  `;

}

/* =========================================================
   SAVE PROFILE
========================================================= */

async function saveProfile() {

  const nameElement =
    document.getElementById(
      "catName"
    );

  const nicknameElement =
    document.getElementById(
      "catNickname"
    );

  const savedInfo =
    document.getElementById(
      "savedInfo"
    );

  const name =
    nameElement
      ? nameElement.value.trim()
      : "";

  const nickname =
    nicknameElement
      ? nicknameElement.value.trim()
      : "";

  if (!samples.length) {

    if (savedInfo) {

      savedInfo.classList.remove(
        "hidden"
      );

      savedInfo.innerHTML = `
        <p style="margin:0;font-weight:700;">
          NIE SÚ K DISPOZÍCII ZÁBERY
        </p>
      `;

    }

    return;

  }

  const profiles =
    loadCatProfiles();

  const profile = {

    id:
      "cat_" +
      Date.now() +
      "_" +
      Math.random()
        .toString(36)
        .slice(2, 8),

    name:
      name ||
      "Moja mačka",

    nickname,

    createdAt:
      Date.now(),

    samples: []

  };

  try {

    setStatus(
      "Vytváram profil mačky..."
    );

    for (
      const sample of samples
    ) {

      const fingerprint =
        await createVisualFingerprint(
          sample.image
        );

      if (!fingerprint) {
        continue;
      }

      profile.samples.push({

        image:
          sample.image,

        fingerprint,

        confidence:
          sample.confidence,

        quality:
          sample.quality,

        timestamp:
          sample.timestamp

      });

    }

    if (
      !profile.samples.length
    ) {
      throw new Error(
        "Nepodarilo sa vytvoriť referenčné vzorky."
      );
    }

    profiles.push(
      profile
    );

    saveCatProfiles(
      profiles
    );

    if (savedInfo) {

      savedInfo.classList.remove(
        "hidden"
      );

      savedInfo.innerHTML = `

        <p style="margin:0;font-weight:700;">
          🐱 MAČKA ULOŽENÁ
        </p>

        <p style="margin:8px 0 0;">
          ${escapeHtml(
            profile.name
          )}
        </p>

        ${
          nickname
            ? `
              <p style="margin:4px 0 0;opacity:.75;">
                ${escapeHtml(
                  nickname
                )}
              </p>
            `
            : ""
        }

        <p style="margin:8px 0 0;opacity:.75;">
          ${profile.samples.length}
          referenčných záberov.
        </p>

        <p style="margin:8px 0 0;opacity:.65;">
          Profil je uložený v tomto zariadení.
        </p>

      `;

    }

    refreshProfileManager();

    setStatus(
      "Mačka je uložená"
    );

  } catch (error) {

    console.error(
      "PROFILE SAVE ERROR:",
      error
    );

    if (savedInfo) {

      savedInfo.classList.remove(
        "hidden"
      );

      savedInfo.innerHTML = `

        <p style="margin:0;font-weight:700;">
          PROFIL SA NEPODARILO ULOŽIŤ
        </p>

        <p style="margin:8px 0 0;">
          ${escapeHtml(
            error.message
          )}
        </p>

      `;

    }

  }

}

/* =========================================================
   DELETE PROFILE
========================================================= */

function deleteCatProfile(
  id
) {

  const profiles =
    loadCatProfiles()
      .filter(
        profile =>
          profile.id !== id
      );

  saveCatProfiles(
    profiles
  );

  refreshProfileManager();

}

/* =========================================================
   PROFILE UI
========================================================= */

function createProfileManagerUI() {

  if (
    profileManagerInitialized
  ) {
    return;
  }

  profileManagerInitialized =
    true;

  const style =
    document.createElement(
      "style"
    );

  style.textContent = `

    #catProfilePanel {
      margin:18px auto;
      max-width:720px;
      padding:16px;
      border-radius:18px;
      background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.10);
    }

    #catProfilePanel h3 {
      margin:0 0 12px;
    }

    .cat-profile-row {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:12px 0;
      border-bottom:1px solid rgba(255,255,255,.08);
    }

    .cat-profile-meta {
      min-width:0;
    }

    .cat-profile-meta strong {
      display:block;
    }

    .cat-profile-meta small {
      opacity:.65;
    }

    .cat-profile-action {
      border:0;
      border-radius:10px;
      padding:7px 10px;
      cursor:pointer;
    }

    #catIdentityControls {
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      margin-top:14px;
    }

    #catIdentityControls button {
      cursor:pointer;
      border:0;
      border-radius:12px;
      padding:10px 14px;
      font-weight:700;
    }

  `;

  document.head.appendChild(
    style
  );

  const home =
    document.getElementById(
      "home"
    );

  if (!home) {
    return;
  }

  const panel =
    document.createElement(
      "section"
    );

  panel.id =
    "catProfilePanel";

  panel.innerHTML = `

    <h3>
      🐱 Moje mačky
    </h3>

    <div id="catProfileList">
      Načítavam...
    </div>

    <div id="catIdentityControls">

      <button
        id="addCatProfileButton">
        + Pridať mačku
      </button>

      <button
        id="identifyCatButton">
        🔎 Identifikovať mačku
      </button>

    </div>

  `;

  home.appendChild(
    panel
  );

  const addButton =
    document.getElementById(
      "addCatProfileButton"
    );

  const identifyButton =
    document.getElementById(
      "identifyCatButton"
    );

  if (addButton) {

    addButton.addEventListener(
      "click",
      () => {

        scanMode =
          "enroll";

        startCamera();

      }
    );

  }

  if (identifyButton) {

    identifyButton.addEventListener(
      "click",
      () => {

        if (
          loadCatProfiles()
            .length === 0
        ) {

          alert(
            "Najprv pridaj aspoň jednu mačku."
          );

          return;

        }

        scanMode =
          "identify";

        startCamera();

      }
    );

  }

  refreshProfileManager();

}

/* =========================================================
   REFRESH PROFILES
========================================================= */

function refreshProfileManager() {

  const list =
    document.getElementById(
      "catProfileList"
    );

  if (!list) {
    return;
  }

  const profiles =
    loadCatProfiles();

  if (!profiles.length) {

    list.innerHTML = `

      <p style="margin:0;opacity:.65;">
        Zatiaľ nemáš uloženú žiadnu mačku.
      </p>

    `;

    return;

  }

  list.innerHTML =
    profiles
      .map(
        profile => `

          <div class="cat-profile-row">

            <div class="cat-profile-meta">

              <strong>
                ${escapeHtml(
                  profile.name
                )}
              </strong>

              <small>

                ${
                  profile.nickname
                    ? escapeHtml(
                        profile.nickname
                      ) + " · "
                    : ""
                }

                ${
                  (
                    profile.samples ||
                    []
                  ).length
                }

                referenčných záberov

              </small>

            </div>

            <button
              class="cat-profile-action"
              data-delete-profile="${escapeHtml(
                profile.id
              )}">
              Zmazať
            </button>

          </div>

        `
      )
      .join("");

  list
    .querySelectorAll(
      "[data-delete-profile]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const id =
              button.getAttribute(
                "data-delete-profile"
              );

            if (
              confirm(
                "Naozaj chceš zmazať tento profil?"
              )
            ) {

              deleteCatProfile(
                id
              );

            }

          }
        );

      }
    );

}

/* =========================================================
   COUNTER
========================================================= */

function updateCounter() {

  if (!frameCounter) {
    return;
  }

  const count =
    scanMode === "enroll"
      ? samples.length
      : recognitionCandidates.length;

  frameCounter.textContent =
    count +
    " / " +
    (
      scanMode === "enroll"
        ? MAX_SAMPLES
        : 5
    );

}

/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}

/* =========================================================
   IMAGE / VIDEO TEST
========================================================= */

if (mediaInput) {

  mediaInput.addEventListener(
    "change",
    async event => {

      const file =
        event.target.files[0];

      if (!file) {
        return;
      }

      if (
        file.type.startsWith(
          "image/"
        )
      ) {

        await analyzeImageFile(
          file
        );

        return;

      }

      if (
        file.type.startsWith(
          "video/"
        )
      ) {

        sourceVideo.src =
          URL.createObjectURL(
            file
          );

        showScreen(
          "videoTest"
        );

      }

    }
  );

}

/* =========================================================
   IMAGE ANALYSIS
========================================================= */

async function analyzeImageFile(
  file
) {

  const ready =
    await initializeRoboflow();

  if (!ready) {
    return;
  }

  const url =
    URL.createObjectURL(
      file
    );

  const image =
    new Image();

  image.onload =
    async () => {

      videoCanvas.width =
        image.naturalWidth;

      videoCanvas.height =
        image.naturalHeight;

      const ctx =
        videoCanvas.getContext(
          "2d"
        );

      ctx.drawImage(
        image,
        0,
        0
      );

      const dataUrl =
        canvasToDataUrl(
          videoCanvas,
          0.80
        );

      try {

        const predictions =
          await runRoboflowWorkflow(
            dataUrl
          );

        const detection =
          selectBestDetection(
            predictions
          );

        videoResult.classList.remove(
          "hidden"
        );

        if (detection) {

          videoResult.innerHTML = `

            <p style="margin:0;font-weight:700;">
              CAT FACE DETECTED
            </p>

            <p style="margin:8px 0 0;">
              Confidence:
              ${Math.round(
                detection.confidence *
                100
              )}%
            </p>

          `;

        } else {

          videoResult.innerHTML = `

            <p style="margin:0;font-weight:700;">
              NO CAT FACE DETECTED
            </p>

          `;

        }

      } catch (error) {

        videoResult.classList.remove(
          "hidden"
        );

        videoResult.innerHTML = `

          <p style="margin:0;font-weight:700;">
            AI ERROR
          </p>

          <p style="margin:8px 0 0;">
            ${escapeHtml(
              error.message
            )}
          </p>

        `;

      }

      showScreen(
        "videoTest"
      );

    };

  image.src =
    url;

}

/* =========================================================
   VIDEO ANALYSIS
========================================================= */

const analyzeVideoButton =
  document.getElementById(
    "analyzeVideo"
  );

if (analyzeVideoButton) {

  analyzeVideoButton.addEventListener(
    "click",
    analyzeUploadedVideo
  );

}

async function analyzeUploadedVideo() {

  if (
    !sourceVideo ||
    !sourceVideo.src
  ) {
    return;
  }

  const ready =
    await initializeRoboflow();

  if (!ready) {
    return;
  }

  videoSamples.innerHTML =
    "";

  videoResult.classList.remove(
    "hidden"
  );

  videoResult.innerHTML = `
    <p style="margin:0;font-weight:700;">
      ANALYZING VIDEO...
    </p>
  `;

  const duration =
    sourceVideo.duration;

  if (
    !Number.isFinite(
      duration
    ) ||
    duration <= 0
  ) {

    videoResult.innerHTML = `
      <p style="margin:0;font-weight:700;">
        VIDEO NOT READY
      </p>
    `;

    return;

  }

  const results = [];

  const frameCount =
    Math.min(
      24,
      Math.max(
        8,
        Math.floor(
          duration * 6
        )
      )
    );

  for (
    let i = 0;
    i < frameCount;
    i++
  ) {

    const time =
      duration *
      (
        i /
        Math.max(
          1,
          frameCount - 1
        )
      );

    await seekVideo(
      sourceVideo,
      time
    );

    videoCanvas.width =
      sourceVideo.videoWidth;

    videoCanvas.height =
      sourceVideo.videoHeight;

    const ctx =
      videoCanvas.getContext(
        "2d"
      );

    ctx.drawImage(
      sourceVideo,
      0,
      0,
      videoCanvas.width,
      videoCanvas.height
    );

    const dataUrl =
      canvasToDataUrl(
        videoCanvas,
        0.80
      );

    try {

      const predictions =
        await runRoboflowWorkflow(
          dataUrl
        );

      const detection =
        selectBestDetection(
          predictions
        );

      if (detection) {

        results.push({

          time,

          confidence:
            detection.confidence,

          quality:
            calculateStaticImageQuality(
              videoCanvas,
              detection
            ),

          data:
            videoCanvas.toDataURL(
              "image/jpeg",
              0.88
            )

        });

      }

    } catch (error) {

      console.warn(
        "VIDEO FRAME ERROR:",
        error
      );

    }

  }

  results.sort(
    (a, b) =>
      (
        b.quality +
        b.confidence * 100
      ) -
      (
        a.quality +
        a.confidence * 100
      )
  );

  const best =
    results.slice(
      0,
      9
    );

  best.forEach(
    sample => {

      const img =
        document.createElement(
          "img"
        );

      img.src =
        sample.data;

      img.style.width =
        "100%";

      img.style.borderRadius =
        "12px";

      videoSamples.appendChild(
        img
      );

    }
  );

  if (best.length) {

    videoQuality.textContent =
      Math.round(
        best[0].confidence *
        100
      ) + "%";

    videoQualityBar.style.width =
      Math.round(
        best[0].confidence *
        100
      ) + "%";

    videoResult.innerHTML = `

      <p style="margin:0;font-weight:700;">
        CAT FACE DETECTIONS FOUND
      </p>

      <p style="margin:8px 0 0;">
        Vybraných záberov:
        ${best.length}
      </p>

    `;

  } else {

    videoResult.innerHTML = `

      <p style="margin:0;font-weight:700;">
        NO CAT FACE DETECTION
      </p>

    `;

  }

}

/* =========================================================
   STATIC IMAGE QUALITY
========================================================= */

function calculateStaticImageQuality(
  canvas,
  detection
) {

  if (
    !canvas ||
    !detection
  ) {
    return 0;
  }

  const areaRatio =
    (
      detection.bbox.width *
      detection.bbox.height
    ) /
    (
      canvas.width *
      canvas.height
    );

  const sizeScore =
    Math.min(
      100,
      (
        areaRatio /
        0.003
      ) * 100
    );

  return Math.round(
    detection.confidence *
    100 *
    0.7 +
    sizeScore *
    0.3
  );

}

/* =========================================================
   SEEK VIDEO
========================================================= */

function seekVideo(
  videoElement,
  time
) {

  return new Promise(
    resolve => {

      const handler =
        () => {

          videoElement.removeEventListener(
            "seeked",
            handler
          );

          resolve();

        };

      videoElement.addEventListener(
        "seeked",
        handler
      );

      videoElement.currentTime =
        time;

    }
  );

}

/* =========================================================
   BUTTONS
========================================================= */

const startCameraButton =
  document.getElementById(
    "startCamera"
  );

if (startCameraButton) {

  startCameraButton.addEventListener(
    "click",
    () => {

      scanMode =
        "enroll";

      startCamera();

    }
  );

}

const stopCameraButton =
  document.getElementById(
    "stopCamera"
  );

if (stopCameraButton) {

  stopCameraButton.addEventListener(
    "click",
    stopCamera
  );

}

const backHomeButton =
  document.getElementById(
    "backHome"
  );

if (backHomeButton) {

  backHomeButton.addEventListener(
    "click",
    () => {

      showScreen(
        "home"
      );

    }
  );

}

const profileBackButton =
  document.getElementById(
    "profileBack"
  );

if (profileBackButton) {

  profileBackButton.addEventListener(
    "click",
    () => {

      showScreen(
        "camera"
      );

    }
  );

}

const saveProfileButton =
  document.getElementById(
    "saveProfile"
  );

if (saveProfileButton) {

  saveProfileButton.addEventListener(
    "click",
    saveProfile
  );

}

/* =========================================================
   INITIALIZATION
========================================================= */

showScreen(
  "home"
);

setStatus(
  "Roboflow AI pripravené"
);

createProfileManagerUI();

refreshProfileManager();

updateCounter();

console.log(
  "CAT NOSE ID v0.9.0 loaded."
);

console.log(
  "Roboflow Workflow:",
  ROBOFLOW_WORKFLOW_URL
);
