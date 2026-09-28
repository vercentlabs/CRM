import type { SVGProps } from 'react';

/** Small stroke icon set (24px grid, 1.75 stroke). Decorative unless labelled by the parent. */
function icon(paths: string[]) {
  return function Icon({ className = 'h-4 w-4', ...props }: SVGProps<SVGSVGElement>) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        focusable="false"
        className={className}
        {...props}
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  };
}

export const XIcon = icon(['M6 6l12 12', 'M18 6L6 18']);
export const PlusIcon = icon(['M12 5v14', 'M5 12h14']);
export const SearchIcon = icon(['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4']);
export const ChevronDownIcon = icon(['M6 9l6 6 6-6']);
export const ChevronLeftIcon = icon(['M15 6l-6 6 6 6']);
export const ChevronRightIcon = icon(['M9 6l6 6-6 6']);
export const ArrowUpIcon = icon(['M12 19V5', 'M6 11l6-6 6 6']);
export const ArrowDownIcon = icon(['M12 5v14', 'M6 13l6 6 6-6']);
export const MenuIcon = icon(['M4 6h16', 'M4 12h16', 'M4 18h16']);
export const MoreIcon = icon([
  'M11 6a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  'M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  'M11 18a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
]);
export const HomeIcon = icon(['M4 11l8-7 8 7', 'M6 10v10h12V10']);
export const UsersIcon = icon([
  'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1',
  'M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  'M21 20v-1a4 4 0 0 0-3-3.87',
  'M16 4.13a3.5 3.5 0 0 1 0 6.74',
]);
export const LeadIcon = icon(['M12 3a6 6 0 0 0-3 11.2V17h6v-2.8A6 6 0 0 0 12 3z', 'M9 21h6']);
export const BriefcaseIcon = icon(['M4 7h16v12H4z', 'M9 7V5h6v2', 'M4 12h16']);
export const CheckSquareIcon = icon(['M4 4h16v16H4z', 'M8 12l3 3 5-6']);
export const CalendarIcon = icon(['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4']);
export const ClockIcon = icon(['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2']);
export const NoteIcon = icon(['M6 3h9l3 3v15H6z', 'M9 10h6', 'M9 14h6', 'M9 18h4']);
export const PhoneIcon = icon([
  'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
]);
export const MessageIcon = icon(['M4 5h16v11H8l-4 4z']);
export const ChatIcon = icon(['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z']);
export const ChartIcon = icon(['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2']);
export const MapPinIcon = icon([
  'M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z',
  'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
]);
export const SettingsIcon = icon([
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
]);
export const ShieldIcon = icon(['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z']);
export const LogOutIcon = icon(['M9 21H5V3h4', 'M16 17l5-5-5-5', 'M21 12H9']);
export const SunIcon = icon([
  'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  'M12 1v2',
  'M12 21v2',
  'M4.2 4.2l1.4 1.4',
  'M18.4 18.4l1.4 1.4',
  'M1 12h2',
  'M21 12h2',
  'M4.2 19.8l1.4-1.4',
  'M18.4 5.6l1.4-1.4',
]);
export const MoonIcon = icon(['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z']);
export const DownloadIcon = icon(['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16']);
export const RefreshIcon = icon(['M20 11a8 8 0 1 0-2.3 5.7', 'M20 5v6h-6']);
export const PaperclipIcon = icon([
  'M21 11.5l-8.5 8.5a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3l8-8',
]);
export const SendIcon = icon(['M22 2L11 13', 'M22 2l-7 20-4-9-9-4z']);
export const AlertIcon = icon([
  'M12 9v4',
  'M12 17h.01',
  'M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
]);
export const BuildingIcon = icon([
  'M4 21V4h11v17',
  'M15 9h5v12',
  'M8 8h3',
  'M8 12h3',
  'M8 16h3',
  'M2 21h20',
]);
export const KanbanIcon = icon(['M4 4h4v16H4z', 'M10 4h4v10h-4z', 'M16 4h4v13h-4z']);
export const ListIcon = icon([
  'M8 6h13',
  'M8 12h13',
  'M8 18h13',
  'M3 6h.01',
  'M3 12h.01',
  'M3 18h.01',
]);
