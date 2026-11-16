import { msg, t } from "../../i18n";

export type SettingsTab = "about" | "appearance" | "playback" | "system" | "shortcuts" | "window";

export type SettingsSearchEntry = {
  tab: SettingsTab;
  category: string;
  title: string;
  description: string;
  /** Hidden on a phone (no windows, keyboard or local folders there). */
  desktopOnly?: boolean;
};

/** Settings a phone does not show, so search must not lead to them there. */
const DESKTOP_ONLY_TITLES = new Set([
  "Discord presence", "App size", "Toolbar", "Onboarding", "Local music", "Launch at startup",
  "Remember window size and location",
]);

const ENTRIES: SettingsSearchEntry[] = [
  { tab: "about", category: msg("Account"), title: msg("Account"), description: msg("Sign in and manage your YouTube Music account.") },
  { tab: "about", category: msg("Account"), title: "Last.fm", description: msg("Connect Last.fm and scrobble plays.") },
  { tab: "about", category: msg("Account"), title: msg("Discord presence"), description: msg("Show what you are playing and hide status when paused.") },
  { tab: "about", category: msg("Account"), title: msg("Updates"), description: msg("Check for and install Zuno updates.") },
  { tab: "appearance", category: msg("Appearance"), title: msg("Theme"), description: msg("Choose light, dark, or system theme.") },
  { tab: "appearance", category: msg("Appearance"), title: msg("Accent colour"), description: msg("Pick the colour of buttons, highlights and the progress bar.") },
  { tab: "appearance", category: msg("Appearance"), title: msg("Language"), description: msg("Change the app language: English, Español, Português, Français, Deutsch, Italiano.") },
  { tab: "appearance", category: msg("Appearance"), title: msg("Style"), description: msg("Glass, iOS-like, solid or Zuno's own look for cards and panels.") },
  { tab: "appearance", category: msg("Appearance"), title: msg("App size"), description: msg("Zoom the whole app in or out. Ctrl + and Ctrl - work too.") },
  { tab: "appearance", category: msg("Appearance"), title: msg("Motion"), description: msg("Control animations and visual effects.") },
  { tab: "appearance", category: msg("Appearance"), title: msg("Toolbar"), description: msg("Choose which controls appear in the title bar.") },
  { tab: "appearance", category: msg("Appearance"), title: msg("Onboarding"), description: msg("Restart the first-run introduction.") },
  { tab: "appearance", category: msg("Appearance"), title: msg("Made for you"), description: msg("Show personalized recommendations on Home.") },
  { tab: "playback", category: msg("Playback"), title: msg("Output device"), description: msg("Choose where Zuno sends audio.") },
  { tab: "playback", category: msg("Playback"), title: msg("Normalize volume"), description: msg("Play every track at a similar loudness.") },
  { tab: "playback", category: msg("Playback"), title: msg("Sound profiles"), description: msg("Save, import and export EQ, bass and balance setups; link one to your headphones.") },
  { tab: "playback", category: msg("Playback"), title: msg("Equalizer"), description: msg("Adjust audio frequencies and presets.") },
  { tab: "playback", category: msg("Playback"), title: msg("Bass boost, treble, balance and width"), description: msg("Tone knobs and stereo controls beside the equalizer.") },
  { tab: "playback", category: msg("Playback"), title: msg("Headphones"), description: msg("Earbud button gestures and resume when headphones connect.") },
  { tab: "playback", category: msg("Playback"), title: msg("Bit-perfect output (DAC)"), description: msg("Send music to an external DAC untouched, at its own sample rate.") },
  { tab: "playback", category: msg("Playback"), title: msg("Gapless playback"), description: msg("Remove silence between tracks.") },
  { tab: "playback", category: msg("Playback"), title: msg("Crossfade"), description: msg("Blend the end of one track into the next.") },
  { tab: "playback", category: msg("Playback"), title: msg("Restore tabs and queues"), description: msg("Restore your playback session after restarting.") },
  { tab: "playback", category: msg("Playback"), title: msg("Audio engine"), description: msg("Choose the playback method and authenticated streaming.") },
  { tab: "system", category: msg("Library"), title: msg("Local music"), description: msg("Create playlists from folders on this computer.") },
  { tab: "system", category: msg("Library"), title: msg("Cache"), description: msg("Set cache size and clear cached content.") },
  { tab: "system", category: msg("Library"), title: msg("Downloads"), description: msg("Set offline storage limits and remove downloads.") },
  { tab: "system", category: msg("Library"), title: msg("Offline mode"), description: msg("Play only downloaded music and use no network.") },
  { tab: "system", category: msg("Library"), title: msg("Backup"), description: msg("Back up or restore settings, sound profiles, playlists, history and downloads.") },
  { tab: "system", category: msg("Library"), title: msg("Streaming quality"), description: msg("Choose quality for music played over the network.") },
  { tab: "system", category: msg("Library"), title: msg("Download quality"), description: msg("Choose quality for offline music.") },
  { tab: "system", category: msg("Library"), title: msg("Lyrics"), description: msg("Translate lyrics, set text size, and choose a source.") },
  { tab: "system", category: msg("Library"), title: msg("Launch at startup"), description: msg("Start Zuno when your computer starts.") },
  { tab: "system", category: msg("Library"), title: msg("Remember window size and location"), description: msg("Restore the main window geometry.") },
  { tab: "system", category: msg("Library"), title: msg("Troubleshooting"), description: msg("Open logs or reset Zuno data.") },
  { tab: "window", category: msg("Window"), title: msg("Mini player"), description: msg("Show a compact player when the main window loses focus.") },
  { tab: "window", category: msg("Window"), title: msg("Library sidebar"), description: msg("Choose the playlist rail size and hover behavior.") },
  { tab: "window", category: msg("Window"), title: msg("Window controls"), description: msg("Choose macOS, Windows, or native title-bar buttons.") },
  { tab: "window", category: msg("Window"), title: msg("Minimize to tray"), description: msg("Keep Zuno available from the system tray.") },
  { tab: "window", category: msg("Window"), title: msg("Compact player bar"), description: msg("Use a smaller playback bar.") },
  { tab: "window", category: msg("Window"), title: msg("System media controls"), description: msg("Show playback in system media controls.") },
  { tab: "window", category: msg("Window"), title: msg("Window outline"), description: msg("Show or hide the thin edge around the window.") },
  { tab: "shortcuts", category: msg("Shortcuts"), title: msg("Keyboard shortcuts"), description: msg("View, record, or clear keyboard bindings.") },
];

export function searchSettings(query: string): SettingsSearchEntry[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const mobile = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  return ENTRIES.filter((entry) => {
    if (mobile && (entry.tab === "window" || entry.tab === "shortcuts" || DESKTOP_ONLY_TITLES.has(entry.title))) {
      return false;
    }
    // Both the English source and the active language, so either finds the setting.
    const haystack = [
      entry.category, entry.title, entry.description,
      t(entry.category), t(entry.title), t(entry.description),
    ].join(" ").toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
