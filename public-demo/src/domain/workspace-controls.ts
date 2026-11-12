export type WorkspaceControls={revision:number;aiPaused:boolean;aiRequestCap:number;emailPaused?:boolean;voicePaused?:boolean;urgentOverdueDays?:number;reminderPolicy?:{enabled:boolean;beforeDays:7|14;businessName:string;demoDate?:string}};
// A one-time development allowance, never an automatically renewing plan.
export const defaultControls:WorkspaceControls={revision:0,aiPaused:true,aiRequestCap:0};
