let timerId = null;

export function startPolling(callback, intervalMs) {
  stopPolling();
  timerId = window.setInterval(callback, intervalMs);
}

export function stopPolling() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
}
