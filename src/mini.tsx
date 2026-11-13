import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "motion/react";

import "./ui/styles/global.css";
import { applyPlatformAttributes } from "./ui/platform";
import MiniPlayer from "./ui/components/mini-player/MiniPlayer";
import { SkinnedMiniPlayer } from "./ui/components/mini-player/SkinnedMiniPlayer";
import { hydrateMiniPlayerSettings, useMiniPlayerSkin } from "./ui/settings/miniPlayer";
import { applyPaperPcMode, hydratePaperPcMode } from "./ui/settings/paperPcMode";
import { applyAppearance, hydrateAppearance } from "./ui/settings/appearance";
import {
  applyRenderEffects,
  hydrateRenderEffects,
  useReduceMotion,
} from "./ui/settings/renderEffects";

applyPlatformAttributes();
/*
 * The mini player is its own window, so it is its own document — none of the attributes
 * main.tsx stamps on <html> exist here, and it was running full blur, marquee and springs
 * with Reduced motion mode on. Both settings read the same durable keys, so the two windows
 * agree without talking to each other; a window already open when the setting changes picks
 * it up on its next launch, which is when it is next visible anyway.
 */
applyPaperPcMode();
applyRenderEffects();
// Accent and style too, so the mini player's controls follow the chosen colour.
applyAppearance();
void Promise.all([hydrateMiniPlayerSettings(), hydratePaperPcMode(), hydrateRenderEffects(), hydrateAppearance()]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MiniPlayerRoot />
  </React.StrictMode>,
);

/** The MotionConfig App.tsx has, for the same reason: it is what reduces the beUI springs. */
function MiniPlayerRoot() {
  const reduce = useReduceMotion();
  const skin = useMiniPlayerSkin();
  return (
    <MotionConfig reducedMotion={reduce ? "always" : "user"}>
      {skin === "classic" ? <MiniPlayer /> : <SkinnedMiniPlayer skin={skin} />}
    </MotionConfig>
  );
}
