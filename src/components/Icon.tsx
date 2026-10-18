// Small stroke icon set. Decorative by default (aria-hidden); pair with visible text or an aria-label.

const PATHS: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  dumbbell: 'M2 12h20M6 7v10M18 7v10M3.5 9v6M20.5 9v6',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M9 2h6',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 3',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  skip: 'M5 4l10 8-10 8zM19 5v14',
  reset: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  stop: 'M6 6h12v12H6z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  check: 'M4 12l5 5L20 6',
  x: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  back: 'M15 18l-6-6 6-6',
  forward: 'M9 18l6-6-6-6',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  flame: 'M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-5 5-5 8-1-1-2-2-2-4-2 2-2 4-2 8 0 4 3 7 7 7z',
  heart: 'M12 20s-7-4.5-9-9a4.5 4.5 0 0 1 9-3 4.5 4.5 0 0 1 9 3c-2 4.5-9 9-9 9z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v2a3 3 0 0 0 4 3M16 6h4v2a3 3 0 0 1-4 3M12 13v4M8 21h8M9 17h6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7.5v.5',
  volume: 'M4 9h4l5-4v14l-5-4H4zM17 9a4 4 0 0 1 0 6',
  mute: 'M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  body: 'M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 8h14M12 8v6M12 14l-3 7M12 14l3 7',
  share: 'M12 3v13M7 8l5-5 5 5M5 12v8h14v-8',
  barcode: 'M4 5v14M7 5v14M10 5v14M14 5v14M17 5v14M20 5v14M12 5v14',
  apple: 'M12 7c-2-2-7-1.5-7 4 0 4 3 9 5.5 9 1 0 1.2-.6 1.5-.6s.5.6 1.5.6C16 20 19 15 19 11c0-5.5-5-6-7-4zM12 7c0-2 1-3.5 3-4',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size, title }: { name: IconName; size?: number; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size ?? '1.25em'}
      height={size ?? '1.25em'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} fill={name === 'play' ? 'currentColor' : 'none'} />
    </svg>
  );
}
