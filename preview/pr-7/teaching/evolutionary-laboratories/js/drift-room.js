// The Drift Room: pure Wright-Fisher sampling, no selection. The next
// generation's sampling probability is just the current frequency — see
// wright-fisher-core.js for the shared engine this runs on.
(function () {
  createWrightFisherRoom({
    suffix: 'drift',
    selection: false,
    samplingFreq: (freq) => freq
  });
})();
