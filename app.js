const $=id=>document.getElementById(id);

const screens=["home","camera","videoTest","profile"];

let stream=null;
let bestCapture=null;
let captureSamples=[];
let recentFrames=[];
let scanTimer=null;

let catModel=null;
let lastCatBox=null;
let lastCatScore=0;
let lastDetect=0;
let detectBusy=false;

let noseCandidate=null;
let noseCandidateScore=0;

const LIVE_DETECT_INTERVAL=170;
const AUTO_BUFFER_INTERVAL=120;
const MAX_RECENT_FRAMES=24;

let lastBufferedCapture=0;
let captureLocked=false;


/* -------------------------------------------------------
   BASIC UI
------------------------------------------------------- */

function show(n){
  screens.forEach(s=>{
    const el=$(s);
    if(el){
      el.classList.toggle("active",s===n);
    }
  });
}


/* -------------------------------------------------------
   IMAGE QUALITY
------------------------------------------------------- */

function luminance(r,g,b){
  return .2126*r+.7152*g+.0722*b;
}

function scoreCanvas(c){

  if(!c||!c.width||!c.height)return 0;

  try{

    const x=c.getContext("2d",{willReadFrequently:true});
    const w=c.width;
    const h=c.height;
    const d=x.getImageData(0,0,w,h).data;

    const step=4;

    let s=0;
    let s2=0;
    let n=0;

    for(let y=1;y<h-1;y+=step){

      for(let z=1;z<w-1;z+=step){

        const i=(y*w+z)*4;

        const center=
          luminance(
            d[i],
            d[i+1],
            d[i+2]
          );

        const left=
          luminance(
            d[i-4],
            d[i-3],
            d[i-2]
          );

        const right=
          luminance(
            d[i+4],
            d[i+5],
            d[i+6]
          );

        const up=
          luminance(
            d[i-w*4],
            d[i-w*4+1],
            d[i-w*4+2]
          );

        const down=
          luminance(
            d[i+w*4],
            d[i+w*4+1],
            d[i+w*4+2]
          );

        const q=
          Math.abs(
            4*center-
            left-
            right-
            up-
            down
          );

        s+=q;
        s2+=q*q;
        n++;
      }
    }

    if(!n)return 0;

    const variance=
      Math.max(
        0,
        s2/n-
        Math.pow(s/n,2)
      );

    return Math.min(
      100,
      Math.sqrt(variance)*2.4
    );

  }catch(e){

    console.warn(
      "Quality score error:",
      e
    );

    return 0;
  }
}


/* -------------------------------------------------------
   VIDEO / CANVAS
------------------------------------------------------- */

function drawVideo(v,c){

  if(!v||!c||!v.videoWidth)return;

  const w=480;

  const h=
    Math.round(
      w*
      (v.videoHeight/
       v.videoWidth||1)
    );

  c.width=w;
  c.height=h;

  c.getContext("2d")
    .drawImage(
      v,
      0,
      0,
      w,
      h
    );
}


function cropCenter(v,c){

  const w=
    v.videoWidth||
    c.width;

  const h=
    v.videoHeight||
    c.height;

  if(!w||!h)return null;

  c.width=w;
  c.height=h;

  c.getContext("2d")
    .drawImage(
      v,
      0,
      0,
      w,
      h
    );

  const sz=
    Math.min(w,h)*.58;

  const x=
    (w-sz)/2;

  const y=
    (h-sz)/2;

  const o=
    document.createElement(
      "canvas"
    );

  o.width=640;
  o.height=640;

  o.getContext("2d")
    .drawImage(
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


function cropNoseCandidate(
  v,
  candidate
){

  if(
    !v||
    !candidate||
    !candidate.box
  ){
    return null;
  }

  const [
    nx,
    ny,
    nw,
    nh
  ]=candidate.box;

  if(
    nw<10||
    nh<10
  ){
    return null;
  }

  const o=
    document.createElement(
      "canvas"
    );

  o.width=640;
  o.height=640;

  o.getContext("2d")
    .drawImage(
      v,
      nx,
      ny,
      nw,
      nh,
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


/* -------------------------------------------------------
   QUALITY UI
------------------------------------------------------- */

function setQ(q){

  const bar=$("qualityBar");
  const text=$("qualityText");

  if(bar){
    bar.style.width=
      Math.max(
        0,
        Math.min(100,q)
      )+"%";
  }

  if(text){

    text.textContent=
      q<25
        ?"MOVE CLOSER"
        :q<45
          ?"HOLD STEADY"
          :q<65
            ?"GOOD"
            :"EXCELLENT";
  }
}


/* -------------------------------------------------------
   FRAME COUNTER
------------------------------------------------------- */

function updateFrameCounter(){

  const el=
    $("frameCounter");

  if(!el)return;

  el.textContent=
    captureSamples.length+
    " samples";
}


/* -------------------------------------------------------
   INSTRUCTION
------------------------------------------------------- */

function setInstruction(text){

  const el=
    $("instruction");

  if(el){
    el.textContent=text;
  }
}


/* -------------------------------------------------------
   OVERLAY
------------------------------------------------------- */

function resizeOverlay(){

  const v=$("video");
  const o=$("detectionOverlay");

  if(
    !v||
    !o||
    !v.videoWidth
  ){
    return;
  }

  o.width=
    v.videoWidth;

  o.height=
    v.videoHeight;
}


function drawDetection(
  box,
  score
){

  const o=
    $("detectionOverlay");

  if(!o)return;

  const c=
    o.getContext("2d");

  c.clearRect(
    0,
    0,
    o.width,
    o.height
  );

  if(!box)return;

  const [
    x,
    y,
    w,
    h
  ]=box;

  const nx=
    x+w*.28;

  const ny=
    y+h*.48;

  const nw=
    w*.44;

  const nh=
    h*.30;

  c.lineWidth=
    Math.max(
      4,
      o.width/300
    );

  c.strokeStyle="#fff";

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

  c.font=
    `${Math.max(
      18,
      o.width/35
    )}px system-ui`;

  c.fillStyle=
    "#0b0d12";

  c.fillRect(
    x,
    y,
    Math.min(w,260),
    42
  );

  c.fillStyle="#fff";

  c.fillText(
    `CAT ${Math.round(
      score*100
    )}%`,
    x+10,
    y+28
  );
}


/* -------------------------------------------------------
   NOSE CANDIDATE
------------------------------------------------------- */

function noseCandidateFromCat(
  box
){

  const v=$("video");

  if(
    !v||
    !v.videoWidth||
    !box
  ){
    return null;
  }

  const [
    x,
    y,
    w,
    h
  ]=box;

  const cx=
    x+w*.50;

  const baseY=
    y+h*.58;

  const candidates=[

    [
      cx-w*.18,
      baseY-h*.10,
      w*.36,
      h*.24
    ],

    [
      cx-w*.22,
      baseY-h*.04,
      w*.44,
      h*.26
    ],

    [
      cx-w*.16,
      baseY+h*.02,
      w*.32,
      h*.22
    ]

  ];

  const c=
    document.createElement(
      "canvas"
    );

  c.width=224;
  c.height=224;

  const ctx=
    c.getContext(
      "2d",
      {
        willReadFrequently:true
      }
    );

  let best=null;

  for(
    const [
      px,
      py,
      pw,
      ph
    ] of candidates
  ){

    const xx=
      Math.max(
        0,
        px
      );

    const yy=
      Math.max(
        0,
        py
      );

    const ww=
      Math.min(
        v.videoWidth-xx,
        pw
      );

    const hh=
      Math.min(
        v.videoHeight-yy,
        ph
      );

    if(
      ww<20||
      hh<20
    ){
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

    const d=
      ctx.getImageData(
        0,
        0,
        224,
        224
      ).data;

    let mean=0;
    let contrast=0;
    let n=0;

    for(
      let i=0;
      i<d.length;
      i+=16
    ){

      const lum=
        luminance(
          d[i],
          d[i+1],
          d[i+2]
        );

      mean+=lum;
      n++;
    }

    if(!n)continue;

    mean/=n;

    for(
      let i=0;
      i<d.length;
      i+=16
    ){

      const lum=
        luminance(
          d[i],
          d[i+1],
          d[i+2]
        );

      contrast+=
        Math.abs(
          lum-mean
        );
    }

    contrast/=n;

    const score=
      Math.min(
        99,
        Math.max(
          1,
          contrast*1.8
        )
      );

    if(
      !best||
      score>best.score
    ){

      best={
        box:[
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
){

  const o=
    $("detectionOverlay");

  if(
    !o||
    !lastCatBox
  ){
    return;
  }

  drawDetection(
    lastCatBox,
    lastCatScore
  );

  if(!candidate)return;

  const [
    x,
    y,
    w,
    h
  ]=candidate.box;

  const ctx=
    o.getContext("2d");

  ctx.lineWidth=
    Math.max(
      4,
      o.width/280
    );

  ctx.setLineDash([
    6,
    5
  ]);

  ctx.strokeStyle="#fff";

  ctx.strokeRect(
    x,
    y,
    w,
    h
  );

  ctx.setLineDash([]);

  ctx.font=
    `${Math.max(
      16,
      o.width/40
    )}px system-ui`;

  ctx.fillStyle=
    "#0b0d12";

  ctx.fillRect(
    x,
    y+h-38,
    Math.min(w,230),
    38
  );

  ctx.fillStyle="#fff";

  ctx.fillText(
    `NOSE CANDIDATE ${Math.round(
      candidate.score
    )}%`,
    x+8,
    y+h-13
  );
}


/* -------------------------------------------------------
   CAT DETECTOR
------------------------------------------------------- */

async function loadCatDetector(){

  try{

    setInstruction(
      "Loading cat detector…"
    );

    catModel=
      await cocoSsd.load({
        base:
          "lite_mobilenet_v2"
      });

    setInstruction(
      "Cat detector ready. Show the cat."
    );

  }catch(e){

    console.warn(e);

    setInstruction(
      "Detector unavailable — fallback mode."
    );
  }
}


async function detectCat(){

  if(
    !catModel||
    !$("video")||
    !$("video").videoWidth||
    detectBusy
  ){
    return;
  }

  detectBusy=true;

  try{

    const p=
      await catModel.detect(
        $("video"),
        5,
        .45
      );

    const cats=
      p
        .filter(
          x=>x.class==="cat"
        )
        .sort(
          (a,b)=>
            b.score-a.score
        );

    if(cats.length){

      lastCatBox=
        cats[0].bbox;

      lastCatScore=
        cats[0].score;

      noseCandidate=
        noseCandidateFromCat(
          lastCatBox
        );

      noseCandidateScore=
        noseCandidate
          ?noseCandidate.score
          :0;

      drawNoseCandidate(
        noseCandidate
      );

      setInstruction(
        noseCandidate
          ?`🐽 Nose candidate found ${Math.round(
              noseCandidateScore
            )}%. Hold steady.`
          :`🐱 Cat detected ${Math.round(
              lastCatScore*100
            )}%. Searching nose…`
      );

    }else{

      lastCatBox=null;
      lastCatScore=0;

      noseCandidate=null;
      noseCandidateScore=0;

      drawDetection(
        null,
        0
      );

      setInstruction(
        "Looking for the cat…"
      );
    }

  }catch(e){

    console.warn(e);

  }finally{

    detectBusy=false;
  }
}


/* -------------------------------------------------------
   AUTOMATIC FRAME BUFFER
------------------------------------------------------- */

function addRecentFrame(
  dataUrl,
  quality,
  noseScore
){

  if(!dataUrl)return;

  recentFrames.push({
    dataUrl:dataUrl,
    quality:quality,
    noseScore:noseScore||0,
    timestamp:Date.now()
  });

  recentFrames.sort(
    (a,b)=>
      (
        b.quality+
        b.noseScore*.35
      )-
      (
        a.quality+
        a.noseScore*.35
      )
  );

  if(
    recentFrames.length>
    MAX_RECENT_FRAMES
  ){

    recentFrames=
      recentFrames.slice(
        0,
        MAX_RECENT_FRAMES
      );
  }
}


function getBestRecentFrame(){

  if(
    !recentFrames.length
  ){
    return null;
  }

  return[
    ...recentFrames
  ].sort(
    (a,b)=>
      (
        b.quality+
        b.noseScore*.35
      )-
      (
        a.quality+
        a.noseScore*.35
      )
  )[0];
}


/* -------------------------------------------------------
   MANUAL CAPTURE
   THIS IS THE IMPORTANT FIX
------------------------------------------------------- */

function captureBestFrame(){

  if(captureLocked){
    return;
  }

  captureLocked=true;

  try{

    const recent=
      getBestRecentFrame();

    let sample=null;

    /*
      First choice:
      use the best frame already collected
      from the live camera buffer.
    */

    if(recent){

      sample={
        dataUrl:
          recent.dataUrl,

        quality:
          recent.quality,

        noseScore:
          recent.noseScore,

        timestamp:
          new Date().toISOString()
      };

    }else{

      /*
        Fallback:
        capture the exact current camera frame.
      */

      const v=
        $("video");

      const c=
        $("frameCanvas");

      if(
        !v||
        !c||
        !v.videoWidth
      ){

        captureLocked=false;
        return;
      }

      drawVideo(
        v,
        c
      );

      const quality=
        scoreCanvas(c);

      let img=null;

      if(
        noseCandidate &&
        noseCandidate.box
      ){

        img=
          cropNoseCandidate(
            v,
            noseCandidate
          );
      }

      if(!img){

        img=
          cropCenter(
            v,
            c
          );
      }

      if(!img){

        captureLocked=false;
        return;
      }

      sample={
        dataUrl:img,
        quality:quality,
        noseScore:
          noseCandidateScore||0,
        timestamp:
          new Date().toISOString()
      };
    }

    /*
      Save the sample.
    */

    captureSamples.push(
      sample
    );

    /*
      Keep the highest-quality manually
      captured sample as bestCapture.
    */

    if(
      !bestCapture||
      sample.quality>
      bestCapture.quality
    ){

      bestCapture=
        sample;
    }

    updateFrameCounter();

    /*
      Clear the automatic buffer after
      manual capture so the next capture
      represents a new moment.
    */

    recentFrames=[];

    /*
      Visible confirmation.
    */

    const button=
      $("captureNow");

    if(button){

      const original=
        button.textContent;

      button.textContent=
        "✓ CAPTURED";

      button.disabled=true;

      setTimeout(()=>{

        button.textContent=
          original;

        button.disabled=false;

      },900);
    }

    setInstruction(
      `✓ Frame captured — ${captureSamples.length} sample${
        captureSamples.length===1
          ?""
          :"s"
      }`
    );

  }catch(e){

    console.error(
      "Capture error:",
      e
    );

    setInstruction(
      "Capture failed — try again."
    );

  }finally{

    setTimeout(()=>{
      captureLocked=false;
    },250);
  }
}


/* -------------------------------------------------------
   CAMERA
------------------------------------------------------- */

async function startCamera(){

  try{

    stream=
      await navigator.mediaDevices.getUserMedia({

        video:{
          facingMode:
            "environment",

          width:{
            ideal:1280
          },

          height:{
            ideal:720
          },

          frameRate:{
            ideal:30,
            min:24,
            max:60
          }
        },

        audio:false
      });

    const v=
      $("video");

    v.srcObject=
      stream;

    await v.play();

    captureSamples=[];
    recentFrames=[];
    bestCapture=null;

    updateFrameCounter();

    show("camera");

    resizeOverlay();

    lastDetect=0;
    lastBufferedCapture=0;

    await loadCatDetector();

    loop();

  }catch(e){

    console.error(e);

    alert(
      "Camera access needs HTTPS and permission. If opened as a local file, upload it to the HTTPS website first."
    );
  }
}


function stopCamera(){

  if(stream){

    stream
      .getTracks()
      .forEach(
        t=>t.stop()
      );

    stream=null;
  }

  if(scanTimer){

    cancelAnimationFrame(
      scanTimer
    );

    scanTimer=null;
  }

  show("home");
}


/* -------------------------------------------------------
   LIVE LOOP
------------------------------------------------------- */

function loop(){

  const v=
    $("video");

  const c=
    $("frameCanvas");

  if(
    !v||
    !c||
    !v.videoWidth
  ){

    scanTimer=
      requestAnimationFrame(
        loop
      );

    return;
  }

  resizeOverlay();

  const now=
    performance.now();

  /*
    AI detection runs frequently,
    but never in parallel.
  */

  if(
    now-lastDetect>=
    LIVE_DETECT_INTERVAL
  ){

    lastDetect=
      now;

    detectCat();
  }

  /*
    Draw the current camera frame.
  */

  drawVideo(
    v,
    c
  );

  const q=
    scoreCanvas(c);

  setQ(q);

  /*
    Automatically buffer only usable frames.
  */

  if(
    q>=42 &&
    now-lastBufferedCapture>=
    AUTO_BUFFER_INTERVAL
  ){

    lastBufferedCapture=
      now;

    let img=null;

    if(
      noseCandidate &&
      noseCandidate.box
    ){

      img=
        cropNoseCandidate(
          v,
          noseCandidate
        );
    }

    if(!img){

      img=
        cropCenter(
          v,
          c
        );
    }

    if(img){

      addRecentFrame(
        img,
        q,
        noseCandidateScore
      );
    }
  }

  /*
    User guidance.
  */

  if(
    noseCandidate &&
    noseCandidateScore>=35
  ){

    if(q>=55){

      setInstruction(
        "Ready — hold steady or capture."
      );
    }

  }else if(q<25){

    setInstruction(
      "Move closer to the nose."
    );

  }else if(q<45){

    setInstruction(
      "Hold the phone steady."
    );
  }

  scanTimer=
    requestAnimationFrame(
      loop
    );
}


/* -------------------------------------------------------
   BUTTONS
------------------------------------------------------- */

$("startCamera").onclick=
  startCamera;


$("stopCamera").onclick=
  stopCamera;


/*
  IMPORTANT:
  Use direct onclick assignment.
  This avoids problems with touch/pointer
  event handling on mobile browsers.
*/

$("captureNow").onclick=
  function(e){

    if(e){
      e.preventDefault();
    }

    captureBestFrame();
  };


$("finishScan").onclick=
  function(){

    /*
      If no manual sample exists,
      use the best automatically buffered
      frame as a fallback.
    */

    if(
      !captureSamples.length
    ){

      const recent=
        getBestRecentFrame();

      if(recent){

        bestCapture={
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
          bestCapture
        );
      }
    }

    if(
      !bestCapture &&
      !captureSamples.length
    ){

      alert(
        "No sample captured yet."
      );

      return;
    }

    show("profile");
  };


$("profileBack").onclick=
  function(){
    show("camera");
  };


$("backHome").onclick=
  function(){
    show("home");
  };


/* -------------------------------------------------------
   SAVE PROFILE
------------------------------------------------------- */

$("saveProfile").onclick=
  function(){

    const name=
      $("catName")
        .value
        .trim()||
      "Unknown Cat";

    const sample=
      bestCapture||
      captureSamples[
        captureSamples.length-1
      ];

    if(!sample){

      alert(
        "No nose sample available."
      );

      return;
    }

    const r={

      id:
        "cat_"+Date.now(),

      name:name,

      nickname:
        $("catNickname")
          .value
          .trim(),

      createdAt:
        new Date()
          .toISOString(),

      sample:sample,

      samples:
        captureSamples
    };

    localStorage.setItem(
      "catNosePrototype_last",
      JSON.stringify(r)
    );

    $("savedInfo")
      .classList
      .remove("hidden");

    $("savedInfo").innerHTML=
      "<h3>🐱 "+
      name+
      "</h3>"+
      "<p><b>NOSE SAMPLE SAVED</b></p>"+
      "<p>This prototype uses cat detection plus an experimental nose-candidate stage. This is not yet biometric recognition.</p>"+
      "<img src='"+
      sample.dataUrl+
      "' style='width:100%;border-radius:16px'>";
  };


/* -------------------------------------------------------
   PHOTO / VIDEO INPUT
------------------------------------------------------- */

$("mediaInput").onchange=
  async function(e){

    const f=
      e.target.files[0];

    if(!f)return;

    if(
      f.type.startsWith(
        "image/"
      )
    ){

      const u=
        URL.createObjectURL(f);

      const im=
        new Image();

      im.onload=
        function(){

          const c=
            $("videoCanvas");

          c.width=
            im.naturalWidth;

          c.height=
            im.naturalHeight;

          c.getContext(
            "2d"
          ).drawImage(
            im,
            0,
            0
          );

          const q=
            scoreCanvas(c);

          $("videoQuality")
            .textContent=
            Math.round(q)+
            "%";

          $("videoQualityBar")
            .style.width=
            Math.min(
              100,
              q
            )+
            "%";

          $("videoResult")
            .classList
            .remove("hidden");

          $("videoResult")
            .innerHTML=
            "<b>IMAGE TEST</b>"+
            "<p>Generic image-quality score: "+
            Math.round(q)+
            ". Not nose recognition.</p>"+
            "<img src='"+
            u+
            "' style='width:100%;border-radius:14px'>";

          show(
            "videoTest"
          );
        };

      im.src=u;

    }else{

      $("sourceVideo").src=
        URL.createObjectURL(f);

      show(
        "videoTest"
      );
    }
  };


/* -------------------------------------------------------
   VIDEO ANALYSIS
------------------------------------------------------- */

$("analyzeVideo").onclick=
  async function(){

    const v=
      $("sourceVideo");

    if(!v.src){

      alert(
        "Choose a video first."
      );

      return;
    }

    if(!v.duration){

      await new Promise(
        resolve=>{

          v.addEventListener(
            "loadedmetadata",
            resolve,
            {
              once:true
            }
          );
        }
      );
    }

    if(
      !v.duration||
      !isFinite(v.duration)
    ){

      alert(
        "Video could not be loaded."
      );

      return;
    }

    const c=
      $("videoCanvas");

    const a=[];

    /*
      Dense sampling for moving cats.
    */

    const N=
      Math.min(
        120,
        Math.max(
          24,
          Math.ceil(
            v.duration*8
          )
        )
      );

    for(
      let i=0;
      i<N;
      i++
    ){

      v.currentTime=
        v.duration*
        i/
        Math.max(
          1,
          N-1
        );

      await new Promise(
        resolve=>{

          v.onseeked=
            resolve;
        }
      );

      drawVideo(
        v,
        c
      );

      const q=
        scoreCanvas(c);

      a.push({
        q:q,
        img:
          cropCenter(
            v,
            c
          )
      });
    }

    a.sort(
      (x,y)=>
        y.q-x.q
    );

    const best=
      a.slice(
        0,
        12
      );

    if(!best.length){

      alert(
        "No usable frames found."
      );

      return;
    }

    $("videoQuality")
      .textContent=
      Math.round(
        best[0].q
      )+
      "%";

    $("videoQualityBar")
      .style.width=
      Math.min(
        100,
        best[0].q
      )+
      "%";

    $("videoResult")
      .classList
      .remove("hidden");

    $("videoResult")
      .innerHTML=
      "<b>VIDEO ANALYSIS COMPLETE</b>"+
      "<p>Sampled "+
      N+
      " frames. Best generic quality score: "+
      Math.round(
        best[0].q
      )+
      "%.</p>"+
      "<p><b>Important:</b> the current prototype still uses an experimental nose-candidate stage; this is not a trained nose detector.</p>";

    $("videoSamples")
      .innerHTML=
      best
        .map(
          x=>
            "<img src='"+
            x.img+
            "'>"
        )
        .join("");
  };
