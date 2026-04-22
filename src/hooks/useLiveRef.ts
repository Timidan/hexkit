import { useEffect, useRef, type MutableRefObject } from 'react';

// Ref that tracks `value` post-commit. Read inside async/callbacks, not during render.
export function useLiveRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
