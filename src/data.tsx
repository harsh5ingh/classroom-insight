import { createContext, useContext } from "react";
import type {
  Analytics,
  Analysis,
  Config,
  Recommendation,
  Session,
  Student,
} from "./types";
export interface Data {
  students: Student[];
  sessions: Session[];
  analytics: Analytics;
  analyses: Analysis[];
  recommendations: Recommendation[];
  config: Config;
}
export interface DataContext extends Data {
  refresh: () => Promise<void>;
  run: (work: () => Promise<unknown>, message: string) => Promise<boolean>;
  busy: boolean;
  newSession: () => void;
  upload: (sessionId?: number) => void;
  editSession: (session: Session) => void;
  confirm: (
    title: string,
    description: string,
    action: () => Promise<unknown>,
  ) => void;
}
export const Context = createContext<DataContext | null>(null);
export const useData = () => useContext(Context)!;
