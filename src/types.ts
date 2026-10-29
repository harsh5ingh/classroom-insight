export type AttendanceStatus = "present" | "absent" | "unconfirmed";
export interface Summary {
  present: number;
  absent: number;
  unconfirmed: number;
  total: number;
  rate: number | null;
  sessions?: number;
  analyzed?: number;
}
export interface Student {
  id: number;
  identifier: string;
  name: string;
  cohort: string;
  is_demo: number;
  rate: number | null;
  history: {
    session_id: number;
    title: string;
    date: string;
    status: AttendanceStatus;
  }[];
}
export interface Session {
  id: number;
  title: string;
  date: string;
  instructor: string;
  is_demo: number;
  attendance: Summary;
  analysis: {
    id: number;
    status: string;
    progress: number;
    is_demo: number;
  } | null;
}
export interface Point {
  seconds: number;
  count: number | null;
  activity: number | null;
}
export interface Analysis {
  id: number;
  session_id: number;
  filename: string;
  status: string;
  progress: number;
  error: string | null;
  is_demo: number;
  has_media: boolean;
  created_at: string;
  result: null | {
    kind: string;
    video: null | {
      duration_seconds: number;
      sample_seconds: number;
      frames_sampled: number;
      points: Point[];
      detector: string | null;
      method: string;
      limitations: string;
    };
    audio: null | {
      duration_seconds: number;
      energy: { seconds: number; energy: number }[];
      active_fraction: number;
      threshold: number;
      method: string;
      active_intervals: { start: number; end: number }[];
    };
    unavailable: string[];
    notes: string[];
  };
}
export interface Recommendation {
  id: number;
  session_id: number;
  title: string;
  is_demo: number;
  source: string;
  items: { title: string; body: string; evidence: string }[];
  note: string;
  created_at: string;
}
export interface Analytics {
  summary: Summary;
  trend: {
    id: number;
    date: string;
    title: string;
    is_demo: number;
    rate: number | null;
    activity: number | null;
    sound: number | null;
  }[];
  sessions: Session[];
  events: {
    id: number;
    message: string;
    created_at: string;
    is_demo: number;
  }[];
  demo: boolean;
}
export interface Config {
  gemini: { credential_supplied: boolean; access: string; model: string };
  preferences: { sample_seconds: number; person_detection: boolean };
  ffmpeg_available: boolean;
  upload_limit_mb: number;
  retention: string;
  privacy: string;
}
