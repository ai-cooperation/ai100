document.addEventListener('DOMContentLoaded', function () {
  // Module filter
  var filterBtns = document.querySelectorAll('.filter-btn');
  var lectureCards = document.querySelectorAll('.lecture-card');
  var moduleCards = document.querySelectorAll('.module-card');

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mod = this.getAttribute('data-module');

      filterBtns.forEach(function (b) { b.classList.remove('active'); });
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
});
