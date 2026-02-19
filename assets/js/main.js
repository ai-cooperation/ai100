document.addEventListener('DOMContentLoaded', function () {
  var lectureCards = document.querySelectorAll('.lecture-card');
  var moduleCards = document.querySelectorAll('.module-card');

  // Current active track
  var currentTrack = 'module';

  // === Track Toggle ===
  var trackBtns = document.querySelectorAll('.track-btn');
  var moduleFilter = document.getElementById('module-filter');
  var dolFilter = document.getElementById('dol-filter');
  var modulesSection = document.getElementById('modules-section');
  var dolSection = document.getElementById('dol-section');

  trackBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var track = this.getAttribute('data-track');
      currentTrack = track;

      trackBtns.forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');

      if (track === 'module') {
        if (moduleFilter) moduleFilter.style.display = '';
        if (dolFilter) dolFilter.style.display = 'none';
        if (modulesSection) modulesSection.style.display = '';
        if (dolSection) dolSection.style.display = 'none';
        // Reset to show all lectures
        showAllLectures();
        resetModuleFilter();
      } else {
        if (moduleFilter) moduleFilter.style.display = 'none';
        if (dolFilter) dolFilter.style.display = '';
        if (modulesSection) modulesSection.style.display = 'none';
        if (dolSection) dolSection.style.display = '';
        // Reset to show all lectures
        showAllLectures();
        resetDolFilter();
      }
    });
  });

  // === Module Filter ===
  var moduleFilterBtns = document.querySelectorAll('#module-filter .filter-btn');
  moduleFilterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mod = this.getAttribute('data-module');

      moduleFilterBtns.forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');

      lectureCards.forEach(function (card) {
        if (mod === 'all' || card.getAttribute('data-module') === mod) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });

      moduleCards.forEach(function (card) {
        if (mod === 'all' || card.getAttribute('data-module') === mod) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // === DOL Filter ===
  var dolFilterBtns = document.querySelectorAll('#dol-filter .filter-btn');
  var dolAreaCards = document.querySelectorAll('.dol-area-card');

  dolFilterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var dol = this.getAttribute('data-dol');

      dolFilterBtns.forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');

      // Filter lecture cards by DOL area
      lectureCards.forEach(function (card) {
        var areas = card.getAttribute('data-dol-areas') || '';
        if (dol === 'all' || areas.indexOf(dol) !== -1) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });

      // Filter DOL area overview cards
      dolAreaCards.forEach(function (card) {
        if (dol === 'all' || card.getAttribute('data-dol') === dol) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  function showAllLectures() {
    lectureCards.forEach(function (card) { card.style.display = ''; });
    moduleCards.forEach(function (card) { card.style.display = ''; });
    dolAreaCards.forEach(function (card) { card.style.display = ''; });
  }

  function resetModuleFilter() {
    moduleFilterBtns.forEach(function (b) { b.classList.remove('active'); });
    var allBtn = document.querySelector('#module-filter .filter-btn[data-module="all"]');
    if (allBtn) allBtn.classList.add('active');
  }

  function resetDolFilter() {
    dolFilterBtns.forEach(function (b) { b.classList.remove('active'); });
    var allBtn = document.querySelector('#dol-filter .filter-btn[data-dol="all"]');
    if (allBtn) allBtn.classList.add('active');
  }
});
