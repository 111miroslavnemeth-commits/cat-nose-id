const $=id=>document.getElementById(id);const screens=["home","camera","videoTest","profile"];let stream=null,bestCapture=null,captureSamples=[],scanTimer=null;
function show(n){screens.forEach(s=>$(s).classList.toggle("active",s===n))}
function luminance(r,g,b){return .2126*r+.7152*g+.0722*b}
function scoreCanvas(c){const x=c.getContext("2d",{willReadFrequently:true}),w=c.width,h=c.height,d=x.getImageData(0,0,w,h).data,step=4;let s=0,s2=0,n=0;for(let y=1;y<h-1;y+=step)for(let z=1;z<w-1;z+=step){let i=(y*w+z)*4,c=luminance(d[i],d[i+1],d[i+2]),l=luminance(d[i-4],d[i-3],d[i-2]),r=luminance(d[i+4],d[i+5],d[i+6]),u=luminance(d[i-w*4],d[i-w*4+1],d[i-w*4+2]),v=luminance(d[i+w*4],d[i+w*4+1],d[i+w*4+2]),q=Math.abs(4*c-l-r-u-v);s+=q;s2+=q*q;n++}return Math.min(100,Math.sqrt(Math.max(0,s2/n-(s/n)**2))*2.4)}
function drawVideo(v,c){let w=360,h=Math.round(360*(v.videoHeight/v.videoWidth||1));c.width=w;c.height=h;c.getContext("2d").drawImage(v,0,0,w,h)}
function cropCenter(v,c){let w=v.videoWidth||c.width,h=v.videoHeight||c.height;c.width=w;c.height=h;c.getContext("2d").drawImage(v,0,0,w,h);let sz=Math.min(w,h)*.58,x=(w-sz)/2,y=(h-sz)/2,o=document.createElement("canvas");o.width=o.height=640;o.getContext("2d").drawImage(c,x,y,sz,sz,0,0,640,640);return o.toDataURL("image/jpeg",.9)}
function setQ(q){$("qualityBar").style.width=q+"%";$("qualityText").textContent=q<25?"MOVE CLOSER":q<45?"HOLD STEADY":q<65?"GOOD":"EXCELLENT"}

let catModel=null,lastCatBox=null,lastCatScore=0,lastDetect=0;
async function loadCatDetector(){
  try{ $("instruction").textContent="Loading cat detector…"; catModel=await cocoSsd.load({base:"lite_mobilenet_v2"}); $("instruction").textContent="Cat detector ready. Show the cat."; }
  catch(e){ console.warn(e); $("instruction").textContent="Detector unavailable — fallback mode."; }
}
function resizeOverlay(){const v=$("video"),o=$("detectionOverlay");if(!v.videoWidth)return;o.width=v.videoWidth;o.height=v.videoHeight}
function drawDetection(box,score){
  const o=$("detectionOverlay"),c=o.getContext("2d");c.clearRect(0,0,o.width,o.height);if(!box)return;
  const [x,y,w,h]=box,nx=x+w*.28,ny=y+h*.48,nw=w*.44,nh=h*.30;
  c.lineWidth=Math.max(4,o.width/300);c.strokeStyle="#fff";c.strokeRect(x,y,w,h);
  c.setLineDash([12,8]);c.strokeRect(nx,ny,nw,nh);c.setLineDash([]);
  c.font=`${Math.max(18,o.width/35)}px system-ui`;c.fillStyle="#0b0d12";c.fillRect(x,y,Math.min(w,260),42);
  c.fillStyle="#fff";c.fillText(`CAT ${Math.round(score*100)}%`,x+10,y+28)
}

let noseCandidate=null,noseCandidateScore=0;

function noseCandidateFromCat(box){
  // Experimental candidate search: the cat detector supplies the ROI.
  // We scan several patches around the lower-central facial region and score
  // local contrast/edge structure. This is NOT a trained nose detector.
  const v=$("video"),[x,y,w,h]=box;
  const cx=x+w*.50, baseY=y+h*.58;
  const candidates=[
    [cx-w*.18, baseY-h*.10, w*.36, h*.24],
    [cx-w*.22, baseY-h*.04, w*.44, h*.26],
    [cx-w*.16, baseY+h*.02, w*.32, h*.22]
  ];
  const c=document.createElement("canvas"); c.width=224;c.height=224;
  let best=null;
  for(const [px,py,pw,ph] of candidates){
    const xx=Math.max(0,px), yy=Math.max(0,py), ww=Math.min(v.videoWidth-xx,pw), hh=Math.min(v.videoHeight-yy,ph);
    if(ww<20||hh<20) continue;
    const ctx=c.getContext("2d",{willReadFrequently:true});
    ctx.clearRect(0,0,224,224);ctx.drawImage(v,xx,yy,ww,hh,0,0,224,224);
    const d=ctx.getImageData(0,0,224,224).data;
    let mean=0,contrast=0,n=0;
    for(let i=0;i<d.length;i+=16){
      const lum=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
      mean+=lum;n++;
    }
    mean/=n;
    for(let i=0;i<d.length;i+=16){
      const lum=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
      contrast+=Math.abs(lum-mean);
    }
    contrast/=n;
    const score=Math.min(99,Math.max(1,contrast*1.8));
    if(!best||score>best.score) best={box:[xx,yy,ww,hh],score};
  }
  return best;
}

function drawNoseCandidate(candidate){
  const o=$("detectionOverlay"),ctx=o.getContext("2d");
  if(!lastCatBox)return;
  drawDetection(lastCatBox,lastCatScore);
  if(!candidate)return;
  const [x,y,w,h]=candidate.box;
  ctx.lineWidth=Math.max(4,o.width/280);
  ctx.setLineDash([6,5]);ctx.strokeStyle="#fff";ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);
  ctx.font=`${Math.max(16,o.width/40)}px system-ui`;
  ctx.fillStyle="#0b0d12";ctx.fillRect(x,y+h-38,Math.min(w,230),38);
  ctx.fillStyle="#fff";ctx.fillText(`NOSE CANDIDATE ${Math.round(candidate.score)}%`,x+8,y+h-13);
}

async function detectCat(){
  if(!catModel||!$("video").videoWidth)return;
  try{
    const p=await catModel.detect($("video"),5,.45),cats=p.filter(x=>x.class==="cat").sort((a,b)=>b.score-a.score);
    if(cats.length){lastCatBox=cats[0].bbox;lastCatScore=cats[0].score;noseCandidate=noseCandidateFromCat(lastCatBox);noseCandidateScore=noseCandidate?noseCandidate.score:0;drawNoseCandidate(noseCandidate);$("instruction").textContent=noseCandidate?`🐽 Nose candidate found ${Math.round(noseCandidateScore)}%. Hold steady.`:`🐱 Cat detected ${Math.round(lastCatScore*100)}%. Searching nose…`}
    else{lastCatBox=null;lastCatScore=0;noseCandidate=null;noseCandidateScore=0;drawDetection(null,0);$("instruction").textContent="Looking for the cat…"}
  }catch(e){console.warn(e)}
}

async function startCamera(){try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:1280},height:{ideal:720}},audio:false});$("video").srcObject=stream;await $("video").play();show("camera");loop()}catch(e){alert("Camera access needs HTTPS and permission. If opened as a local file, upload it to the HTTPS website first.")}}
function stopCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}if(scanTimer)cancelAnimationFrame(scanTimer);show("home")}
function loop(){const v=$("video"),c=$("frameCanvas");if(!v.videoWidth)return;resizeOverlay();if(performance.now()-lastDetect>350){lastDetect=performance.now();detectCat()};drawVideo(v,c);let q=scoreCanvas(c);setQ(q);if(q>55){bestCapture={dataUrl:cropCenter(v,c),quality:q};$("instruction").textContent="Good. Hold for capture."}else $("instruction").textContent=q<25?"Move closer to the nose.":"Hold the phone steady.";scanTimer=requestAnimationFrame(loop)}
$("startCamera").onclick=startCamera;$("stopCamera").onclick=stopCamera;
$("captureNow").onclick=()=>{const v=$("video"),c=$("frameCanvas");if(!v.videoWidth)return;drawVideo(v,c);let q=scoreCanvas(c),img;if(noseCandidate){const [nx,ny,nw,nh]=noseCandidate.box,o=document.createElement("canvas");o.width=o.height=640;o.getContext("2d").drawImage(v,nx,ny,nw,nh,0,0,640,640);img=o.toDataURL("image/jpeg",.9)}else img=cropCenter(v,c);captureSamples.push({dataUrl:img,quality:q});bestCapture={dataUrl:img,quality:q};$("frameCounter").textContent=captureSamples.length+" samples"};
$("finishScan").onclick=()=>{if(!bestCapture&&!captureSamples.length)return alert("No sample captured yet.");show("profile")};
$("profileBack").onclick=()=>show("camera");
$("saveProfile").onclick=()=>{let name=$("catName").value.trim()||"Unknown Cat",s=bestCapture||captureSamples.at(-1),r={id:"cat_"+Date.now(),name,nickname:$("catNickname").value.trim(),createdAt:new Date().toISOString(),sample:s,samples:captureSamples};localStorage.setItem("catNosePrototype_last",JSON.stringify(r));$("savedInfo").classList.remove("hidden");$("savedInfo").innerHTML="<h3>🐱 "+name+"</h3><p><b>NOSE SAMPLE SAVED</b></p><p>This v0.1 does not yet perform biometric recognition. The image is stored locally as a test sample.</p><img src='"+s.dataUrl+"' style='width:100%;border-radius:16px'>"};
$("backHome").onclick=()=>show("home");
$("mediaInput").onchange=async e=>{let f=e.target.files[0];if(!f)return;if(f.type.startsWith("image/")){let u=URL.createObjectURL(f),im=new Image;im.onload=()=>{let c=$("videoCanvas");c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext("2d").drawImage(im,0,0);let q=scoreCanvas(c);$("videoQuality").textContent=Math.round(q)+"%";$("videoQualityBar").style.width=Math.min(100,q)+"%";$("videoResult").classList.remove("hidden");$("videoResult").innerHTML="<b>IMAGE TEST</b><p>Generic image-quality score: "+Math.round(q)+". Not nose recognition.</p><img src='"+u+"' style='width:100%;border-radius:14px'>";show("videoTest")};im.src=u}else{$("sourceVideo").src=URL.createObjectURL(f);show("videoTest")}};
$("analyzeVideo").onclick=async()=>{let v=$("sourceVideo");if(!v.duration)return alert("Choose a video first.");let c=$("videoCanvas"),a=[],N=Math.min(30,Math.max(12,Math.floor(v.duration*2)));for(let i=0;i<N;i++){v.currentTime=v.duration*i/(N-1);await new Promise(r=>v.onseeked=r);drawVideo(v,c);let q=scoreCanvas(c);a.push({q,img:cropCenter(v,c)})}a.sort((x,y)=>y.q-x.q);let best=a.slice(0,9);$("videoQuality").textContent=Math.round(best[0].q)+"%";$("videoQualityBar").style.width=Math.min(100,best[0].q)+"%";$("videoResult").classList.remove("hidden");$("videoResult").innerHTML="<b>VIDEO ANALYSIS COMPLETE</b><p>Sampled "+N+" frames. Best generic quality score: "+Math.round(best[0].q)+".</p><p><b>Important:</b> the current prototype crops the central scan zone; a dedicated nose detector comes next.</p>";$("videoSamples").innerHTML=best.map(x=>"<img src='"+x.img+"'>").join("")};
