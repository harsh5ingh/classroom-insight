import type { SpectralAudio } from "./AudioInsights";
export type AttendanceStatus = "present" | "absent" | "unconfirmed";
export interface AttendanceChange {
  id: number;
  student_id: number;
  name: string;
  previous_status: AttendanceStatus;
  status: AttendanceStatus;
  recorded_at: string;
  source: string;
  actor: string;
  analysis_id: number | null;
  track_id: number | null;
}
export interface PresenceTrack {
  id: number;
  first_seen: number;
  last_seen: number;
  samples: number;
  span_seconds: number;
  qualified: boolean;
  preview: string | null;
  longest_still_seconds: number;
  mean_motion_face_widths_per_second: number | null;
  mean_eye_line_roll_degrees: number | null;
  roll_samples: number;
}
export interface ActivityFusion {
  version: string;
  label: string;
  score: number | null;
  window_seconds: number;
  joint_windows: number;
  method: string;
  limitations: string;
  audio_offset_seconds: number;
  points: {
    seconds: number;
    end_seconds: number;
    visual: number | null;
    sound: number | null;
    score: number | null;
    modalities: number;
    visual_coverage: number;
    audio_coverage: number;
  }[];
}
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
    confirmed_at?: string | null;
    updated_at?: string | null;
    source?: string;
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
  faces?: number | null;
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
    derived_from?: number[];
    source?: { kind: string; frame_seconds: number[]; clock: string };
    analysis_preferences?: Record<string, unknown>;
    fusion?: ActivityFusion | null;
    video: null | {
      duration_seconds: number;
      sample_seconds: number;
      frames_sampled: number;
      points: Point[];
      detector: string | null;
      method: string;
      limitations: string;
      face_tracking?: {
        method: string;
        tracks: PresenceTrack[];
        minimum_seconds: number;
        minimum_samples: number;
        still_motion_threshold?: number;
        eligible_sampling: boolean;
        limitations: string;
        pose_method: string;
      } | null;
    };
    audio: null | {
      spectral?: SpectralAudio;
      duration_seconds: number;
      energy: { seconds: number; energy: number }[];
      active_fraction: number;
      threshold: number;
      method: string;
      active_intervals: { start: number; end: number }[];
      activity_bouts?: number;
      bouts_per_minute?: number;
      speech_like_fraction?: number;
      speech_like_intervals?: { start: number; end: number }[];
      speech_like_intervals_truncated?: boolean;
      speech_method?: string;
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
  gemini: {
    credential_supplied: boolean;
    access: string;
    model: string;
    checked_at?: string | null;
    message?: string;
    error_code?: string | null;
    connection_id?: string;
    revision?: number;
  };
  preferences: {
    sample_seconds: number;
    person_detection: boolean;
    face_detection?: boolean;
    presence_seconds?: number;
    presence_samples?: number;
    still_motion_threshold?: number;
    retain_face_previews?: boolean;
    visual_weight?: number;
    audio_weight?: number;
    audio_rms_threshold?: number;
  };
  ffmpeg_available: boolean;
  upload_limit_mb: number;
  retention: string;
  privacy: string;
}
