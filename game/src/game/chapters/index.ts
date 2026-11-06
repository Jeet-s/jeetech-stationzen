import type { LevelSpec } from "../engine";
import { willowmere } from "./c1-willowmere";
import { portside } from "./c2-portside";
import { kitebrook } from "./c3-kitebrook";
import { amberhill } from "./c4-amberhill";
import { lotus } from "./c5-lotus";
import { frostholm } from "./c6-frostholm";
import { sunbazaar } from "./c7-sunbazaar";
import { ringvale } from "./c8-ringvale";
import { neonquay } from "./c9-neonquay";
import { meridian } from "./c10-meridian";

export interface Chapter {
  id: string;
  name: string;
  /** The rule this city introduces. */
  rule: string;
  /** Art background key in src/art.ts. */
  bg: string;
  levels: LevelSpec[];
}

export const CHAPTERS: Chapter[] = [willowmere, portside, kitebrook, amberhill, lotus, frostholm, sunbazaar, ringvale, neonquay, meridian];
