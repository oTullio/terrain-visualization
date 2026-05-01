import '@testing-library/jest-dom';

// jsdom does not implement window.matchMedia. Provide a minimal stub so
// that any code calling matchMedia (e.g. the reducedScene store initialiser)
// doesn't throw during tests.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
