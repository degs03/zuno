import { useId } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/motion/switch";
import {
  isEqualizerFlat,
  setEqualizer,
  setEqualizerEnabled,
  useEqualizer,
  useEqualizerEnabled,
} from "../../settings/equalizer";
import { useAudioEngineMode } from "../../settings/audioEngine";
import { EqualizerMixer, EqualizerPresets, PersonalEqChips, ToneKnobs } from "../Equalizer";
import { useT } from "../../../i18n";

/** The Settings faders, knobs and presets, compact, for the speed/sleep-timer popup. Naming presets stays in Settings. */
export function MiniEqualizer() {
  const t = useT();
  const equalizer = useEqualizer();
  const enabled = useEqualizerEnabled();
  const available = useAudioEngineMode() === "rust";
  const flat = isEqualizerFlat(equalizer);
  const labelId = useId();

  return (
    <div className={cn("flex flex-col gap-2.5 border-t border-border pt-3", !available && "opacity-50")}>
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="text-xs font-medium text-foreground">
          {t("Equaliser")}
        </span>
        <div className="flex items-center gap-2">
          {/* A visible way back to flat: the graph's own reset is a double-click, which a
              finger cannot reliably do. */}
          {available && !flat ? (
            <button
              type="button"
              className="rounded-full px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-9 max-sm:px-3 max-sm:text-xs"
              onClick={() => setEqualizer({ preampDb: 0, bandsDb: equalizer.bandsDb.map(() => 0) })}
            >
              {t("Reset")}
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {available ? (enabled ? t("Flat") : t("Off")) : t("Rust engine only")}
            </span>
          )}
          <Switch
            checked={enabled}
            onCheckedChange={setEqualizerEnabled}
            disabled={!available}
            aria-labelledby={labelId}
          />
        </div>
      </div>

      <div className={cn("flex flex-col gap-2", !enabled && "opacity-60")}>
        <PersonalEqChips compact disabled={!available} />
        <EqualizerPresets compact disabled={!available} />
        <EqualizerMixer compact disabled={!available} />
        <ToneKnobs size={44} disabled={!available} />
      </div>
    </div>
  );
}
