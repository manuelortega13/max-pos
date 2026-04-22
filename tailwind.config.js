// Tailwind v4 is configured entirely in CSS (see src/styles.css — @import
// 'tailwindcss'). This file exists purely as a marker so IntelliJ's Tailwind
// CSS plugin detects the project and serves class-name autocompletion. The
// Tailwind v4 compiler ignores it.
module.exports = {
  content: [
    './src/**/*.{html,ts}',
    './index.html',
  ],
};
