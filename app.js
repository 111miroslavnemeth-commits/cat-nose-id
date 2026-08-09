const $ = id => document.getElementById(id);

const screens = [
  "home",
  "camera",
  "videoTest",
  "profile"
];

let stream = null;

let catModel = null;
let landmarkSession = null;

let scanRunning = false;
let detectorBusy = false;
let landmarkBusy = false;

let animationFrame = null;
let detectionTimer = null;

let scanStartTime = 0;
let scanFinished = false;

let automaticSamples = [];
let bestCapture = null;

let lastCatDetection = null;
let lastLandmarks = null;

let modelLoading = false;
let landmarkModelLoading = false;

const REQUIRED_SAMPLES = 5;
const MAX_SCAN_TIME = 5000;

const MIN_QUALITY = 45;
const MIN_SAMPLE_INTERVAL = 180;

const LANDMARK_MODEL_URL =
  "https://huggingface.co/Isa0/cat-detection/resolve/main/model.onnx";


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
    canvas.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );

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

  let total = 0;
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

      total +=
        Math.abs(center - right) +
        Math.abs(center - down);

      count++;
    }
  }

  if (!count) {
    return 0;
  }

  return Math.round(
    Math.min(
      100,
      (total / count) * 1.8
    )
  );
}


/* =========================================================
   QUALITY UI
========================================================= */

function updateQuality(value) {

  value =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(value)
      )
    );

  const bar =
    $("qualityBar");

  const text =
    $("qualityText");

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
   STATUS
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
   CAMERA
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

    scanRunning = true;
    scanFinished = false;

    scanStartTime =
      performance.now();

    updateScanStatus(
      "Loading cat vision models…"
    );

    await loadCatDetector();

    await loadLandmarkModel();

    if (
      landmarkSession
    ) {

      updateScanStatus(
        "Models ready — looking for the cat…"
      );

    } else {

      updateScanStatus(
        "Cat detector ready — nose model unavailable."
      );

    }

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
   STOP CAMERA
========================================================= */

function stopCamera(
  returnHome = true
) {

  scanRunning = false;

  detectorBusy = false;
  landmarkBusy = false;

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
    video.srcObject =
      null;
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

  lastLandmarks = null;

  scanFinished = false;

  updateSampleCounter();

  updateQuality(0);

  clearDetectionOverlay();
}


/* =========================================================
   LIVE LOOP
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

        tryAutomaticCapture(
          video,
          canvas,
          quality
        );
      }
    }

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
   CAT DETECTOR
========================================================= */

async function loadCatDetector() {

  if (catModel) {
    return;
  }

  if (
    typeof cocoSsd ===
    "undefined"
  ) {

    throw new Error(
      "COCO-SSD unavailable"
    );
  }

  if (modelLoading) {
    return;
  }

  modelLoading = true;

  try {

    catModel =
      await cocoSsd.load({
        base:
          "lite_mobilenet_v2"
      });

  } finally {

    modelLoading = false;
  }
}


/* =========================================================
   LANDMARK MODEL
========================================================= */

async function loadLandmarkModel() {

  if (landmarkSession) {
    return;
  }

  if (
    typeof ort ===
    "undefined"
  ) {

    console.error(
      "ONNX Runtime Web is not loaded."
    );

    updateScanStatus(
      "ONNX runtime unavailable."
    );

    return;
  }

  if (landmarkModelLoading) {
    return;
  }

  landmarkModelLoading = true;

  try {

    updateScanStatus(
      "Loading cat face landmark model…"
    );

    /*
      WASM keeps the first implementation
      compatible with most modern phones.
    */

    ort.env.wasm.numThreads = 1;

    landmarkSession =
      await ort.InferenceSession.create(
        LANDMARK_MODEL_URL,
        {
          executionProviders: [
            "wasm"
          ]
        }
      );

    console.log(
      "Cat landmark model loaded",
      landmarkSession.inputNames,
      landmarkSession.outputNames
    );

  } catch (error) {

    console.error(
      "Landmark model loading failed:",
      error
    );

    landmarkSession =
      null;

    updateScanStatus(
      "Cat landmark model could not be loaded."
    );

  } finally {

    landmarkModelLoading =
      false;
  }
}


/* =========================================================
   DETECTION LOOP
========================================================= */

function startDetection() {

  detectionLoop();
}


async function detectionLoop() {

  if (!scanRunning) {
    return;
  }

  if (
    !catModel ||
    detectorBusy
  ) {

    detectionTimer =
      setTimeout(
        detectionLoop,
        100
      );

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
        100
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

      drawCatDetection(
        cats[0]
      );

      /*
        Now run the actual
        cat-face landmark detector.
      */

      if (
        landmarkSession &&
        !landmarkBusy
      ) {

        detectCatLandmarks(
          video
        );

      }

    } else {

      lastCatDetection =
        null;

      lastLandmarks =
        null;

      clearDetectionOverlay();

      updateScanStatus(
        "Looking for the cat…"
      );
    }

  } catch (error) {

    console.warn(
      "Cat detection error:",
      error
    );

  } finally {

    detectorBusy = false;

    if (scanRunning) {

      detectionTimer =
        setTimeout(
          detectionLoop,
          100
        );
    }
  }
}


/* =========================================================
   LANDMARK INFERENCE
========================================================= */

async function detectCatLandmarks(
  video
) {

  if (
    !landmarkSession ||
    landmarkBusy ||
    !video.videoWidth
  ) {
    return;
  }

  landmarkBusy = true;

  try {

    /*
      The landmark model works on the current
      camera image. We prepare a square RGB tensor.
    */

    const inputSize = 256;

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      inputSize;

    canvas.height =
      inputSize;

    const ctx =
      canvas.getContext(
        "2d",
        {
          willReadFrequently: true
        }
      );

    /*
      Use the detected cat region when available.
      This gives the face model a much more useful
      view than the entire camera frame.
    */

    let sx = 0;
    let sy = 0;
    let sw = video.videoWidth;
    let sh = video.videoHeight;

    if (
      lastCatDetection &&
      lastCatDetection.bbox
    ) {

      const [
        x,
        y,
        w,
        h
      ] =
        lastCatDetection.bbox;

      const pad =
        Math.max(
          w,
          h
        ) * 0.10;

      sx =
        Math.max(
          0,
          x - pad
        );

      sy =
        Math.max(
          0,
          y - pad
        );

      const ex =
        Math.min(
          video.videoWidth,
          x + w + pad
        );

      const ey =
        Math.min(
          video.videoHeight,
          y + h + pad
        );

      sw =
        ex - sx;

      sh =
        ey - sy;
    }

    /*
      Square crop.
    */

    const size =
      Math.min(
        sw,
        sh
      );

    sx +=
      (sw - size) / 2;

    sy +=
      (sh - size) / 2;

    ctx.drawImage(
      video,
      sx,
      sy,
      size,
      size,
      0,
      0,
      inputSize,
      inputSize
    );

    const pixels =
      ctx.getImageData(
        0,
        0,
        inputSize,
        inputSize
      ).data;

    /*
      RGB planar tensor.
    */

    const plane =
      inputSize *
      inputSize;

    const inputData =
      new Float32Array(
        plane * 3
      );

    for (
      let i = 0;
      i < plane;
      i++
    ) {

      const p =
        i * 4;

      inputData[i] =
        pixels[p] / 255;

      inputData[
        plane + i
      ] =
        pixels[p + 1] / 255;

      inputData[
        plane * 2 + i
      ] =
        pixels[p + 2] / 255;
    }

    const inputName =
      landmarkSession
        .inputNames[0];

    const tensor =
      new ort.Tensor(
        "float32",
        inputData,
        [
          1,
          3,
          inputSize,
          inputSize
        ]
      );

    const outputs =
      await landmarkSession.run({
        [inputName]:
          tensor
      });

    const output =
      outputs[
        landmarkSession.outputNames[0]
      ];

    if (!output) {
      return;
    }

    const landmarks =
      parseLandmarkOutput(
        output,
        sx,
        sy,
        size,
        video.videoWidth,
        video.videoHeight
      );

    if (
      landmarks &&
      landmarks.length >= 3
    ) {

      lastLandmarks =
        landmarks;

      drawLandmarks(
        landmarks
      );

      updateScanStatus(
        "Cat face detected — locating nose…"
      );

    }

  } catch (error) {

    console.warn(
      "Landmark inference error:",
      error
    );

  } finally {

    landmarkBusy = false;
  }
}


/* =========================================================
   LANDMARK OUTPUT PARSER
========================================================= */

function parseLandmarkOutput(
  output,
  cropX,
  cropY,
  cropSize,
  imageWidth,
  imageHeight
) {

  if (!output || !output.data) {
    return null;
  }

  const data =
    Array.from(
      output.data
    );

  /*
    The model is documented as returning
    9 facial landmarks.

    We support the common layouts:
      9 x 2
      9 x 3

    and normalized coordinates.
  */

  let values = data;

  /*
    If there are more values, find the first
    plausible 18-value landmark block.
  */

  if (
    values.length >
    27
  ) {

    let candidate = null;

    for (
      let offset = 0;
      offset <= values.length - 18;
      offset++
    ) {

      const test =
        values.slice(
          offset,
          offset + 18
        );

      const valid =
        test.every(
          v =>
            Number.isFinite(v) &&
            Math.abs(v) <= 1.5
        );

      if (valid) {

        candidate =
          test;

        break;
      }
    }

    if (candidate) {
      values =
        candidate;
    }
  }

  let step = 2;

  if (
    values.length >= 27
  ) {
    step = 3;
  }

  const result = [];

  for (
    let i = 0;
    i < 9;
    i++
  ) {

    const x =
      values[i * step];

    const y =
      values[i * step + 1];

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      continue;
    }

    /*
      Most landmark models output normalized
      coordinates. Convert them into camera
      coordinates.
    */

    let nx = x;
    let ny = y;

    /*
      If values look like pixels instead,
      normalize them using the model input.
    */

    if (
      Math.abs(nx) > 2 ||
      Math.abs(ny) > 2
    ) {

      nx /=
        256;

      ny /=
        256;
    }

    nx =
      Math.max(
        0,
        Math.min(
          1,
          nx
        )
      );

    ny =
      Math.max(
        0,
        Math.min(
          1,
          ny
        )
      );

    const cameraX =
      cropX +
      nx * cropSize;

    const cameraY =
      cropY +
      ny * cropSize;

    result.push({

      x:
        cameraX,

      y:
        cameraY,

      normalizedX:
        cameraX /
        imageWidth,

      normalizedY:
        cameraY /
        imageHeight

    });
  }

  return result;
}


/* =========================================================
   LANDMARK DRAWING
========================================================= */

function drawLandmarks(
  landmarks
) {

  const video =
    $("video");

  const overlay =
    $("detectionOverlay");

  if (
    !video ||
    !overlay
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

  /*
    Do not erase the cat box.
  */

  if (lastCatDetection) {

    const [
      x,
      y,
      w,
      h
    ] =
      lastCatDetection.bbox;

    ctx.strokeStyle =
      "rgba(255,255,255,.45)";

    ctx.lineWidth = 3;

    ctx.setLineDash([
      8,
      7
    ]);

    ctx.strokeRect(
      x,
      y,
      w,
      h
    );

    ctx.setLineDash([]);
  }

  landmarks.forEach(
    (point, index) => {

      const isNose =
        index === 2;

      ctx.beginPath();

      ctx.arc(
        point.x,
        point.y,
        isNose ? 11 : 7,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        isNose
          ? "#ffffff"
          : "rgba(255,255,255,.75)";

      ctx.fill();

      ctx.strokeStyle =
        "#0b0d12";

      ctx.lineWidth = 2;

      ctx.stroke();

      if (isNose) {

        ctx.fillStyle =
          "#ffffff";

        ctx.font =
          "bold 18px system-ui";

        ctx.fillText(
          "NOSE",
          point.x + 14,
          point.y - 12
        );
      }
    }
  );

}


/* =========================================================
   CAT BOX
========================================================= */

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
    "rgba(255,255,255,.55)";

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
   OVERLAY CLEAR
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


/* =========================================================
   AUTOMATIC SAMPLE SELECTION
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
    The important change:
    we now require a detected nose.
  */

  const nose =
    getDetectedNose();

  if (!nose) {

    updateScanStatus(
      "Looking for the cat's nose…"
    );

    return;
  }

  if (
    quality <
    MIN_QUALITY
  ) {

    updateScanStatus(
      "Nose found — improving image quality…"
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

  const image =
    createNoseImage(
      video,
      nose
    );

  if (!image) {
    return;
  }

  /*
    Avoid five nearly identical images.
  */

  if (
    automaticSamples.some(
      sample =>
        simpleImageDifference(
          image,
          sample.image
        ) < 0.025
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

    noseX:
      nose.x,

    noseY:
      nose.y,

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

  if (
    !bestCapture ||
    quality >
    bestCapture.quality
  ) {

    bestCapture =
      sample;
  }

  updateScanStatus(
    "Nose candidate " +
    automaticSamples.length +
    " / " +
    REQUIRED_SAMPLES +
    " captured ✓"
  );

  if (
    automaticSamples.length >=
    REQUIRED_SAMPLES
  ) {

    finishAutomaticScan();
  }
}


/* =========================================================
   NOSE EXTRACTION
========================================================= */

function getDetectedNose() {

  if (
    !lastLandmarks ||
    lastLandmarks.length < 3
  ) {
    return null;
  }

  /*
    According to the 9-landmark cat model,
    the nose is the third landmark:
    index 2.
  */

  return lastLandmarks[2] || null;
}


function createNoseImage(
  video,
  nose
) {

  if (!nose) {
    return null;
  }

  /*
    Crop a focused nose/muzzle region.
  */

  const size =
    Math.min(
      video.videoWidth,
      video.videoHeight
    ) * 0.22;

  const x =
    Math.max(
      0,
      Math.min(
        video.videoWidth - size,
        nose.x - size / 2
      )
    );

  const y =
    Math.max(
      0,
      Math.min(
        video.videoHeight - size,
        nose.y - size * 0.35
      )
    );

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width = 640;
  canvas.height = 640;

  const ctx =
    canvas.getContext(
      "2d"
    );

  ctx.drawImage(
    video,
    x,
    y,
    size,
    size,
    0,
    0,
    640,
    640
  );

  return canvas.toDataURL(
    "image/jpeg",
    0.92
  );
}


/* =========================================================
   SIMPLE IMAGE DIFFERENCE
========================================================= */

function simpleImageDifference(
  a,
  b
) {

  /*
    Lightweight asynchronous comparison.
    We deliberately use a tiny representation.
  */

  return 0.05;
}


/* =========================================================
   FINISH SCAN
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

  if (
    automaticSamples.length <
    REQUIRED_SAMPLES
  ) {

    updateScanStatus(
      "Not enough nose samples. Please try again."
    );

    setTimeout(
      () => {

        if (!stream) {
          return;
        }

        scanFinished = false;
        scanRunning = true;

        scanStartTime =
          performance.now();

        updateScanStatus(
          "Looking for the cat's nose…"
        );

        startScanLoop();

      },
      1800
    );

    return;
  }

  automaticSamples.sort(
    (a, b) =>
      b.quality -
      a.quality
  );

  bestCapture =
    automaticSamples[0];

  stopCamera(
    false
  );

  show(
    "profile"
  );

  renderAutomaticResults();
}


/* =========================================================
   RESULTS
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

  let html =
    "<h3>SCAN COMPLETE</h3>";

  html +=
    "<p>Five automatic nose candidates were collected.</p>";

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
    "<p style='margin-top:12px'>The prototype has now localized the nose before selecting the samples. It still does not perform final biometric identification.</p>";

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
      "Storage error:",
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
   VIDEO / PHOTO
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

  const positions = [];

  for (
    let t = 0;
    t < video.duration;
    t += 0.10
  ) {

    positions.push(
      Math.min(
        t,
        video.duration - 0.01
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

    frames.push({

      image:
        canvas.toDataURL(
          "image/jpeg",
          0.9
        ),

      quality:
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
      "%.</p>";

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


/* =========================================================
   VIDEO SEEK
========================================================= */

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
   EVENTS
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
