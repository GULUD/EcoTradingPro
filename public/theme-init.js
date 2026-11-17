// Runs before first paint so dark-mode users never see a white flash.
// Kept as an external file so the page needs no inline script (strict CSP).
;(function () {
  try {
    var saved = localStorage.getItem('theme')
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    if (dark) document.documentElement.classList.add('dark')
  } catch (e) {
    // Storage can be blocked; the default light theme still renders
  }
})()
