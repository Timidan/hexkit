import { Buffer } from "buffer";

const root = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
};

if (typeof root.Buffer === "undefined") {
  root.Buffer = Buffer;
}

if (typeof window !== "undefined") {
  const browserWindow = window as Window & {
    Buffer?: typeof Buffer;
  };

  if (typeof browserWindow.Buffer === "undefined") {
    browserWindow.Buffer = Buffer;
  }
}
