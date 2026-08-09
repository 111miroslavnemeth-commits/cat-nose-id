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


/*
   IMPORTANT:
   The complete Roboflow project slug is required.

   NOT:
   cat-nose

   CORRECT:
   blanciagabriel/cat-nose
*/

const ROBOFLOW_MODEL =
  "blanciagabriel/cat-nose";

const ROBOFLOW_VERSION =
  1;


/* =========================================================
   DETECTION SETTINGS
========================================================= */

const MODEL_SCORE_THRESHOLD = 0.20;

const CAPTURE_CONFIDENCE = 0.30;

const MAX_SAMPLES = 5;

const MIN_SAMPLE_INTERVAL = 450;

const MAX_SCAN_TIME = 10000;

const INFERENCE_INTERVAL = 120;


/* =========================================================
   GLOBAL STATE
========================================================= */

let currentScreen = "home";

let cameraStream = null;

let inferEngine = null;

let modelWorkerId = null;

let modelReady = false;

let modelLoading = false;

let inferenceRunning = false;

let inferenceBusy = false;

let lastInferenceTime = 0;

let scanStartedAt = 0;

let lastAcceptedSampleTime = 0;

let samples = [];

let bestDetection = null;

let scanFinished = false;


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
    engineStatus.textContent =
      text;
  }

}


function setInstruction(text) {

  if (instruction) {
    instruction.textContent =
      text;
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
      "Načítavam AI model nosa..."
    );


    if (
      typeof inferencejs ===
      "undefined"
    ) {

      throw new Error(
        "Knižnica inferencejs sa nenačítala."
      );

    }


    /*
       Create Roboflow inference engine.
    */

    inferEngine =
      new inferencejs.InferenceEngine();


    /*
       Load the actual public model.

       IMPORTANT:
       blanciagabriel/cat-nose
       version 1
    */

    modelWorkerId =
      await inferEngine.startWorker(
        ROBOFLOW_MODEL,
        ROBOFLOW_VERSION,
        ROBOFLOW_PUBLISHABLE_KEY
      );


    if (
      modelWorkerId ===
      undefined ||
      modelWorkerId ===
      null
    ) {

      throw new Error(
        "Roboflow nevrátil ID modelu."
      );

    }


    modelReady = true;


    setStatus(
      "AI model nosa je pripravený"
    );


    if (detectorNote) {

      detectorNote.textContent =
        "Roboflow model na detekciu nosa je aktívny.";

    }


    return true;


  } catch (error) {

    console.error(
      "ROBOFLOW ERROR:",
      error
    );


    modelReady = false;


    const message =
      error &&
      error.message
        ? error.message
        : String(error);


    setStatus(
      "Načítanie AI modelu zlyhalo"
    );


    if (detectorNote) {

      detectorNote.textContent =
        "AI model sa nepodarilo načítať.";

    }


    /*
       IMPORTANT:
       Instead of hiding the real problem,
       show the actual error.
    */

    console.error(
      "Roboflow model:",
      ROBOFLOW_MODEL
    );

    console.error(
      "Roboflow version:",
      ROBOFLOW_VERSION
    );

    console.error(
      "Roboflow error message:",
      message
    );


    modelLoading = false;

    return false;

  } finally {

    modelLoading = false;

  }

}


/* =========================================================
   START CAMERA
========================================================= */

async function startCamera() {

  setStatus(
    "Pripravujem skener..."
  );


  /*
     Load AI first.
  */

  const ready =
    await initializeRoboflow();


  if (!ready) {

    alert(
      "AI model nosa sa nepodarilo načítať.\n\nModel: blanciagabriel/cat-nose/1\n\nSkontrolujeme presnú chybu v ďalšom kroku."
    );

    return;

  }


  try {

    /*
       Request camera.
    */

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
      "Kamera aktívna — hľadám nos"
    );


    setInstruction(
      "Hľadám nos mačky..."
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
      "CAMERA ERROR:",
      error
    );


    setStatus(
      "Kameru sa nepodarilo spustiť"
    );


    alert(
      "Kamera sa nepodarilo spustiť.\n\nSkontrolujte povolenie kamery v prehliadači."
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
        track =>
          track.stop()
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


  setStatus(
    modelReady
      ? "AI model nosa je pripravený"
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


  /*
     Scan timeout.
  */

  if (
    timestamp -
    scanStartedAt >
    MAX_SCAN_TIME
  ) {

    finishAutomaticScan(
      "Automatické skenovanie dokončené."
    );

    return;

  }


  /*
     Prevent multiple AI requests
     from running simultaneously.
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
     Control inference frequency.
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
      "INFERENCE ERROR:",
      error
    );

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
    !modelReady ||
    modelWorkerId === null ||
    !video ||
    video.readyState < 2
  ) {

    return;

  }


  /*
     Roboflow officially supports
     CVImage(HTMLVideoElement).
  */

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
      "Hľadám nos mačky..."
    );


    return;

  }


  const confidence =
    detection.confidence;


  const score =
    Math.round(
      confidence * 100
    );


  if (qualityText) {

    qualityText.textContent =
      `${score}%`;

  }


  if (qualityBar) {

    qualityBar.style.width =
      `${Math.max(
        5,
        Math.min(
          100,
          score
        )
      )}%`;

  }


  bestDetection =
    detection;


  setInstruction(
    `Nos detegovaný — ${score}%`
  );


  /*
     Automatically capture suitable frame.
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
    )
  ) {

    return null;

  }


  if (
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

    if (!prediction) {
      continue;
    }


    const confidence =
      Number(
        prediction.confidence ||
        0
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
        prediction.class ||
        "catnose",

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
    `NOSE ${Math.round(
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
   AUTOMATIC SAMPLE CAPTURE
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
      "Päť vhodných záberov zachytených."
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


  const quality =
    calculateCaptureQuality(
      detection
    );


  /*
     We intentionally use a
     relatively permissive quality threshold.
  */

  if (
    quality < 30
  ) {

    return;

  }


  const frame =
    captureCurrentFrame();


  if (!frame) {

    return;

  }


  if (
    isDuplicateSample(
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
    `Záber ${samples.length} / ${MAX_SAMPLES} zachytený`
  );


  if (
    samples.length >=
    MAX_SAMPLES
  ) {

    finishAutomaticScan(
      "Päť vhodných záberov zachytených."
    );

  }

}


/* =========================================================
   CAPTURE CURRENT FRAME
========================================================= */

function captureCurrentFrame() {

  if (
    !video ||
    !video.videoWidth ||
    !video.videoHeight
  ) {

    return null;

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


  const area =
    b.width *
    b.height;


  const frameArea =
    frameWidth *
    frameHeight;


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
      distance * 140
    );


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
   DUPLICATE DETECTION
========================================================= */

function isDuplicateSample(
  detection
) {

  if (
    samples.length === 0
  ) {

    return false;

  }


  const current =
    detection.bbox;


  const previous =
    samples[
      samples.length - 1
    ].bbox;


  if (
    !current ||
    !previous
  ) {

    return false;

  }


  const dx =
    Math.abs(
      current.x -
      previous.x
    );


  const dy =
    Math.abs(
      current.y -
      previous.y
    );


  const movement =
    Math.sqrt(
      dx * dx +
      dy * dy
    );


  return movement < 15;

}


/* =========================================================
   COUNTER
========================================================= */

function updateCounter() {

  if (frameCounter) {

    frameCounter.textContent =
      `${samples.length} / ${MAX_SAMPLES}`;

  }

}


/* =========================================================
   FINISH SCAN
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
   SUCCESS RESULT
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
      NOS SAMPLES CAPTURED
    </p>

    <p style="margin:8px 0 0;">
      Automaticky zachytených:
      ${samples.length}
    </p>

    <p style="margin:8px 0 0;opacity:.75;">
      Ďalšia fáza bude porovnávanie charakteristických znakov.
    </p>

  `;


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
   FAILURE RESULT
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
      NOS NEBOL DETEGOVANÝ
    </p>

    <p style="margin:8px 0 0;opacity:.75;">
      AI model počas skenovania nenašiel dostatočne spoľahlivý záber nosa.
    </p>

  `;


  setInstruction(
    "Nos sa nepodarilo spoľahlivo detegovať."
  );

}


/* =========================================================
   PROFILE
========================================================= */

function saveProfile() {

  const name =
    document
      .getElementById(
        "catName"
      )
      .value
      .trim();


  const nickname =
    document
      .getElementById(
        "catNickname"
      )
      .value
      .trim();


  const savedInfo =
    document
      .getElementById(
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
      Cat:
      ${escapeHtml(catName)}
    </p>

    ${
      nickname
        ? `
          <p style="margin:4px 0 0;opacity:.75;">
            ${escapeHtml(nickname)}
          </p>
        `
        : ""
    }

    <p style="margin:8px 0 0;opacity:.75;">
      ${samples.length} vzoriek nosa.
    </p>

  `;

}


/* =========================================================
   HTML ESCAPE
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
   VIDEO / PHOTO
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
   IMAGE ANALYSIS
========================================================= */

async function analyzeImageFile(
  file
) {

  const ready =
    await initializeRoboflow();


  if (!ready) {

    alert(
      "AI model sa nepodarilo načítať."
    );

    return;

  }


  try {

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


    videoResult.classList.remove(
      "hidden"
    );


    if (detection) {

      videoResult.innerHTML = `

        <p style="margin:0;font-weight:700;">
          NOSE DETECTED
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
          NOSE NOT DETECTED
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


    const image =
      new inferencejs.CVImage(
        videoCanvas
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


    if (detection) {

      results.push({

        time,

        confidence:
          detection.confidence,

        data:
          videoCanvas.toDataURL(
            "image/jpeg",
            0.88
          )

      });

    }

  }


  results.sort(
    (a, b) =>
      b.confidence -
      a.confidence
  );


  const best =
    results.slice(
      0,
      5
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

    videoResult.innerHTML = `

      <p style="margin:0;font-weight:700;">
        NOSE DETECTIONS FOUND
      </p>

      <p style="margin:8px 0 0;">
        ${best.length} vhodných záberov.
      </p>

      <p style="margin:8px 0 0;">
        Najlepší výsledok:
        ${Math.round(
          best[0].confidence *
          100
        )}%
      </p>

    `;

  } else {

    videoResult.innerHTML = `

      <p style="margin:0;font-weight:700;">
        NO NOSE DETECTION
      </p>

    `;

  }

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
    startCamera
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

/*
   IMPORTANT:
   Do NOT load the AI model automatically when the
   page opens.

   The model will load when the user presses
   SCAN WITH CAMERA.

   This makes troubleshooting much easier.
*/

showScreen(
  "home"
);


setStatus(
  "Capture engine ready"
);
