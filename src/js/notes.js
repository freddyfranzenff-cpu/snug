import { state } from './state.js';
import { R } from './registry.js';

// Notes
function fmtTs(ts){if(!ts)return"";const d=new Date(ts),p=n=>String(n).padStart(2,"0");return`${p(d.getDate())}.${p(d.getMonth()+1)}.${String(d.getFullYear()).slice(2)} · ${p(d.getHours())}:${p(d.getMinutes())}`;}
function noteCardHTML(note){
  const canDelete=note.author===state.ME;
  const reactions=note.reactions||{};
  const myReaction=state.myUid&&reactions[state.myUid];
  const heartCount=Object.keys(reactions).length;
  const reactLabel=heartCount>0?`${heartCount}`:"";
  const k=R._esc(note._key||"");
  return`<div class="note-card">
    <p class="note-text">${R._esc(note.text)}</p>
    <div class="note-footer">
      <span class="note-author">${R._esc(note.author)}</span>
      ${note.time?`<span class="note-time">${R.fmtTs(note.time)}</span>`:""}
    </div>
    <div class="note-actions">
      <button class="note-react-btn${myReaction?" reacted":""}" onclick="reactToNote('${k}')" title="React with heart">
        <svg width="12" height="11" viewBox="0 0 32 30" fill="${myReaction?"#e8622a":"none"}" stroke="#e8622a" stroke-width="1.5" stroke-linejoin="round"><path d="M16 28C14 26 2 19 2 10.5A7.5 7.5 0 0116 15a7.5 7.5 0 0114-4.5C30 19 18 26 16 28z"/></svg>
        ${reactLabel}
      </button>
      ${canDelete&&note._key?`<button class="note-delete-btn" onclick="deleteNote('${k}')" title="Delete">✕</button>`:""}
    </div>
  </div>`;
}
function renderNotes(notes){const w=document.getElementById("notes-wall");if(!notes.length){w.innerHTML=`<p class="empty">No notes yet.</p>`;return;}w.innerHTML=notes.map(R.noteCardHTML).join("");}
function renderNotesPreview(notes){const p=document.getElementById("home-notes-preview");const r=notes.slice(0,2);if(!r.length){p.innerHTML=`<p class="empty">No notes yet.</p>`;return;}p.innerHTML=r.map(R.noteCardHTML).join("");}
window.deleteNote=function(key){
  if(!key)return;
  if(state.db&&state.dbRemove)state.dbRemove(state.dbRef(state.db,`couples/${state.coupleId}/notes/${key}`));
  else{state.localNotes=state.localNotes.filter(n=>n._key!==key);R.renderNotes(state.localNotes);R.renderNotesPreview(state.localNotes);}
};

window.reactToNote=function(key){
  if(!key||!state.ME)return;
  const reactionKey=`couples/${state.coupleId}/notes/${key}/reactions/${state.myUid}`;
  if(state.db&&state.fbOnValue){
    state.fbOnValue(state.dbRef(state.db,reactionKey),snap=>{
      if(snap.val()){state.dbRemove(state.dbRef(state.db,reactionKey));}
      else{state.dbSet(state.dbRef(state.db,reactionKey),true);}
    },{onlyOnce:true});
  }
};

window.submitNote=async function(){
  const text=document.getElementById("note-input").value.trim();
  if(!text||!state.ME)return;
  const note={text,author:state.ME,time:Date.now()};
  if(state.db&&state.dbPush){
    try{
      await state.dbPush(state.dbRef(state.db,`couples/${state.coupleId}/notes`),note);
      R.notifyPartner&&R.notifyPartner('note');
    }catch(e){ console.error('submitNote failed:',e); return; }
  } else {
    state.localNotes.unshift(note);
    R.renderNotes(state.localNotes);
    R.renderNotesPreview(state.localNotes);
  }
  document.getElementById("note-input").value="";
};

// Milestones

// ── Register for cross-module access ─────────────────────
R.fmtTs = fmtTs;
R.noteCardHTML = noteCardHTML;
R.renderNotes = renderNotes;
R.renderNotesPreview = renderNotesPreview;
