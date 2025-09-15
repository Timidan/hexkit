// Global error handler for better debugging
window.addEventListener('error', function(event) {
  console.error('Global error:', event.error);
  // Don't prevent default to allow normal error handling
});

window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
  // Prevent the default behavior to avoid console spam
  event.preventDefault();
});

// Handle extension conflicts more gracefully
window.addEventListener('DOMContentLoaded', function() {
  // Check for multiple ethereum providers
  if (window.ethereum && window.ethereum.providers) {
    console.log('Multiple ethereum providers detected:', window.ethereum.providers.length);
  }
});
