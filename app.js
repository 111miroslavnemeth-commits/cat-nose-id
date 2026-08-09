const $ = id => document.getElementById(id);

const screens = [
  "home",
  "camera",
  "videoTest",
  "profile"
];

let stream = null;
let catModel = null;

let scanRunning = false;
let detectorBusy = false;

let animationFrame = null;
let detectionTimer = null;

let scanStartTime = 0;
let scanFinished = false;

let automaticSamples = [];
let bestCapture = null;

let lastCatDetection = null;
let lastCatDetectionTime = 0;

const REQUIRED_SAMPLES = 5;
const MAX_SCAN_TIME = 5000;

/*
  Minimum quality required before a frame
  can become a candidate.
*/
const MIN_QUALITY = 45;

/*
  Do not accept frames that are almost identical.
*/
const MIN_DIFFERENCE = 0.035;

/*
  Minimum time between accepted samples.
*/
const MIN_SAMPLE_INTERVAL = 180;


/* =========================================================
   SCREEN NAVIGATION
========================================================= */

function show(name) {

  screens.forEach(screen => {

    const el = $(screen);

    if (el) {
      el.classList.toggle(
        "active",
        screen === name
      );
    }

  });

}


/* =========================================================
   BASIC IMAGE FUNCTIONS
========================================================= */

function luminance(r, g, b) {

  return (
    0.2126 * r +
    0.7152 * g +
    0.0722 * b
  );

}


function drawVideoToCanvas(video, canvas) {

  if (
    !video ||
    !canvas ||
    !video.videoWidth ||
    !video.videoHeight
  ) {
    return false;
  }

  canvas.width =
    video.videoWidth;

  canvas.height =
    video.videoHeight;

  const ctx =
    canvas.getContext("2d");

  ctx.drawImage(
    video,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return true;

}


/* =========================================================
   IMAGE QUALITY
========================================================= */

function calculateQuality(canvas) {

  if (
    !canvas ||
    !canvas.width ||
    !canvas.height
  ) {
    return 0;
  }

  const small =
    document.createElement("canvas");

  const targetWidth =
    Math.min(
      320,
      canvas.width
    );

  const targetHeight =
    Math.max(
      1,
      Math.round(
        canvas.height *
        targetWidth /
        canvas.width
      )
    );

  small.width =
    targetWidth;

  small.height =
    targetHeight;

  const ctx =
    small.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );

  ctx.drawImage(
    canvas,
    0,
    0,
    targetWidth,
    targetHeight
  );

  const data =
    ctx.getImageData(
      0,
      0,
      targetWidth,
      targetHeight
    ).data;

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (
    let y = 1;
    y < targetHeight - 1;
    y += 2
  ) {

    for (
      let x = 1;
      x < targetWidth - 1;
      x += 2
    ) {

      const i =
        (y * targetWidth + x) * 4;

      const center =
        luminance(
          data[i],
          data[i + 1],
          data[i + 2]
        );

      const right =
        luminance(
          data[i + 4],
          data[i + 5],
          data[i + 6]
        );

      const down =
        luminance(
          data[
            i +
            targetWidth * 4
          ],
          data[
            i +
            targetWidth * 4 +
            1
          ],
          data[
            i +
            targetWidth * 4 +
            2
          ]
        );

      const detail =
        Math.abs(
          center - right
        ) +
        Math.abs(
          center - down
        );

      sum += detail;
      sumSq += detail * detail;
      count++;

    }

  }

  if (!count) {
    return 0;
  }

  const mean =
    sum / count;

  const variance =
    Math.max(
      0,
      sumSq / count -
      mean * mean
    );

  return Math.round(
    Math.min(
      100,
      Math.sqrt(variance) * 8
    )
  );

}


/* =========================================================
   QUALITY UI
========================================================= */

function updateQuality(value) {

  const bar =
    $("qualityBar");

  const text =
    $("qualityText");

  value =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(value)
      )
    );

  if (bar) {

    bar.style.width =
      value + "%";

  }

  if (text) {

    if (value >= 75) {

      text.textContent =
        "EXCELLENT";

    } else if (value >= 55) {

      text.textContent =
        "GOOD";

    } else if (value >= 40) {

      text.textContent =
        "FAIR";

    } else {

      text.textContent =
        "LOW";

    }

  }

}


/* =========================================================
   SCAN STATUS
========================================================= */

function updateScanStatus(text) {

  const instruction =
    $("instruction");

  if (instruction) {
    instruction.textContent =
      text;
  }

}


function updateSampleCounter() {

  const counter =
    $("frameCounter");

  if (!counter) {
    return;
  }

  counter.textContent =
    automaticSamples.length +
    " / " +
    REQUIRED_SAMPLES;

}


/* =========================================================
   CAMERA START
========================================================= */

async function startCamera() {

  show("camera");

  resetAutomaticScan();

  updateScanStatus(
    "Starting camera…"
  );

  try {

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
          },

          frameRate: {
            ideal: 30,
            min: 24,
            max: 60
          }

        },

        audio: false

      });

    const video =
      $("video");

    video.srcObject =
      stream;

    await video.play();

    updateScanStatus(
      "Looking for the cat…"
    );

    scanRunning = true;
    scanFinished = false;

    scanStartTime =
      performance.now();

    startDetection();

    startScanLoop();

  } catch (error) {

    console.error(
      "Camera error:",
      error
    );

    updateScanStatus(
      "Camera access failed."
    );

  }

}


/* =========================================================
   CAMERA STOP
========================================================= */

function stopCamera(
  returnHome = true
) {

  scanRunning = false;

  detectorBusy = false;

  if (animationFrame) {

    cancelAnimationFrame(
      animationFrame
    );

    animationFrame = null;

  }

  if (detectionTimer) {

    clearTimeout(
      detectionTimer
    );

    detectionTimer = null;

  }

  if (stream) {

    stream
      .getTracks()
      .forEach(
        track => {

          try {
            track.stop();
          } catch (_) {}

        }
      );

    stream = null;

  }

  const video =
    $("video");

  if (video) {
    video.srcObject = null;
  }

  if (returnHome) {
    show("home");
  }

}


/* =========================================================
   RESET
========================================================= */

function resetAutomaticScan() {

  automaticSamples = [];

  bestCapture = null;

  lastCatDetection = null;

  lastCatDetectionTime = 0;

  scanFinished = false;

  updateSampleCounter();

  updateQuality(0);

}


/* =========================================================
   LIVE SCAN LOOP
========================================================= */

function startScanLoop() {

  if (animationFrame) {

    cancelAnimationFrame(
      animationFrame
    );

  }

  function loop() {

    if (!scanRunning) {
      return;
    }

    const video =
      $("video");

    const canvas =
      $("frameCanvas");

    if (
      video &&
      canvas &&
      video.readyState >= 2 &&
      video.videoWidth
    ) {

      if (
        drawVideoToCanvas(
          video,
          canvas
        )
      ) {

        const quality =
          calculateQuality(
            canvas
          );

        updateQuality(
          quality
        );

        /*
          Automatic candidate selection.
          No user button is required.
        */

        tryAutomaticCapture(
          video,
          canvas,
          quality
        );

      }

    }

    /*
      Hard scan timeout.
    */

    if (
      performance.now() -
      scanStartTime >=
      MAX_SCAN_TIME
    ) {

      finishAutomaticScan();

      return;

    }

    animationFrame =
      requestAnimationFrame(
        loop
      );

  }

  animationFrame =
    requestAnimationFrame(
      loop
    );

}


/* =========================================================
   AUTOMATIC FRAME SELECTION
========================================================= */

let lastAcceptedFrameTime = 0;

function tryAutomaticCapture(
  video,
  canvas,
  quality
) {

  if (!scanRunning) {
    return;
  }

  /*
    We need the cat detector to confirm
    that a cat is actually present.
  */

  if (!lastCatDetection) {

    updateScanStatus(
      "Looking for the cat…"
    );

    return;

  }

  /*
    Require reasonable image quality.
  */

  if (
    quality <
    MIN_QUALITY
  ) {

    updateScanStatus(
      "Cat found — improving image…"
    );

    return;

  }

  const now =
    performance.now();

  if (
    now -
    lastAcceptedFrameTime <
    MIN_SAMPLE_INTERVAL
  ) {
    return;
  }

  /*
    Extract a candidate region around
    the detected cat.

    IMPORTANT:
    This is a cat-region candidate,
    not yet a trained nose detector.
  */

  const image =
    createCandidateImage(
      video,
      lastCatDetection
    );

  if (!image) {
    return;
  }

  /*
    Avoid accepting almost identical frames.
  */

  if (
    isTooSimilarToExisting(
      image
    )
  ) {
    return;
  }

  const sample = {

    id:
      Date.now(),

    image:

      image,

    quality:
      quality,

    catScore:
      lastCatDetection.score,

    timestamp:
      new Date()
        .toISOString()

  };

  automaticSamples.push(
    sample
  );

  lastAcceptedFrameTime =
    now;

  updateSampleCounter();

  /*
    Keep the highest-quality sample.
  */

  if (
    !bestCapture ||
    sample.quality >
    bestCapture.quality
  ) {

    bestCapture =
      sample;

  }

  updateScanStatus(
    "Candidate " +
    automaticSamples.length +
    " / " +
    REQUIRED_SAMPLES +
    " captured ✓"
  );

  /*
    Once five suitable candidates
    are available, finish immediately.
  */

  if (
    automaticSamples.length >=
    REQUIRED_SAMPLES
  ) {

    finishAutomaticScan();

  }

}


/* =========================================================
   CANDIDATE IMAGE
========================================================= */

function createCandidateImage(
  video,
  detection
) {

  if (
    !video ||
    !detection ||
    !detection.bbox
  ) {
    return null;
  }

  const [
    x,
    y,
    width,
    height
  ] =
    detection.bbox;

  /*
    Add a little margin around
    the detected cat.
  */

  const marginX =
    width * 0.08;

  const marginY =
    height * 0.08;

  const sx =
    Math.max(
      0,
      x - marginX
    );

  const sy =
    Math.max(
      0,
      y - marginY
    );

  const ex =
    Math.min(
      video.videoWidth,
      x + width + marginX
    );

  const ey =
    Math.min(
      video.videoHeight,
      y + height + marginY
    );

  const sw =
    ex - sx;

  const sh =
    ey - sy;

  if (
    sw < 30 ||
    sh < 30
  ) {
    return null;
  }

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    640;

  canvas.height =
    640;

  const ctx =
    canvas.getContext(
      "2d"
    );

  /*
    Center-crop the cat region
    into a square.
  */

  const size =
    Math.min(
      sw,
      sh
    );

  const cropX =
    sx +
    (sw - size) / 2;

  const cropY =
    sy +
    (sh - size) / 2;

  ctx.drawImage(
    video,
    cropX,
    cropY,
    size,
    size,
    0,
    0,
    640,
    640
  );

  return canvas.toDataURL(
    "image/jpeg",
    0.9
  );

}


/* =========================================================
   DIFFERENCE CHECK
========================================================= */

function isTooSimilarToExisting(
  newImage
) {

  if (
    !automaticSamples.length
  ) {
    return false;
  }

  /*
    Convert image to a tiny grayscale
    representation and compare it
    with previous candidates.
  */

  const current =
    createImageSignature(
      newImage
    );

  if (!current) {
    return false;
  }

  for (
    const sample
    of automaticSamples
  ) {

    const previous =
      createImageSignature(
        sample.image
      );

    if (!previous) {
      continue;
    }

    const difference =
      signatureDifference(
        current,
        previous
      );

    if (
      difference <
      MIN_DIFFERENCE
    ) {

      return true;

    }

  }

  return false;

}


/* =========================================================
   IMAGE SIGNATURE
========================================================= */

function createImageSignature(
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

          canvas.width = 16;
          canvas.height = 16;

          const ctx =
            canvas.getContext(
              "2d"
            );

          ctx.drawImage(
            image,
            0,
            0,
            16,
            16
          );

          const data =
            ctx.getImageData(
              0,
              0,
              16,
              16
            ).data;

          const signature =
            [];

          for (
            let i = 0;
            i < data.length;
            i += 4
          ) {

            signature.push(
              (
                0.2126 * data[i] +
                0.7152 * data[i + 1] +
                0.0722 * data[i + 2]
              ) / 255
            );

          }

          resolve(
            signature
          );

        };

      image.onerror =
        () => resolve(null);

      image.src =
        dataUrl;

    }
  );

}


function signatureDifference(
  a,
  b
) {

  if (
    !a ||
    !b ||
    a.length !== b.length
  ) {
    return 1;
  }

  let total = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {

    total +=
      Math.abs(
        a[i] - b[i]
      );

  }

  return (
    total / a.length
  );

}


/* =========================================================
   AUTOMATIC SCAN FINISH
========================================================= */

function finishAutomaticScan() {

  if (scanFinished) {
    return;
  }

  scanFinished = true;

  scanRunning = false;

  if (animationFrame) {

    cancelAnimationFrame(
      animationFrame
    );

    animationFrame = null;

  }

  /*
    If we have fewer than five candidates,
    we do not pretend that the scan succeeded.
  */

  if (
    automaticSamples.length <
    REQUIRED_SAMPLES
  ) {

    updateScanStatus(
      "Not enough suitable frames. Please try again."
    );

    setTimeout(
      () => {

        if (!scanRunning) {
          show("camera");
        }

      },
      1800
    );

    return;
  }

  /*
    Select the best candidate.
  */

  automaticSamples.sort(
    (a, b) =>
      b.quality -
      a.quality
  );

  bestCapture =
    automaticSamples[0];

  /*
    Stop camera after successful scan.
  */

  stopCamera(
    false
  );

  /*
    Show the automatically collected
    samples in the profile/result screen.
  */

  show("profile");

  renderAutomaticResults();

}


/* =========================================================
   AUTOMATIC RESULTS
========================================================= */

function renderAutomaticResults() {

  const savedInfo =
    $("savedInfo");

  if (!savedInfo) {
    return;
  }

  savedInfo.classList.remove(
    "hidden"
  );

  let html = "";

  html +=
    "<h3>SCAN COMPLETE</h3>";

  html +=
    "<p>Automatically selected " +
    automaticSamples.length +
    " candidate frames.</p>";

  html +=
    "<div style='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px'>";

  automaticSamples.forEach(
    (sample, index) => {

      html +=
        "<div style='position:relative;overflow:hidden;border-radius:10px;background:#111'>";

      html +=
        "<img src='" +
        sample.image +
        "' style='width:100%;display:block;aspect-ratio:1/1;object-fit:cover'>";

      html +=
        "<div style='position:absolute;left:5px;bottom:5px;background:rgba(0,0,0,.75);color:#fff;padding:3px 6px;border-radius:5px;font-size:10px'>" +
        "#" +
        (index + 1) +
        " • " +
        sample.quality +
        "%" +
        "</div>";

      html +=
        "</div>";

    }
  );

  html +=
    "</div>";

  html +=
    "<p style='margin-top:12px'>The current prototype has collected image candidates. It does not yet perform biometric identification.</p>";

  savedInfo.innerHTML =
    html;

}


/* =========================================================
   PROFILE SAVE
========================================================= */

function saveProfile() {

  const name =
    $("catName")?.value.trim() ||
    "Unknown Cat";

  const nickname =
    $("catNickname")?.value.trim() ||
    "";

  if (
    !automaticSamples.length
  ) {

    alert(
      "No scan samples available."
    );

    return;

  }

  const record = {

    id:
      "cat_" +
      Date.now(),

    name:
      name,

    nickname:
      nickname,

    createdAt:
      new Date()
        .toISOString(),

    samples:
      automaticSamples,

    bestSample:
      bestCapture

  };

  try {

    localStorage.setItem(
      "catNosePrototype_last",
      JSON.stringify(
        record
      )
    );

  } catch (error) {

    console.warn(
      "Local storage error:",
      error
    );

  }

  const savedInfo =
    $("savedInfo");

  if (savedInfo) {

    savedInfo.innerHTML +=
      "<p><b>SCAN SAVED.</b></p>";

  }

}


/* =========================================================
   CAT DETECTION
========================================================= */

async function loadCatDetector() {

  if (
    catModel ||
    typeof cocoSsd ===
    "undefined"
  ) {
    return;
  }

  try {

    updateScanStatus(
      "Loading cat detector…"
    );

    catModel =
      await cocoSsd.load({
        base:
          "lite_mobilenet_v2"
      });

    updateScanStatus(
      "Looking for the cat…"
    );

  } catch (error) {

    console.warn(
      "Cat detector error:",
      error
    );

    /*
      Without a cat detector we do not
      automatically accept frames.
    */

    updateScanStatus(
      "Cat detector unavailable."
    );

  }

}


/* =========================================================
   DETECTION LOOP
========================================================= */

function startDetection() {

  loadCatDetector()
    .then(
      () => {

        if (!catModel) {
          return;
        }

        detectionLoop();

      }
    );

}


async function detectionLoop() {

  if (
    !scanRunning ||
    !catModel ||
    detectorBusy
  ) {

    if (scanRunning) {

      detectionTimer =
        setTimeout(
          detectionLoop,
          120
        );

    }

    return;

  }

  const video =
    $("video");

  if (
    !video ||
    video.readyState < 2 ||
    !video.videoWidth
  ) {

    detectionTimer =
      setTimeout(
        detectionLoop,
        120
      );

    return;

  }

  detectorBusy = true;

  try {

    const predictions =
      await catModel.detect(
        video,
        5,
        0.30
      );

    const cats =
      predictions
        .filter(
          item =>
            item.class ===
            "cat" &&
            item.score >=
            0.30
        )
        .sort(
          (a, b) =>
            b.score -
            a.score
        );

    if (cats.length) {

      lastCatDetection =
        cats[0];

      lastCatDetectionTime =
        performance.now();

      drawCatDetection(
        cats[0]
      );

      updateScanStatus(
        "Cat detected — automatically scanning…"
      );

    } else {

      lastCatDetection =
        null;

      clearDetectionOverlay();

      updateScanStatus(
        "Looking for the cat…"
      );

    }

  } catch (error) {

    console.warn(
      "Detection error:",
      error
    );

  } finally {

    detectorBusy = false;

    if (scanRunning) {

      detectionTimer =
        setTimeout(
          detectionLoop,
          120
        );

    }

  }

}


/* =========================================================
   DETECTION DRAWING
========================================================= */

function clearDetectionOverlay() {

  const overlay =
    $("detectionOverlay");

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


function drawCatDetection(
  detection
) {

  const video =
    $("video");

  const overlay =
    $("detectionOverlay");

  if (
    !video ||
    !overlay ||
    !detection
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

  const [
    x,
    y,
    width,
    height
  ] =
    detection.bbox;

  ctx.strokeStyle =
    "#ffffff";

  ctx.lineWidth =
    Math.max(
      3,
      overlay.width / 300
    );

  ctx.setLineDash([
    10,
    8
  ]);

  ctx.strokeRect(
    x,
    y,
    width,
    height
  );

  ctx.setLineDash([]);

  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    `${Math.max(
      16,
      overlay.width / 40
    )}px system-ui`;

  ctx.fillText(
    "CAT " +
    Math.round(
      detection.score * 100
    ) +
    "%",
    x,
    Math.max(
      24,
      y - 8
    )
  );

}


/* =========================================================
   VIDEO / PHOTO TEST
========================================================= */

function handleMediaInput(
  event
) {

  const file =
    event.target.files?.[0];

  if (!file) {
    return;
  }

  const url =
    URL.createObjectURL(
      file
    );

  if (
    file.type.startsWith(
      "video/"
    )
  ) {

    const video =
      $("sourceVideo");

    if (video) {

      video.src =
        url;

      video.load();

    }

    show(
      "videoTest"
    );

    return;

  }

  if (
    file.type.startsWith(
      "image/"
    )
  ) {

    const samples =
      $("videoSamples");

    if (samples) {

      samples.innerHTML =
        "<img src='" +
        url +
        "' style='width:100%;border-radius:12px'>";

    }

    show(
      "videoTest"
    );

  }

}


/* =========================================================
   VIDEO ANALYSIS
========================================================= */

async function analyzeVideo() {

  const video =
    $("sourceVideo");

  const canvas =
    $("videoCanvas");

  const result =
    $("videoResult");

  if (
    !video ||
    !canvas ||
    !video.duration
  ) {

    if (result) {

      result.classList.remove(
        "hidden"
      );

      result.textContent =
        "Choose a video first.";

    }

    return;

  }

  const duration =
    video.duration;

  const interval =
    0.10;

  const positions = [];

  for (
    let t = 0;
    t < duration;
    t += interval
  ) {

    positions.push(
      Math.min(
        t,
        Math.max(
          0,
          duration - 0.01
        )
      )
    );

  }

  const frames = [];

  if (result) {

    result.classList.remove(
      "hidden"
    );

    result.textContent =
      "Analyzing video…";

  }

  for (
    let i = 0;
    i < positions.length;
    i++
  ) {

    await seekVideo(
      video,
      positions[i]
    );

    if (
      !drawVideoToCanvas(
        video,
        canvas
      )
    ) {
      continue;
    }

    const quality =
      calculateQuality(
        canvas
      );

    const image =
      canvas.toDataURL(
        "image/jpeg",
        0.9
      );

    frames.push({
      image,
      quality,
      time:
        positions[i]
    });

    if (result) {

      result.textContent =
        "Analyzing " +
        (i + 1) +
        " / " +
        positions.length;

    }

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          0
        )
    );

  }

  frames.sort(
    (a, b) =>
      b.quality -
      a.quality
  );

  const best =
    frames.slice(
      0,
      9
    );

  if (result) {

    result.innerHTML =
      "<b>VIDEO ANALYSIS COMPLETE</b>" +
      "<p>Sampled " +
      frames.length +
      " frames.</p>" +
      "<p>Best generic image quality: " +
      (
        best.length
          ? best[0].quality
          : 0
      ) +
      "%.</p>" +
      "<p>This is image/cat candidate analysis, not biometric identification.</p>";

  }

  const grid =
    $("videoSamples");

  if (grid) {

    grid.innerHTML = "";

    best.forEach(
      (frame, index) => {

        const div =
          document.createElement(
            "div"
          );

        div.innerHTML =
          "<img src='" +
          frame.image +
          "' style='width:100%;border-radius:10px'>" +
          "<small>#"+
          (index + 1) +
          " • " +
          frame.quality +
          "%</small>";

        grid.appendChild(
          div
        );

      }
    );

  }

}


function seekVideo(
  video,
  time
) {

  return new Promise(
    resolve => {

      const handler =
        () => {

          video.removeEventListener(
            "seeked",
            handler
          );

          resolve();

        };

      video.addEventListener(
        "seeked",
        handler
      );

      video.currentTime =
        time;

    }
  );

}


/* =========================================================
   EVENT HANDLERS
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const start =
      $("startCamera");

    if (start) {

      start.onclick =
        startCamera;

    }

    const stop =
      $("stopCamera");

    if (stop) {

      stop.onclick =
        () =>
          stopCamera(
            true
          );

    }

    const finish =
      $("finishScan");

    if (finish) {

      finish.onclick =
        finishAutomaticScan;

    }

    const backHome =
      $("backHome");

    if (backHome) {

      backHome.onclick =
        () =>
          show("home");

    }

    const profileBack =
      $("profileBack");

    if (profileBack) {

      profileBack.onclick =
        () =>
          show("camera");

    }

    const save =
      $("saveProfile");

    if (save) {

      save.onclick =
        saveProfile;

    }

    const media =
      $("mediaInput");

    if (media) {

      media.onchange =
        handleMediaInput;

    }

    const analyze =
      $("analyzeVideo");

    if (analyze) {

      analyze.onclick =
        analyzeVideo;

    }

    updateSampleCounter();

  }
);
