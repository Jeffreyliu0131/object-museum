import { Badge, Button, Dialog, DropdownMenu, IconButton, Tooltip } from "@radix-ui/themes";
import { CircleHalf, Info, Moon, Sun } from "@phosphor-icons/react";
import type { ThemePreference } from "../app/useTheme";

interface AppHeaderProps {
  themePreference: ThemePreference;
  onThemeChange: (value: ThemePreference) => void;
}

const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "system", label: "Follow system", icon: CircleHalf },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function AppHeader({ themePreference, onThemeChange }: AppHeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <div className="topbar__brand brand" aria-label="Object Museum local prototype">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__text">Object Museum <span className="visually-hidden">local</span></span>
        </div>

        <div className="topbar__status status-cluster">
          <Badge className="portfolio-label" size="2" variant="soft">Portfolio prototype</Badge>

        <Dialog.Root>
          <Tooltip content="Read the local data boundary">
            <Dialog.Trigger>
              <IconButton className="icon-button" variant="ghost" size="3" aria-label="Read the local data boundary">
                <Info size={20} weight="regular" />
              </IconButton>
            </Dialog.Trigger>
          </Tooltip>
          <Dialog.Content className="boundary-dialog" maxWidth="560px">
            <Dialog.Title>What this prototype can promise</Dialog.Title>
            <Dialog.Description className="dialog-description">
              It keeps at most one working copy in this browser session or profile, depending on available local storage, and makes no encryption, backup, production privacy or global deletion guarantee.
            </Dialog.Description>
            <div className="boundary-list">
              <p><strong>Inside scope:</strong> the current browser prototype working copy and its locally stored media derivative.</p>
              <p><strong>Outside scope:</strong> original files, screenshots, downloads, browser or device backups, other copies and code-bundled synthetic fixtures.</p>
              <p><strong>Network:</strong> the app has no account, telemetry, model call, upload, share or public route.</p>
            </div>
            <div className="dialog-actions">
              <Dialog.Close>
                <Button className="button button--primary" variant="solid">Understood</Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Root>

        <DropdownMenu.Root>
          <Tooltip content="Choose appearance">
            <DropdownMenu.Trigger>
              <IconButton className="theme-toggle" variant="ghost" size="3" aria-label={`Appearance: ${themePreference}`}>
                {themePreference === "light" ? <Sun size={20} /> : themePreference === "dark" ? <Moon size={20} /> : <CircleHalf size={20} />}
              </IconButton>
            </DropdownMenu.Trigger>
          </Tooltip>
          <DropdownMenu.Content align="end">
            <DropdownMenu.Label>Appearance</DropdownMenu.Label>
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <DropdownMenu.CheckboxItem
                key={value}
                checked={themePreference === value}
                onCheckedChange={() => onThemeChange(value)}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </DropdownMenu.CheckboxItem>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        </div>
      </div>
    </header>
  );
}
