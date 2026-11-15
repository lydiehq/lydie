import { useApp } from "@lydie/plugin-api";
import { Link, SettingsCard, SettingsRow } from "@lydie/plugin-api/ui";

export function AboutPage() {
  const app = useApp();
  const about = app.services?.about;
  return (
    <SettingsCard>
      <SettingsRow label="Version">
        <span className="text-sm text-gray-600" data-testid="about-version">
          {about?.version ?? "Unknown"}
          {about?.shell ? ` (${about.shell})` : ""}
        </span>
      </SettingsRow>
      <SettingsRow label="Licence" description="The client is open source.">
        <span className="text-sm text-gray-600">{about?.licence ?? "AGPL-3.0-only"}</span>
      </SettingsRow>
      <SettingsRow label="Source code">
        <Link
          href={about?.sourceUrl ?? "https://github.com/lydiehq/lydie"}
          target="_blank"
          rel="noreferrer"
          className="text-sm"
        >
          {about?.sourceUrl ?? "https://github.com/lydiehq/lydie"}
        </Link>
      </SettingsRow>
    </SettingsCard>
  );
}
