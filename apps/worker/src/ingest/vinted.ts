import { mapVinted, searchVinted } from "@mall/sources";
import { ingestResaleSearch } from "./resale-search.ts";

export const ingestVinted = () => ingestResaleSearch("vinted", searchVinted, mapVinted);
