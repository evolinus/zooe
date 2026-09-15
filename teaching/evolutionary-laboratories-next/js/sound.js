// Music while a simulation runs. One track, started by a Run button and faded
// out when that run finishes.
//
// Silent until the reader asks for it. The rooms are used in lecture theatres,
// libraries and shared computer rooms, and a page that makes a noise nobody
// asked for is a page a student closes — so the preference starts off, the
// toggle sits in the tab bar where it is visible from every room, and the answer
// is remembered for next time.
//
// Nothing here touches a room's own code. A room signals that it is busy in one
// of three ways, and all three are visible on the button that started it:
//
//   Drift, Selection, Adaptation, Speciation, Fate, Mutation, Hardy-Weinberg
//     disable the button (and the controls) for the length of the run;
//   Reproduction and Linkage run on a timer and flip the button to "Pause";
//   Copying and Branching do the same through a `playing` flag.
//
// So "the run is over" is the same question in every room: is the button that
// started it back at rest — not disabled, and not offering to pause? Asking the
// button rather than the room is what keeps this in one file instead of eleven,
// and keeps a mistake here from being able to break a simulation.

(function () {
  'use strict';

  // Drop the file in at this path. Any format the browser plays will do; mp3 is
  // the safe choice. If it is missing or will not decode, the toggle takes
  // itself out of the tab bar rather than offering a control that does nothing.
  const TRACK = 'audio/Last_Life_Jump.mp3';

  const STORAGE_KEY = 'lab:sound';

  // A run that finishes the moment it starts — "Mate randomly" is one — would
  // otherwise get a click of music and nothing more. Hold the floor briefly so
  // an instant action still sounds like something rather than like a fault.
  const MIN_MS = 900;

  // How often to ask the button whether it is done. Cheap, and well under the
  // threshold at which a reader would notice the music outlasting the run.
  const POLL_MS = 200;

  // A run ends the moment the last generation is drawn, and cutting the track
  // dead at that instant lands like a fault rather than an ending. Five seconds
  // is long enough for the music to read as leaving of its own accord, and short
  // enough that a reader who sets up the next run is not still hearing the last.
  const FADE_MS = 5000;

  // Steps in the fade. 50 ms is below the interval at which a change in volume
  // is heard as a step rather than as a slide.
  const FADE_STEP_MS = 50;

  let audio = null;       // built on first use, so a missing file costs nothing at load
  let available = true;   // false once the file has failed to load
  let enabled = false;    // the reader's preference
  let watch = null;       // { btn, since, timer } while a run is in flight
  let fadeTimer = null;   // set while the track is on its way out
  let toggleBtn = null;

  /* ---- the reader's preference ------------------------------------------ */

  // Private browsing and locked-down browsers throw on localStorage rather than
  // returning null, so every touch of it is wrapped.
  function readPreference() {
    try { return localStorage.getItem(STORAGE_KEY) === 'on'; } catch (e) { return false; }
  }
  function writePreference(on) {
    try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch (e) { /* nothing to do */ }
  }

  /* ---- the track -------------------------------------------------------- */

  function ensureAudio() {
    if (audio || !available) return audio;
    // Built empty and told not to preload BEFORE it is given a source: passing
    // the source to the constructor starts the fetch before preload can be set,
    // and the whole track goes down the wire whether or not it is ever played.
    audio = new Audio();
    audio.preload = 'none';
    audio.loop = true;          // the run decides the length, not the file
    audio.addEventListener('error', () => {
      // The track is missing or will not decode. Take the control away rather
      // than leave a speaker that does nothing.
      available = false;
      audio = null;
      syncToggle();
    });
    audio.src = TRACK;
    return audio;
  }

  function startTrack() {
    const a = ensureAudio();
    if (!a) return;
    // A run started while the last one is still fading takes the track back at
    // full volume, from the top, rather than inheriting a half-faded one.
    cancelFade();
    a.volume = 1;
    try {
      a.currentTime = 0;
    } catch (e) { /* not seekable yet; it will start from wherever it is */ }
    // play() rejects if the browser declines it or the file will not decode.
    // Either way the simulation carries on; the music is the optional part.
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* stay silent */ });
  }

  function cancelFade() {
    if (fadeTimer) clearInterval(fadeTimer);
    fadeTimer = null;
  }

  function stopTrack() {
    cancelFade();
    if (!audio) return;
    audio.pause();
    audio.volume = 1;
    try { audio.currentTime = 0; } catch (e) { /* not seekable; pausing is enough */ }
  }

  // Walk the volume down and then stop. Linear in volume: the second half of a
  // linear fade is already quiet, so the track thins out steadily rather than
  // hanging on and then vanishing. The clock is read each step instead of
  // counting them, because a browser is free to run a background interval late
  // and a fade that drifts long is a fade the reader notices.
  function fadeTrack() {
    if (!audio || audio.paused) { stopTrack(); return; }
    cancelFade();
    const a = audio;
    const from = a.volume;
    const since = Date.now();
    fadeTimer = setInterval(() => {
      // The error handler drops `audio` and ensureAudio builds a fresh element
      // if the file turns out to be unplayable mid-fade; this fade belongs to
      // the old one and has nothing left to turn down.
      if (audio !== a) { cancelFade(); return; }
      const t = (Date.now() - since) / FADE_MS;
      if (t >= 1) { stopTrack(); return; }
      a.volume = from * (1 - t);
    }, FADE_STEP_MS);
  }

  /* ---- is the run over? ------------------------------------------------- */

  // At rest means: the room is not holding the button disabled, and the button
  // is not offering to pause something. Matching on the word rather than on a
  // room's internal state is what lets one rule cover all eleven rooms; the
  // pause label is checked in whatever language the dictionary supplied, since
  // T() is what wrote it.
  function atRest(btn) {
    if (btn.disabled) return false;
    const pause = (typeof T === 'function') ? T('sound.pauseWord', 'Pause') : 'Pause';
    const label = (btn.textContent || '').toLowerCase();
    return label.indexOf(pause.toLowerCase()) === -1 && label.indexOf('pause') === -1;
  }

  function stopWatching() {
    if (watch && watch.timer) clearInterval(watch.timer);
    watch = null;
  }

  function beginRun(btn) {
    stopWatching();
    startTrack();
    watch = { btn: btn, since: Date.now(), timer: null };
    watch.timer = setInterval(() => {
      if (!watch) return;
      // The button has to have been given its chance to go busy first, which is
      // also what stops an instant run from being cut off mid-note.
      if (Date.now() - watch.since < MIN_MS) return;
      if (atRest(watch.btn)) endRun();
    }, POLL_MS);
  }

  // The run is over: let the music go quietly.
  function endRun() {
    stopWatching();
    fadeTrack();
  }

  // Silence now, no fade. Leaving the room, hiding the tab and switching sound
  // off are all the reader asking not to hear this, and answering that with
  // five more seconds of music answers the wrong question. A hidden tab is also
  // where a browser throttles intervals, so the fade would not be a fade.
  function cutRun() {
    stopWatching();
    stopTrack();
  }

  /* ---- wiring ----------------------------------------------------------- */

  // Capture phase, and that is load-bearing rather than incidental — the same
  // reason nav.js scrolls from capture. Telling a press that starts a run from
  // one that stops it means reading the button as it was BEFORE the press, and
  // by the time an ordinary bubble listener runs, Copying and Branching have
  // already relabelled it to "Pause" and Drift has already disabled it. Read
  // from the bubble phase, every press looks like a stop and the music never
  // starts at all. The watcher below then polls, which is after, and so sees
  // the busy state the press produced.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('button[data-sound]');
    if (!btn) return;
    if (!enabled || !available) return;
    // A press on a button that already offered to pause is the reader stopping
    // the run, not starting one.
    if (!atRest(btn)) { endRun(); return; }
    beginRun(btn);
  }, true);

  // The same courtesy the animating rooms already observe: a reader who has
  // walked away from a room should not still be able to hear it.
  document.addEventListener('lab:tabchange', cutRun);

  // Nor should a background tab keep playing.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cutRun();
  });

  /* ---- the toggle ------------------------------------------------------- */

  function syncToggle() {
    if (!toggleBtn) return;
    // No file, no control: an inert speaker icon is worse than none at all.
    toggleBtn.hidden = !available;
    toggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    toggleBtn.classList.toggle('is-on', enabled);
    const label = enabled
      ? ((typeof T === 'function') ? T('sound.off', 'Turn simulation sound off') : 'Turn simulation sound off')
      : ((typeof T === 'function') ? T('sound.on', 'Turn simulation sound on') : 'Turn simulation sound on');
    toggleBtn.setAttribute('aria-label', label);
    toggleBtn.setAttribute('title', label);
    toggleBtn.textContent = enabled ? '🔊' : '🔇';
  }

  function setEnabled(on) {
    enabled = on;
    writePreference(on);
    if (!on) cutRun();
    syncToggle();
  }

  document.addEventListener('DOMContentLoaded', () => {
    enabled = readPreference();
    toggleBtn = document.getElementById('soundToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => setEnabled(!enabled));
      syncToggle();
    }
    // There is deliberately no check here that the track exists. Asking the
    // question costs the answer: preload="metadata" is a hint, and a browser
    // answers it by requesting "bytes=0-" — measured against this very file, a
    // page load with sound switched off pulled all 1.6MB of it. For a room used
    // by a class at once, that is the whole track downloaded for every reader
    // who never wanted it. So the file is left alone until somebody turns sound
    // on and presses Run, and a missing one is discovered then, by the error
    // handler in ensureAudio, which hides the control at that point.
  });

  // Exposed for a room that ever needs to say so itself, and for testing.
  window.labSoundStop = endRun;
  window.labSoundEnabled = () => enabled;
})();
