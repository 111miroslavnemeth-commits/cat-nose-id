const $ = id => document.getElementById(id);

const screens = ["home", "camera", "videoTest", "profile"];

let stream = null;
let catModel = null;

let captureSamples = [];
let bestCapture = null;
let bestCaptureScore = 0;

let scanRunning = false;
let animationFrame = null;
let detectorRunning = false;

let currentQuality = 0;
let sampleCounter = 0;

let lastDetection = null;
let modelLoading = false;

const CAPTURE_MAX = 12;
const JPEG_QUALITY = 0.88;


/* =========================================================
   SCREEN NAVIGATION
========================================================= */

function show(name) {
    screens.forEach(screen => {
        const el = $(screen);
        if (el) {
            el.classList.toggle("active", screen === name);
        }
    });
}


/* =========================================================
   IMAGE / CANVAS HELPERS
========================================================= */

function getVideoSize(video) {
    if (!video) return { width: 0, height: 0 };

    return {
        width: video.videoWidth || video.clientWidth || 0,
        height: video.videoHeight || video.clientHeight || 0
    };
}


function drawVideoToCanvas(video, canvas) {
    const { width, height } = getVideoSize(video);

    if (!width || !height) return false;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", {
        willReadFrequently: true
    });

    ctx.drawImage(video, 0, 0, width, height);

    return true;
}


function calculateImageQuality(canvas) {
    if (!canvas || !canvas.width || !canvas.height) {
        return 0;
    }

    const ctx = canvas.getContext("2d", {
        willReadFrequently: true
    });

    const width = canvas.width;
    const height = canvas.height;

    /*
      Sample a smaller image for speed.
    */
    const targetWidth = Math.min(320, width);
    const targetHeight = Math.max(
        1,
        Math.round(height * targetWidth / width)
    );

    const temp = document.createElement("canvas");
    temp.width = targetWidth;
    temp.height = targetHeight;

    const tctx = temp.getContext("2d", {
        willReadFrequently: true
    });

    tctx.drawImage(
        canvas,
        0,
        0,
        targetWidth,
        targetHeight
    );

    const image = tctx.getImageData(
        0,
        0,
        targetWidth,
        targetHeight
    );

    const data = image.data;

    let sum = 0;
    let sumSq = 0;
    let count = 0;

    /*
      Simple contrast / detail estimate.
      This is not biometric identification.
    */
    for (let y = 1; y < targetHeight - 1; y += 2) {
        for (let x = 1; x < targetWidth - 1; x += 2) {

            const i = (y * targetWidth + x) * 4;

            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            const lum =
                0.2126 * r +
                0.7152 * g +
                0.0722 * b;

            sum += lum;
            sumSq += lum * lum;
            count++;
        }
    }

    if (!count) return 0;

    const mean = sum / count;
    const variance = Math.max(
        0,
        sumSq / count - mean * mean
    );

    const contrastScore = Math.min(
        100,
        Math.sqrt(variance) * 3
    );

    return Math.round(contrastScore);
}


/* =========================================================
   QUALITY UI
========================================================= */

function setQuality(value) {
    value = Math.max(0, Math.min(100, Math.round(value)));

    currentQuality = value;

    const bar = $("qualityBar");
    const text = $("qualityText");

    if (bar) {
        bar.style.width = value + "%";
    }

    if (text) {
        if (value >= 80) {
            text.textContent = "EXCELLENT";
        } else if (value >= 60) {
            text.textContent = "GOOD";
        } else if (value >= 40) {
            text.textContent = "FAIR";
        } else {
            text.textContent = "LOW";
        }
    }
}


/* =========================================================
   CAMERA
========================================================= */

async function startCamera() {
    show("camera");

    const video = $("video");

    if (!video) return;

    try {
        if (stream) {
            stopCamera(false);
        }

        stream = await navigator.mediaDevices.getUserMedia({
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
                    min: 20
                }
            },
            audio: false
        });

        video.srcObject = stream;

        await video.play();

        scanRunning = true;

        const status = $("engineStatus");
        if (status) {
            status.textContent = "Camera ready";
        }

        resetScan();

        startFrameLoop();

        loadCatDetector();

    } catch (error) {

        console.error(error);

        const instruction = $("instruction");

        if (instruction) {
            instruction.textContent =
                "Camera unavailable. Check camera permission.";
        }

        const status = $("engineStatus");

        if (status) {
            status.textContent =
                "Camera permission required";
        }
    }
}


function stopCamera(returnHome = true) {
    scanRunning = false;
    detectorRunning = false;

    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    if (stream) {
        stream.getTracks().forEach(track => {
            try {
                track.stop();
            } catch (_) {}
        });

        stream = null;
    }

    const video = $("video");

    if (video) {
        video.srcObject = null;
    }

    if (returnHome) {
        show("home");
    }
}


/* =========================================================
   LIVE FRAME LOOP
========================================================= */

function startFrameLoop() {

    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
    }

    const loop = () => {

        if (!scanRunning) {
            return;
        }

        const video = $("video");
        const canvas = $("frameCanvas");

        if (
            video &&
            canvas &&
            video.readyState >= 2 &&
            video.videoWidth > 0
        ) {

            if (drawVideoToCanvas(video, canvas)) {

                /*
                  We calculate quality continuously,
                  but do not save a frame automatically.
                */
                const quality = calculateImageQuality(canvas);

                setQuality(quality);

                /*
                  Remember the best frame seen during the scan.
                */
                if (quality > bestCaptureScore) {

                    bestCaptureScore = quality;

                    bestCapture = canvas.toDataURL(
                        "image/jpeg",
                        JPEG_QUALITY
                    );
                }
            }
        }

        animationFrame = requestAnimationFrame(loop);
    };

    animationFrame = requestAnimationFrame(loop);
}


/* =========================================================
   CAPTURE SYSTEM
========================================================= */

function captureBestFrame() {

    const video = $("video");
    const canvas = $("frameCanvas");

    if (
        !video ||
        !canvas ||
        video.readyState < 2 ||
        !video.videoWidth
    ) {
        showCaptureMessage(
            "Kamera ešte nie je pripravená."
        );

        return;
    }

    /*
      Always capture a fresh frame at the exact moment
      the user presses the button.
    */
    const drawn = drawVideoToCanvas(
        video,
        canvas
    );

    if (!drawn) {
        showCaptureMessage(
            "Nepodarilo sa zachytiť aktuálny obraz."
        );

        return;
    }

    const quality = calculateImageQuality(
        canvas
    );

    const imageData = canvas.toDataURL(
        "image/jpeg",
        JPEG_QUALITY
    );

    const sample = {
        id: Date.now(),
        index: captureSamples.length + 1,
        timestamp: new Date().toISOString(),
        quality: quality,
        image: imageData
    };

    /*
      Limit the number of stored samples.
      If full, remove the oldest one.
    */
    if (captureSamples.length >= CAPTURE_MAX) {
        captureSamples.shift();
    }

    captureSamples.push(sample);

    sampleCounter = captureSamples.length;

    /*
      Keep the highest-quality captured sample.
    */
    if (
        !bestCapture ||
        quality > bestCaptureScore
    ) {
        bestCapture = imageData;
        bestCaptureScore = quality;
    }

    updateFrameCounter();
    renderCaptureSamples();

    setQuality(quality);

    showCaptureMessage(
        "Zachytené ✓"
    );
}


function updateFrameCounter() {

    const counter = $("frameCounter");

    if (!counter) return;

    counter.textContent =
        captureSamples.length +
        (
            captureSamples.length === 1
                ? " sample"
                : " samples"
        );
}


/* =========================================================
   CAPTURE PREVIEW UI
========================================================= */

function ensureCaptureGallery() {

    let gallery = $("captureGallery");

    if (gallery) {
        return gallery;
    }

    /*
      We create the gallery dynamically.
      Therefore index.html does not need another edit.
    */

    gallery = document.createElement("div");

    gallery.id = "captureGallery";

    gallery.style.marginTop = "14px";
    gallery.style.display = "grid";
    gallery.style.gridTemplateColumns =
        "repeat(3, minmax(0, 1fr))";
    gallery.style.gap = "8px";

    const title = document.createElement("div");

    title.id = "captureGalleryTitle";

    title.textContent =
        "ZACHYTENÉ ZÁBERY";

    title.style.margin =
        "12px 0 8px 0";

    title.style.fontSize =
        "12px";

    title.style.fontWeight =
        "700";

    title.style.opacity =
        "0.7";

    const controls = document.querySelector(
        "#camera .controls"
    );

    if (controls && controls.parentNode) {

        controls.parentNode.insertBefore(
            title,
            controls.nextSibling
        );

        controls.parentNode.insertBefore(
            gallery,
            title.nextSibling
        );

    } else {

        const camera = $("camera");

        if (camera) {
            camera.appendChild(title);
            camera.appendChild(gallery);
        }
    }

    return gallery;
}


function renderCaptureSamples() {

    const gallery =
        ensureCaptureGallery();

    if (!gallery) return;

    gallery.innerHTML = "";

    captureSamples.forEach(sample => {

        const card =
            document.createElement("div");

        card.style.position =
            "relative";

        card.style.borderRadius =
            "10px";

        card.style.overflow =
            "hidden";

        card.style.background =
            "#151820";

        card.style.border =
            "1px solid rgba(255,255,255,.12)";

        const image =
            document.createElement("img");

        image.src =
            sample.image;

        image.alt =
            "Captured sample " +
            sample.index;

        image.style.width =
            "100%";

        image.style.aspectRatio =
            "1 / 1";

        image.style.objectFit =
            "cover";

        image.style.display =
            "block";

        const label =
            document.createElement("div");

        label.textContent =
            "#" +
            sample.index +
            " • " +
            sample.quality +
            "%";

        label.style.position =
            "absolute";

        label.style.left =
            "5px";

        label.style.bottom =
            "5px";

        label.style.padding =
            "3px 6px";

        label.style.borderRadius =
            "5px";

        label.style.background =
            "rgba(0,0,0,.75)";

        label.style.color =
            "#fff";

        label.style.fontSize =
            "10px";

        card.appendChild(image);
        card.appendChild(label);

        gallery.appendChild(card);
    });
}


function showCaptureMessage(message) {

    const instruction =
        $("instruction");

    if (!instruction) return;

    instruction.textContent =
        message;

    setTimeout(() => {

        if (
            scanRunning &&
            instruction
        ) {
            instruction.textContent =
                "Move the nose into the circle.";
        }

    }, 1200);
}


/* =========================================================
   RESET SCAN
========================================================= */

function resetScan() {

    captureSamples = [];
    bestCapture = null;
    bestCaptureScore = 0;

    sampleCounter = 0;
    currentQuality = 0;

    updateFrameCounter();
    setQuality(0);

    const gallery =
        $("captureGallery");

    if (gallery) {
        gallery.innerHTML = "";
    }

    const title =
        $("captureGalleryTitle");

    if (title) {
        title.remove();
    }
}


/* =========================================================
   FINISH SCAN
========================================================= */

function finishScan() {

    if (!captureSamples.length) {

        showCaptureMessage(
            "Najprv zachyť aspoň jeden záber."
        );

        return;
    }

    /*
      Sort only for determining the best captured sample.
    */
    const sorted =
        [...captureSamples].sort(
            (a, b) =>
                b.quality - a.quality
        );

    bestCapture =
        sorted[0].image;

    bestCaptureScore =
        sorted[0].quality;

    /*
      Stop camera.
    */
    stopCamera(false);

    /*
      Move to profile.
    */
    show("profile");

    const savedInfo =
        $("savedInfo");

    if (savedInfo) {

        savedInfo.classList.remove(
            "hidden"
        );

        savedInfo.innerHTML = `
            <strong>Scan pripravený</strong>
            <p>${captureSamples.length} zachytených záberov</p>
            <p>Najlepší záber: ${bestCaptureScore}%</p>
            <img
                src="${bestCapture}"
                style="
                    width:100%;
                    max-width:320px;
                    border-radius:12px;
                    margin-top:10px;
                    display:block;
                "
                alt="Best captured cat nose sample"
            >
        `;
    }
}


/* =========================================================
   PROFILE
========================================================= */

function saveProfile() {

    const name =
        $("catName")?.value.trim();

    const nickname =
        $("catNickname")?.value.trim();

    if (!name) {

        alert(
            "Zadaj meno mačky."
        );

        return;
    }

    const savedInfo =
        $("savedInfo");

    if (!savedInfo) return;

    savedInfo.classList.remove(
        "hidden"
    );

    savedInfo.innerHTML = `
        <strong>Vzorka uložená</strong>
        <p>Mačka: ${escapeHtml(name)}</p>
        ${
            nickname
                ? `<p>Prezývka: ${escapeHtml(nickname)}</p>`
                : ""
        }
        <p>Zachytených záberov: ${captureSamples.length}</p>
        <p>Najlepší záber: ${bestCaptureScore}%</p>
        ${
            bestCapture
                ? `
                    <img
                        src="${bestCapture}"
                        style="
                            width:100%;
                            max-width:320px;
                            border-radius:12px;
                            margin-top:10px;
                            display:block;
                        "
                        alt="Saved nose sample"
                    >
                `
                : ""
        }
    `;
}


function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   CAT DETECTOR
========================================================= */

async function loadCatDetector() {

    if (catModel || modelLoading) {
        return;
    }

    if (
        typeof cocoSsd ===
        "undefined"
    ) {

        console.warn(
            "COCO-SSD library not available."
        );

        const note =
            $("detectorNote");

        if (note) {
            note.textContent =
                "Cat detector unavailable. Camera capture still works.";
        }

        return;
    }

    modelLoading = true;

    const instruction =
        $("instruction");

    if (instruction) {
        instruction.textContent =
            "Loading cat detector…";
    }

    try {

        catModel =
            await cocoSsd.load({
                base:
                    "lite_mobilenet_v2"
            });

        if (instruction) {
            instruction.textContent =
                "Move the nose into the circle.";
        }

        runDetector();

    } catch (error) {

        console.warn(
            "Cat detector failed:",
            error
        );

        if (instruction) {
            instruction.textContent =
                "Detector unavailable — capture mode still works.";
        }

    } finally {

        modelLoading = false;
    }
}


/* =========================================================
   CAT DETECTION LOOP
========================================================= */

async function runDetector() {

    if (
        detectorRunning ||
        !catModel
    ) {
        return;
    }

    detectorRunning = true;

    const video =
        $("video");

    const overlay =
        $("detectionOverlay");

    if (!video || !overlay) {
        detectorRunning = false;
        return;
    }

    const ctx =
        overlay.getContext("2d");

    const detect = async () => {

        if (
            !scanRunning ||
            !catModel ||
            video.readyState < 2
        ) {
            detectorRunning = false;
            return;
        }

        try {

            const predictions =
                await catModel.detect(
                    video
                );

            const cats =
                predictions.filter(
                    item =>
                        item.class === "cat" &&
                        item.score >= 0.25
                );

            if (cats.length) {

                cats.sort(
                    (a, b) =>
                        b.score - a.score
                );

                lastDetection =
                    cats[0];

            } else {

                lastDetection = null;
            }

            drawDetection();

        } catch (error) {

            console.warn(
                "Detection error:",
                error
            );
        }

        /*
          Detection is intentionally throttled.
          Camera capture itself runs independently at
          the browser's animation-frame frequency.
        */
        if (scanRunning) {
            setTimeout(
                detect,
                120
            );
        } else {
            detectorRunning = false;
        }
    };

    detect();
}


function drawDetection() {

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

    const width =
        video.videoWidth ||
        video.clientWidth;

    const height =
        video.videoHeight ||
        video.clientHeight;

    if (!width || !height) {
        return;
    }

    overlay.width =
        width;

    overlay.height =
        height;

    const ctx =
        overlay.getContext("2d");

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    if (!lastDetection) {
        return;
    }

    const [
        x,
        y,
        w,
        h
    ] =
        lastDetection.bbox;

    ctx.strokeStyle =
        "#ffffff";

    ctx.lineWidth =
        Math.max(
            3,
            width / 300
        );

    ctx.setLineDash([
        10,
        8
    ]);

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
            width / 45
        )}px sans-serif`;

    ctx.fillStyle =
        "#ffffff";

    ctx.fillText(
        "CAT " +
        Math.round(
            lastDetection.score * 100
        ) +
        "%",
        x,
        Math.max(
            25,
            y - 10
        )
    );
}


/* =========================================================
   VIDEO TEST
========================================================= */

function handleMediaInput(event) {

    const file =
        event.target.files?.[0];

    if (!file) return;

    const url =
        URL.createObjectURL(file);

    const sourceVideo =
        $("sourceVideo");

    if (
        file.type.startsWith("video/") &&
        sourceVideo
    ) {

        sourceVideo.src =
            url;

        sourceVideo.load();

        show("videoTest");

        return;
    }

    if (
        file.type.startsWith("image/")
    ) {

        /*
          Convert image to a one-frame video-like
          test result by displaying it in the sample area.
        */

        show("videoTest");

        const samples =
            $("videoSamples");

        if (samples) {

            samples.innerHTML = `
                <img
                    src="${url}"
                    style="
                        width:100%;
                        max-width:420px;
                        border-radius:12px;
                    "
                    alt="Uploaded test image"
                >
            `;
        }
    }
}


async function analyzeVideo() {

    const video =
        $("sourceVideo");

    const canvas =
        $("videoCanvas");

    if (
        !video ||
        !canvas ||
        !video.duration ||
        !isFinite(video.duration)
    ) {

        const result =
            $("videoResult");

        if (result) {
            result.classList.remove(
                "hidden"
            );

            result.textContent =
                "Nahraj najprv video.";
        }

        return;
    }

    const samples = [];

    const duration =
        video.duration;

    /*
      Sample much more frequently than the old version.
      This matters for cats because they can move very quickly.
    */
    const SAMPLE_INTERVAL =
        0.10;

    const positions = [];

    for (
        let t = 0;
        t < duration;
        t += SAMPLE_INTERVAL
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

    const result =
        $("videoResult");

    if (result) {

        result.classList.remove(
            "hidden"
        );

        result.textContent =
            "Analyzujem " +
            positions.length +
            " snímok…";
    }

    let best = null;

    for (
        let i = 0;
        i < positions.length;
        i++
    ) {

        const time =
            positions[i];

        await seekVideo(
            video,
            time
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
            calculateImageQuality(
                canvas
            );

        const image =
            canvas.toDataURL(
                "image/jpeg",
                JPEG_QUALITY
            );

        samples.push({
            time,
            quality,
            image
        });

        if (
            !best ||
            quality > best.quality
        ) {
            best =
                samples[samples.length - 1];
        }

        if (result) {

            result.textContent =
                "Analyzujem " +
                (i + 1) +
                " / " +
                positions.length +
                " snímok…";
        }

        /*
          Give the browser time to update the UI.
        */
        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    0
                )
        );
    }

    samples.sort(
        (a, b) =>
            b.quality - a.quality
    );

    const top =
        samples.slice(
            0,
            9
        );

    const sampleGrid =
        $("videoSamples");

    if (sampleGrid) {

        sampleGrid.innerHTML = "";

        top.forEach(
            (sample, index) => {

                const wrapper =
                    document.createElement(
                        "div"
                    );

                wrapper.style.position =
                    "relative";

                wrapper.style.borderRadius =
                    "10px";

                wrapper.style.overflow =
                    "hidden";

                const image =
                    document.createElement(
                        "img"
                    );

                image.src =
                    sample.image;

                image.style.width =
                    "100%";

                image.style.display =
                    "block";

                const label =
                    document.createElement(
                        "div"
                    );

                label.textContent =
                    "#" +
                    (index + 1) +
                    " • " +
                    sample.quality +
                    "%";

                label.style.position =
                    "absolute";

                label.style.bottom =
                    "5px";

                label.style.left =
                    "5px";

                label.style.padding =
                    "3px 6px";

                label.style.background =
                    "rgba(0,0,0,.75)";

                label.style.color =
                    "#fff";

                label.style.fontSize =
                    "10px";

                wrapper.appendChild(
                    image
                );

                wrapper.appendChild(
                    label
                );

                sampleGrid.appendChild(
                    wrapper
                );
            }
        );
    }

    if (result) {

        result.innerHTML = `
            <strong>Analýza dokončená</strong>
            <p>
                Skontrolovaných snímok:
                ${samples.length}
            </p>
            <p>
                Najlepší záber:
                ${best ? best.quality : 0}%
            </p>
        `;
    }
}


function seekVideo(video, time) {

    return new Promise(resolve => {

        const handler = () => {

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
    });
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const start =
            $("startCamera");

        if (start) {
            start.addEventListener(
                "click",
                startCamera
            );
        }

        const stop =
            $("stopCamera");

        if (stop) {
            stop.addEventListener(
                "click",
                () =>
                    stopCamera(true)
            );
        }

        const capture =
            $("captureNow");

        if (capture) {

            capture.addEventListener(
                "click",
                captureBestFrame
            );
        }

        const finish =
            $("finishScan");

        if (finish) {

            finish.addEventListener(
                "click",
                finishScan
            );
        }

        const media =
            $("mediaInput");

        if (media) {

            media.addEventListener(
                "change",
                handleMediaInput
            );
        }

        const backHome =
            $("backHome");

        if (backHome) {

            backHome.addEventListener(
                "click",
                () => show("home")
            );
        }

        const profileBack =
            $("profileBack");

        if (profileBack) {

            profileBack.addEventListener(
                "click",
                () => show("camera")
            );
        }

        const analyze =
            $("analyzeVideo");

        if (analyze) {

            analyze.addEventListener(
                "click",
                analyzeVideo
            );
        }

        const saveProfileButton =
            $("saveProfile");

        if (saveProfileButton) {

            saveProfileButton.addEventListener(
                "click",
                saveProfile
            );
        }

        const status =
            $("engineStatus");

        if (status) {
            status.textContent =
                "Capture engine ready";
        }
    }
);
