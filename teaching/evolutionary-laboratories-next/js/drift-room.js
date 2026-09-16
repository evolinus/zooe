// The Drift Room: pure Wright-Fisher sampling, no selection. The next
// generation's sampling probability is just the current frequency — see
// wright-fisher-core.js for the shared engine this runs on.
//
// Two options the Selection Room deliberately does not take. `mutation: true`
// adds the recurrent-mutation slider, off at 0 by default so the room's own
// argument — that drift destroys variation and fixation is the end — stands
// exactly as it did; turn it up and the room shows the balance that argument
// leaves out. `multiRunHeterozygosity: true` adds the variation-remaining chart
// beneath the ten trajectories, which is where the decay rate becomes visible:
// ten runs that disagree completely about WHICH allele wins agree closely about
// how fast the variation goes. Neither belongs in the Selection Room, where the
// subject is the fate of one allele rather than the fate of the variation.
(function () {
  createWrightFisherRoom({
    suffix: 'drift',
    tabId: 'drifting',
    selection: false,
    mutation: true,
    multiRunHeterozygosity: true,
    samplingFreq: (freq) => freq
  });
})();
