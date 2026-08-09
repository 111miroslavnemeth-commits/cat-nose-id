const $ = id => document.getElementById(id);

const APP_VERSION = "v0.5.0";

const screens = ["home", "camera", "videoTest", "profile"];

let stream = null;
let bestCapture = null;
let captureSamples = [];
let recentFrames = [];
let scanTimer = null;

let catModel = null;
let lastCatBox = null;
let lastCatScore = 0;
let lastDetect = 0;
let detectBusy = false;

let noseCandidate = null;
let noseCandidateScore = 0;

let lastBufferedCapture = 0;

const MAX_RECENT_FRAMES = 24;
const AUTO_BUFFER_INTERVAL = 120;
const DETECTION_INTERVAL = 170;

function show(n) {
  screens.forEach(s => {
    const el = $(s);
    if (el) {
      el.classList.toggle("active", s === n);
    }
  });
}

function setVersionUI() {
  document.title = `CAT NOSE ID — ${APP_VERSION}`;

  document.querySelectorAll(".eyebrow").forEach(el => {
    if (el.textContent.includes("TECHNICAL PROTOTYPE")) {
      el.textContent = `TECHNICAL PROTOTYPE ${APP_VERSION}`;
    }
  });

  const note = $("detectorNote");

  if (note) {
    note.textContent =
      `${APP_VERSION} continuously captures candidate frames and uses cat detection plus an experimental nose-candidate stage. This is not biometric identification.`;
  }
}

function luminance(r, g, b) {
  return .2126 * r + .7152 * g + .0722 * b;
}

function scoreCanvas(c) {
  if (!c || !c.width || !c.height) return 0;

  try {
    const ctx = c.getContext("2d", {
      willReadFrequently: true
    });

    const w = c.width;
    const h = c.height;

    if (w < 10 || h < 10) return 0;

    const d = ctx.getImageData(0, 0, w, h).data;

    const step = 4;

    let s = 0;
    let s2 = 0;
    let n = 0;

    for (let y = 1; y < h - 1; y += step) {
      for (let x = 1; x < w - 1; x += step) {

        const i = (y * w + x) * 4;

        const center =
          luminance(
            d[i],
            d[i + 1],
            d[i + 2]
          );

        const left =
          luminance(
            d[i - 4],
            d[i - 3],
            d[i - 2]
          );

        const right =
          luminance(
            d[i + 4],
            d[i + 5],
            d[i + 6]
          );

        const up =
          luminance(
            d[i - w * 4],
            d[i - w * 4 + 1],
            d[i - w * 4 + 2]
          );

        const down =
          luminance(
            d[i + w * 4],
            d[i + w * 4 + 1],
            d[i + w * 4 + 2]
          );

        const q =
          Math.abs(
            4 * center -
            left -
            right -
            up -
            down
          );

        s += q;
        s2 += q * q;
        n++;
      }
    }

    if (!n) return 0;

    const variance =
      Math.max(
        0,
        s2 / n - Math.pow(s / n, 2)
      );

    return Math.min(
      100,
      Math.sqrt(variance) * 2.4
    );

  } catch (e) {
    console.warn("Quality score error:", e);
    return 0;
  }
}

function drawVideo(v, c) {
  if (!v || !c || !v.videoWidth) return;

  const w = 480;

  const ratio =
    v.videoHeight /
    v.videoWidth ||
    1;

  const h = Math.round(w * ratio);

  c.width = w;
  c.height = h;

  const ctx = c.getContext("2d");

  ctx.drawImage(
    v,
    0,
    0,
    w,
    h
  );
}

function cropCenter(v, c) {
  const w =
    v.videoWidth ||
    c.width;

  const h =
    v.videoHeight ||
    c.height;

  if (!w || !h) return null;

  c.width = w;
  c.height = h;

  const ctx = c.getContext("2d");

  ctx.drawImage(
    v,
    0,
    0,
    w,
    h
  );

  const sz =
    Math.min(w, h) * .58;

  const x =
    (w - sz) / 2;

  const y =
    (h - sz) / 2;

  const o =
    document.createElement("canvas");

  o.width = 640;
  o.height = 640;

  o.getContext("2d").drawImage(
    c,
    x,
    y,
    sz,
    sz,
    0,
    0,
    640,
    640
  );

  return o.toDataURL(
    "image/jpeg",
    .9
  );
}

function cropBox(v, box) {
  if (!v || !box) return null;

  const [
    x,
    y,
    w,
    h
  ] = box;

  if (
    w < 10 ||
    h < 10
  ) {
    return null;
  }

  const o =
    document.createElement("canvas");

  o.width = 640;
  o.height = 640;

  const ctx =
    o.getContext("2d");

  ctx.drawImage(
    v,
    x,
    y,
    w,
    h,
    0,
    0,
    640,
    640
  );

  return o.toDataURL(
    "image/jpeg",
    .92
  );
}

function setQ(q) {

  const bar = $("qualityBar");
  const text = $("qualityText");

  if (bar) {
    bar.style.width =
      Math.max(
        0,
        Math.min(100, q)
      ) + "%";
  }

  if (text) {
    text.textContent =
      q < 25
        ? "MOVE CLOSER"
        : q < 45
          ? "HOLD STEADY"
          : q < 65
            ? "GOOD"
            : "EXCELLENT";
  }
}

function updateFrameCounter() {

  const el =
    $("frameCounter");

  if (!el) return;

  el.textContent =
    `${captureSamples.length} saved • ${recentFrames.length} buffered`;
}

function setInstruction(text) {

  const el =
    $("instruction");

  if (el) {
    el.textContent = text;
  }
}

function showCaptureFeedback() {

  const button =
    $("captureNow");

  if (!button) return;

  const original =
    button.dataset.originalText ||
    button.textContent;

  button.dataset.originalText =
    original;

  button.textContent =
    "✓ CAPTURED";

  button.disabled = true;

  setTimeout(() => {

    button.textContent =
      original;

    button.disabled = false;

  }, 900);
}

function resizeOverlay() {

  const v =
    $("video");

  const o =
    $("detectionOverlay");

  if (
    !v ||
    !o ||
    !v.videoWidth
  ) {
    return;
  }

  if (
    o.width !== v.videoWidth ||
    o.height !== v.videoHeight
  ) {
    o.width =
      v.videoWidth;

    o.height =
      v.videoHeight;
  }
}

function drawDetection(box, score) {

  const o =
    $("detectionOverlay");

  if (!o) return;

  const c =
    o.getContext("2d");

  c.clearRect(
    0,
    0,
    o.width,
    o.height
  );

  if (!box) return;

  const [
    x,
    y,
    w,
    h
  ] = box;

  const nx =
    x + w * .28;

  const ny =
    y + h * .48;

  const nw =
    w * .44;

  const nh =
    h * .30;

  c.lineWidth =
    Math.max(
      4,
      o.width / 300
    );

  c.strokeStyle =
    "#fff";

  c.strokeRect(
    x,
    y,
    w,
    h
  );

  c.setLineDash([
    12,
    8
  ]);

  c.strokeRect(
    nx,
    ny,
    nw,
    nh
  );

  c.setLineDash([]);

  c.font =
    `${Math.max(
      18,
      o.width / 35
    )}px system-ui`;

  c.fillStyle =
    "#0b0d12";

  c.fillRect(
    x,
    y,
    Math.min(w, 260),
    42
  );

  c.fillStyle =
    "#fff";

  c.fillText(
    `CAT ${Math.round(
      score * 100
    )}%`,
    x + 10,
    y + 28
  );
}

function noseCandidateFromCat(box) {

  const v =
    $("video");

  if (
    !v ||
    !v.videoWidth ||
    !box
  ) {
    return null;
  }

  const [
    x,
    y,
    w,
    h
  ] = box;

  const cx =
    x + w * .50;

  const baseY =
    y + h * .58;

  const candidates = [

    [
      cx - w * .18,
      baseY - h * .10,
      w * .36,
      h * .24
    ],

    [
      cx - w * .22,
      baseY - h * .04,
      w * .44,
      h * .26
    ],

    [
      cx - w * .16,
      baseY + h * .02,
      w * .32,
      h * .22
    ]

  ];

  const c =
    document.createElement(
      "canvas"
    );

  c.width = 224;
  c.height = 224;

  const ctx =
    c.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );

  let best = null;

  for (
    const [
      px,
      py,
      pw,
      ph
    ] of candidates
  ) {

    const xx =
      Math.max(
        0,
        px
      );

    const yy =
      Math.max(
        0,
        py
      );

    const ww =
      Math.min(
        v.videoWidth - xx,
        pw
      );

    const hh =
      Math.min(
        v.videoHeight - yy,
        ph
      );

    if (
      ww < 20 ||
      hh < 20
    ) {
      continue;
    }

    ctx.clearRect(
      0,
      0,
      224,
      224
    );

    ctx.drawImage(
      v,
      xx,
      yy,
      ww,
      hh,
      0,
      0,
      224,
      224
    );

    const d =
      ctx.getImageData(
        0,
        0,
        224,
        224
      ).data;

    let mean = 0;
    let contrast = 0;
    let n = 0;

    for (
      let i = 0;
      i < d.length;
      i += 16
    ) {

      const lum =
        luminance(
          d[i],
          d[i + 1],
          d[i + 2]
        );

      mean += lum;
      n++;
    }

    if (!n) continue;

    mean /= n;

    for (
      let i = 0;
      i < d.length;
      i += 16
    ) {

      const lum =
        luminance(
          d[i],
          d[i + 1],
          d[i + 2]
        );

      contrast +=
        Math.abs(
          lum - mean
        );
    }

    contrast /= n;

    const score =
      Math.min(
        99,
        Math.max(
          1,
          contrast * 1.8
        )
      );

    if (
      !best ||
      score > best.score
    ) {

      best = {
        box: [
          xx,
          yy,
          ww,
          hh
        ],
        score
      };
    }
  }

  return best;
}

function drawNoseCandidate(
  candidate
) {

  const o =
    $("detectionOverlay");

  if (
    !o ||
    !lastCatBox
  ) {
    return;
  }

  drawDetection(
    lastCatBox,
    lastCatScore
  );

  if (!candidate) return;

  const [
    x,
    y,
    w,
    h
  ] = candidate.box;

  const ctx =
    o.getContext("2d");

  ctx.lineWidth =
    Math.max(
      4,
      o.width / 280
    );

  ctx.setLineDash([
    6,
    5
  ]);

  ctx.strokeStyle =
    "#fff";

  ctx.strokeRect(
    x,
    y,
    w,
    h
  );

  ctx.setLineDash([]);

  ctx.font =
    `${Math.max(
      16,
      o.width / 40
    )}px system-ui`;

  ctx.fillStyle =
    "#0b0d12";

  ctx.fillRect(
    x,
    y + h - 38,
    Math.min(w, 230),
    38
  );

  ctx.fillStyle =
    "#fff";

  ctx.fillText(
    `NOSE ${Math.round(
      candidate.score
    )}%`,
    x + 8,
    y + h - 13
  );
}

async function loadCatDetector() {

  try {

    setInstruction(
      "Loading cat detector…"
    );

    catModel =
      await cocoSsd.load({
        base:
          "lite_mobilenet_v2"
      });

    setInstruction(
      "Cat detector ready. Show the cat."
    );

  } catch (e) {

    console.warn(
      "Cat detector error:",
      e
    );

    setInstruction(
      "Detector unavailable — fallback mode."
    );
  }
}

async function detectCat() {

  if (
    !catModel ||
    !$("video") ||
    !$("video").videoWidth ||
    detectBusy
  ) {
    return;
  }

  detectBusy = true;

  try {

    const p =
      await catModel.detect(
        $("video"),
        5,
        .45
      );

    const cats =
      p
        .filter(
          x =>
            x.class === "cat"
        )
        .sort(
          (a, b) =>
            b.score - a.score
        );

    if (cats.length) {

      lastCatBox =
        cats[0].bbox;

      lastCatScore =
        cats[0].score;

      noseCandidate =
        noseCandidateFromCat(
          lastCatBox
        );

      noseCandidateScore =
        noseCandidate
          ? noseCandidate.score
          : 0;

      drawNoseCandidate(
        noseCandidate
      );

      if (
        noseCandidate &&
        noseCandidate.score >= 35
      ) {

        setInstruction(
          `🐽 NOSE CANDIDATE ${Math.round(
            noseCandidateScore
          )}% — keep the cat here`
        );

      } else {

        setInstruction(
          `🐱 CAT ${Math.round(
            lastCatScore * 100
          )}% — finding nose…`
        );
      }

    } else {

      lastCatBox = null;
      lastCatScore = 0;

      noseCandidate = null;
      noseCandidateScore = 0;

      drawDetection(
        null,
        0
      );

      setInstruction(
        "Looking for the cat…"
      );
    }

  } catch (e) {

    console.warn(
      "Cat detection error:",
      e
    );

  } finally {

    detectBusy = false;
  }
}

function addRecentFrame(
  dataUrl,
  quality,
  noseScore
) {

  if (!dataUrl) return;

  const frame = {
    dataUrl,
    quality,
    noseScore:
      noseScore || 0,
    timestamp:
      Date.now()
  };

  recentFrames.push(
    frame
  );

  if (
    recentFrames.length >
    MAX_RECENT_FRAMES
  ) {
    recentFrames.shift();
  }

  recentFrames.sort(
    (a, b) =>
      (
        b.quality +
        b.noseScore * .35
      ) -
      (
        a.quality +
        a.noseScore * .35
      )
  );

  if (
    recentFrames.length >
    MAX_RECENT_FRAMES
  ) {
    recentFrames =
      recentFrames.slice(
        0,
        MAX_RECENT_FRAMES
      );
  }

  updateFrameCounter();
}

function getBestRecentFrame() {

  if (!recentFrames.length) {
    return null;
  }

  return [
    ...recentFrames
  ].sort(
    (a, b) =>
      (
        b.quality +
        b.noseScore * .35
      ) -
      (
        a.quality +
        a.noseScore * .35
      )
  )[0];
}

function captureCurrentFrame(
  showFeedback = true
) {

  const v =
    $("video");

  const c =
    $("frameCanvas");

  if (
    !v ||
    !c ||
    !v.videoWidth
  ) {
    return false;
  }

  drawVideo(
    v,
    c
  );

  const quality =
    scoreCanvas(c);

  let img = null;

  if (
    noseCandidate &&
    noseCandidate.box
  ) {

    img =
      cropBox(
        v,
        noseCandidate.box
      );

  } else {

    img =
      cropCenter(
        v,
        c
      );
  }

  if (!img) {
    return false;
  }

  const sample = {
    dataUrl: img,
    quality,
    noseScore:
      noseCandidateScore || 0,
    timestamp:
      new Date().toISOString()
  };

  captureSamples.push(
    sample
  );

  bestCapture =
    sample;

  updateFrameCounter();

  if (showFeedback) {

    showCaptureFeedback();

    setInstruction(
      `✓ CAPTURED — ${captureSamples.length} sample${
        captureSamples.length === 1
          ? ""
          : "s"
      } saved`
    );
  }

  return true;
}

function autoBufferFrame(
  v,
  c,
  quality
) {

  const now =
    performance.now();

  if (
    now -
      lastBufferedCapture <
    AUTO_BUFFER_INTERVAL
  ) {
    return;
  }

  lastBufferedCapture =
    now;

  let img = null;

  if (
    noseCandidate &&
    noseCandidate.box
  ) {

    img =
      cropBox(
        v,
        noseCandidate.box
      );

  } else {

    img =
      cropCenter(
        v,
        c
      );
  }

  if (!img) return;

  addRecentFrame(
    img,
    quality,
    noseCandidateScore
  );

  const best =
    getBestRecentFrame();

  if (
    best &&
    (
      !bestCapture ||
      best.quality >
        bestCapture.quality
    )
  ) {

    bestCapture = {
      dataUrl:
        best.dataUrl,
      quality:
        best.quality,
      noseScore:
        best.noseScore,
      timestamp:
        new Date().toISOString()
    };
  }
}

async function startCamera() {

  try {

    stream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode:
            "environment",

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

    const v =
      $("video");

    v.srcObject =
      stream;

    await v.play();

    recentFrames = [];
    captureSamples = [];
    bestCapture = null;

    updateFrameCounter();

    show("camera");

    resizeOverlay();

    await loadCatDetector();

    lastDetect = 0;
    lastBufferedCapture = 0;

    loop();

  } catch (e) {

    console.error(e);

    alert(
      "Camera access needs HTTPS and permission."
    );
  }
}

function stopCamera() {

  if (stream) {

    stream
      .getTracks()
      .forEach(
        t => t.stop()
      );

    stream = null;
  }

  if (scanTimer) {

    cancelAnimationFrame(
      scanTimer
    );

    scanTimer = null;
  }

  show("home");
}

function loop() {

  const v =
    $("video");

  const c =
    $("frameCanvas");

  if (
    !v ||
    !c ||
    !v.videoWidth
  ) {

    scanTimer =
      requestAnimationFrame(
        loop
      );

    return;
  }

  resizeOverlay();

  const now =
    performance.now();

  if (
    now -
      lastDetect >=
    DETECTION_INTERVAL
  ) {

    lastDetect =
      now;

    detectCat();
  }

  drawVideo(
    v,
    c
  );

  const quality =
    scoreCanvas(c);

  setQ(
    quality
  );

  if (
    quality >= 42
  ) {

    autoBufferFrame(
      v,
      c,
      quality
    );
  }

  if (
    noseCandidate &&
    noseCandidateScore >= 35
  ) {

    if (
      quality >= 55
    ) {

      setInstruction(
        `🐽 READY — ${recentFrames.length} frames buffered`
      );

    }

  } else if (
    quality < 25
  ) {

    setInstruction(
      "Move closer to the nose."
    );

  } else if (
    quality < 45
  ) {

    setInstruction(
      "Hold the phone steady."
    );
  }

  scanTimer =
    requestAnimationFrame(
      loop
    );
}

$("startCamera").onclick =
  startCamera;

$("stopCamera").onclick =
  stopCamera;

$("captureNow").onclick =
  () => {

    const recent =
      getBestRecentFrame();

    let captured = false;

    if (recent) {

      const sample = {
        dataUrl:
          recent.dataUrl,

        quality:
          recent.quality,

        noseScore:
          recent.noseScore,

        timestamp:
          new Date().toISOString()
      };

      captureSamples.push(
        sample
      );

      bestCapture =
        sample;

      updateFrameCounter();

      captured = true;

      showCaptureFeedback();

      setInstruction(
        `✓ BEST FRAME CAPTURED — ${
          captureSamples.length
        } sample${
          captureSamples.length === 1
            ? ""
            : "s"
        } saved`
      );

    } else {

      captured =
        captureCurrentFrame(
          true
        );
    }

    if (!captured) {

      setInstruction(
        "No usable frame yet — point the camera at the cat."
      );
    }
  };

$("finishScan").onclick =
  () => {

    if (
      !bestCapture &&
      !captureSamples.length
    ) {

      const recent =
        getBestRecentFrame();

      if (recent) {

        bestCapture = {
          dataUrl:
            recent.dataUrl,

          quality:
            recent.quality,

          noseScore:
            recent.noseScore
        };
      }
    }

    if (
      !bestCapture &&
      !captureSamples.length
    ) {

      alert(
        "No sample captured yet."
      );

      return;
    }

    show("profile");
  };

$("profileBack").onclick =
  () =>
    show("camera");

$("saveProfile").onclick =
  () => {

    const name =
      $("catName")
        .value
        .trim() ||
      "Unknown Cat";

    const sample =
      bestCapture ||
      captureSamples.at(-1);

    if (!sample) {

      alert(
        "No nose sample available."
      );

      return;
    }

    const record = {

      id:
        "cat_" +
        Date.now(),

      name,

      nickname:
        $("catNickname")
          .value
          .trim(),

      version:
        APP_VERSION,

      createdAt:
        new Date()
          .toISOString(),

      sample,

      samples:
        captureSamples,

      sampleCount:
        captureSamples.length
    };

    localStorage.setItem(
      "catNosePrototype_last",
      JSON.stringify(record)
    );

    $("savedInfo")
      .classList
      .remove("hidden");

    $("savedInfo").innerHTML =
      "<h3>🐱 " +
      name +
      "</h3>" +

      "<p><b>NOSE SAMPLE SAVED</b></p>" +

      "<p>" +
      APP_VERSION +
      " — " +
      captureSamples.length +
      " captured sample(s).</p>" +

      "<p>This prototype uses cat detection and an experimental nose-candidate stage. It is not yet biometric recognition.</p>" +

      "<img src='" +
      sample.dataUrl +
      "' style='width:100%;border-radius:16px'>";
  };

$("backHome").onclick =
  () =>
    show("home");

$("mediaInput").onchange =
  async e => {

    const f =
      e.target.files[0];

    if (!f) return;

    if (
      f.type.startsWith(
        "image/"
      )
    ) {

      const u =
        URL.createObjectURL(f);

      const im =
        new Image();

      im.onload =
        () => {

          const c =
            $("videoCanvas");

          c.width =
            im.naturalWidth;

          c.height =
            im.naturalHeight;

          c.getContext(
            "2d"
          ).drawImage(
            im,
            0,
            0
          );

          const q =
            scoreCanvas(c);

          $("videoQuality")
            .textContent =
            Math.round(q) +
            "%";

          $("videoQualityBar")
            .style.width =
            Math.min(
              100,
              q
            ) +
            "%";

          $("videoResult")
            .classList
            .remove("hidden");

          $("videoResult")
            .innerHTML =
            "<b>IMAGE TEST</b>" +

            "<p>Generic image-quality score: " +
            Math.round(q) +
            ".</p>" +

            "<p>Not nose recognition.</p>" +

            "<img src='" +
            u +
            "' style='width:100%;border-radius:14px'>";

          show(
            "videoTest"
          );
        };

      im.src = u;

    } else {

      $("sourceVideo").src =
        URL.createObjectURL(f);

      show(
        "videoTest"
      );
    }
  };

$("analyzeVideo").onclick =
  async () => {

    const v =
      $("sourceVideo");

    if (!v.src) {

      alert(
        "Choose a video first."
      );

      return;
    }

    if (!v.duration) {

      await new Promise(
        resolve => {

          v.addEventListener(
            "loadedmetadata",
            resolve,
            {
              once: true
            }
          );
        }
      );
    }

    if (
      !v.duration ||
      !isFinite(v.duration)
    ) {

      alert(
        "Video could not be loaded."
      );

      return;
    }

    const c =
      $("videoCanvas");

    const frames = [];

    /*
      V0.5 samples the video much more densely.
      We aim for approximately 8 frames/sec,
      while keeping a reasonable upper limit.
    */

    const N =
      Math.min(
        120,
        Math.max(
          24,
          Math.ceil(
            v.duration * 8
          )
        )
      );

    for (
      let i = 0;
      i < N;
      i++
    ) {

      v.currentTime =
        v.duration *
        i /
        Math.max(
          1,
          N - 1
        );

      await new Promise(
        resolve => {

          v.onseeked =
            resolve;
        }
      );

      drawVideo(
        v,
        c
      );

      const q =
        scoreCanvas(c);

      const img =
        cropCenter(
          v,
          c
        );

      frames.push({
        q,
        img
      });
    }

    frames.sort(
      (a, b) =>
        b.q - a.q
    );

    const best =
      frames.slice(
        0,
        12
      );

    if (!best.length) {

      alert(
        "No usable frames found."
      );

      return;
    }

    $("videoQuality")
      .textContent =
      Math.round(
        best[0].q
      ) + "%";

    $("videoQualityBar")
      .style.width =
      Math.min(
        100,
        best[0].q
      ) + "%";

    $("videoResult")
      .classList
      .remove("hidden");

    $("videoResult")
      .innerHTML =
      "<b>VIDEO ANALYSIS COMPLETE</b>" +

      "<p>Sampled " +
      N +
      " frames at a denser rate.</p>" +

      "<p>Best generic quality: " +
      Math.round(
        best[0].q
      ) +
      "%.</p>" +

      "<p><b>" +
      APP_VERSION +
      ":</b> this stage selects high-quality candidate frames. It is not yet biometric recognition.</p>";

    $("videoSamples")
      .innerHTML =
      best
        .map(
          x =>
            "<img src='" +
            x.img +
            "'>"
        )
        .join("");
  };

setVersionUI();

updateFrameCounter();
