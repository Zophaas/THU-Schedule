import { useEffect, useState } from 'react';
import { type Lang, t } from '../lib/i18n';
import { PALETTES, type PaletteName, type Schedule, type Settings } from '../lib/store';

interface SettingsPanelProps {
  schedule: Schedule;
  scheduleCount: number;
  settings: Settings;
  englishNames: number;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSettings: (settings: Settings) => void;
}

export function LanguageSwitch({ value, onChange }: { value: Lang; onChange: (lang: Lang) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Language / 语言">
      {(
        [
          ['zh', '中文'],
          ['en', 'English'],
        ] as const
      ).map(([lang, label]) => (
        <button
          type="button"
          role="radio"
          key={lang}
          aria-checked={value === lang}
          className={value === lang ? 'active' : undefined}
          onClick={() => onChange(lang)}
          lang={lang}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel({
  schedule,
  scheduleCount,
  settings,
  englishNames,
  onRename,
  onDelete,
  onSettings,
}: SettingsPanelProps) {
  const [name, setName] = useState(schedule.name);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setName(schedule.name);
    setConfirming(false);
  }, [schedule.id, schedule.name]);

  return (
    <div className="settings">
      <section>
        <h3>{t('thisSchedule')}</h3>
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) onRename(name.trim());
          }}
        >
          <label className="grow">
            <span className="sr-only">{t('scheduleName')}</span>
            <input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          </label>
          <button type="submit" disabled={!name.trim() || name.trim() === schedule.name}>
            {t('rename')}
          </button>
        </form>
        {confirming ? (
          <div className="confirm">
            <p>{t('deleteConfirm', { name: schedule.name, c: schedule.courses.length, e: schedule.events.length })}</p>
            <div className="row">
              <button type="button" className="danger" onClick={onDelete}>
                {t('deleteNow')}
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                {t('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="danger-outline" onClick={() => setConfirming(true)}>
            {t('deleteSchedule')}
          </button>
        )}
        {scheduleCount === 1 && <p className="muted small">{t('onlySchedule')}</p>}
      </section>

      <section>
        <h3>{t('display')}</h3>
        <p className="field-label">{t('language')}</p>
        <LanguageSwitch value={settings.language} onChange={(language) => onSettings({ ...settings, language })} />
        {settings.language === 'en' && englishNames === 0 && <p className="muted small">{t('englishNamesMissing')}</p>}
        <label className="check">
          <input
            type="checkbox"
            checked={settings.showWeekends}
            onChange={(event) => onSettings({ ...settings, showWeekends: event.target.checked })}
          />
          {t('showWeekendsSetting')}
        </label>
        <fieldset className="palettes">
          <legend>{t('palette')}</legend>
          {(Object.keys(PALETTES) as PaletteName[]).map((key) => (
            <label key={key} className="check">
              <input
                type="radio"
                name="palette"
                checked={settings.palette === key}
                onChange={() => onSettings({ ...settings, palette: key })}
              />
              {PALETTES[key].label}
              <span className="palette-preview" aria-hidden="true">
                {PALETTES[key].colors.slice(0, 6).map((color) => (
                  <span key={color} style={{ background: color }} />
                ))}
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      <section>
        <h3>{t('storage')}</h3>
        <p className="muted">{t('storageNote')}</p>
      </section>
    </div>
  );
}
