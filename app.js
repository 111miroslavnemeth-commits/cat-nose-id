/* =========================================================
   CAT NOSE ID
   Roboflow Cat Nose Detection
   Prototype v0.5.0
========================================================= */


/* =========================================================
   ROBOFLOW CONFIGURATION
========================================================= */

const ROBOFLOW_PUBLISHABLE_KEY =
  "rf_JGgApuVxUWez8vuNZfsIqbojNwp1";

const ROBOFLOW_MODEL =
  "cat-nose";

const ROBOFLOW_VERSION =
  1;


/*
   We deliberately start with a relatively permissive
   threshold so the application does not miss the nose
   too easily during the first live tests.
*/

const MODEL_SCORE_THRESHOLD = 0.20;


/*
   A frame must reach at least this confidence before
   it becomes a candidate for automatic capture.
*/

const CAPTURE_CONFIDENCE = 0.35;


/*
   Maximum number of automatically selected samples.
*/

const MAX_SAMPLES = 5;


/*
   Minimum time between accepted samples.

   This prevents the application from capturing
   five almost identical frames in a fraction of
   a second.
*/

const MIN_SAMPLE_INTERVAL = 450;


/*
   Maximum scan duration.
*/

const MAX_SCAN_TIME = 8000;


/*
   Inference interval.

   We deliberately do not run inference on every
   camera frame. The camera can run at 30/60 FPS,
   while AI inference runs at a sensible rate.
*/

const INFERENCE_INTERVAL = 120;


/* =========================================================
   GLOBAL STATE
========================================================= */

let currentScreen = "home";

let cameraStream = null;

let inferEngine = null;

let modelWorkerId = null;

let inferenceRunning = false;

let lastInferenceTime = 0;

let scanStartedAt = 0;

let lastAcceptedSampleTime = 0;

let samples = [];

let bestDetection = null;

let scanFinished = false;

let modelReady = false;


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
   BASIC SCREEN CONTROL
========================================================= */

function showScreen(name) {

  screens.forEach(id => {

    const el =
      document.getElementById(id);

    if (!el) return;

    el.classList.toggle(
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
   ROBOFLOW INITIALIZATION
========================================================= */

async function initializeRoboflow() {

  try {

    if (
      typeof inferencejs === "undefined"
    ) {

      throw new Error(
        "Roboflow inferencejs library did not load."
      );

    }


    setStatus(
      "Loading cat nose AI model..."
    );


    inferEngine =
      new inferencejs.InferenceEngine();


    modelWorkerId =
      await inferEngine.startWorker(
        ROBOFLOW_MODEL,
        ROBOFLOW_VERSION,
        ROBOFLOW_PUBLISHABLE_KEY,
        {
          scoreThreshold:
            MODEL_SCORE_THRESHOLD,

          iouThreshold:
            0.50,

          maxNumBoxes:
            5
        }
      );


    modelReady = true;


    setStatus(
      "Cat nose AI ready"
    );


    if (detectorNote) {

      detectorNote.textContent =
        "Roboflow cat-nose detection model is active. Detection is experimental and is not biometric identification.";

    }


  } catch (error) {

    console.error(
      "Roboflow initialization error:",
      error
    );


    modelReady = false;


    setStatus(
      "AI model failed to load"
    );


    if (detectorNote) {

      detectorNote.textContent =
        "The AI model could not be loaded. Check the browser connection and console.";

    }

  }

}


/* =========================================================
   CAMERA START
========================================================= */

async function startCamera() {

  try {

    if (!modelReady) {

      setStatus(
        "Loading AI model..."
      );

      await initializeRoboflow();

    }


    if (!modelReady) {

      alert(
        "The AI model could not be loaded."
      );

      return;

    }


    if (
      cameraStream
    ) {

      stopCamera();

    }


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
            max: 60
          }

        },

        audio: false

      });


    video.srcObject =
      cameraStream;


    await video.play();


    setupOverlay();


    resetScan();


    showScreen(
      "camera"
    );


    setStatus(
      "Camera active — searching for nose"
    );


    setInstruction(
      "Looking for the nose..."
    );


    inferenceRunning =
      true;


    scanStartedAt =
      performance.now();


    requestAnimationFrame(
      inferenceLoop
    );


  } catch (error) {

    console.error(
      "Camera error:",
      error
    );


    setStatus(
      "Camera could not be started"
    );


    alert(
      "Camera access could not be started. Please allow camera access in the browser."
    );

  }

}


/* =========================================================
   CAMERA STOP
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


  setStatus(
    modelReady
      ? "Cat nose AI ready"
      : "Capture engine ready"
  );

}


/* =========================================================
   RESET SCAN
========================================================= */

function resetScan() {

  samples = [];

  bestDetection = null;

  scanFinished = false;

  lastInferenceTime = 0;

  lastAcceptedSampleTime = 0;

  scanStartedAt =
    performance.now();


  updateCounter();


  qualityText.textContent =
    "—";


  qualityBar.style.width =
    "0%";


  scanResult.classList.add(
    "hidden"
  );


  clearOverlay();

}


/* =========================================================
   OVERLAY SETUP
========================================================= */

function setupOverlay() {

  if (
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


/* =========================================================
   CLEAR OVERLAY
========================================================= */

function clearOverlay() {

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


  /*
     Automatic timeout.
  */

  if (
    timestamp - scanStartedAt >
    MAX_SCAN_TIME
  ) {

    finishAutomaticScan(
      "Scan time completed."
    );

    return;

  }


  /*
     Avoid overlapping inference calls.
  */

  if (
    timestamp - lastInferenceTime <
    INFERENCE_INTERVAL
  ) {

    requestAnimationFrame(
      inferenceLoop
    );

    return;

  }


  lastInferenceTime =
    timestamp;


  try {

    await runCameraInference();

  } catch (error) {

    console.error(
      "Inference error:",
      error
    );

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
    !modelWorkerId ||
    video.readyState < 2
  ) {

    return;

  }


  const image =
    new inferencejs.CVImage(
      video
    );


  let predictions;


  try {

    predictions =
      await inferEngine.infer(
        modelWorkerId,
        image
      );

  } finally {

    try {

      image.dispose();

    } catch (_) {}

  }


  /*
     Find the strongest cat-nose detection.
  */

  const detection =
    selectBestDetection(
      predictions
    );


  drawDetection(
    detection
  );


  if (!detection) {

    qualityText.textContent =
      "Searching...";

    qualityBar.style.width =
      "5%";

    setInstruction(
      "Move the cat's nose closer to the camera..."
    );

    return;

  }


  const confidence =
    detection.confidence;


  const score =
    Math.round(
      confidence * 100
    );


  qualityText.textContent =
    `${score}%`;


  qualityBar.style.width =
    `${Math.max(
      5,
      Math.min(
        100,
        score
      )
    )}%`;


  bestDetection =
    detection;


  setInstruction(
    `Nose detected — ${score}%`
  );


  /*
     Automatic sample selection.
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
   SELECT BEST DETECTION
========================================================= */

function selectBestDetection(
  predictions
) {

  if (
    !Array.isArray(
      predictions
    ) ||
    predictions.length === 0
  ) {

    return null;

  }


  let best =
    null;


  for (
    const prediction
    of predictions
  ) {

    if (
      !prediction
    ) {

      continue;

    }


    const confidence =
      Number(
        prediction.confidence || 0
      );


    const bbox =
      prediction.bbox;


    if (
      !bbox ||
      confidence <= 0
    ) {

      continue;

    }


    const candidate = {

      confidence,

      className:
        prediction.class || "catnose",

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


  ctx.lineWidth =
    Math.max(
      3,
      detectionOverlay.width / 320
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
    `${Math.max(
      18,
      detectionOverlay.width / 35
    )}px Arial`;


  ctx.fillStyle =
    "#00ff88";


  ctx.fillText(
    `NOSE ${Math.round(
      detection.confidence * 100
    )}%`,
    left,
    Math.max(
      25,
      top - 8
    )
  );

}


/* =========================================================
   AUTOMATIC SAMPLE SELECTION
========================================================= */

async function considerAutomaticCapture(
  detection
) {

  if (
    scanFinished
  ) {

    return;

  }


  if (
    samples.length >=
    MAX_SAMPLES
  ) {

    finishAutomaticScan(
      "Five suitable nose samples captured."
    );

    return;

  }


  const now =
    performance.now();


  if (
    now -
    lastAcceptedSampleTime <
    MIN_SAMPLE_INTERVAL
  ) {

    return;

  }


  /*
     Calculate a simple quality score.

     This is NOT biometric scoring.
     It is only a capture-quality heuristic.
  */

  const quality =
    calculateCaptureQuality(
      detection
    );


  if (
    quality < 45
  ) {

    setInstruction(
      "Nose detected — improving image quality..."
    );

    return;

  }


  const frame =
    captureCurrentFrame();


  if (!frame) {

    return;

  }


  /*
     Prevent near-duplicate samples.
  */

  if (
    isDuplicateSample(
      frame,
      detection
    )
  ) {

    return;

  }


  samples.push({

    image:
      frame,

    confidence:
      detection.confidence,

    quality,

    bbox:
      detection.bbox,

    timestamp:
      Date.now()

  });


  lastAcceptedSampleTime =
    now;


  updateCounter();


  setInstruction(
    `Good nose sample captured — ${samples.length} / ${MAX_SAMPLES}`
  );


  if (
    samples.length >=
    MAX_SAMPLES
  ) {

    finishAutomaticScan(
      "Five suitable nose samples captured."
    );

  }

}


/* =========================================================
   CAPTURE FRAME
========================================================= */

function captureCurrentFrame() {

  if (
    !video.videoWidth ||
    !video.videoHeight
  ) {

    return null;

  }


  const width =
    video.videoWidth;


  const height =
    video.videoHeight;


  frameCanvas.width =
    width;

  frameCanvas.height =
    height;


  const ctx =
    frameCanvas.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );


  ctx.drawImage(
    video,
    0,
    0,
    width,
    height
  );


  return frameCanvas.toDataURL(
    "image/jpeg",
    0.92
  );

}


/* =========================================================
   CAPTURE QUALITY
========================================================= */

function calculateCaptureQuality(
  detection
) {

  const b =
    detection.bbox;


  const frameWidth =
    video.videoWidth;


  const frameHeight =
    video.videoHeight;


  if (
    !b ||
    !frameWidth ||
    !frameHeight
  ) {

    return 0;

  }


  /*
     Nose should not be extremely tiny.
  */

  const area =
    b.width *
    b.height;


  const frameArea =
    frameWidth *
    frameHeight;


  const areaRatio =
    area /
    frameArea;


  let sizeScore;


  if (
    areaRatio >=
    0.003
  ) {

    sizeScore =
      100;

  } else {

    sizeScore =
      Math.min(
        100,
        areaRatio /
        0.003 *
        100
      );

  }


  /*
     Confidence.
  */

  const confidenceScore =
    detection.confidence *
    100;


  /*
     Prefer detections reasonably close
     to the centre of the camera frame.
  */

  const centerX =
    b.x /
    frameWidth;


  const centerY =
    b.y /
    frameHeight;


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
      distance *
      140
    );


  /*
     Weighted quality score.
  */

  return Math.round(

    confidenceScore *
    0.55

    +

    sizeScore *
    0.25

    +

    centerScore *
    0.20

  );

}


/* =========================================================
   DUPLICATE SAMPLE CHECK
========================================================= */

function isDuplicateSample(
  frame,
  detection
) {

  if (
    samples.length === 0
  ) {

    return false;

  }


  const current =
    detection.bbox;


  const last =
    samples[
      samples.length - 1
    ].bbox;


  if (
    !last ||
    !current
  ) {

    return false;

  }


  const dx =
    Math.abs(
      current.x -
      last.x
    );


  const dy =
    Math.abs(
      current.y -
      last.y
    );


  const movement =
    Math.sqrt(
      dx * dx +
      dy * dy
    );


  /*
     If the nose has moved enough,
     consider it a different sample.
  */

  return movement < 12;

}


/* =========================================================
   UPDATE SAMPLE COUNTER
========================================================= */

function updateCounter() {

  frameCounter.textContent =
    `${samples.length} / ${MAX_SAMPLES}`;

}


/* =========================================================
   FINISH AUTOMATIC SCAN
========================================================= */

function finishAutomaticScan(
  message
) {

  if (
    scanFinished
  ) {

    return;

  }


  scanFinished =
    true;


  inferenceRunning =
    false;


  setInstruction(
    message
  );


  if (
    samples.length > 0
  ) {

    showScanResult();

  } else {

    showScanFailure();

  }

}


/* =========================================================
   SCAN RESULT
========================================================= */

function showScanResult() {

  scanResult.classList.remove(
    "hidden"
  );


  scanResult.innerHTML = `

    <p style="margin:0;font-weight:700;">
      NOSE SAMPLES CAPTURED
    </p>

    <p style="margin:8px 0 0;">
      ${samples.length} suitable frame${samples.length === 1 ? "" : "s"} selected automatically.
    </p>

    <p style="margin:8px 0 0;opacity:.75;">
      The next stage is biometric comparison.
    </p>

  `;


  /*
     After successful capture,
     move to profile after a short delay.
  */

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
    1200
  );

}


/* =========================================================
   SCAN FAILURE
========================================================= */

function showScanFailure() {

  scanResult.classList.remove(
    "hidden"
  );


  scanResult.innerHTML = `

    <p style="margin:0;font-weight:700;">
      NO SUITABLE NOSE FRAME
    </p>

    <p style="margin:8px 0 0;opacity:.75;">
      The camera did not obtain a sufficiently confident nose detection.
    </p>

    <p style="margin:8px 0 0;opacity:.75;">
      Try moving the cat slightly closer and keeping the nose visible.
    </p>

  `;


  setInstruction(
    "No suitable nose frame found."
  );

}


/* =========================================================
   MANUAL CAPTURE BUTTON
   Kept internally for compatibility, but the UI
   intentionally does not expose a capture button.
========================================================= */

function captureNow() {

  if (
    bestDetection
  ) {

    considerAutomaticCapture(
      bestDetection
    );

  }

}


/* =========================================================
   PROFILE SAVE
========================================================= */

function saveProfile() {

  const name =
    document.getElementById(
      "catName"
    ).value.trim();


  const nickname =
    document.getElementById(
      "catNickname"
    ).value.trim();


  const savedInfo =
    document.getElementById(
      "savedInfo"
    );


  if (
    samples.length === 0
  ) {

    savedInfo.classList.remove(
      "hidden"
    );


    savedInfo.innerHTML = `

      <p style="margin:0;font-weight:700;">
        NO SAMPLE AVAILABLE
      </p>

      <p style="margin:8px 0 0;opacity:.75;">
        The application needs at least one detected nose sample.
      </p>

    `;

    return;

  }


  const catName =
    name ||
    "Unnamed cat";


  savedInfo.classList.remove(
    "hidden"
  );


  savedInfo.innerHTML = `

    <p style="margin:0;font-weight:700;">
      NOSE SAMPLE SAVED
    </p>

    <p style="margin:8px 0 0;">
      Cat: ${escapeHtml(catName)}
    </p>

    ${
      nickname
        ? `<p style="margin:4px 0 0;opacity:.75;">
             ${escapeHtml(nickname)}
           </p>`
        : ""
    }

    <p style="margin:8px 0 0;opacity:.75;">
      ${samples.length} nose samples captured.
    </p>

    <p style="margin:8px 0 0;opacity:.75;">
      Biometric identification is not implemented yet.
    </p>

  `;

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(
  value
) {

  return value
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
   VIDEO / PHOTO TEST
========================================================= */

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


/* =========================================================
   IMAGE FILE ANALYSIS
========================================================= */

async function analyzeImageFile(
  file
) {

  try {

    if (!modelReady) {

      await initializeRoboflow();

    }


    if (!modelReady) {

      return;

    }


    const url =
      URL.createObjectURL(
        file
      );


    const img =
      new Image();


    img.src =
      url;


    await new Promise(
      (resolve, reject) => {

        img.onload =
          resolve;

        img.onerror =
          reject;

      }
    );


    const image =
      new inferencejs.CVImage(
        img
      );


    let predictions;


    try {

      predictions =
        await inferEngine.infer(
          modelWorkerId,
          image
        );

    } finally {

      try {

        image.dispose();

      } catch (_) {}

    }


    const detection =
      selectBestDetection(
        predictions
      );


    showScreen(
      "videoTest"
    );


    if (
      detection
    ) {

      videoResult.classList.remove(
        "hidden"
      );


      videoResult.innerHTML = `

        <p style="margin:0;font-weight:700;">
          NOSE DETECTED
        </p>

        <p style="margin:8px 0 0;">
          Confidence:
          ${Math.round(
            detection.confidence * 100
          )}%
        </p>

      `;

    } else {

      videoResult.classList.remove(
        "hidden"
      );


      videoResult.innerHTML = `

        <p style="margin:0;font-weight:700;">
          NOSE NOT DETECTED
        </p>

        <p style="margin:8px 0 0;opacity:.75;">
          Try another photograph with the cat facing the camera.
        </p>

      `;

    }


    URL.revokeObjectURL(
      url
    );


  } catch (error) {

    console.error(
      "Image analysis error:",
      error
    );

  }

}


/* =========================================================
   VIDEO ANALYSIS
========================================================= */

document
  .getElementById(
    "analyzeVideo"
  )
  .addEventListener(
    "click",
    analyzeUploadedVideo
  );


async function analyzeUploadedVideo() {

  if (
    !sourceVideo.src
  ) {

    return;

  }


  if (!modelReady) {

    await initializeRoboflow();

  }


  if (!modelReady) {

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


  const testSamples = [];

  const numberOfFrames =
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
    i < numberOfFrames;
    i++
  ) {

    const time =
      duration *
      (
        i /
        Math.max(
          1,
          numberOfFrames - 1
        )
      );


    await seekVideo(
      sourceVideo,
      time
    );


    const canvas =
      videoCanvas;


    canvas.width =
      sourceVideo.videoWidth;

    canvas.height =
      sourceVideo.videoHeight;


    const ctx =
      canvas.getContext(
        "2d"
      );


    ctx.drawImage(
      sourceVideo,
      0,
      0,
      canvas.width,
      canvas.height
    );


    const image =
      new inferencejs.CVImage(
        canvas
      );


    let predictions;


    try {

      predictions =
        await inferEngine.infer(
          modelWorkerId,
          image
        );

    } finally {

      try {

        image.dispose();

      } catch (_) {}

    }


    const detection =
      selectBestDetection(
        predictions
      );


    if (
      detection
    ) {

      testSamples.push({

        time,

        confidence:
          detection.confidence,

        data:
          canvas.toDataURL(
            "image/jpeg",
            0.88
          )

      });

    }

  }


  testSamples.sort(
    (
      a,
      b
    ) =>
      b.confidence -
      a.confidence
  );


  const best =
    testSamples.slice(
      0,
      5
    );


  videoSamples.innerHTML =
    "";


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


      img.title =
        `Confidence ${Math.round(
          sample.confidence * 100
        )}%`;


      videoSamples.appendChild(
        img
      );

    }
  );


  if (
    best.length > 0
  ) {

    const confidence =
      Math.round(
        best[0].confidence *
        100
      );


    videoResult.innerHTML = `

      <p style="margin:0;font-weight:700;">
        NOSE DETECTIONS FOUND
      </p>

      <p style="margin:8px 0 0;">
        ${best.length} suitable frames found.
      </p>

      <p style="margin:8px 0 0;opacity:.75;">
        Best confidence:
        ${confidence}%
      </p>

    `;

  } else {

    videoResult.innerHTML = `

      <p style="margin:0;font-weight:700;">
        NO NOSE DETECTION
      </p>

      <p style="margin:8px 0 0;opacity:.75;">
        The model did not find a sufficiently confident cat nose in the video.
      </p>

    `;

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

document
  .getElementById(
    "startCamera"
  )
  .addEventListener(
    "click",
    startCamera
  );


document
  .getElementById(
    "stopCamera"
  )
  .addEventListener(
    "click",
    stopCamera
  );


document
  .getElementById(
    "backHome"
  )
  .addEventListener(
    "click",
    () => {

      showScreen(
        "home"
      );

    }
  );


document
  .getElementById(
    "profileBack"
  )
  .addEventListener(
    "click",
    () => {

      showScreen(
        "camera"
      );

    }
  );


document
  .getElementById(
    "saveProfile"
  )
  .addEventListener(
    "click",
    saveProfile
  );


/*
   If an old version of the HTML still contains
   the captureNow button, it will continue to work.
   The new HTML intentionally does not show it.
*/

const oldCaptureButton =
  document.getElementById(
    "captureNow"
  );


if (
  oldCaptureButton
) {

  oldCaptureButton.addEventListener(
    "click",
    captureNow
  );

}


/* =========================================================
   VIDEO CLEANUP
========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    if (
      cameraStream
    ) {

      cameraStream
        .getTracks()
        .forEach(
          track =>
            track.stop()
        );

    }


    if (
      inferEngine &&
      modelWorkerId !== null
    ) {

      inferEngine
        .stopWorker(
          modelWorkerId
        )
        .catch(
          () => {}
        );

    }

  }
);


/* =========================================================
   INITIALIZATION
========================================================= */

showScreen(
  "home"
);


initializeRoboflow();
