import { useInsertionEffect } from 'react';

const pages = ['dashboard', 'mothers', 'infants', 'healthcare', 'announcements', 'system', 'caregiver', 'user', 'login'];
export function PageStyles({ page }) {
  useInsertionEffect(() => {
    // Apply the destination stylesheet before React replaces the page markup.
    // This prevents a frame painted with the old page's styles.
    pages.forEach((name) => {
      const link = document.getElementById(`medimama-css-${name}`);
      // The React login has its own scoped stylesheet.  The legacy login CSS
      // uses global selectors (label, button, .container) and would otherwise
      // override its spacing and alignment.
      if (link) link.disabled = name !== page || name === 'login';
    });
    document.body.dataset.medimamaPage = page;
    document.body.classList.toggle('dashboard-page', page === 'user');
  }, [page]);
  return null;
}
