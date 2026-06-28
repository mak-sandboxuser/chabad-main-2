const listeners = new Set();
let toastId = 0;

export function showToast({ message, type = 'success', duration = 4000 }) {
  const id = ++toastId;
  const toast = { id, message, type, duration };
  listeners.forEach((listener) => listener(toast));
  return id;
}

export function subscribeToasts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
