// One translation helper for every room. Each user-facing string produced by
// the JavaScript is written at its call site in English and tagged with a
// stable key:
//
//     T('fate.odds', 'It was lost in {losses} of them.', { losses: 1978 })
//
// With no dictionary loaded the English falls straight through, which is what
// happens today — the keys cost nothing until they are used. To publish the
// rooms in another language, define window.LAB_STRINGS before the room scripts
// run:
//
//     <script>window.LAB_STRINGS = { 'fate.odds': 'È andata persa in {losses}…' };</script>
//
// and every tagged string switches over; anything the dictionary does not
// mention stays in English, so a partial translation is safe to ship.
//
// One limit worth knowing: this covers only the strings the rooms generate.
// The prose in main.html — the briefs, the payoffs, the README — is written
// directly in the markup and would have to be translated there.
//
// This used to be nine identical copies, one per room file.
function T(key, en, vars) {
  const dict = window.LAB_STRINGS;
  const src = (dict && Object.prototype.hasOwnProperty.call(dict, key)) ? dict[key] : en;
  return String(src).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m));
}
