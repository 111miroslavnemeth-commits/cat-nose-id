/* =========================================================
   CAT NOSE ID
   v0.9.1
   Roboflow RF-DETR Cat Face Detection
   Local Household Cat Profiles
   Automatic Reference Frame Selection
   TEST VERSION - ROBOFLOW KEY DIRECTLY EMBEDDED
========================================================= */


/* =========================================================
   ROBOFLOW CONFIGURATION
========================================================= */

const ROBOFLOW_WORKFLOW_URL =
  "https://serverless.roboflow.com/miroslav-nemeth/workflows/cat-face-data-atoiv";

/*
   TEST ONLY

   API key is intentionally embedded directly in this
   development version so we can verify that the
   Roboflow Workflow connection itself works.

   After successful testing this must be moved to a
   server-side environment.
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
  "catNoseIdProfiles_v2";

const RECOGNITION_MIN_SCORE = 0.72;

const MIN_SAMPLE_INTERVAL = 260;

const MAX_SCAN_TIME = 10000;

const INFERENCE_INTERVAL = 850;


/* =========================================================
   GLOBAL STATE
========================================================= */

let currentScreen = "home";

let cameraStream = null;

let modelReady = false;

let modelLoading = false;

let inferenceRunning = false;

let inferenceBusy = false;

let lastInferenceTime = 0;

let scanStartedAt = 0;

let lastAcceptedSampleTime = 0;

let samples = [];

let recognitionCandidates = [];

let bestDetection = null;

let scanFinished = false;

let scanMode = "enroll";

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
  document.getElementById(
    "detectionOverlay"
  );

const frameCanvas =
  document.getElementById(
    "frameCanvas"
  );

const frameCounter =
  document.getElementById(
    "frameCounter"
  );

const qualityText =
  document.getElementById(
    "qualityText"
  );

const qualityBar =
  document.getElementById(
    "qualityBar"
  );

const instruction =
  document.getElementById(
    "instruction"
  );

const engineStatus =
  document.getElementById(
    "engineStatus"
  );

const scanResult =
  document.getElementById(
    "scanResult"
  );

const detectorNote =
  document.getElementById(
    "detectorNote"
  );

const mediaInput =
  document.getElementById(
    "mediaInput"
  );

const sourceVideo =
  document.getElementById(
    "sourceVideo"
  );

const videoCanvas =
  document.getElementById(
    "videoCanvas"
  );

const videoQuality =
  document.getElementById(
    "videoQuality"
  );

const videoQualityBar =
  document.getElementById(
    "videoQualityBar"
  );

const videoResult =
  document.getElementById(
    "videoResult"
  );

const videoSamples =
  document.getElementById(
    "videoSamples"
  );


/* =========================================================
   SCREEN CONTROL
========================================================= */

function showScreen(name) {

  screens.forEach(id => {

    const element =
      document.getElementById(id);

    if (!element) {
      return;
    }

    element.classList.toggle(
      "active",
      id === name
    );

  });

  currentScreen = name;

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
   API KEY
========================================================= */

/*
   TEST VERSION:

   We deliberately DO NOT ask the user for an API key.

   The key is supplied directly by ROBOFLOW_API_KEY above.
*/

function getRoboflowApiKey() {

  return ROBOFLOW_API_KEY.trim();

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
      "Roboflow AI sa pripravuje..."
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

    const apiKey =
      getRoboflowApiKey();

    if (!apiKey) {

      throw new Error(
        "Roboflow API kľúč nie je nastavený."
      );

    }

    /*
       We don't call Roboflow here yet.

       This initialization only confirms that the
       application has a valid configured endpoint
       and API key.

       The real connection test happens when the
       first image is sent through runRoboflowWorkflow().
    */

    modelReady = true;

    setStatus(
      "Roboflow AI je pripravené"
    );

    if (detectorNote) {

      detectorNote.textContent =
        "Roboflow RF-DETR je pripojený. Aplikácia automaticky hľadá tvár mačky a vyberá najlepšie zábery.";

    }

    return true;

  } catch (error) {

    console.error(
      "ROBOFLOW INITIALIZATION ERROR:",
      error
    );

    modelReady = false;

    setStatus(
      "Roboflow AI nie je pripravené"
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

async function runRoboflowWorkflow(
  dataUrl
) {

  if (!dataUrl) {

    throw new Error(
      "Chýba obrazový frame."
    );

  }

  const ready =
    await initializeRoboflow();

  if (!ready) {

    throw new Error(
      "Roboflow AI nie je pripravené."
    );

  }

  const apiKey =
    getRoboflowApiKey();

  if (!apiKey) {

    throw new Error(
      "Chýba Roboflow API kľúč."
    );

  }

  const base64 =
    dataUrl.includes(",")
      ? dataUrl.split(",")[1]
      : dataUrl;


  let response;

  try {

    response =
      await fetch(
        ROBOFLOW_WORKFLOW_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              api_key:
                apiKey,

              inputs: {

                image: {

                  type:
                    "base64",

                  value:
                    base64

                }

              }

            })

        }
      );

  } catch (error) {

    console.error(
      "ROBOFLOW FETCH ERROR:",
      error
    );

    throw new Error(
      "Nepodarilo sa spojiť s Roboflow. Skontroluj internetové pripojenie alebo Roboflow Workflow."
    );

  }


  let result = null;

  try {

    result =
      await response.json();

  } catch (error) {

    let text = "";

    try {
      text =
        await response.text();
    } catch (_) {
      text = "";
    }

    throw new Error(
      `Roboflow neposlal platnú odpoveď. HTTP ${response.status}. ${text}`
    );

  }


  console.log(
    "ROBOFLOW HTTP STATUS:",
    response.status
  );

  console.log(
    "ROBOFLOW RESPONSE:",
    result
  );


  if (!response.ok) {

    let message =
      `Roboflow HTTP ${response.status}`;

    if (result) {

      if (result.error) {
        message +=
          `: ${result.error}`;
      } else if (result.message) {
        message +=
          `: ${result.message}`;
      }

    }

    throw new Error(
      message
    );

  }


  const predictions =
    extractPredictions(
      result
    );


  console.log(
    "ROBOFLOW NORMALIZED PREDICTIONS:",
    predictions
  );


  return predictions;

}


/* =========================================================
   ROBUST ROBOFLOW RESPONSE PARSER
========================================================= */

function extractPredictions(
  result
) {

  const found = [];

  const visited =
    new Set();


  function isPredictionObject(
    value
  ) {

    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return false;
    }

    const confidence =
      Number(
        value.confidence ??
        value.score ??
        value.class_confidence ??
        NaN
      );

    const hasConfidence =
      Number.isFinite(
        confidence
      );

    const box =
      value.bbox ||
      value.bounding_box ||
      value.boundingBox ||
      value.box ||
      value;

    const x =
      Number(box.x);

    const y =
      Number(box.y);

    const width =
      Number(
        box.width ??
        box.w
      );

    const height =
      Number(
        box.height ??
        box.h
      );

    return (
      hasConfidence &&
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    );

  }


  function normalizePrediction(
    value
  ) {

    const box =
      value.bbox ||
      value.bounding_box ||
      value.boundingBox ||
      value.box ||
      value;

    const confidence =
      Number(
        value.confidence ??
        value.score ??
        value.class_confidence ??
        0
      );

    return {

      confidence,

      className:
        value.class ||
        value.label ||
        value.name ||
        "cat-face",

      bbox: {

        x:
          Number(box.x),

        y:
          Number(box.y),

        width:
          Number(
            box.width ??
            box.w
          ),

        height:
          Number(
            box.height ??
            box.h
          )

      }

    };

  }


  function visit(
    value
  ) {

    if (
      !value ||
      typeof value !== "object"
    ) {
      return;
    }

    if (
      visited.has(value)
    ) {
      return;
    }

    visited.add(value);


    if (Array.isArray(value)) {

      for (
        const item
        of value
      ) {

        if (
          isPredictionObject(
            item
          )
        ) {

          found.push(
            normalizePrediction(
              item
            )
          );

        } else {

          visit(item);

        }

      }

      return;

    }


    if (
      isPredictionObject(
        value
      )
    ) {

      found.push(
        normalizePrediction(
          value
        )
      );

      return;

    }


    const priorityKeys = [

      "outputs",
      "predictions",
      "detections",
      "results",
      "result",
      "output",
      "inference",
      "data"

    ];


    for (
      const key
      of priorityKeys
    ) {

      if (
        value[key] !==
        undefined
      ) {

        visit(
          value[key]
        );

      }

    }


    for (
      const key
      of Object.keys(value)
    ) {

      if (
        priorityKeys.includes(
          key
        )
      ) {
        continue;
      }

      visit(
        value[key]
      );

    }

  }


  visit(result);


  return found;

}


/* =========================================================
   CANVAS
========================================================= */

function canvasToDataUrl(
  canvas,
  quality = 0.72
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
      await navigator.mediaDevices
        .getUserMedia({

          video: {

            facingMode: {
              ideal:
                "environment"
            },

            width: {
              ideal:
                1280
            },

            height: {
              ideal:
                720
            },

            frameRate: {
              ideal:
                30,
              max:
                60
            }

          },

          audio:
            false

        });


    video.srcObject =
      cameraStream;

    await video.play();


    showScreen(
      "camera"
    );


    resetScan();

    setupOverlay();


    setInstruction(
      scanMode ===
        "identify"
        ? "Hľadám uloženú mačku..."
        : "Namier kameru na mačku..."
    );


    const ready =
      await initializeRoboflow();


    if (!ready) {

      setInstruction(
        "AI sa nepodarilo pripojiť."
      );

      return;

    }


    setStatus(
      "Kamera + Roboflow AI sú pripravené"
    );


    setInstruction(
      scanMode ===
        "identify"
        ? "Hľadám mačku..."
        : "Hľadám tvár mačky..."
    );


    inferenceRunning =
      true;

    scanFinished =
      false;

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
      "Kameru sa nepodarilo spustiť.\n\nSkontroluj povolenie kamery v prehliadači."
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
      .forEach(
        track => {
          track.stop();
        }
      );

    cameraStream =
      null;

  }


  if (video) {

    video.pause();

    video.srcObject =
      null;

  }


  clearOverlay();


  showScreen(
    "home"
  );


  refreshProfileManager();


  setStatus(
    "Roboflow AI je pripravené"
  );

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
    qualityText.textContent =
      "—";
  }


  if (qualityBar) {
    qualityBar.style.width =
      "0%";
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
    !video.videoHeight ||
    !detectionOverlay
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
    detectionOverlay
      .getContext("2d");


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

    await finishAutomaticScan(
      "Automatické skenovanie dokončené."
    );

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

  inferenceBusy =
    true;


  try {

    await runCameraInference();

  } catch (error) {

    console.error(
      "INFERENCE ERROR:",
      error
    );


    inferenceRunning =
      false;

    scanFinished =
      true;


    setStatus(
      "Chyba Roboflow AI"
    );


    setInstruction(
      "AI vrátilo chybu — pozri správu nižšie."
    );


    showAIError(
      error
    );


    return;

  } finally {

    inferenceBusy =
      false;

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
      "2d",
      {
        willReadFrequently:
          true
      }
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


  const confidence =
    detection.confidence;


  const percentage =
    Math.round(
      confidence * 100
    );


  if (qualityText) {
    qualityText.textContent =
      `${percentage}%`;
  }


  if (qualityBar) {

    qualityBar.style.width =
      `${Math.max(
        5,
        Math.min(
          100,
          percentage
        )
      )}%`;

  }


  bestDetection =
    detection;


  setInstruction(
    `Tvár mačky detegovaná — ${percentage}%`
  );


  if (
    confidence >=
    CAPTURE_CONFIDENCE
  ) {

    await considerAutomaticCapture(
      detection
    );

  }

}


/* =========================================================
   SELECT BEST DETECTION
========================================================= */

function selectBestDetection(
  predictions
) {

  if (
    !Array.isArray(
      predictions
    ) ||
    !predictions.length
  ) {
    return null;
  }


  let best =
    null;


  for (
    const prediction
    of predictions
  ) {

    if (!prediction) {
      continue;
    }


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


    const bbox =
      prediction.bbox;


    if (
      !bbox ||
      !Number.isFinite(
        bbox.x
      ) ||
      !Number.isFinite(
        bbox.y
      ) ||
      !Number.isFinite(
        bbox.width
      ) ||
      !Number.isFinite(
        bbox.height
      )
    ) {
      continue;
    }


    const candidate = {

      confidence,

      className:
        prediction.className ||
        "cat-face",

      bbox: {

        x:
          Number(
            bbox.x
          ),

        y:
          Number(
            bbox.y
          ),

        width:
          Number(
            bbox.width
          ),

        height:
          Number(
            bbox.height
          )

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
   DRAW DETECTION
========================================================= */

function drawDetection(
  detection
) {

  if (!detectionOverlay) {
    return;
  }


  const ctx =
    detectionOverlay
      .getContext("2d");


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


  ctx.lineWidth =
    4;


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
    `CAT FACE ${Math.round(
      detection.confidence *
        100
    )}%`,
    left,
    Math.max(
      25,
      top - 8
    )
  );

}


/* =========================================================
   CAPTURE QUALITY
========================================================= */

function calculateCaptureQuality(
  detection
) {

  if (
    !detection ||
    !detection.bbox ||
    !video.videoWidth ||
    !video.videoHeight
  ) {
    return 0;
  }


  const b =
    detection.bbox;


  const area =
    b.width *
    b.height;


  const frameArea =
    video.videoWidth *
    video.videoHeight;


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
    b.x /
    video.videoWidth;


  const centerY =
    b.y /
    video.videoHeight;


  const distance =
    Math.sqrt(
      Math.pow(
        centerX -
          0.5,
        2
      ) +
      Math.pow(
        centerY -
          0.5,
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
    confidenceScore *
      0.55 +
    sizeScore *
      0.25 +
    centerScore *
      0.20
  );

}


/* =========================================================
   AUTOMATIC CAPTURE
========================================================= */

async function considerAutomaticCapture(
  detection
) {

  const now =
    performance.now();


  if (
    now -
      lastAcceptedSampleTime <
    MIN_SAMPLE_INTERVAL
  ) {
    return;
  }


  const list =
    scanMode ===
      "enroll"
      ? samples
      : recognitionCandidates;


  if (
    list.length >=
    MAX_CANDIDATES
  ) {
    return;
  }


  const quality =
    calculateCaptureQuality(
      detection
    );


  if (quality < 35) {
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


  const image =
    frameCanvas.toDataURL(
      "image/jpeg",
      0.88
    );


  const sample = {

    image,

    confidence:
      detection.confidence,

    quality,

    bbox:
      {
        ...detection.bbox
      },

    timestamp:
      Date.now()

  };


  list.push(
    sample
  );


  lastAcceptedSampleTime =
    now;


  updateCounter();


  if (
    scanMode ===
    "enroll"
  ) {

    setInstruction(
      `${samples.length} vhodných záberov zachytených...`
    );

  } else {

    setInstruction(
      `Analyzujem mačku... ${recognitionCandidates.length} záberov`
    );

  }

}


/* =========================================================
   DUPLICATE / SAMPLE SELECTION
========================================================= */

function bboxDistance(
  a,
  b
) {

  if (!a || !b) {
    return 999;
  }


  const ax =
    a.x;

  const ay =
    a.y;

  const bx =
    b.x;

  const by =
    b.y;


  const dx =
    ax - bx;

  const dy =
    ay - by;


  return Math.sqrt(
    dx * dx +
      dy * dy
  );

}


function selectBestReferenceSamples(
  list,
  count
) {

  if (
    !Array.isArray(list) ||
    !list.length
  ) {
    return [];
  }


  const sorted =
    [...list].sort(
      (a, b) =>
        (
          b.quality +
          b.confidence *
            100
        ) -
        (
          a.quality +
          a.confidence *
            100
        )
    );


  const selected = [];


  for (
    const candidate
    of sorted
  ) {

    if (
      selected.length >=
      count
    ) {
      break;
    }


    let tooSimilar =
      false;


    for (
      const existing
      of selected
    ) {

      if (
        bboxDistance(
          candidate.bbox,
          existing.bbox
        ) < 25 &&
        Math.abs(
          candidate.confidence -
            existing.confidence
        ) < 0.04
      ) {

        tooSimilar =
          true;

        break;

      }

    }


    if (!tooSimilar) {

      selected.push(
        candidate
      );

    }

  }


  return selected;

}


/* =========================================================
   FINISH SCAN
========================================================= */

async function finishAutomaticScan(
  message
) {

  if (scanFinished) {
    return;
  }


  scanFinished =
    true;

  inferenceRunning =
    false;


  if (
    scanMode ===
    "enroll"
  ) {

    samples =
      selectBestReferenceSamples(
        samples,
        MAX_SAMPLES
      );


    updateCounter();


    if (samples.length) {

      setInstruction(
        `${samples.length} najlepších záberov vybraných automaticky`
      );


      showScanResult();


    } else {

      showScanFailure();

    }


    return;

  }


  if (
    scanMode ===
    "identify"
  ) {

    const candidates =
      selectBestReferenceSamples(
        recognitionCandidates,
        5
      );


    samples =
      candidates;


    updateCounter();


    await identifyCurrentCat();


    return;

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
      Aplikácia vybrala najkvalitnejšie zábery z automatického skenovania.
    </p>

  `;


  if (
    currentScreen ===
    "camera"
  ) {

    setTimeout(
      () => {

        if (
          currentScreen ===
          "camera"
        ) {

          showScreen(
            "profile"
          );

        }

      },
      900
    );

  }

}


/* =========================================================
   SCAN FAILURE
========================================================= */

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


  setInstruction(
    "Tvár mačky sa nepodarilo detegovať."
  );

}


/* =========================================================
   AI ERROR
========================================================= */

function showAIError(
  error
) {

  if (!scanResult) {
    return;
  }


  scanResult.classList.remove(
    "hidden"
  );


  const message =
    error &&
    error.message
      ? error.message
      : "Neznáma chyba AI.";


  scanResult.innerHTML = `

    <p style="margin:0;font-weight:700;">
      ROBOFLOW AI CHYBA
    </p>

    <p style="margin:10px 0 0;word-break:break-word;">
      ${escapeHtml(
        message
      )}
    </p>

    <p style="margin:10px 0 0;opacity:.65;">
      Aplikácia tentoraz nezostane visieť na „Hľadám mačku“. Zobrazí skutočnú chybu pripojenia.
    </p>

  `;

}


/* =========================================================
   LOCAL CAT PROFILES
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
      JSON.parse(
        raw
      );


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


function deleteCatProfile(
  profileId
) {

  const profiles =
    loadCatProfiles();


  const filtered =
    profiles.filter(
      profile =>
        profile.id !==
        profileId
    );


  saveCatProfiles(
    filtered
  );


  refreshProfileManager();

}


/* =========================================================
   VISUAL FINGERPRINT
========================================================= */

async function createVisualFingerprint(
  dataUrl
) {

  return new Promise(
    resolve => {

      const img =
        new Image();


      img.onload = () => {

        const canvas =
          document.createElement(
            "canvas"
          );


        const size =
          24;


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
          img,
          0,
          0,
          size,
          size
        );


        const imageData =
          ctx.getImageData(
            0,
            0,
            size,
            size
          );


        const pixels =
          imageData.data;


        const gray = [];

        const rgb = [];


        for (
          let y = 0;
          y < size;
          y++
        ) {

          for (
            let x = 0;
            x < size;
            x++
          ) {

            const i =
              (
                y *
                  size +
                x
              ) *
              4;


            const r =
              pixels[i];

            const g =
              pixels[i + 1];

            const b =
              pixels[i + 2];


            const luminance =
              0.299 * r +
              0.587 * g +
              0.114 * b;


            gray.push(
              luminance
            );


            rgb.push(
              Math.round(
                r / 16
              ),
              Math.round(
                g / 16
              ),
              Math.round(
                b / 16
              )
            );

          }

        }


        const mean =
          gray.reduce(
            (sum, value) =>
              sum + value,
            0
          ) /
          gray.length;


        const variance =
          gray.reduce(
            (sum, value) =>
              sum +
              Math.pow(
                value -
                  mean,
                2
              ),
            0
          ) /
          gray.length;


        const std =
          Math.sqrt(
            variance
          ) || 1;


        const normalizedGray =
          gray.map(
            value =>
              Math.max(
                -2.5,
                Math.min(
                  2.5,
                  (
                    value -
                      mean
                  ) /
                    std
                )
              )
          );


        const smallGray = [];


        for (
          let y = 0;
          y < 24;
          y += 1.5
        ) {

          const yy =
            Math.min(
              23,
              Math.floor(y)
            );


          for (
            let x = 0;
            x < 24;
            x += 1.5
          ) {

            const xx =
              Math.min(
                23,
                Math.floor(x)
              );


            smallGray.push(
              Math.round(
                (
                  normalizedGray[
                    yy *
                      24 +
                    xx
                  ] +
                  2.5
                ) *
                  51
              )
            );

          }

        }


        resolve({

          gray:
            smallGray,

          rgb:
            rgb

        });

      };


      img.onerror =
        () =>
          resolve(
            null
          );


      img.src =
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
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length !==
      b.length ||
    !a.length
  ) {
    return 0;
  }


  let dot = 0;

  let normA = 0;

  let normB = 0;


  for (
    let i = 0;
    i < a.length;
    i++
  ) {

    const av =
      Number(
        a[i]
      );

    const bv =
      Number(
        b[i]
      );


    dot +=
      av * bv;

    normA +=
      av * av;

    normB +=
      bv * bv;

  }


  if (
    !normA ||
    !normB
  ) {
    return 0;
  }


  return (
    dot /
    (
      Math.sqrt(
        normA
      ) *
      Math.sqrt(
        normB
      )
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
   IDENTIFY CURRENT CAT
========================================================= */

async function identifyCurrentCat() {

  const profiles =
    loadCatProfiles();


  if (!profiles.length) {

    showIdentificationResult({

      type:
        "empty",

      message:
        "Zatiaľ nemáš uloženú žiadnu mačku."

    });

    return;

  }


  if (!samples.length) {

    showIdentificationResult({

      type:
        "empty",

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
    const sample
    of samples
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


  if (
    !candidateFingerprints.length
  ) {

    showIdentificationResult({

      type:
        "empty",

      message:
        "Nepodarilo sa vytvoriť vizuálny podpis."

    });

    return;

  }


  const results = [];


  for (
    const profile
    of profiles
  ) {

    const profileScores =
      [];


    for (
      const reference
      of (
        profile.samples ||
        []
      )
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

        profileScores.push(
          compareFingerprints(
            candidateFp,
            reference.fingerprint
          )
        );

      }

    }


    if (
      !profileScores.length
    ) {
      continue;
    }


    profileScores.sort(
      (a, b) =>
        b - a
    );


    const top =
      profileScores.slice(
        0,
        Math.min(
          5,
          profileScores.length
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
    margin >=
      0.035;


  if (!accepted) {

    showIdentificationResult({

      type:
        "unknown",

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

    type:
      "match",

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
    "empty"
  ) {

    scanResult.innerHTML = `

      <p style="margin:0;font-weight:700;">
        ŽIADNA MAČKA
      </p>

      <p style="margin:8px 0 0;opacity:.75;">
        ${escapeHtml(
          result.message
        )}
      </p>

    `;

    return;

  }


  if (
    result.type ===
    "unknown"
  ) {

    const score =
      Math.round(
        result.score *
          100
      );


    scanResult.innerHTML = `

      <p style="margin:0;font-weight:700;">
        MAČKU SA NEPODARILO SPOĽAHLIVO IDENTIFIKOVAŤ
      </p>

      <p style="margin:8px 0 0;">
        Najlepšia zhoda:
        ${score}%
      </p>

      ${
        result.winner
          ? `
            <p style="margin:8px 0 0;opacity:.75;">
              Najbližší profil:
              ${escapeHtml(
                result.winner.name
              )}
            </p>
          `
          : ""
      }

      <p style="margin:8px 0 0;opacity:.65;">
        Porovnanie prebehlo iba s mačkami uloženými v tomto zariadení.
      </p>

    `;

    return;

  }


  const score =
    Math.round(
      result.score *
        100
    );


  scanResult.innerHTML = `

    <p style="margin:0;font-weight:700;">
      🐱 MAČKA ROZPOZNANÁ
    </p>

    <p style="margin:10px 0 0;font-size:1.25em;font-weight:700;">
      ${escapeHtml(
        result.winner.name
      )}
    </p>

    ${
      result.winner.nickname
        ? `
          <p style="margin:4px 0 0;opacity:.75;">
            ${escapeHtml(
              result.winner.nickname
            )}
          </p>
        `
        : ""
    }

    <p style="margin:10px 0 0;">
      Vizuálna zhoda:
      ${score}%
    </p>

    <p style="margin:8px 0 0;opacity:.65;">
      Porovnanie prebehlo iba s mačkami uloženými v tomto zariadení.
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
          ŽIADNY ZÁBER
        </p>

      `;

    }

    return;

  }


  const catName =
    name ||
    "Unnamed cat";


  try {

    const profiles =
      loadCatProfiles();


    const now =
      Date.now();


    const profile = {

      id:
        "cat_" +
        now +
        "_" +
        Math.random()
          .toString(36)
          .slice(2, 8),

      name:
        catName,

      nickname:
        nickname,

      createdAt:
        now,

      samples:
        []

    };


    for (
      const sample
      of samples
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
            catName
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
          Profil je uložený lokálne v tomto zariadení.
        </p>

      `;

    }


    refreshProfileManager();


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

        <p style="margin:8px 0 0;opacity:.75;">
          ${escapeHtml(
            error.message ||
            "Neznáma chyba"
          )}
        </p>

      `;

    }

  }

}


/* =========================================================
   PROFILE MANAGER
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

      border:
        1px solid
        rgba(255,255,255,.12);

      border-radius:16px;

      background:
        rgba(0,0,0,.08);

    }


    #catProfilePanel h3 {
      margin:
        0 0 12px;
    }


    .cat-profile-row {

      display:flex;

      align-items:center;

      justify-content:space-between;

      gap:12px;

      padding:10px 0;

      border-bottom:
        1px solid
        rgba(255,255,255,.08);

    }


    .cat-profile-row:last-child {
      border-bottom:0;
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
        id="addCatProfileButton"
      >
        + Pridať mačku
      </button>

      <button
        id="identifyCatButton"
      >
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
   REFRESH PROFILE LIST
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
                      ) +
                      " · "
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
              )}"
            >
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
                "Naozaj chceš zmazať tento profil mačky?"
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
   ESCAPE HTML
========================================================= */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
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
    scanMode ===
      "enroll"
      ? samples.length
      : recognitionCandidates.length;


  frameCounter.textContent =
    `${count} / ${MAX_SAMPLES}`;

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
          0.72
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
              🐱 CAT FACE DETECTED
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


      URL.revokeObjectURL(
        url
      );


      showScreen(
        "videoTest"
      );

    };


  image.onerror =
    () => {

      URL.revokeObjectURL(
        url
      );

    };


  image.src =
    url;

}


/* =========================================================
   VIDEO ANALYSIS
========================================================= */

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
      ANALYZUJEM VIDEO...
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
        VIDEO NIE JE PRIPRAVENÉ
      </p>

    `;

    return;

  }


  const results = [];


  const frameCount =
    Math.min(
      30,
      Math.max(
        10,
        Math.floor(
          duration * 8
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
        0.72
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
        b.confidence *
          100
      ) -
      (
        a.quality +
        a.confidence *
          100
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
      `${Math.round(
        best[0].confidence *
          100
      )}%`;


    videoQualityBar.style.width =
      `${Math.round(
        best[0].confidence *
          100
      )}%`;


    videoResult.innerHTML = `

      <p style="margin:0;font-weight:700;">
        CAT FACE DETECTIONS FOUND
      </p>

      <p style="margin:8px 0 0;">
        Vybraných záberov:
        ${best.length}
      </p>

      <p style="margin:8px 0 0;">
        Najlepší AI výsledok:
        ${Math.round(
          best[0].confidence *
            100
        )}%
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
    !detection ||
    !detection.bbox
  ) {
    return 0;
  }


  const width =
    canvas.width;


  const height =
    canvas.height;


  const b =
    detection.bbox;


  const areaRatio =
    (
      b.width *
      b.height
    ) /
    (
      width *
      height
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
   VIDEO SEEK
========================================================= */

function seekVideo(
  videoElement,
  time
) {

  return new Promise(
    resolve => {

      const handler =
        () => {

          videoElement
            .removeEventListener(
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
   FILE INPUT
========================================================= */

if (mediaInput) {

  mediaInput.addEventListener(
    "change",
    event => {

      const file =
        event.target.files &&
        event.target.files[0];


      if (!file) {
        return;
      }


      if (
        file.type.startsWith(
          "image/"
        )
      ) {

        analyzeImageFile(
          file
        );

      } else if (
        file.type.startsWith(
          "video/"
        )
      ) {

        const url =
          URL.createObjectURL(
            file
          );


        sourceVideo.src =
          url;


        showScreen(
          "videoTest"
        );

      }

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
        "home"
      );

      refreshProfileManager();

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


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    createProfileManagerUI();

    setStatus(
      "CAT NOSE ID pripravené"
    );

  }
);


/*
   Also initialize immediately because this script
   is normally loaded at the end of <body>.
*/

createProfileManagerUI();

setStatus(
  "CAT NOSE ID pripravené"
);
