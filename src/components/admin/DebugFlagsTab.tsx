import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useFeatureFlag } from '@/lib/featureFlags';

/**
 * Phase 1 (Stats V2) — admin-only toggle panel.
 *
 * Lets the maintainer flip `statsV2Enabled` on/off for the current browser
 * to A/B compare the legacy `StatsView` against the v2 implementation
 * without needing a deploy. Default OFF for everyone; change persists in
 * localStorage and syncs across tabs via the `storage` event.
 */
export default function DebugFlagsTab() {
  const { enabled: statsV2Enabled, setEnabled: setStatsV2Enabled } = useFeatureFlag('statsV2Enabled');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Debug Flags</h2>
        <p className="text-sm text-muted-foreground mt-1">
          דגלי פיצ'רים מקומיים (שמורים ב-localStorage בדפדפן הנוכחי בלבד).
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-lg">Stats V2</CardTitle>
              <CardDescription className="mt-1">
                מציג את הגרסה החדשה של מסך הסטטיסטיקות (המלצות + חולשות). כאשר כבוי — הגרסה הישנה נשארת כפי שהיא.
              </CardDescription>
            </div>
            <Switch
              checked={statsV2Enabled}
              onCheckedChange={setStatsV2Enabled}
              aria-label="Toggle Stats V2"
            />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            מצב נוכחי:{' '}
            <span className={statsV2Enabled ? 'text-primary font-semibold' : 'text-muted-foreground font-semibold'}>
              {statsV2Enabled ? 'פעיל' : 'כבוי'}
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
