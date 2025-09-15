// Fix for browser extension conflicts
(function () {
  const originalDefineProperty = Object.defineProperty;

  Object.defineProperty = function (obj, prop, descriptor) {
    try {
      if (prop === "ethereum" && obj === window) {
        // If ethereum already exists, skip redefining
        if (
          Object.prototype.hasOwnProperty.call(window, "ethereum") ||
          window.ethereum
        ) {
          console.warn(
            "Ethereum property already exists, skipping redefinition"
          );
          return obj;
        }
        // If extension defines with getter/setter, wrap in try/catch
        if (descriptor && (descriptor.get || descriptor.set)) {
          const get = descriptor.get;
          const set = descriptor.set;
          if (get) {
            descriptor.get = function () {
              try {
                return get.call(this);
              } catch (e) {
                console.warn("ethereum getter blocked:", e);
                return undefined;
              }
            };
          }
          if (set) {
            descriptor.set = function (v) {
              try {
                return set.call(this, v);
              } catch (e) {
                console.warn("ethereum setter blocked:", e);
              }
            };
          }
        }
      }
      return originalDefineProperty.call(this, obj, prop, descriptor);
    } catch (e) {
      if (prop === "ethereum") {
        console.warn("Caught error redefining window.ethereum:", e);
        return obj;
      }
      throw e;
    }
  };
})();
