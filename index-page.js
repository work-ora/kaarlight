document.addEventListener('DOMContentLoaded', () => {
      const searchBtn = document.getElementById('hero-search-btn');
      const searchInput = document.getElementById('hero-search');

      if (searchBtn && searchInput) {
        const performSearch = () => {
          const query = searchInput.value.trim();
          if (query) {
            window.location.href = 'jobs.html?search=' + encodeURIComponent(query);
          }
        };

        searchBtn.addEventListener('click', performSearch);
        searchInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            performSearch();
          }
        });
      }
    });
