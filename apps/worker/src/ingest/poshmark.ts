import { mapPoshmark, searchPoshmark } from "@mall/sources";
import { ingestResaleSearch } from "./resale-search.ts";

export const ingestPoshmark = () => ingestResaleSearch("poshmark", (q) => searchPoshmark(q), mapPoshmark);
