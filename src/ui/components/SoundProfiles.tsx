import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  CloseIcon,
  ExportIcon,
  HeadphonesIcon,
  ImportIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SaveIcon,
  SoundProfileIcon,
  TrashIcon,
} from "@/ui/icons";
import {
  AUDIO_PROFILE_NAME_MAX,
  applyAudioProfile,
  audioProfileNameError,
  deleteAudioProfile,
  exportAudioProfiles,
  importAudioProfiles,
  renameAudioProfile,
  saveCurrentAsProfile,
  setDeviceProfile,
  suggestAudioProfileName,
  updateProfileFromCurrent,
  useActiveAudioProfile,
  useAudioProfiles,
  useDeviceProfiles,
  type AudioProfile,
} from "../settings/audioProfiles";
import { useCurrentOutputDevice } from "../settings/currentOutputDevice";
import { showNotice } from "../notice";
import { getInvokeErrorMessage } from "../../internal/appSettings";
import { t, tn, useT } from "../../i18n";

const FIELD =
  "min-w-0 flex-1 rounded-lg bg-background px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring/60";

function ActionButton({
  icon,
  label,
  onClick,
  tone = "neutral",
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "neutral" | "primary" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "pressable inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        tone === "primary" && "bg-primary text-primary-foreground",
        tone === "neutral" && "bg-muted/60 text-foreground hover:bg-muted",
        tone === "danger" && "bg-destructive/15 text-destructive hover:bg-destructive/25",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function NameEditor({
  initial,
  renamingId,
  onDone,
  onCancel,
}: {
  initial: string;
  renamingId?: string;
  onDone: (name: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial);
  const error = audioProfileNameError(name, renamingId);
  const submit = () => {
    if (!error) onDone(name.trim());
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          className={FIELD}
          value={name}
          maxLength={AUDIO_PROFILE_NAME_MAX}
          aria-label={t("Profile name")}
          aria-invalid={error !== null}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            if (event.key === "Escape") onCancel();
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={error !== null}
          aria-label={t("Save name")}
          className="pressable grid size-9 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
        >
          <CheckIcon size={18} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("Cancel")}
          className="pressable grid size-9 place-items-center rounded-full bg-muted/60 text-foreground"
        >
          <CloseIcon size={18} />
        </button>
      </div>
      {error && name.trim() !== "" ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function describe(profile: AudioProfile): string {
  const parts: string[] = [];
  if (!profile.equalizer.enabled) parts.push(t("EQ off"));
  if (profile.effects.bassDb > 0) parts.push(t("Bass +{db} dB", { db: profile.effects.bassDb }));
  if (profile.effects.trebleDb !== 0) parts.push(t("Treble {db} dB", { db: `${profile.effects.trebleDb > 0 ? "+" : ""}${profile.effects.trebleDb}` }));
  if (profile.effects.width !== 1) parts.push(t("Width {percent}%", { percent: Math.round(profile.effects.width * 100) }));
  if (profile.effects.balance !== 0) parts.push(t("Balance {side}{amount}", { side: profile.effects.balance < 0 ? "L" : "R", amount: Math.round(Math.abs(profile.effects.balance) * 100) }));
  if (profile.playbackRate !== 1) parts.push(`${profile.playbackRate}x`);
  if (profile.pitchSemitones !== 0) parts.push(t("Pitch {semitones}", { semitones: `${profile.pitchSemitones > 0 ? "+" : ""}${profile.pitchSemitones}` }));
  if (profile.volumeNormalization) parts.push(t("Normalised"));
  return parts.length ? parts.join(" · ") : t("EQ curve only");
}

/**
 * Saved sound setups: tap a chip to apply it, then manage the selected one below. Import/export
 * moves them between devices as `.zuno-audio.json` files; "Use with" ties one to the output
 * device currently in use, so it is applied whenever that device connects.
 */
export function SoundProfilesPanel({ disabled }: { disabled?: boolean }) {
  const t = useT();
  const profiles = useAudioProfiles();
  const active = useActiveAudioProfile();
  const devices = useDeviceProfiles();
  const device = useCurrentOutputDevice();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | "rename" | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = profiles.find((profile) => profile.id === (selectedId ?? active?.id)) ?? null;
  const deviceProfileId = device ? devices[device.key] : undefined;

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      showNotice(getInvokeErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onImport = () => run(async () => {
    const result = await importAudioProfiles();
    if (!result) return;
    if (result.profiles === 0 && result.presets === 0) {
      showNotice(t("Nothing new in that file"));
      return;
    }
    if (result.only) setSelectedId(result.only.id);
    const profilesText = tn("{n} profile", "{n} profiles", result.profiles);
    const presetsText = tn("{n} EQ preset", "{n} EQ presets", result.presets);
    showNotice(
      result.profiles && result.presets
        ? t("Imported {profiles} and {presets}", { profiles: profilesText, presets: presetsText })
        : t("Imported {items}", { items: result.profiles ? profilesText : presetsText }),
    );
  });

  const onExport = (id?: string) => run(async () => {
    const path = await exportAudioProfiles(id);
    if (path) showNotice(id ? t("Profile exported") : t("Profiles exported"));
  });

  return (
    <div className={cn("flex flex-col gap-4", disabled && "pointer-events-none opacity-50")}>
      {profiles.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="listbox" aria-label={t("Sound profiles")}>
          {profiles.map((profile) => {
            const isActive = profile.id === active?.id;
            const isSelected = profile.id === selected?.id;
            const forDevice = Object.values(devices).includes(profile.id);
            return (
              <button
                key={profile.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  setSelectedId(profile.id);
                  setEditing(null);
                  applyAudioProfile(profile);
                }}
                className={cn(
                  "pressable inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground hover:bg-muted",
                  isSelected && !isActive && "ring-2 ring-inset ring-primary/60",
                )}
              >
                {forDevice ? <HeadphonesIcon size={15} aria-label={t("Linked to a device")} /> : null}
                {profile.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("No profiles yet. Shape the sound with the equaliser below, then save it here.")}
        </p>
      )}

      {editing === "new" ? (
        <NameEditor
          initial={suggestAudioProfileName()}
          onCancel={() => setEditing(null)}
          onDone={(name) => {
            const profile = saveCurrentAsProfile(name);
            setSelectedId(profile.id);
            setEditing(null);
            showNotice(t("Saved \"{name}\"", { name }));
          }}
        />
      ) : editing === "rename" && selected ? (
        <NameEditor
          initial={selected.name}
          renamingId={selected.id}
          onCancel={() => setEditing(null)}
          onDone={(name) => {
            renameAudioProfile(selected.id, name);
            setEditing(null);
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <ActionButton tone="primary" icon={<PlusIcon size={16} />} label={t("Save current sound")} onClick={() => setEditing("new")} />
          <ActionButton icon={<ImportIcon size={16} />} label={t("Import")} onClick={onImport} disabled={busy} />
          <ActionButton
            icon={<ExportIcon size={16} />}
            label={t("Export all")}
            onClick={() => onExport()}
            disabled={busy || profiles.length === 0}
          />
        </div>
      )}

      {selected && editing === null ? (
        <div className="flex flex-col gap-3 rounded-xl bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <SoundProfileIcon size={18} className="shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{selected.name}</p>
              <p className="truncate text-xs text-muted-foreground">{describe(selected)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.id !== active?.id ? (
              <ActionButton
                icon={<SaveIcon size={16} />}
                label={t("Update with current")}
                onClick={() => {
                  updateProfileFromCurrent(selected.id);
                  showNotice(t("Updated \"{name}\"", { name: selected.name }));
                }}
              />
            ) : null}
            <ActionButton icon={<PencilIcon size={16} />} label={t("Rename")} onClick={() => setEditing("rename")} />
            <ActionButton icon={<ExportIcon size={16} />} label={t("Export")} onClick={() => onExport(selected.id)} disabled={busy} />
            {device ? (
              <ActionButton
                icon={deviceProfileId === selected.id ? <RefreshIcon size={16} /> : <HeadphonesIcon size={16} />}
                label={deviceProfileId === selected.id ? t("Unlink from {device}", { device: device.name }) : t("Use with {device}", { device: device.name })}
                onClick={() => {
                  const linking = deviceProfileId !== selected.id;
                  setDeviceProfile(device.key, linking ? selected.id : null);
                  showNotice(
                    linking
                      ? t("\"{name}\" will play on {device}", { name: selected.name, device: device.name })
                      : t("Unlinked from {device}", { device: device.name }),
                  );
                }}
              />
            ) : null}
            <ActionButton
              tone="danger"
              icon={<TrashIcon size={16} />}
              label={t("Delete")}
              onClick={() => {
                deleteAudioProfile(selected.id);
                setSelectedId(null);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
