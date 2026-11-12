// Original Nalbace interface glyphs: a shared 24-unit grid, rounded joins,
// open counters and a single monochrome stroke treatment. These are not the logo.
export const iconPaths={
  alert:{main:"M10.3 4.3a2 2 0 0 1 3.4 0l7.5 13a2 2 0 0 1-1.7 3H4.5a2 2 0 0 1-1.7-3Z",accent:"M12 9v4M12 16.5h.01"},
  home:{main:"M3.5 10.5 12 3.8l8.5 6.7M5.5 9v10a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9",accent:"M9.5 17.5v-4h5v4"},
  connections:{main:"m9 8 2-2a5 5 0 0 1 7 7l-2 2M8 9l-2 2a5 5 0 0 0 7 7l2-2",accent:"m8.5 15.5 7-7"},
  assistant:{main:"M5 4.5h14A1.5 1.5 0 0 1 20.5 6v12A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5ZM8 2v2.5M16 2v2.5M8 19.5V22M16 19.5V22",accent:"M8 9h8M8 13h5"},
  account:{main:"M15.5 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM5 20v-2a7 5 0 0 1 14 0v2",accent:"M9 19h6"},
  mail:{main:"M4.5 5.5h15A1.5 1.5 0 0 1 21 7v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7a1.5 1.5 0 0 1 1.5-1.5Z",accent:"m4 7 6.9 5.3a1.8 1.8 0 0 0 2.2 0L20 7"},
  pause:{main:"M8 5.5v13M16 5.5v13",accent:"M5 21h14"},
  check:{main:"M20.3 10.3a8.4 8.4 0 1 1-5.6-6.2",accent:"m8.1 10.8 3.3 3.4 8.5-9"},
  arrow:{main:"m10 5-7 7 7 7M3 12h17",accent:"M16 12h4"},
  clock:{main:"M20.5 12a8.5 8.5 0 1 1-3.1-6.6",accent:"M12 7v5l3.6 2"},
  history:{main:"M4 7.5a8.5 8.5 0 1 1-.2 8M3 3.5v5h5",accent:"M12 7v5l-3 2"},
  gear:{main:"M9.17 5.16L10.21 4.82L10.35 2.64L13.65 2.64L13.79 4.82L14.83 5.16L15.81 5.66L17.45 4.22L19.78 6.55L18.34 8.19L18.84 9.17L19.18 10.21L21.36 10.35L21.36 13.65L19.18 13.79L18.84 14.83L18.34 15.81L19.78 17.45L17.45 19.78L15.81 18.34L14.83 18.84L13.79 19.18L13.65 21.36L10.35 21.36L10.21 19.18L9.17 18.84L8.19 18.34L6.55 19.78L4.22 17.45L5.66 15.81L5.16 14.83L4.82 13.79L2.64 13.65L2.64 10.35L4.82 10.21L5.16 9.17L5.66 8.19L4.22 6.55L6.55 4.22L8.19 5.66Z",accent:"M15.2 12a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0Z"},
  invoice:{main:"M6 3.5h9l4 4v13H5V5a1.5 1.5 0 0 1 1-1.5ZM15 3.5v5h4",accent:"M8.5 12h7M8.5 15.5h7M8.5 19h3"},
  receipt:{main:"M5.5 3.5h13v17l-3-1.7-3.5 1.7-3.5-1.7-3 1.7ZM8.5 8h7",accent:"m8.5 13 2.4 2.3 4.6-4.8"},
  refresh:{main:"M4 9a8.2 8.2 0 0 1 13.8-3.2L21 9M21 4v5h-5",accent:"M20 15a8.2 8.2 0 0 1-13.8 3.2L3 15M3 20v-5h5"},
  chat:{main:"M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-4.3A2 2 0 0 1 3 15V6a2 2 0 0 1 2-2Z",accent:"M7.5 9h9M7.5 13h5"},
  spark:{main:"m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",accent:"M20 2v4M18 4h4"},
  phone:{main:"m7.5 3 3 5-2.3 2a14 14 0 0 0 5.8 5.8l2-2.3 5 3-.6 3.3a2 2 0 0 1-2.3 1.5A20 20 0 0 1 2.7 5.9 2 2 0 0 1 4.2 3.6Z",accent:"M15 4a6.5 6.5 0 0 1 5 5M15 8a2.5 2.5 0 0 1 1 1"},
  link:{main:"m9 8 2-2a5 5 0 0 1 7 7l-2 2M8 9l-2 2a5 5 0 0 0 7 7l2-2",accent:"m8.5 15.5 7-7"},
  chevron:{main:"m9 5 7 7-7 7",accent:""}
} as const;
export type IconName=keyof typeof iconPaths;
export default function UiIcon({name,className=""}:{name:IconName;className?:string}){
  const shape=iconPaths[name];
  return <svg className={`ui-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={shape.main}/>{shape.accent&&<path d={shape.accent} className="icon-accent"/>}</svg>;
}
