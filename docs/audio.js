const clips = {
 taught: {file:'taught', text:'Do as I taught you!'},
 mercy: {file:'mercy', text:'Show them no mercy!'},
 warmed: {file:'warmed', text:"Hah hah, I'm just getting warmed up!"},
 stand: {file:'stand', text:'Stand and fight!'},
 show: {file:'show', text:"Show me what you've got!"},
 disappoint: {file:'disappoint', text:'You disappoint me, students!'},
 death: {file:'death', text:'An honorable... death.'}
};

// One voice at a time. Loading and playback require an explicit sound opt-in.
export class BossVoice {
 constructor(player, onCaption, onError) {
  this.player=player;this.onCaption=onCaption;this.onError=onError;
  this.enabled=false;this.paused=false;this.active=null;this.queue=[];this.revision=0;
  player.muted=true;player.preload='none';player.volume=.75;
  player.addEventListener('ended',()=>{
   if(!player.ended)return;
   this.active=null;this.next();
  });
  player.addEventListener('error',()=>{
   if(this.enabled&&this.active)this.unavailable();
  });
 }
 setEnabled(enabled) {
  this.stop();this.enabled=enabled;this.player.muted=!enabled;
  if(!enabled)return;
  // Unlock this media element inside the click gesture, without an audible quote.
  const revision=++this.revision;
  this.player.src='assets/audio/razuvious-taught.mp3';this.player.muted=true;
  this.play(revision,()=>{
   this.player.pause();this.player.currentTime=0;this.player.muted=false;
  });
 }
 say(id, {interrupt=false}={}) {
  const clip=clips[id];if(!clip)return;
  this.onCaption(clip.text);
  if(!this.enabled)return;
  if(interrupt)this.stop();
  if(this.active||this.paused) {
   if(this.active!==id&&!this.queue.includes(id))this.queue.push(id);
   if(this.queue.length>2)this.queue.shift();
   return;
  }
  this.begin(id);
 }
 begin(id) {
  const revision=++this.revision;
  this.active=id;this.player.pause();this.player.muted=false;
  this.player.src='assets/audio/razuvious-'+clips[id].file+'.mp3';
  this.player.currentTime=0;this.play(revision);
 }
 play(revision, onStarted) {
  try {
   Promise.resolve(this.player.play()).then(()=>{
    if(revision===this.revision)onStarted?.();
   }).catch(error=>{
    if(revision===this.revision&&error.name!=='AbortError')this.unavailable();
   });
  } catch {if(revision===this.revision)this.unavailable();}
 }
 next() {
  if(this.enabled&&!this.paused&&this.queue.length)this.begin(this.queue.shift());
 }
 pause() {
  this.paused=true;++this.revision;this.player.pause();
 }
 resume() {
  this.paused=false;
  if(this.enabled&&this.active){this.player.muted=false;this.play(++this.revision)}
  else this.next();
 }
 stop() {
  ++this.revision;this.player.pause();this.player.currentTime=0;
  this.active=null;this.queue=[];this.paused=false;
 }
 unavailable() {
  this.enabled=false;this.player.muted=true;this.stop();this.onError?.();
 }
}
