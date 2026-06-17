// Data loading. All files are static JSON produced by scripts/fetch_data.py.

const json = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return r.json();
  });

const localCache = new Map();

export async function loadCore() {
  const [meta, national, states, topo] = await Promise.all([
    json("data/meta.json"),
    json("data/national.json"),
    json("data/states.json"),
    json("data/us-states-10m.json"),
  ]);
  const byFips = new Map(states.states.map((s) => [s.fips, s]));
  const byAbbr = new Map(states.states.map((s) => [s.abbr, s]));
  return { meta, national, states, topo, byFips, byAbbr };
}

export function loadLocal(abbr) {
  if (!localCache.has(abbr)) {
    localCache.set(
      abbr,
      json(`data/local/${abbr}.json`).catch((e) => {
        localCache.delete(abbr); // allow retry on transient failure
        throw e;
      })
    );
  }
  return localCache.get(abbr);
}
