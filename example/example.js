// Plain script (no modules) for running via file:// without CORS issues.
// Requires dist/bundle.js to have been loaded first, exposing window.mapbundleProtocol.
/* global maplibregl */
(function () {
  if (!window.mapbundleProtocol) {
    console.error(
      "mapbundleProtocol global not found. Load dist/bundle.js before example.js.",
    );
    return;
  }
  const { MapBundle, FileSource, Protocol } = window.mapbundleProtocol;
  let currentMap = null;
  let protocolInstance = null;
  let currentPkg = null;
  let availableStyles = [];

  async function initMap(pkg, styleIndex = 0) {
    const fileList = await pkg.getFilelist();
    console.log("MapBundle file list:", fileList);

    const styles = await pkg.getStyles();
    console.log("MapBundle styles:", styles);

    currentPkg = pkg;
    availableStyles = styles;
    populateStyleSelector(styles, styleIndex);

    if (!protocolInstance) {
      protocolInstance = new Protocol({
        metadata: true,
        subdivideMissingTile: true,
        debug: true,
      });
      console.debug("[example] Protocol initialized (debug:true)");
      if (window.maplibregl && maplibregl.addProtocol) {
        maplibregl.addProtocol("mapbundle", protocolInstance.package);
        console.debug(
          "[example] mapbundle:// protocol registered with maplibregl",
        );
      } else {
        console.warn("[example] maplibregl.addProtocol unavailable");
      }
    }

    // Always register the MapBundle instance so protocol doesn't create FetchSource (causing file:/// fetch)
    protocolInstance.add(pkg);
    console.debug(
      "[example] MapBundle instance added to protocol with key",
      pkg.source.getKey(),
    );

    // Preserve current map state if it exists
    let mapState = null;
    if (currentMap) {
      try {
        mapState = {
          center: currentMap.getCenter(),
          zoom: currentMap.getZoom(),
          bearing: currentMap.getBearing(),
          pitch: currentMap.getPitch(),
        };
        currentMap.remove();
        // eslint-disable-next-line no-unused-vars
      } catch (_) {
        /* empty */
      }
      currentMap = null;
    }

    const selectedStyle = styles[styleIndex] || styles[0];
    const mapOptions = {
      container: "map-element",
      localIdeographFontFamily: false,
      style: selectedStyle,
    };

    // Restore previous map state if available
    if (mapState) {
      mapOptions.center = mapState.center;
      mapOptions.zoom = mapState.zoom;
      mapOptions.bearing = mapState.bearing;
      mapOptions.pitch = mapState.pitch;
    }

    currentMap = new maplibregl.Map(mapOptions);
  }

  function populateStyleSelector(styles, selectedIndex = 0) {
    const selector = document.getElementById("style-select");
    if (!selector) return;

    selector.innerHTML = "";

    if (!styles || styles.length === 0) {
      selector.innerHTML = '<option value="">No styles available</option>';
      selector.disabled = true;
      return;
    }

    styles.forEach((style, index) => {
      const option = document.createElement("option");
      option.value = index;
      const styleName = style.name || `Style ${index + 1}`;
      option.textContent = styleName;
      if (index === selectedIndex) {
        option.selected = true;
      }
      selector.appendChild(option);
    });

    selector.disabled = false;
  }

  function initWithFile(file) {
    console.log("Selected file:", file.name);
    try {
      const fileSource = new FileSource(file);
      console.log("FileSource:", fileSource);
      const pkg = new MapBundle(fileSource);
      console.log("MapBundle:", pkg);
      initMap(pkg);
    } catch (err) {
      console.error("Failed to initialize map from file", err);
      alert(
        "Failed to initialize: " + (err && err.message ? err.message : err),
      );
    }
  }

  function sanitizeUrl(u) {
    if (!u) return null;
    u = u.trim();
    if (!u) return null;
    // Allow absolute http(s)
    if (/^https?:\/\//i.test(u)) return u;
    // Disallow protocol-relative and other schemes
    if (u.startsWith("//") || /^[a-zA-Z]+:\/.+/.test(u)) {
      alert("Unsupported or unsafe URL scheme");
      return null;
    }
    // Treat as relative path when not file://
    if (location.protocol !== "file:") {
      try {
        const resolved = new URL(u, window.location.href).href;
        console.debug("[example] Resolved relative URL to", resolved);
        return resolved;
        // eslint-disable-next-line no-unused-vars
      } catch (e) {
        alert("Invalid relative URL");
        return null;
      }
    }
    alert("URL must start with http:// or https:// when using file:// origin");
    return null;
  }

  async function initWithUrl(url) {
    const clean = sanitizeUrl(url);
    if (!clean) return;
    console.log("Loading remote MapBundle URL:", clean);
    try {
      const pkg = new MapBundle(clean);
      console.log("MapBundle (remote):", pkg);
      // Await map initialization so we only reflect URL on success
      await initMap(pkg);
      // If URL input exists and is empty, show the URL used for initialization
      const urlInput = document.getElementById("mapbundle-url");
      if (urlInput && !urlInput.value) {
        urlInput.value = clean;
      }
    } catch (err) {
      console.error("Failed to initialize map from URL", err);
      alert(
        "Failed to initialize: " + (err && err.message ? err.message : err),
      );
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("mapbundle-input");
    if (input) {
      input.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) initWithFile(file);
      });
    }

    const styleSelect = document.getElementById("style-select");
    if (styleSelect) {
      styleSelect.addEventListener("change", (e) => {
        const selectedIndex = parseInt(e.target.value, 10);
        if (currentPkg && !isNaN(selectedIndex)) {
          console.log("Switching to style index:", selectedIndex);
          initMap(currentPkg, selectedIndex);
        }
      });
    }
    const urlInput = document.getElementById("mapbundle-url");
    const urlButton = document.getElementById("mapbundle-load-url");
    if (urlButton && urlInput) {
      urlButton.addEventListener("click", () => initWithUrl(urlInput.value));
      urlInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          initWithUrl(urlInput.value);
        }
      });
    }
    // Auto-load demo mapbundle when served via http/https (not file://)
    if (location.protocol !== "file:") {
      const demoName = "oslo-small.mapbundle"; // present in example folder
      // Use relative path so it works regardless of host/port
      const demoUrl = demoName; // same directory as index.html
      console.log("Attempting auto-load of demo package:", demoUrl);
      initWithUrl(demoUrl);
    }
  });
})();
