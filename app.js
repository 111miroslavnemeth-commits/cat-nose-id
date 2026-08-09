/* =========================================================
   CAT NOSE ID
   v1.0.0
   Roboflow RF-DETR Cat Face Detection
   Automatic Reference Frame Selection
   Local Cat Profiles
   Robust Roboflow Workflow Connection

   IMPORTANT:
   This is a TEST version.
   The Roboflow API key is intentionally included directly
   so that we can first verify that the connection works.
========================================================= */

"use strict";


/* =========================================================
   ROBOFLOW CONFIGURATION
========================================================= */

const ROBOFLOW_WORKFLOW_URL =
  "https://serverless.roboflow.com/infer/workflows/miroslav-nemeth/cat-face-data-atoiv";

const ROBOFLOW_API_KEY =
  "w4cawsZFX6ady8eie8XB";


/* =========================================================
   DETECTION SETTINGS
========================================================= */

const MODEL_SCORE_THRESHOLD = 0.20;

const CAPTURE_CONFIDENCE = 0.30;

const MAX_CANDIDATES = 36;

const MAX_SAMPLES = 9;

const MAX_SCAN_TIME = 10000;

const INFERENCE_INTERVAL = 850;

const MIN_SAMPLE_INTERVAL = 300;

const PROFILE_STORAGE_KEY =
  "catNoseIdProfiles_v3";

const RECOGNITION_MIN_SCORE = 0.72;


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
   DOM HELPERS
========================================================= */

const $ = id =>
  document.getElementById(id);


const screens = [
  "home",
  "camera",
  "videoTest",
  "profile"
];


const video =
  $("video");

const detectionOverlay =
  $("detectionOverlay");

const frameCanvas =
  $("frameCanvas");

const frameCounter =
  $("frameCounter");

const qualityText =
  $("qualityText");

const qualityBar =
  $("qualityBar");

const instruction =
  $("instruction");

const engineStatus =
  $("engineStatus");

const scanResult =
  $("scanResult");

const detectorNote =
  $("detectorNote");

const mediaInput =
  $("mediaInput");

const sourceVideo =
  $("sourceVideo");

const videoCanvas =
  $("videoCanvas");

const videoQuality =
  $("videoQuality");

const videoQualityBar =
  $("videoQualityBar");

const videoResult =
  $("videoResult");

const videoSamples =
  $("videoSamples");


/* =========================================================
   SCREEN CONTROL
========================================================= */

function showScreen(name) {

  screens.forEach(id => {

    const element =
      $(id);

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
   HTML ESCAPE
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================================================
   ROBOFLOW INITIALIZATION
========================================================= */

/*
   IMPORTANT:

   We DO NOT send an empty test image.

   An empty base64 image can produce a normal HTTP error even
   when the API key and Workflow are perfectly valid.

   Therefore the real camera/image request is the connection test.
*/

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
      !ROBOFLOW_WORKFLOW_URL
    ) {

      throw new Error(
        "Roboflow Workflow URL chýba."
      );

    }


    if (
      !ROBOFLOW_WORKFLOW_URL.includes(
        "/infer/workflows/"
      )
    ) {

      throw new Error(
        "Roboflow Workflow URL nemá správny formát."
      );

    }


    if (
      !ROBOFLOW_API_KEY ||
      ROBOFLOW_API_KEY.length < 10
    ) {

      throw new Error(
        "Roboflow API kľúč chýba alebo je neplatný."
      );

    }


    /*
       Configuration is valid.
       The actual connection will be tested when
       the first real image is sent.
    */

    modelReady = true;

    setStatus(
      "Roboflow AI pripravené — čakám na obrázok"
    );


    if (detectorNote) {

      detectorNote.textContent =
        "Roboflow RF-DETR je pripravený. Teraz čakám na skutočný obraz z kamery.";

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
        "Neznáma chyba Roboflow.";

    }


    return false;


  } finally {

    modelLoading = false;

  }

}


/* =========================================================
   ROBOFLOW WORKFLOW REQUEST
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
                ROBOFLOW_API_KEY,

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
      "Prehliadač sa nedokázal spojiť s Roboflow. " +
      "Skontroluj internetové pripojenie alebo CORS."
    );

  }


  /*
     Read response as text first.

     This allows us to show the real Roboflow response
     even if it is not valid JSON.
  */

  const responseText =
    await response.text();


  let result = null;


  try {

    result =
      responseText
        ? JSON.parse(responseText)
        : null;

  } catch (_) {

    result = null;

  }


  console.log(
    "=============================="
  );

  console.log(
    "ROBOFLOW HTTP:",
    response.status
  );

  console.log(
    "ROBOFLOW RESPONSE:",
    result || responseText
  );

  console.log(
    "=============================="
  );


  /*
     HTTP error.
  */

  if (!response.ok) {

    let message =
      `Roboflow HTTP ${response.status}`;


    if (
      result &&
      typeof result === "object"
    ) {

      if (result.error) {

        message +=
          `: ${result.error}`;

      } else if (result.message) {

        message +=
          `: ${result.message}`;

      } else {

        message +=
          `: ${responseText.slice(0, 500)}`;

      }

    } else {

      message +=
        `: ${responseText.slice(0, 500)}`;

    }


    throw new Error(
      message
    );

  }


  /*
     Successful HTTP response.
  */

  if (!result) {

    throw new Error(
      "Roboflow odpovedal, ale neposlal platný JSON."
    );

  }


  return extractPredictionsFromWorkflow(
    result
  );

}


/* =========================================================
   ROBUST WORKFLOW RESPONSE PARSER
========================================================= */

function extractPredictionsFromWorkflow(
  result
) {

  const found = [];

  const visited =
    new Set();


  function walk(value) {

    if (
      value === null ||
      value === undefined
    ) {
      return;
    }


    if (
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


    /*
       Array.
    */

    if (
      Array.isArray(value)
    ) {

      for (
        const item
        of value
      ) {

        walk(item);

      }

      return;

    }


    /*
       Standard Roboflow detection.

       x
       y
       width
       height
       confidence
    */

    if (

      value.x !== undefined &&

      value.y !== undefined &&

      value.width !== undefined &&

      value.height !== undefined &&

      value.confidence !== undefined

    ) {

      found.push(
        value
      );

    }


    /*
       Some responses use
       bounding_box instead of bbox.
    */

    if (
      value.bounding_box &&
      typeof value.bounding_box === "object"
    ) {

      const box =
        value.bounding_box;


      if (

        box.x !== undefined &&
        box.y !== undefined &&
        box.width !== undefined &&
        box.height !== undefined

      ) {

        found.push({

          ...value,

          x:
            box.x,

          y:
            box.y,

          width:
            box.width,

          height:
            box.height

        });

      }

    }


    /*
       Continue through all response fields.
    */

    for (
      const key
      of Object.keys(value)
    ) {

      walk(
        value[key]
      );

    }

  }


  walk(result);


  /*
     Remove obvious duplicates.
  */

  const unique = [];

  const signatures =
    new Set();


  for (
    const prediction
    of found
  ) {

    const signature =
      [
        prediction.x,
        prediction.y,
        prediction.width,
        prediction.height,
        prediction.confidence
      ].join("|");


    if (
      signatures.has(signature)
    ) {
      continue;
    }


    signatures.add(
      signature
    );


    unique.push(
      prediction
    );

  }


  return unique;

}


/* =========================================================
   CANVAS
========================================================= */

function canvasToDataUrl(
  canvas,
  quality = 0.78
) {

  if (
    !canvas ||
    !canvas.width ||
    !canvas.height
  ) {

    return null;

  }


  return canvas.toDataURL(
    "image/jpeg",
    quality
  );

}


/* =========================================================
   SELECT BEST DETECTION
========================================================= */

function selectBestDetection(
  predictions
) {

  if (
    !Array.isArray(predictions) ||
    !predictions.length
  ) {

    return null;

  }


  let best = null;


  for (
    const prediction
    of predictions
  ) {

    if (!prediction) {
      continue;
    }


    const confidence =
      Number(
        prediction.confidence ??
        prediction.score ??
        0
      );


    if (
      confidence <
      MODEL_SCORE_THRESHOLD
    ) {

      continue;

    }


    let x =
      Number(
        prediction.x
      );

    let y =
      Number(
        prediction.y
      );

    let width =
      Number(
        prediction.width
      );

    let height =
      Number(
        prediction.height
      );


    /*
       Alternative bbox structure.
    */

    if (
      prediction.bbox
    ) {

      x =
        Number(
          prediction.bbox.x
        );

      y =
        Number(
          prediction.bbox.y
        );

      width =
        Number(
          prediction.bbox.width
        );

      height =
        Number(
          prediction.bbox.height
        );

    }


    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {

      continue;

    }


    const candidate = {

      confidence,

      className:
        prediction.class ||
        prediction.class_name ||
        "cat-face",

      bbox: {

        x,
        y,
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
   DRAW DETECTION
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


  /*
     Roboflow coordinates are center-based.
  */

  const left =
    b.x -
    b.width / 2;


  const top =
    b.y -
    b.height / 2;


  ctx.lineWidth =
    Math.max(
      3,
      detectionOverlay.width / 400
    );


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
    `${Math.round(
      detection.confidence * 100
    )}%`,
    left + 8,
    Math.max(
      24,
      top - 8
    )
  );

}


/* =========================================================
   IMAGE QUALITY
========================================================= */

function calculateImageQuality(
  canvas
) {

  if (
    !canvas ||
    !canvas.width ||
    !canvas.height
  ) {

    return 0;

  }


  const small =
    document.createElement(
      "canvas"
    );


  const width =
    Math.min(
      320,
      canvas.width
    );


  const height =
    Math.max(
      1,
      Math.round(
        canvas.height *
        width /
        canvas.width
      )
    );


  small.width =
    width;

  small.height =
    height;


  const ctx =
    small.getContext(
      "2d",
      {
        willReadFrequently:
          true
      }
    );


  ctx.drawImage(
    canvas,
    0,
    0,
    width,
    height
  );


  const data =
    ctx.getImageData(
      0,
      0,
      width,
      height
    ).data;


  let total =
    0;

  let count =
    0;


  for (
    let y = 1;
    y < height - 1;
    y += 3
  ) {

    for (
      let x = 1;
      x < width - 1;
      x += 3
    ) {

      const i =
        (
          y *
          width +
          x
        ) * 4;


      const center =
        (
          0.299 * data[i] +
          0.587 * data[i + 1] +
          0.114 * data[i + 2]
        );


      const right =
        (
          0.299 * data[i + 4] +
          0.587 * data[i + 5] +
          0.114 * data[i + 6]
        );


      const downIndex =
        i +
        width * 4;


      const down =
        (
          0.299 * data[downIndex] +
          0.587 * data[downIndex + 1] +
          0.114 * data[downIndex + 2]
        );


      total +=
        Math.abs(
          center - right
        ) +
        Math.abs(
          center - down
        );


      count++;

    }

  }


  if (!count) {
    return 0;
  }


  return Math.round(
    Math.min(
      100,
      (
        total /
        count
      ) * 1.8
    )
  );

}


/* =========================================================
   CAPTURE QUALITY
========================================================= */

function calculateDetectionQuality(
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


  const imageQuality =
    calculateImageQuality(
      canvas
    );


  const b =
    detection.bbox;


  const frameArea =
    canvas.width *
    canvas.height;


  const detectionArea =
    b.width *
    b.height;


  const areaRatio =
    detectionArea /
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


  return Math.round(

    confidenceScore *
    0.55 +

    sizeScore *
    0.20 +

    imageQuality *
    0.25

  );

}


/* =========================================================
   CROP DETECTION
========================================================= */

function cropDetection(
  videoElement,
  detection
) {

  if (
    !videoElement ||
    !detection ||
    !detection.bbox
  ) {

    return null;

  }


  const b =
    detection.bbox;


  /*
     Expand the detected region so the
     reference contains the complete face
     around the detected area.
  */

  const side =
    Math.max(
      b.width * 2.8,
      b.height * 2.8,
      Math.min(
        videoElement.videoWidth,
        videoElement.videoHeight
      ) * 0.25
    );


  let sx =
    b.x -
    side / 2;


  let sy =
    b.y -
    side / 2;


  sx =
    Math.max(
      0,
      Math.min(
        videoElement.videoWidth -
          side,
        sx
      )
    );


  sy =
    Math.max(
      0,
      Math.min(
        videoElement.videoHeight -
          side,
        sy
      )
    );


  const canvas =
    document.createElement(
      "canvas"
    );


  canvas.width =
    512;

  canvas.height =
    512;


  const ctx =
    canvas.getContext(
      "2d"
    );


  ctx.drawImage(
    videoElement,
    sx,
    sy,
    side,
    side,
    0,
    0,
    512,
    512
  );


  return canvas.toDataURL(
    "image/jpeg",
    0.88
  );

}


/* =========================================================
   DUPLICATE DETECTION
========================================================= */

function isDuplicateDetection(
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
    list[list.length - 1];


  if (
    !previous ||
    !previous.bbox
  ) {

    return false;

  }


  const a =
    detection.bbox;


  const b =
    previous.bbox;


  const dx =
    a.x -
    b.x;


  const dy =
    a.y -
    b.y;


  const distance =
    Math.sqrt(
      dx * dx +
      dy * dy
    );


  const sizeChange =
    Math.abs(
      a.width -
      b.width
    ) /
    Math.max(
      1,
      b.width
    );


  return (
    distance < 18 &&
    sizeChange < 0.08
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


  if (
    isDuplicateDetection(
      detection
    )
  ) {

    return;

  }


  if (
    scanMode === "enroll" &&
    samples.length >= MAX_CANDIDATES
  ) {

    return;

  }


  if (
    scanMode === "identify" &&
    recognitionCandidates.length >=
    MAX_CANDIDATES
  ) {

    return;

  }


  const quality =
    calculateDetectionQuality(
      frameCanvas,
      detection
    );


  if (
    quality < 35
  ) {

    return;

  }


  const image =
    cropDetection(
      video,
      detection
    );


  if (!image) {
    return;
  }


  const candidate = {

    image,

    bbox: {
      ...detection.bbox
    },

    confidence:
      detection.confidence,

    quality,

    timestamp:
      Date.now()

  };


  if (
    scanMode === "enroll"
  ) {

    samples.push(
      candidate
    );


    if (
      samples.length >
      MAX_CANDIDATES
    ) {

      samples.sort(
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


      samples =
        samples.slice(
          0,
          MAX_CANDIDATES
        );

    }

  } else {

    recognitionCandidates.push(
      candidate
    );


    if (
      recognitionCandidates.length >
      MAX_CANDIDATES
    ) {

      recognitionCandidates =
        recognitionCandidates.slice(
          -MAX_CANDIDATES
        );

    }

  }


  lastAcceptedSampleTime =
    now;


  updateCounter();


  const count =
    scanMode === "enroll"
      ? samples.length
      : recognitionCandidates.length;


  setInstruction(
    `Zachytávam zábery — ${count} / ${MAX_CANDIDATES}`
  );

}


/* =========================================================
   SELECT BEST REFERENCE SAMPLES
========================================================= */

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
          b.confidence * 100
        ) -
        (
          a.quality +
          a.confidence * 100
        )
    );


  const selected = [];


  for (
    const candidate
    of sorted
  ) {

    if (
      selected.length >= count
    ) {

      break;

    }


    let similar =
      false;


    for (
      const existing
      of selected
    ) {

      if (
        !candidate.bbox ||
        !existing.bbox
      ) {

        continue;

      }


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


      if (
        distance < 25 &&
        Math.abs(
          candidate.confidence -
          existing.confidence
        ) < 0.04
      ) {

        similar =
          true;

        break;

      }

    }


    if (!similar) {

      selected.push(
        candidate
      );

    }

  }


  return selected;

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
    `${count} / ${MAX_SAMPLES}`;

}


/* =========================================================
   RESET SCAN
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

    scanResult.innerHTML = "";

  }


  clearOverlay();

}


/* =========================================================
   CAMERA START
========================================================= */

async function startCamera(
  mode = "enroll"
) {

  scanMode =
    mode;


  showScreen(
    "camera"
  );


  resetScan();


  setStatus(
    "Spúšťam kameru..."
  );


  setInstruction(
    "Pripravujem kameru..."
  );


  try {

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {

      throw new Error(
        "Tento prehliadač nepodporuje kameru."
      );

    }


    cameraStream =
      await navigator.mediaDevices.getUserMedia({

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


    if (!video) {

      throw new Error(
        "Video element sa nenašiel."
      );

    }


    video.srcObject =
      cameraStream;


    await video.play();


    /*
       Give the browser a moment to establish
       the actual video dimensions.
    */

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          250
        )
    );


    setupOverlay();


    setStatus(
      "Kamera aktívna — pripájam Roboflow AI"
    );


    const ready =
      await initializeRoboflow();


    if (!ready) {

      setInstruction(
        "Kamera funguje, ale AI sa nepodarilo pripraviť."
      );

      return;

    }


    setInstruction(
      scanMode === "identify"
        ? "Namier kameru na mačku..."
        : "Namier kameru na tvár mačky..."
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


    setInstruction(
      error.message ||
      "Skontroluj povolenie kamery."
    );

  }

}


/* =========================================================
   CAMERA STOP
========================================================= */

function stopCamera(
  returnHome = true
) {

  inferenceRunning =
    false;


  scanFinished =
    true;


  if (cameraStream) {

    cameraStream
      .getTracks()
      .forEach(
        track => {

          try {
            track.stop();
          } catch (_) {}

        }
      );


    cameraStream =
      null;

  }


  if (video) {

    try {
      video.pause();
    } catch (_) {}

    video.srcObject =
      null;

  }


  clearOverlay();


  if (returnHome) {

    showScreen(
      "home"
    );

    refreshProfileManager();

  }

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


  /*
     Maximum scan duration.
  */

  if (
    timestamp -
    scanStartedAt >=
    MAX_SCAN_TIME
  ) {

    await finishAutomaticScan();

    return;

  }


  /*
     Prevent simultaneous HTTP requests.
  */

  if (
    inferenceBusy
  ) {

    requestAnimationFrame(
      inferenceLoop
    );

    return;

  }


  /*
     Limit request frequency.
  */

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
      "=============================="
    );

    console.error(
      "CAMERA AI ERROR"
    );

    console.error(
      error
    );

    console.error(
      "=============================="
    );


    inferenceRunning =
      false;


    scanFinished =
      true;


    setStatus(
      "Roboflow AI vrátilo chybu"
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
    video.readyState < 2 ||
    !video.videoWidth ||
    !video.videoHeight
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


  /*
     No cat face.
  */

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


  /*
     Detection found.
  */

  bestDetection =
    detection;


  const confidence =
    detection.confidence;


  const percentage =
    Math.round(
      confidence * 100
    );


  const quality =
    calculateDetectionQuality(
      frameCanvas,
      detection
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
          quality
        )
      )}%`;

  }


  setInstruction(
    `Tvár mačky detegovaná — ${percentage}%`
  );


  /*
     Automatic frame capture.
  */

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
   FINISH AUTOMATIC SCAN
========================================================= */

async function finishAutomaticScan() {

  if (scanFinished) {
    return;
  }


  scanFinished =
    true;


  inferenceRunning =
    false;


  /*
     ENROLLMENT
  */

  if (
    scanMode === "enroll"
  ) {

    samples =
      selectBestReferenceSamples(
        samples,
        MAX_SAMPLES
      );


    updateCounter();


    if (
      samples.length
    ) {

      setInstruction(
        `${samples.length} najlepších záberov vybraných automaticky`
      );


      showScanResult();


    } else {

      showScanFailure();

    }


    return;

  }


  /*
     IDENTIFICATION
  */

  if (
    scanMode === "identify"
  ) {

    samples =
      selectBestReferenceSamples(
        recognitionCandidates,
        Math.min(
          MAX_SAMPLES,
          recognitionCandidates.length
        )
      );


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


  /*
     After a short moment open profile screen.
  */

  setTimeout(
    () => {

      if (
        currentScreen ===
        "camera"
      ) {

        stopCamera(
          false
        );

        showScreen(
          "profile"
        );

      }

    },
    900
  );

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
    "Tvár mačky sa nepodarilo spoľahlivo detegovať."
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

    <p style="
      margin:10px 0 0;
      word-break:break-word;
    ">
      ${escapeHtml(
        message
      )}
    </p>

    <p style="
      margin:10px 0 0;
      opacity:.65;
    ">
      Toto je skutočná odpoveď Roboflow. Aplikácia ju už neskrýva za všeobecnú hlášku.
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


      img.onload =
        () => {

          const canvas =
            document.createElement(
              "canvas"
            );


          const size =
            32;


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


          const data =
            ctx.getImageData(
              0,
              0,
              size,
              size
            ).data;


          const vector = [];


          for (
            let i = 0;
            i < data.length;
            i += 4
          ) {

            const r =
              data[i] /
              255;


            const g =
              data[i + 1] /
              255;


            const b =
              data[i + 2] /
              255;


            const gray =
              (
                0.299 * r +
                0.587 * g +
                0.114 * b
              );


            vector.push(
              gray,
              r,
              g,
              b
            );

          }


          resolve(
            vector
          );

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
    a.length !== b.length ||
    !a.length
  ) {

    return 0;

  }


  let dot =
    0;

  let normA =
    0;

  let normB =
    0;


  for (
    let i = 0;
    i < a.length;
    i++
  ) {

    dot +=
      a[i] *
      b[i];


    normA +=
      a[i] *
      a[i];


    normB +=
      b[i] *
      b[i];

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
   IDENTIFICATION
========================================================= */

async function identifyCurrentCat() {

  const profiles =
    loadCatProfiles();


  if (!profiles.length) {

    showIdentificationResult(
      "empty",
      "Zatiaľ nemáš uloženú žiadnu mačku."
    );


    return;

  }


  if (!samples.length) {

    showIdentificationResult(
      "empty",
      "Nepodarilo sa zachytiť vhodný záber."
    );


    return;

  }


  setInstruction(
    "Porovnávam mačku s uloženými profilmi..."
  );


  const currentFingerprints =
    [];


  for (
    const sample
    of samples
  ) {

    const fingerprint =
      await createVisualFingerprint(
        sample.image
      );


    if (fingerprint) {

      currentFingerprints.push(
        fingerprint
      );

    }

  }


  if (
    !currentFingerprints.length
  ) {

    showIdentificationResult(
      "empty",
      "Nepodarilo sa vytvoriť vizuálny podpis."
    );


    return;

  }


  const results = [];


  for (
    const profile
    of profiles
  ) {

    let bestScore =
      0;


    for (
      const stored
      of profile.samples || []
    ) {

      if (
        !stored.fingerprint
      ) {

        continue;

      }


      for (
        const current
        of currentFingerprints
      ) {

        const score =
          vectorSimilarity(
            current,
            stored.fingerprint
          );


        if (
          score >
          bestScore
        ) {

          bestScore =
            score;

        }

      }

    }


    results.push({

      profile,

      score:
        bestScore

    });

  }


  results.sort(
    (a, b) =>
      b.score -
      a.score
  );


  const best =
    results[0];


  if (
    !best ||
    best.score <
    RECOGNITION_MIN_SCORE
  ) {

    showIdentificationResult(
      "unknown",
      "Nepodarilo sa spoľahlivo určiť uloženú mačku."
    );


    return;

  }


  showIdentificationResult(
    "found",
    best.profile.name,
    best.score
  );

}


/* =========================================================
   IDENTIFICATION RESULT
========================================================= */

function showIdentificationResult(
  type,
  message,
  score = 0
) {

  if (!scanResult) {
    return;
  }


  scanResult.classList.remove(
    "hidden"
  );


  if (
    type ===
    "found"
  ) {

    scanResult.innerHTML = `

      <p style="margin:0;font-weight:700;">
        🐱 MAČKA ROZPOZNANÁ
      </p>

      <p style="margin:10px 0 0;font-size:20px;">
        ${escapeHtml(
          message
        )}
      </p>

      <p style="margin:8px 0 0;opacity:.75;">
        Zhoda:
        ${Math.round(
          score * 100
        )}%
      </p>

    `;


    setInstruction(
      `Rozpoznaná mačka: ${message}`
    );


  } else {

    scanResult.innerHTML = `

      <p style="margin:0;font-weight:700;">
        MAČKA NEBOLA SPOĽAHLIVO ROZPOZNANÁ
      </p>

      <p style="margin:10px 0 0;opacity:.75;">
        ${escapeHtml(
          message
        )}
      </p>

    `;


    setInstruction(
      "Mačku sa nepodarilo spoľahlivo identifikovať."
    );

  }

}


/* =========================================================
   SAVE CAT PROFILE
========================================================= */

async function saveCatProfile() {

  const name =
    (
      $("catName")?.value ||
      ""
    ).trim();


  const nickname =
    (
      $("catNickname")?.value ||
      ""
    ).trim();


  const savedInfo =
    $("savedInfo");


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
      "Neznáma mačka",

    nickname,

    createdAt:
      new Date()
        .toISOString(),

    samples:
      []

  };


  try {

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
   PROFILE MANAGER UI
========================================================= */

function createProfileManagerUI() {

  if (
    profileManagerInitialized
  ) {

    return;

  }


  profileManagerInitialized =
    true;


  const home =
    $("home");


  if (!home) {
    return;
  }


  /*
     Add only once.
  */

  const existing =
    $("catProfilePanel");


  if (existing) {
    return;
  }


  const style =
    document.createElement(
      "style"
    );


  style.textContent = `

    #catProfilePanel {
      margin:18px auto;
      max-width:720px;
      padding:16px;
      border:1px solid rgba(255,255,255,.12);
      border-radius:16px;
      background:rgba(0,0,0,.08);
    }

    #catProfilePanel h3 {
      margin:0 0 12px;
    }

    .cat-profile-row {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:10px 0;
      border-bottom:1px solid rgba(255,255,255,.08);
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
    $("addCatProfileButton");


  const identifyButton =
    $("identifyCatButton");


  if (addButton) {

    addButton.addEventListener(
      "click",
      () => {

        startCamera(
          "enroll"
        );

      }
    );

  }


  if (identifyButton) {

    identifyButton.addEventListener(
      "click",
      () => {

        if (
          !loadCatProfiles()
            .length
        ) {

          alert(
            "Najprv pridaj aspoň jednu mačku."
          );

          return;

        }


        startCamera(
          "identify"
        );

      }
    );

  }


  refreshProfileManager();

}


/* =========================================================
   REFRESH PROFILE MANAGER
========================================================= */

function refreshProfileManager() {

  const list =
    $("catProfileList");


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
   IMAGE / VIDEO TEST
========================================================= */

async function analyzeImageFile(
  file
) {

  showScreen(
    "videoTest"
  );


  if (videoResult) {

    videoResult.classList.remove(
      "hidden"
    );


    videoResult.innerHTML =
      "<p>Odosielam obrázok do Roboflow...</p>";

  }


  try {

    const dataUrl =
      await new Promise(
        (resolve, reject) => {

          const reader =
            new FileReader();


          reader.onload =
            () =>
              resolve(
                reader.result
              );


          reader.onerror =
            reject;


          reader.readAsDataURL(
            file
          );

        }
      );


    const predictions =
      await runRoboflowWorkflow(
        dataUrl
      );


    const detection =
      selectBestDetection(
        predictions
      );


    if (detection) {

      if (videoResult) {

        videoResult.innerHTML = `

          <p style="margin:0;font-weight:700;">
            🐱 TVÁR MAČKY DETEGOVANÁ
          </p>

          <p style="margin:8px 0 0;">
            Confidence:
            ${Math.round(
              detection.confidence * 100
            )}%
          </p>

        `;

      }

    } else {

      if (videoResult) {

        videoResult.innerHTML = `

          <p style="margin:0;font-weight:700;">
            MAČKA NEBOLA DETEGOVANÁ
          </p>

          <p style="margin:8px 0 0;opacity:.7;">
            Roboflow obrázok prijal, ale model v ňom nenašiel vhodnú detekciu.
          </p>

        `;

      }

    }


  } catch (error) {

    if (videoResult) {

      videoResult.innerHTML = `

        <p style="margin:0;font-weight:700;">
          ROBOFLOW CHYBA
        </p>

        <p style="
          margin:10px 0 0;
          word-break:break-word;
        ">
          ${escapeHtml(
            error.message
          )}
        </p>

      `;

    }

  }

}


/* =========================================================
   VIDEO ANALYSIS
========================================================= */

async function analyzeUploadedVideo() {

  if (
    !sourceVideo ||
    !Number.isFinite(
      sourceVideo.duration
    ) ||
    sourceVideo.duration <= 0
  ) {

    alert(
      "Najprv vyber video."
    );

    return;

  }


  const ready =
    await initializeRoboflow();


  if (!ready) {
    return;
  }


  if (videoSamples) {
    videoSamples.innerHTML = "";
  }


  if (videoResult) {

    videoResult.classList.remove(
      "hidden"
    );


    videoResult.innerHTML =
      "<p>Analyzujem video...</p>";

  }


  const duration =
    sourceVideo.duration;


  const frameCount =
    9;


  const results = [];


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
        0.78
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

          data:
            dataUrl,

          confidence:
            detection.confidence,

          quality:
            calculateDetectionQuality(
              videoCanvas,
              detection
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


  if (videoSamples) {

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

  }


  if (videoResult) {

    if (best.length) {

      videoResult.innerHTML = `

        <p style="margin:0;font-weight:700;">
          🐱 TVÁRE MAČIEK DETEGOVANÉ
        </p>

        <p style="margin:8px 0 0;">
          Vhodných záberov:
          ${best.length}
        </p>

        <p style="margin:8px 0 0;">
          Najlepší výsledok:
          ${Math.round(
            best[0].confidence * 100
          )}%
        </p>

      `;

    } else {

      videoResult.innerHTML = `

        <p style="margin:0;font-weight:700;">
          MAČKA NEBOLA DETEGOVANÁ
        </p>

      `;

    }

  }

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
  $("startCamera");


if (startCameraButton) {

  startCameraButton.addEventListener(
    "click",
    () =>
      startCamera(
        "enroll"
      )
  );

}


const stopCameraButton =
  $("stopCamera");


if (stopCameraButton) {

  stopCameraButton.addEventListener(
    "click",
    () =>
      stopCamera(
        true
      )
  );

}


const backHomeButton =
  $("backHome");


if (backHomeButton) {

  backHomeButton.addEventListener(
    "click",
    () => {

      if (
        cameraStream
      ) {

        stopCamera(
          true
        );

      } else {

        showScreen(
          "home"
        );

      }

    }
  );

}


const profileBackButton =
  $("profileBack");


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
  $("saveProfile");


if (saveProfileButton) {

  saveProfileButton.addEventListener(
    "click",
    saveCatProfile
  );

}


const finishScanButton =
  $("finishScan");


if (finishScanButton) {

  finishScanButton.addEventListener(
    "click",
    () =>
      finishAutomaticScan()
  );

}


const analyzeVideoButton =
  $("analyzeVideo");


if (analyzeVideoButton) {

  analyzeVideoButton.addEventListener(
    "click",
    analyzeUploadedVideo
  );

}


/* =========================================================
   INITIALIZATION
========================================================= */

function initializeApplication() {

  showScreen(
    "home"
  );


  setStatus(
    "CAT NOSE ID pripravené"
  );


  createProfileManagerUI();


  refreshProfileManager();


  updateCounter();

}


/*
   Support both script placement modes:
   - script at end of body
   - script in head
*/

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeApplication,
    {
      once:
        true
    }
  );

} else {

  initializeApplication();

}


/* =========================================================
   END
========================================================= */
