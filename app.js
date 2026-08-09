/* =========================================================
   CAT NOSE ID
   Prototype v0.6.0
   Roboflow Cat Nose Detection
   Local Cat Profiles + Prototype Identity Matching
========================================================= */

/* =========================================================
   ROBOFLOW CONFIGURATION
========================================================= */

const ROBOFLOW_PUBLISHABLE_KEY =
  "rf_JGgApuVxUWez8vuNZfsIqbojNwp1";

const ROBOFLOW_MODEL =
  "blanciagabrielli/cat-nose-detection";

const ROBOFLOW_VERSION =
  "1";

const ROBOFLOW_API_URL =
  `https://detect.roboflow.com/${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}`;

const MAX_SAMPLES = 9;
const MAX_CANDIDATES = 36;

const PROFILE_STORAGE_KEY =
  "catNoseIdProfiles_v1";

const RECOGNITION_MIN_SCORE =
  0.72;

const MIN_SAMPLE_INTERVAL =
  260;

const MAX_SCAN_TIME =
  8000;


/* =========================================================
   GLOBAL STATE
========================================================= */

let video = null;
let canvas = null;
let frameCanvas = null;

let stream = null;

let detectorReady = false;

let inferenceBusy = false;
let inferenceRunning = false;

let lastInferenceTime = 0;
let lastAcceptedSampleTime = 0;

let scanStartedAt = 0;

let samples = [];

let recognitionCandidates = [];

let recognitionResult = null;

let bestDetection = null;

let scanFinished = false;

let scanMode = "enroll";

let profileManagerInitialized = false;

let currentScreen = "home";


/* =========================================================
   DOM REFERENCES
========================================================= */

const cameraScreen =
  document.getElementById("camera");

const homeScreen =
  document.getElementById("home");

const profileScreen =
  document.getElementById("profile");

const scanResult =
  document.getElementById("scanResult");

const qualityText =
  document.getElementById("qualityText");

const qualityBar =
  document.getElementById("qualityBar");

const counter =
  document.getElementById("counter");

const instruction =
  document.getElementById("instruction");

const statusText =
  document.getElementById("status");

const detectorNote =
  document.getElementById("detectorNote");

const startCameraButton =
  document.getElementById("startCamera");

const captureButton =
  document.getElementById("captureButton");

const stopCameraButton =
  document.getElementById("stopCamera");

const backButton =
  document.getElementById("backButton");

const saveProfileButton =
  document.getElementById("saveProfile");


/* =========================================================
   BASIC UTILITIES
========================================================= */

function setStatus(
  message
) {

  if (statusText) {
    statusText.textContent =
      message;
  }

}


function setInstruction(
  message
) {

  if (instruction) {
    instruction.textContent =
      message;
  }

}


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
   SCREEN MANAGEMENT
========================================================= */

function showScreen(
  screen
) {

  currentScreen =
    screen;

  const screens = [
    homeScreen,
    cameraScreen,
    profileScreen
  ];

  screens.forEach(
    element => {

      if (!element) {
        return;
      }

      element.classList.add(
        "hidden"
      );

    }
  );

  if (
    screen === "home" &&
    homeScreen
  ) {

    homeScreen.classList.remove(
      "hidden"
    );

  }

  if (
    screen === "camera" &&
    cameraScreen
  ) {

    cameraScreen.classList.remove(
      "hidden"
    );

  }

  if (
    screen === "profile" &&
    profileScreen
  ) {

    profileScreen.classList.remove(
      "hidden"
    );

  }

}


/* =========================================================
   RESET SCAN
========================================================= */

function resetScan() {

  samples = [];

  recognitionCandidates = [];

  recognitionResult = null;

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
   CAMERA
========================================================= */

async function startCamera() {

  try {

    resetScan();

    showScreen(
      "camera"
    );

    setStatus(
      "Spúšťam kameru..."
    );

    setInstruction(
      scanMode === "identify"
        ? "Hľadám mačku..."
        : "Načítavam detekciu nosa..."
    );

    if (stream) {

      stream
        .getTracks()
        .forEach(
          track =>
            track.stop()
        );

    }

    stream =
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
          }
        },
        audio: false
      });

    video =
      document.getElementById(
        "video"
      );

    if (!video) {
      throw new Error(
        "Video element not found."
      );
    }

    video.srcObject =
      stream;

    await video.play();

    frameCanvas =
      document.createElement(
        "canvas"
      );

    frameCanvas.width =
      video.videoWidth;

    frameCanvas.height =
      video.videoHeight;

    setStatus(
      "Kamera je pripravená."
    );

    await initializeDetector();

    scanStartedAt =
      performance.now();

    inferenceRunning =
      true;

    runInferenceLoop();

  } catch (error) {

    console.error(
      "CAMERA ERROR:",
      error
    );

    setStatus(
      "Kameru sa nepodarilo spustiť."
    );

    setInstruction(
      error.message ||
      "Skontroluj povolenie kamery."
    );

  }

}


function stopCamera() {

  inferenceRunning =
    false;

  inferenceBusy =
    false;

  if (stream) {

    stream
      .getTracks()
      .forEach(
        track =>
          track.stop()
      );

  }

  stream =
    null;

  if (video) {

    video.srcObject =
      null;

  }

  showScreen(
    "home"
  );

  refreshProfileManager();

}


/* =========================================================
   ROBOFLOW DETECTOR
========================================================= */

async function initializeDetector() {

  if (detectorReady) {
    return;
  }

  if (detectorNote) {

    detectorNote.textContent =
      scanMode === "identify"
        ? "Roboflow deteguje nos. Identita mačky sa následne porovná s lokálne uloženými profilmi."
        : "Roboflow Cat Nose model je aktívny. Identita mačky sa pri ukladaní vytvorí z automaticky vybraných referenčných záberov.";

  }

  /*
     The browser-side prototype calls the Roboflow
     hosted model directly using the publishable key.
  */

  detectorReady =
    true;

}


async function runInferenceLoop() {

  if (!inferenceRunning) {
    return;
  }

  if (
    performance.now() -
    scanStartedAt >
    MAX_SCAN_TIME
  ) {

    await finishAutomaticScan(
      "Skenovanie dokončené."
    );

    return;

  }

  try {

    if (
      !inferenceBusy &&
      video &&
      video.readyState >= 2
    ) {

      inferenceBusy =
        true;

      const detection =
        await detectWithRoboflow();

      inferenceBusy =
        false;

      if (detection) {

        bestDetection =
          detection;

        drawDetection(
          detection
        );

        updateQuality(
          detection
        );

        await considerAutomaticCapture(
          detection
        );

      } else {

        clearOverlay();

        setInstruction(
          scanMode === "identify"
            ? "Hľadám mačku..."
            : "Hľadám nos mačky..."
        );

      }

    }

  } catch (error) {

    inferenceBusy =
      false;

    console.error(
      "INFERENCE ERROR:",
      error
    );

  }

  requestAnimationFrame(
    runInferenceLoop
  );

}


async function detectWithRoboflow() {

  if (!video) {
    return null;
  }

  if (
    performance.now() -
    lastInferenceTime <
    180
  ) {

    return null;

  }

  lastInferenceTime =
    performance.now();

  const tempCanvas =
    document.createElement(
      "canvas"
    );

  const width =
    video.videoWidth;

  const height =
    video.videoHeight;

  tempCanvas.width =
    width;

  tempCanvas.height =
    height;

  const ctx =
    tempCanvas.getContext(
      "2d"
    );

  ctx.drawImage(
    video,
    0,
    0,
    width,
    height
  );

  const imageData =
    tempCanvas.toDataURL(
      "image/jpeg",
      0.82
    );

  const response =
    await fetch(
      ROBOFLOW_API_URL +
      `?api_key=${encodeURIComponent(
        ROBOFLOW_PUBLISHABLE_KEY
      )}`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },
        body:
          imageData
      }
    );

  if (!response.ok) {

    throw new Error(
      `Roboflow HTTP ${response.status}`
    );

  }

  const result =
    await response.json();

  if (
    !result.predictions ||
    !result.predictions.length
  ) {

    return null;

  }

  const prediction =
    [...result.predictions]
      .sort(
        (a, b) =>
          b.confidence -
          a.confidence
      )[0];

  return normalizeDetection(
    prediction,
    width,
    height
  );

}


function normalizeDetection(
  prediction,
  imageWidth,
  imageHeight
) {

  const x =
    prediction.x;

  const y =
    prediction.y;

  const width =
    prediction.width;

  const height =
    prediction.height;

  return {

    confidence:
      Number(
        prediction.confidence ||
        0
      ),

    bbox: {

      x:
        x -
        width / 2,

      y:
        y -
        height / 2,

      width:
        width,

      height:
        height

    },

    imageWidth,
    imageHeight

  };

}


/* =========================================================
   AUTOMATIC CAPTURE
========================================================= */

async function considerAutomaticCapture(
  detection
) {

  if (scanFinished) {
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

  if (quality < 30) {
    return;
  }

  const frame =
    captureCurrentFrame(
      detection
    );

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

  const candidate = {

    image:
      frame,

    confidence:
      detection.confidence,

    quality,

    bbox: {
      ...detection.bbox
    },

    timestamp:
      Date.now()

  };

  if (
    scanMode ===
    "enroll"
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

    updateCounter();

    setInstruction(
      `Zachytávam referenčné zábery ${samples.length} / ${MAX_CANDIDATES}`
    );

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

    samples =
      recognitionCandidates;

    updateCounter();

    setInstruction(
      `Analyzujem mačku — ${recognitionCandidates.length} kandidátov`
    );

  }

  lastAcceptedSampleTime =
    now;

}


/* =========================================================
   FRAME CAPTURE
========================================================= */

function captureCurrentFrame(
  detection = null
) {

  if (
    !video ||
    !video.videoWidth ||
    !video.videoHeight ||
    !frameCanvas
  ) {

    return null;

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

  /*
     Store a compact face-region reference.
     We use the Roboflow nose box as the center
     and expand it to include eyes, muzzle and coat.
  */

  if (
    detection &&
    detection.bbox
  ) {

    const b =
      detection.bbox;

    const side =
      Math.max(
        b.width * 4.8,
        b.height * 4.8,
        Math.min(
          frameCanvas.width,
          frameCanvas.height
        ) * 0.16
      );

    const sx =
      Math.max(
        0,
        Math.min(
          frameCanvas.width -
          side,
          b.x -
          side / 2
        )
      );

    const sy =
      Math.max(
        0,
        Math.min(
          frameCanvas.height -
          side,
          b.y -
          side / 2
        )
      );

    const cropCanvas =
      document.createElement(
        "canvas"
      );

    cropCanvas.width =
      256;

    cropCanvas.height =
      256;

    const cropCtx =
      cropCanvas.getContext(
        "2d"
      );

    cropCtx.drawImage(
      frameCanvas,
      sx,
      sy,
      side,
      side,
      0,
      0,
      256,
      256
    );

    return cropCanvas.toDataURL(
      "image/jpeg",
      0.72
    );

  }

  return frameCanvas.toDataURL(
    "image/jpeg",
    0.72
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
    !detection.bbox
  ) {

    return 0;

  }

  const confidence =
    detection.confidence;

  const b =
    detection.bbox;

  const imageArea =
    Math.max(
      1,
      detection.imageWidth *
      detection.imageHeight
    );

  const boxArea =
    Math.max(
      1,
      b.width *
      b.height
    );

  const relativeSize =
    boxArea /
    imageArea;

  const sizeScore =
    Math.min(
      100,
      relativeSize *
      10000
    );

  const confidenceScore =
    confidence *
    100;

  const centerX =
    b.x +
    b.width / 2;

  const centerY =
    b.y +
    b.height / 2;

  const imageCenterX =
    detection.imageWidth /
    2;

  const imageCenterY =
    detection.imageHeight /
    2;

  const distance =
    Math.sqrt(
      Math.pow(
        centerX -
        imageCenterX,
        2
      ) +
      Math.pow(
        centerY -
        imageCenterY,
        2
      )
    );

  const maxDistance =
    Math.sqrt(
      Math.pow(
        detection.imageWidth / 2,
        2
      ) +
      Math.pow(
        detection.imageHeight / 2,
        2
      )
    );

  const centerScore =
    Math.max(
      0,
      100 -
      (
        distance /
        Math.max(
          1,
          maxDistance
        )
      ) *
      100
    );

  return (
    confidenceScore *
      0.60 +
    sizeScore *
      0.25 +
    centerScore *
      0.15
  );

}


function updateQuality(
  detection
) {

  const quality =
    calculateCaptureQuality(
      detection
    );

  if (qualityText) {

    qualityText.textContent =
      `${Math.round(
        quality
      )}%`;

  }

  if (qualityBar) {

    qualityBar.style.width =
      `${Math.max(
        0,
        Math.min(
          100,
          quality
        )
      )}%`;

  }

}


/* =========================================================
   DUPLICATE DETECTION
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

  const current =
    detection.bbox;

  const previous =
    list[
      list.length - 1
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
   COUNTER
========================================================= */

function updateCounter() {

  if (!counter) {
    return;
  }

  counter.textContent =
    `${samples.length}`;

}


/* =========================================================
   OVERLAY
========================================================= */

function clearOverlay() {

  const overlay =
    document.getElementById(
      "overlay"
    );

  if (!overlay) {
    return;
  }

  const ctx =
    overlay.getContext(
      "2d"
    );

  ctx.clearRect(
    0,
    0,
    overlay.width,
    overlay.height
  );

}


function drawDetection(
  detection
) {

  const overlay =
    document.getElementById(
      "overlay"
    );

  if (
    !overlay ||
    !video
  ) {

    return;

  }

  overlay.width =
    video.videoWidth;

  overlay.height =
    video.videoHeight;

  const ctx =
    overlay.getContext(
      "2d"
    );

  ctx.clearRect(
    0,
    0,
    overlay.width,
    overlay.height
  );

  const b =
    detection.bbox;

  ctx.lineWidth =
    3;

  ctx.strokeStyle =
    "#00ff66";

  ctx.strokeRect(
    b.x,
    b.y,
    b.width,
    b.height
  );

}


/* =========================================================
   FINISH AUTOMATIC SCAN
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

    setInstruction(
      samples.length
        ? `${samples.length} referenčných záberov vybraných`
        : message
    );

    if (
      samples.length > 0
    ) {

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
        Math.min(
          5,
          recognitionCandidates.length
        )
      );

    samples =
      candidates;

    await identifyCurrentCat();

    return;

  }

  if (
    samples.length > 0
  ) {

    showScanResult();

  } else {

    showScanFailure();

  }

}


/* =========================================================
   SUCCESS
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
      Aplikácia vybrala najkvalitnejšie a navzájom dostatočne odlišné zábery.
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
   FAILURE
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
      NEPODARILO SA ZACHYTIŤ MAČKU
    </p>

    <p style="margin:8px 0 0;opacity:.75;">
      Skús kameru nasmerovať bližšie na tvár mačky.
    </p>

  `;

}


/* =========================================================
   PROFILE SAVE
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
          NO SAMPLE AVAILABLE
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
          MAČKA ULOŽENÁ
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
          ${profile.samples.length} referenčných záberov.
        </p>

        <p style="margin:8px 0 0;opacity:.65;">
          Profil je uložený v tomto zariadení.
        </p>

      `;

    }

    refreshProfileManager();

  } catch (
    error
  ) {

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

  } catch (
    error
  ) {

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
                y * size +
                x
              ) * 4;

            const r =
              pixels[i];

            const g =
              pixels[
                i + 1
              ];

            const b =
              pixels[
                i + 2
              ];

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
            (
              sum,
              value
            ) =>
              sum + value,
            0
          ) /
          gray.length;

        const variance =
          gray.reduce(
            (
              sum,
              value
            ) =>
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
                  ) / std
                )
              )
          );

        const smallGray =
          [];

        for (
          let y = 0;
          y < 24;
          y += 1.5
        ) {

          const yy =
            Math.min(
              23,
              Math.floor(
                y
              )
            );

          for (
            let x = 0;
            x < 24;
            x += 1.5
          ) {

            const xx =
              Math.min(
                23,
                Math.floor(
                  x
                )
              );

            smallGray.push(
              Math.round(
                (
                  normalizedGray[
                    yy * 24 +
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


function compareFingerprints(
  a,
  b
) {

  if (
    !a ||
    !b
  ) {

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
    grayScore *
      0.72 +
    rgbScore *
      0.28
  );

}


/* =========================================================
   REFERENCE SELECTION
========================================================= */

function selectBestReferenceSamples(
  candidates,
  limit
) {

  if (
    !Array.isArray(
      candidates
    ) ||
    !candidates.length
  ) {

    return [];

  }

  const ranked =
    [...candidates].sort(
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

  return selectDiverseCandidates(
    ranked,
    limit
  );

}


function selectDiverseCandidates(
  candidates,
  limit
) {

  if (
    candidates.length <=
    limit
  ) {

    return candidates;

  }

  const selected =
    [];

  selected.push(
    candidates[0]
  );

  while (
    selected.length <
    limit
  ) {

    let bestCandidate =
      null;

    let bestScore =
      -Infinity;

    for (
      const candidate
      of candidates
    ) {

      if (
        selected.includes(
          candidate
        )
      ) {

        continue;

      }

      let minDistance =
        Infinity;

      for (
        const chosen
        of selected
      ) {

        const a =
          candidate.bbox;

        const b =
          chosen.bbox;

        if (
          !a ||
          !b
        ) {

          continue;

        }

        const dx =
          (
            a.x -
            b.x
          ) /
          Math.max(
            1,
            video?.videoWidth ||
              1000
          );

        const dy =
          (
            a.y -
            b.y
          ) /
          Math.max(
            1,
            video?.videoHeight ||
              1000
          );

        const scale =
          Math.abs(
            Math.log(
              Math.max(
                1,
                a.width
              ) /
              Math.max(
                1,
                b.width
              )
            )
          );

        const distance =
          Math.sqrt(
            dx * dx +
            dy * dy
          ) +
          scale *
            0.25;

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
        ) /
        2;

      const diversityScore =
        Math.min(
          1,
          minDistance *
            6
        ) *
        100;

      const score =
        qualityScore *
          0.70 +
        diversityScore *
          0.30;

      if (
        score >
        bestScore
      ) {

        bestScore =
          score;

        bestCandidate =
          candidate;

      }

    }

    if (
      !bestCandidate
    ) {

      break;

    }

    selected.push(
      bestCandidate
    );

  }

  return selected;

}


/* =========================================================
   CAT IDENTIFICATION
========================================================= */

async function identifyCurrentCat() {

  const profiles =
    loadCatProfiles();

  if (
    !profiles.length
  ) {

    showIdentificationResult({
      type:
        "empty",

      message:
        "Zatiaľ nemáš uloženú žiadnu mačku."
    });

    return;

  }

  if (
    !samples.length
  ) {

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

  const results =
    [];

  for (
    const profile
    of profiles
  ) {

    const profileScores =
      [];

    for (
      const reference
      of profile.samples ||
      []
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
      (
        a,
        b
      ) =>
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
        (
          sum,
          value
        ) =>
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
    (
      a,
      b
    ) =>
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

  if (
    !accepted
  ) {

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
          : null,

      runnerUp:
        runnerUp
          ? runnerUp.profile
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
      winner.profile,

    runnerUp:
      runnerUp
        ? runnerUp.profile
        : null

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
        Toto je konzervatívny výsledok prototypu, nie biometrická istota.
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
      MAČKA ROZPOZNANÁ
    </p>

    <p style="margin:10px 0 0;font-size:1.2em;">
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
      Výsledok je založený na lokálnom porovnaní referenčných záberov.
    </p>

  `;

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
      Moje mačky
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

        showScreen(
          "camera"
        );

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

        showScreen(
          "camera"
        );

        startCamera();

      }
    );

  }

  refreshProfileManager();

}


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

  if (
    !profiles.length
  ) {

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
   START CAMERA IN MODE
========================================================= */

function startCameraInMode(
  mode
) {

  scanMode =
    mode ===
    "identify"
      ? "identify"
      : "enroll";

  return startCamera();

}


/* =========================================================
   BUTTON EVENTS
========================================================= */

if (
  startCameraButton
) {

  startCameraButton.addEventListener(
    "click",
    () => {

      scanMode =
        "enroll";

      startCamera();

    }
  );

}


if (
  captureButton
) {

  captureButton.addEventListener(
    "click",
    () => {

      if (
        bestDetection
      ) {

        considerAutomaticCapture(
          bestDetection
        );

      }

    }
  );

}


if (
  stopCameraButton
) {

  stopCameraButton.addEventListener(
    "click",
    stopCamera
  );

}


if (
  backButton
) {

  backButton.addEventListener(
    "click",
    () => {

      scanMode =
        "enroll";

      showScreen(
        "camera"
      );

    }
  );

}


if (
  saveProfileButton
) {

  saveProfileButton.addEventListener(
    "click",
    saveProfile
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
      "Capture engine ready"
    );

  }
);

createProfileManagerUI();
