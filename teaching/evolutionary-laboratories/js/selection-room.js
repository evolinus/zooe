// The Selection Room: same engine as the Drift Room, but allele A carries a
// fitness advantage of (1+s) against B's fitness of 1. Each generation, the
// raw frequency is reweighted by relative fitness *before* the usual
// binomial sampling — that reweighted value (f′) is what's actually drawn
// from, not the raw frequency. See wright-fisher-core.js for the shared
// engine this runs on; `selection: true` also turns on the deterministic
// reference trajectory and the pre-selection wheel marker.
//
// Ploidy is handled by the shared engine (it just needs to know how many
// gene copies to sample: N haploid, 2N diploid). What's room-specific here
// is that *diploid* selection also depends on dominance (h): a haploid
// allele's fitness advantage is fully "visible" every generation, but in a
// diploid a recessive advantageous allele (h near 0) is invisible to
// selection whenever it's paired with B in a heterozygote — which is most
// of the time while it's still rare. That's why a real fitness advantage
// can still be lost to drift much more easily when it's recessive.
(function () {
  createWrightFisherRoom({
    suffix: 'selection',
    selection: true,
    defaultS: 0.10,
    samplingFreq: (freq, state) => {
      const s = state.s;
      if (state.ploidy === 2) {
        const h = state.h;
        const wAA = 1 + s, wAa = 1 + h * s, wBB = 1;
        const wBar = freq*freq*wAA + 2*freq*(1-freq)*wAa + (1-freq)*(1-freq)*wBB;
        if (wBar <= 0) return freq; // guard against a degenerate all-zero-fitness edge case
        return (freq*freq*wAA + freq*(1-freq)*wAa) / wBar;
      }
      const wA = 1 + s, wB = 1;
      const weighted = freq * wA;
      return weighted / (weighted + (1 - freq) * wB);
    }
  });
})();
