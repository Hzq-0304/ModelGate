import type { RatioSourceAdapter } from "../types.js";
import { newApiAdapter } from "./newApiAdapter.js";

export const newApiCompatibleAdapter: RatioSourceAdapter = {
  ...newApiAdapter,
  type: "new-api-compatible",

  async probe(source) {
    const result = await newApiAdapter.probe(source);
    return {
      ...result,
      type: "new-api-compatible"
    };
  }
};
