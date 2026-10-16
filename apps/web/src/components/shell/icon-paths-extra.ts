// The glyphs the slices after the shell added, in one map for icon.tsx: the
// leagues page's (12b), the admin's (13-15) and the static pages' (18).

import { ADMIN_ICONS, type AdminIconName } from './icon-paths-admin';
import {
  LEAGUES_ICONS,
  type IconPath,
  type LeaguesIconName,
} from './icon-paths-leagues';
import { STATIC_ICONS, type StaticIconName } from './icon-paths-static';

export type { IconPath };

export type ExtraIconName = LeaguesIconName | AdminIconName | StaticIconName;

export const EXTRA_ICONS: Readonly<Record<ExtraIconName, readonly IconPath[]>> =
  { ...LEAGUES_ICONS, ...ADMIN_ICONS, ...STATIC_ICONS };
