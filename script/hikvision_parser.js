
/* hikvision_parser.js
   Loads all JSON category files from /json/ and parses a reference according to each category's structure.
   Exposes global function analyzeReference(ref, basePath) returning a Promise resolving to parse result.
*/
const categoryFiles = [
  "IPCamera.json","NVR.json","TurboHD.json","TurboHD_DVR.json","PTZ.json","TurboHDPTZ.json","Switch.json","AccessPoint.json","ACRouter.json","Speaker.json",
  "HiLookIPC.json","HiLookTHC.json","HiLookPTZ.json","HiLookNVR.json","HiLookDVR.json","HiLookKit.json"
];

async function loadAllCategories(basePath = "json/") {
  const results = {};
  await Promise.all(categoryFiles.map(async (f) => {
    try {
      const res = await fetch(basePath + f);
      if (res.ok) {
        results[f] = await res.json();
      } else {
        console.warn("Failed to load", f, res.status);
      }
    } catch (e) {
      console.warn("Error loading", f, e);
    }
  }));
  return results;
}

function findCategoryForRef(ref, categories) {
  const upper = ref.toUpperCase().trim();
  const hasI = upper.startsWith("I");
  const working = hasI ? upper.slice(1) : upper;
  for (const [fname, cat] of Object.entries(categories)) {
    const prefixes = cat.prefixes || [];
    for (const p of prefixes) {
      if (working.startsWith(p)) {
        return {file: fname, category: cat, prefix: p, hasI};
      }
    }
  }
  return null;
}

function parseByStructure(remaining, structure, optionsDict) {
    const segments = [];
    let rest = remaining;

    for (const block of structure) {

        // --- STOP STRUCTURE ONLY ON "-" ---
        if (rest.startsWith("-")) {
            rest = rest.slice(1); // remove "-"
            break; // go directly to options
        }

        // -------- VARIABLE LENGTH --------
        if (block.length === "variable") {
            const keys = Object.keys(block.map || {}).sort((a,b)=>b.length - a.length);
            let matched = null;

            for (const key of keys) {
                if (rest.toUpperCase().startsWith(key.toUpperCase())) {
                    matched = key.toUpperCase();
                    break;
                }
            }

            if (matched) {
                segments.push({
                    name:block.name,
                    code:matched,
                    meaning:block.map[matched] || "Known key (no mapping text)"
                });
                rest = rest.slice(matched.length);
                continue;
            }

            // fallback numeric group (1–3 digits)
            const m = rest.match(/^[0-9]{1,3}/);
            if (m) {
                segments.push({
                    name:block.name,
                    code:m[0],
                    meaning:"(numeric value)"
                });
                rest = rest.slice(m[0].length);
                continue;
            }

            segments.push({
                name:block.name,
                code:rest.charAt(0),
                meaning:"Unknown"
            });
            rest = rest.slice(1);
            continue;
        }

        // -------- FIXED LENGTH --------
        const len = block.length;
        const piece = rest.slice(0,len).toUpperCase();
        const meaning = (block.map && block.map[piece])
                        ? block.map[piece]
                        : (Object.keys(block.map || {}).length > 0
                           ? "Unknown"
                           : "(value)");

        segments.push({name:block.name, code:piece, meaning});
        rest = rest.slice(len);
    }

    // -------- OPTIONS PARSING --------
    const opts = [];

    const optKeys = Object.keys(optionsDict || {}).sort((a,b)=>b.length - a.length);

    while (rest.length > 0) {

        // "/" is NOT a structure separator anymore → treated as option separator
        if (rest.startsWith("-") || rest.startsWith("/")) {
            rest = rest.slice(1);
            continue;
        }

        let matched = false;

        for (const k of optKeys) {
            if (rest.toUpperCase().startsWith(k.toUpperCase())) {
                opts.push({code:k, meaning:optionsDict[k]});
                rest = rest.slice(k.length);
                matched = true;
                break;
            }
        }

        if (!matched) {
            opts.push({
                code:rest.charAt(0),
                meaning:"Unknown option"
            });
            rest = rest.slice(1);
        }
    }

    return {segments, options: opts, leftover: rest};
}


async function analyzeReference(ref, basePath="json/") {
  const categories = await loadAllCategories(basePath);
  const match = findCategoryForRef(ref, categories);
  if (!match) return {error:"No matching category", ref};
  const upper = ref.toUpperCase().trim();
  const afterI = match.hasI ? upper.slice(1) : upper;
  const remaining = afterI.slice(match.prefix.length);
  const parsed = parseByStructure(remaining, match.category.structure, match.category.options || {});
  return {categoryFile: match.file, prefix: match.prefix, parsed};
}

// expose globally
window.analyzeReference = analyzeReference;
