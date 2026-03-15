const CHUNK_RECOVERY_KEY = '__hexkit_chunk_recovery__';
const CHUNK_RECOVERY_TTL_MS = 15000;

function isChunkLoadFailure(value) {
  const message =
    typeof value === 'string'
      ? value
      : value?.message || value?.reason?.message || String(value || '');
  const lower = message.toLowerCase();
  return (
    lower.includes('failed to fetch dynamically imported module') ||
    lower.includes('importing a module script failed') ||
    lower.includes('chunkloaderror') ||
    lower.includes('vite:preloaderror')
  );
}

function recoverFromChunkFailure() {
  try {
    const now = Date.now();
    const last = Number(window.sessionStorage.getItem(CHUNK_RECOVERY_KEY) || '0');
    if (last && now - last < CHUNK_RECOVERY_TTL_MS) {
      return false;
    }
    window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now));
    window.location.reload();
    return true;
  } catch {
    window.location.reload();
    return true;
  }
}

// Global error handler for better debugging
window.addEventListener('error', function(event) {
  if (isChunkLoadFailure(event.error || event.message)) {
    if (recoverFromChunkFailure()) {
      event.preventDefault();
      return;
    }
  }
  console.error('Global error:', event.error || event.message);
  // Don't prevent default to allow normal error handling
});

window.addEventListener('unhandledrejection', function(event) {
  if (isChunkLoadFailure(event.reason)) {
    if (recoverFromChunkFailure()) {
      event.preventDefault();
      return;
    }
  }
  console.error('Unhandled promise rejection:', event.reason);
  // Prevent the default behavior to avoid console spam
  event.preventDefault();
});

window.addEventListener('vite:preloadError', function(event) {
  if (recoverFromChunkFailure()) {
    event.preventDefault();
  }
});

// Handle extension conflicts more gracefully
window.addEventListener('DOMContentLoaded', function() {
  // Check for multiple ethereum providers
  if (window.ethereum && window.ethereum.providers) {
    console.log('Multiple ethereum providers detected:', window.ethereum.providers.length);
  }

  // Clear stale recovery markers after a stable boot window.
  window.setTimeout(function() {
    try {
      window.sessionStorage.removeItem(CHUNK_RECOVERY_KEY);
    } catch {
      // ignore storage failures
    }
  }, CHUNK_RECOVERY_TTL_MS);
});
