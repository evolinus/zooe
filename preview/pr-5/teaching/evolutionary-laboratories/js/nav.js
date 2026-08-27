    function switchTab(tabId, evt) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

      document.getElementById('tab-' + tabId).classList.add('active');
      (evt ? evt.currentTarget : document.querySelector(`.tab-btn[onclick*="${tabId}"]`)).classList.add('active');

      // Dispatch a global resize notification to ensure hidden SVG/Canvas components recalculate safely
      window.dispatchEvent(new Event('resize'));
    }
